import type {
  Contact,
  FundraiseRound,
  FundraiseRoundSaveInput,
  FundraisingOverview,
  ContactStage,
  ProspectImportResult,
  ProspectImportRow,
  ProspectSaveInput,
} from "@rakazo/contracts";
import { isActiveSafe } from "@rakazo/core";
import type { Prisma, PrismaClient } from "./client.js";
import { roundIdForStage, toContact } from "./contacts.js";
import { isUniqueViolation } from "./prisma-errors.js";
import { SafeActiveError, toSafe } from "./safes.js";
import { IsolationError } from "./scope.js";

type Scope = { spaceId: string; userId: string };
type Db = Pick<PrismaClient, "contact" | "fundraiseRound" | "safe">;
/** Only space and user: callers may pass a whole actor, which must not reach a Prisma query. */
const ownerOf = ({ spaceId, userId }: Scope): Scope => ({ spaceId, userId });

export class FundraiseRoundOpenError extends Error {
  constructor() {
    super("Another round is already open.");
    this.name = "FundraiseRoundOpenError";
  }
}

const toRound = (row: Prisma.FundraiseRoundGetPayload<object>): FundraiseRound => ({
  id: row.id,
  name: row.name,
  targetCents: Number(row.targetCents),
  capCents: Number(row.capCents),
  closedAt: row.closedAt?.toISOString() ?? null,
});

/** The open round, else the latest closed one, and the prospect pipeline. */
export async function getFundraisingOverview(
  prisma: Db,
  actor: Scope,
): Promise<Omit<FundraisingOverview, "mercury">> {
  const scope = ownerOf(actor);
  const row =
    (await prisma.fundraiseRound.findFirst({ where: { ...scope, closedAt: null } })) ??
    (await prisma.fundraiseRound.findFirst({
      where: scope,
      orderBy: [{ closedAt: "desc" }, { id: "desc" }],
    }));
  const [contacts, safeRows] = await Promise.all([
    prisma.contact.findMany({
      where: { ...scope, kind: "prospect" },
      include: { bot: { select: { id: true, name: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.safe.findMany({ where: scope, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
  ]);
  const safes = safeRows.map((safe) => toSafe(safe));
  // A prospect with an active SAFE has left the pipeline; it returns once every SAFE is canceled or deleted.
  const withSafe = new Set(
    safes.filter((s) => s.contactId && isActiveSafe(s.status)).map((s) => s.contactId),
  );
  const prospects = contacts.filter((p) => !withSafe.has(p.id));
  // A prospect made without a stage (for example by an agent) starts at Target.
  const withStage = prospects.map((p) => ({ ...p, stage: p.stage ?? "target" }));
  const open = row && !row.closedAt ? row : null;
  const inRound = safes.filter((s) => row && s.roundId === row.id);
  const sumOf = (...statuses: string[]) =>
    inRound.filter((s) => statuses.includes(s.status)).reduce((sum, s) => sum + s.amountCents, 0);
  // A Committed prospect counts only in the round that was open when its stage was saved;
  // a Sent or Draft SAFE of the open round counts at its amount instead of the check size.
  const pendingCents = open
    ? prospects
        .filter((p) => p.stage === "committed" && p.roundId === open.id)
        .reduce((sum, p) => sum + Number(p.checkSizeCents ?? 0), 0) + sumOf("sent", "draft")
    : 0;
  return {
    round: row ? toRound(row) : null,
    pendingCents,
    signedCents: sumOf("signed"),
    fundedCents: sumOf("funded"),
    prospects: withStage.map(toContact),
    safes,
  };
}

/** Starts a round, or edits the open round when `id` is given. */
export async function saveRound(
  prisma: Db,
  actor: Scope,
  input: FundraiseRoundSaveInput,
): Promise<FundraiseRound> {
  const scope = ownerOf(actor);
  const { id, ...fields } = input;
  if (id) {
    const { count } = await prisma.fundraiseRound.updateMany({
      where: { id, ...scope, closedAt: null },
      data: fields,
    });
    if (count === 0) throw new IsolationError("Round not found");
    return toRound(await prisma.fundraiseRound.findUniqueOrThrow({ where: { id } }));
  }
  try {
    return toRound(await prisma.fundraiseRound.create({ data: { ...scope, ...fields } }));
  } catch (error) {
    // The partial unique index allows one open round per space and user.
    throw isUniqueViolation(error) ? new FundraiseRoundOpenError() : error;
  }
}

async function setClosedAt(
  prisma: Db,
  actor: Scope,
  id: string,
  from: { closedAt: null } | { closedAt: { not: null } },
  closedAt: Date | null,
): Promise<FundraiseRound> {
  const { count } = await prisma.fundraiseRound.updateMany({
    where: { id, ...ownerOf(actor), ...from },
    data: { closedAt },
  });
  if (count === 0) throw new IsolationError("Round not found");
  return toRound(await prisma.fundraiseRound.findUniqueOrThrow({ where: { id } }));
}

/** Send SAFE through Mercury needs the prospect's email: it is how the next sync attaches the SAFE. */
export class ProspectEmailRequiredError extends Error {
  constructor() {
    super("Add the investor's email first.");
    this.name = "ProspectEmailRequiredError";
  }
}

async function prospectOf(prisma: Db, scope: Scope, id: string) {
  const row = await prisma.contact.findFirst({
    where: { id, ...scope, kind: "prospect" },
    include: { bot: { select: { id: true, name: true } } },
  });
  if (!row) throw new IsolationError("Contact not found");
  return row;
}

/**
 * Send SAFE with Mercury: the prospect is Waiting for Mercury until a SAFE attaches or Not sent.
 * Throws IsolationError for any other contact, ProspectEmailRequiredError without an email and
 * SafeActiveError while the prospect has an active SAFE (Canceled and Expired ones do not block).
 */
export async function markWaiting(prisma: Db, actor: Scope, id: string): Promise<Contact> {
  const scope = ownerOf(actor);
  const prospect = await prospectOf(prisma, scope, id);
  if (!prospect.email?.trim()) throw new ProspectEmailRequiredError();
  const safes = await prisma.safe.findMany({ where: { ...scope, contactId: id } });
  if (safes.some((safe) => isActiveSafe(toSafe(safe).status))) throw new SafeActiveError();
  await prisma.contact.updateMany({ where: { id, ...scope }, data: { mercurySentAt: new Date() } });
  return toContact(await prospectOf(prisma, scope, id));
}

/** Not sent: restores the normal prospect row. */
export async function notSent(prisma: Db, actor: Scope, id: string): Promise<Contact> {
  const scope = ownerOf(actor);
  await prospectOf(prisma, scope, id);
  await prisma.contact.updateMany({ where: { id, ...scope }, data: { mercurySentAt: null } });
  return toContact(await prospectOf(prisma, scope, id));
}

export const closeRound = (prisma: Db, actor: Scope, id: string) =>
  setClosedAt(prisma, actor, id, { closedAt: null }, new Date());

/** Throws FundraiseRoundOpenError while another round is open. */
export const reopenRound = (prisma: Db, actor: Scope, id: string) =>
  setClosedAt(prisma, actor, id, { closedAt: { not: null } }, null).catch((error: unknown) => {
    throw isUniqueViolation(error) ? new FundraiseRoundOpenError() : error;
  });

/** Changes the pipeline fields of one of the user's prospects. Throws IsolationError for any other contact. */
export async function saveProspect(
  prisma: Db,
  actor: Scope,
  { id, ...fields }: ProspectSaveInput,
): Promise<Contact> {
  const scope = ownerOf(actor);
  const roundId = await roundIdForStage(prisma, scope, fields.stage);
  const { count } = await prisma.contact.updateMany({
    where: { id, ...scope, kind: "prospect" },
    data: { ...fields, roundId },
  });
  if (count === 0) throw new IsolationError("Contact not found");
  const row = await prisma.contact.findUniqueOrThrow({
    where: { id },
    include: { bot: { select: { id: true, name: true } } },
  });
  return toContact(row);
}

/** Lowercase letters and digits only, so "Harbor Angels, LLC" and "harbor angels llc" match. */
const normalized = (value: string | null | undefined) =>
  (value ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

type Known = { id: string; name: string; organization: string | null; email: string | null };
type ImportDb = Pick<PrismaClient, "$transaction" | "contact" | "fundraiseRound">;

/**
 * Finds the saved prospect a row means. A firm-only row (no person, or the firm as the name) means
 * the firm-only record; a person means the person of that name at that firm. A saved prospect
 * with another email is another person, never the same one.
 */
function matchKnown(known: Known[], row: ProspectImportRow): Known | undefined {
  const firmKey = normalized(row.firm);
  const key = normalized(row.name ?? row.firm);
  const person = Boolean(row.name) && key !== firmKey;
  return known.find((k) => {
    if (row.email && k.email) return false;
    if (normalized(k.name) !== key) return false;
    if (!person) return !k.organization || normalized(k.organization) === key;
    return !firmKey || !k.organization || normalized(k.organization) === firmKey;
  });
}

/**
 * Adds prospects, or updates the ones already saved, matched by email and otherwise by normalized
 * name (see matchKnown), so running the same list again adds nobody. Imports for one space and user
 * run one at a time. A saved prospect keeps whatever the owner set: a row fills only fields that
 * are still empty when the write happens, unless `overwrite` is true. A contact that is not a
 * prospect is left alone. Each row has its own savepoint: a row that fails is reported and the
 * rest stay.
 */
export async function importProspects(
  prisma: ImportDb,
  actor: Scope,
  rows: ProspectImportRow[],
  options: { overwrite?: boolean; botId?: string | null } = {},
): Promise<ProspectImportResult> {
  const scope = ownerOf(actor);
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`prospects:${scope.spaceId}:${scope.userId}`}, 0))`;
      return importRows(tx as ImportDb, scope, rows, options);
    },
    { timeout: 60_000 },
  );
}

async function importRows(
  tx: ImportDb,
  scope: Scope,
  rows: ProspectImportRow[],
  options: { overwrite?: boolean; botId?: string | null },
): Promise<ProspectImportResult> {
  const result: ProspectImportResult = { added: 0, updated: 0, skipped: [], failed: [] };
  const known: Known[] = await tx.contact.findMany({
    where: { ...scope, kind: "prospect" },
    select: { id: true, name: true, organization: true, email: true },
  });
  for (const [index, input] of rows.entries()) {
    const name = (input.name ?? input.firm) as string;
    const organization = input.firm ?? null;
    const report = (list: "skipped" | "failed", reason: string) =>
      result[list].push({ row: index + 1, name, reason });
    // A failed statement aborts a PostgreSQL transaction, so each row can roll back on its own.
    await tx.$executeRaw`SAVEPOINT import_row`;
    try {
      let existing = input.email
        ? await tx.contact.findFirst({ where: { ...scope, email: input.email } })
        : null;
      if (existing && existing.kind !== "prospect") {
        report("skipped", `Already saved as ${existing.kind}.`);
        continue;
      }
      if (!existing) {
        const match = matchKnown(known, input);
        if (match) existing = await tx.contact.findFirst({ where: { id: match.id, ...scope } });
      }
      if (!existing) {
        const stage = input.stage ?? "target";
        const created = await tx.contact.create({
          data: {
            ...scope,
            name,
            organization,
            email: input.email ?? null,
            notes: input.notes ?? null,
            nextStep: input.nextStep ?? null,
            checkSizeCents: input.checkSizeCents ?? null,
            kind: "prospect",
            stage,
            roundId: await roundIdForStage(tx, scope, stage),
            botId: options.botId ?? null,
          },
        });
        known.push({ id: created.id, name, organization, email: input.email ?? null });
        result.added += 1;
        continue;
      }
      const current = {
        organization: existing.organization,
        email: existing.email,
        notes: existing.notes,
        nextStep: existing.nextStep,
        checkSizeCents: existing.checkSizeCents == null ? null : Number(existing.checkSizeCents),
        stage: existing.stage,
      };
      const wanted = {
        organization,
        email: input.email,
        notes: input.notes,
        nextStep: input.nextStep,
        checkSizeCents: input.checkSizeCents,
        stage: input.stage,
      };
      const changes: Partial<Record<keyof typeof wanted, string | number | null>> = {};
      for (const key of Object.keys(wanted) as (keyof typeof wanted)[]) {
        const next = wanted[key];
        if (next == null || next === current[key]) continue;
        if (options.overwrite || current[key] == null || current[key] === "") changes[key] = next;
      }
      if (Object.keys(changes).length === 0) {
        report("skipped", "Already saved; nothing to change.");
        continue;
      }
      // Without overwrite, a field is written only while it is still empty in the database, so an
      // owner's edit made after the read above is never replaced.
      const stillEmpty = options.overwrite
        ? []
        : Object.keys(changes).map((key) => ({
            OR: [
              { [key]: null },
              ...(typeof changes[key as keyof typeof changes] === "string" ? [{ [key]: "" }] : []),
            ],
          }));
      const { count } = await tx.contact.updateMany({
        where: { id: existing.id, ...scope, kind: "prospect", AND: stillEmpty },
        data: {
          ...changes,
          ...(changes.stage
            ? { roundId: await roundIdForStage(tx, scope, changes.stage as ContactStage) }
            : {}),
        },
      });
      if (count === 0) {
        report("skipped", "Changed while importing; left as it is.");
        continue;
      }
      const at = known.findIndex((k) => k.id === existing.id);
      const at0 = known[at];
      if (at0) known[at] = { ...at0, email: (changes.email as string) ?? at0.email };
      result.updated += 1;
    } catch {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT import_row`;
      report("failed", "Could not be saved.");
    }
  }
  return result;
}
