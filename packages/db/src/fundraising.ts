import type {
  Contact,
  ContactStage,
  FundraiseRound,
  FundraiseRoundSaveInput,
  FundraisingOverview,
  PipelineCallLogInput,
  PipelineCallLogResult,
  PipelineCallOutcome,
  PipelineStatus,
  ProspectImportResult,
  ProspectImportRow,
  ProspectSaveInput,
} from "@rakazo/contracts";
import {
  PipelineCallOutcomeSchema,
  PipelineDetailSchema,
  PipelineStatusSchema,
} from "@rakazo/contracts";
import { isActiveSafe } from "@rakazo/core";
import * as z from "zod";
import type { Prisma, PrismaClient } from "./client.js";
import { contactInclude, toContact } from "./contacts.js";
import type { PipelineDb } from "./pipeline-records.js";
import {
  ensureRecord,
  FUNDRAISING_PIPELINE,
  normalized,
  personlessRow,
  recordOfContact,
  savePipelineRecord,
  stageOf,
} from "./pipeline-records.js";

export { PipelineInputError } from "./pipeline-records.js";

import { isUniqueViolation } from "./prisma-errors.js";
import { hasActiveSafe, SafeActiveError, safeInRecordRound, toSafe } from "./safes.js";
import { IsolationError } from "./scope.js";

type Scope = { spaceId: string; userId: string };
type Db = PipelineDb & Pick<PrismaClient, "safe">;
type WriteDb = Db & Pick<PrismaClient, "$transaction">;
/** Only space and user: callers may pass a whole actor, which must not reach a Prisma query. */
const ownerOf = ({ spaceId, userId }: Scope): Scope => ({ spaceId, userId });

export class FundraiseRoundOpenError extends Error {
  constructor() {
    super("Another round is already open.");
    this.name = "FundraiseRoundOpenError";
  }
}

const PipelineDetailsSchema = z.array(PipelineDetailSchema);

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
  const pipeline = FUNDRAISING_PIPELINE;
  const [records, people, contacts, safeRows, callEvents] = await Promise.all([
    prisma.pipelineRecord.findMany({ where: { ...scope, pipeline }, orderBy: { id: "asc" } }),
    prisma.pipelineRecordPerson.findMany({
      where: { ...scope, pipeline },
      select: {
        recordId: true,
        contactId: true,
        contact: { select: { kind: true, name: true } },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    // One row per record, its primary person. A prospect not on a record yet still shows.
    prisma.contact.findMany({
      where: {
        ...scope,
        OR: [
          { pipelinePeople: { some: { pipeline, isPrimary: true } } },
          { kind: "prospect", pipelinePeople: { none: { pipeline } } },
        ],
      },
      include: contactInclude,
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    prisma.safe.findMany({ where: scope, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
    // The newest call of each record: Last call is read, never stored.
    prisma.pipelineEvent.findMany({
      where: { ...scope, kind: "call" },
      distinct: ["recordId"],
      orderBy: [{ recordId: "asc" }, { at: "desc" }, { id: "desc" }],
    }),
  ]);
  const referrerIds = [
    ...new Set(records.flatMap((r) => (r.referredByContactId ? [r.referredByContactId] : []))),
  ];
  const referrers = new Map<string, string>(
    referrerIds.length === 0
      ? []
      : (
          await prisma.contact.findMany({
            where: { ...scope, id: { in: referrerIds } },
            select: { id: true, name: true },
          })
        ).map((contact) => [contact.id, contact.name]),
  );
  const recordById = new Map(records.map((record) => [record.id, record]));
  const lastCallOf = new Map(
    callEvents.map((event) => {
      const payload = event.payload as { outcome?: string; note?: string | null } | null;
      return [
        event.recordId,
        { outcome: payload?.outcome, at: event.at.toISOString(), note: payload?.note ?? null },
      ];
    }),
  );
  /** What the table needs beyond the contact: referrer, people, fund details and the last call. */
  const withExtras = (row: Contact): Contact => {
    const info = row.pipelineRecord;
    const record = info && recordById.get(info.id);
    if (!info || !record) return row;
    const call = lastCallOf.get(record.id);
    return {
      ...row,
      pipelineRecord: {
        ...info,
        referredBy: record.referredByContactId
          ? {
              id: record.referredByContactId,
              name: referrers.get(record.referredByContactId) ?? "",
            }
          : null,
        people: people
          .filter((person) => person.recordId === record.id)
          .map((person) => ({ id: person.contactId, name: person.contact.name })),
        details: PipelineDetailsSchema.catch([]).parse(record.details),
        lastCall:
          call && PipelineCallOutcomeSchema.safeParse(call.outcome).success
            ? { ...call, outcome: call.outcome as PipelineCallOutcome }
            : null,
      },
    };
  };
  const safes = safeRows.map((safe) => toSafe(safe));
  const open = row && !row.closedAt ? row : null;
  const created = new Map(records.map((record) => [record.id, record.createdAt]));
  const personOf = new Map(people.map((person) => [person.contactId, person]));
  // A record leaves the pipeline while it has an active SAFE in the open round (any round when none
  // is open). It returns once every SAFE is canceled, expired or deleted. The one exception is as it
  // always was: a lone prospect who signed became an investor, which ends its place in that round.
  // A firm with other people still has someone to raise from.
  const leftRecords = new Set(
    safes.flatMap((safe) => {
      const person = safe.contactId ? personOf.get(safe.contactId) : undefined;
      const since = person && created.get(person.recordId);
      if (!person || !since || !safeInRecordRound(safe, since, open)) return [];
      const signedAlone =
        safe.signedByOwnerAt &&
        safe.signedByInvestorAt &&
        person.contact.kind === "investor" &&
        people.filter((other) => other.recordId === person.recordId).length === 1;
      return isActiveSafe(safe.status) || signedAlone ? [person.recordId] : [];
    }),
  );
  const withSafe = new Set(
    safes.filter((s) => s.contactId && isActiveSafe(s.status)).map((s) => s.contactId),
  );
  const peopled = new Set(people.map((person) => person.recordId));
  const rows = contacts
    .filter((contact) => {
      const record = contact.pipelinePeople[0]?.record;
      return record ? !leftRecords.has(record.id) : !withSafe.has(contact.id);
    })
    .map(toContact);
  const personless = records.filter((record) => !peopled.has(record.id)).map(personlessRow);
  // A prospect not yet on a record reads as Target.
  const withStage = [...rows, ...personless].map((p) =>
    withExtras({ ...p, stage: p.stage ?? "target" }),
  );
  const inRound = safes.filter((s) => row && s.roundId === row.id);
  const sumOf = (...statuses: string[]) =>
    inRound.filter((s) => statuses.includes(s.status)).reduce((sum, s) => sum + s.amountCents, 0);
  // A Committed record counts only in the round that was open when its status was saved, and once,
  // however many people it has; a Sent or Draft SAFE of the open round counts at its amount instead.
  const pendingCents = open
    ? records
        .filter(
          (record) =>
            record.status === "committed" &&
            record.roundId === open.id &&
            !leftRecords.has(record.id),
        )
        .reduce((sum, record) => sum + Number(record.amountCents ?? 0), 0) + sumOf("sent", "draft")
    : 0;
  return {
    round: row ? toRound(row) : null,
    pendingCents,
    signedCents: sumOf("signed"),
    fundedCents: sumOf("funded"),
    prospects: withStage,
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
    super("Add an email first.");
    this.name = "ProspectEmailRequiredError";
  }
}

/**
 * A person on a fundraising record, of any kind, and that record. A prospect with no record gets one.
 * Throws IsolationError for any other contact.
 */
async function prospectOf(prisma: WriteDb, scope: Scope, id: string) {
  const row = await prisma.contact.findFirst({ where: { id, ...scope } });
  if (!row) throw new IsolationError("Contact not found");
  const record =
    (await recordOfContact(prisma, scope, id)) ??
    (row.kind === "prospect"
      ? await prisma.$transaction((tx) => ensureRecord(tx, scope, row))
      : null);
  if (!record) throw new IsolationError("Contact not found");
  return { row, record };
}

const contactRow = async (prisma: Db, scope: Scope, id: string) =>
  toContact(
    await prisma.contact.findFirstOrThrow({ where: { id, ...scope }, include: contactInclude }),
  );

/**
 * Send SAFE with Mercury: the record is Waiting for Mercury until a SAFE attaches or Not sent.
 * Throws IsolationError for any other contact, ProspectEmailRequiredError without an email and
 * SafeActiveError while its record has an active SAFE in the open round (Canceled and Expired ones
 * do not block).
 */
export async function markWaiting(prisma: WriteDb, actor: Scope, id: string): Promise<Contact> {
  const scope = ownerOf(actor);
  const { row, record } = await prospectOf(prisma, scope, id);
  if (!row.email?.trim()) throw new ProspectEmailRequiredError();
  const open = await prisma.fundraiseRound.findFirst({
    where: { ...scope, closedAt: null },
    select: { id: true },
  });
  if (await hasActiveSafe(prisma, scope, id, open?.id ?? null)) throw new SafeActiveError();
  await savePipelineRecord(prisma, scope, record.id, { waitingSince: new Date() });
  return contactRow(prisma, scope, id);
}

/** Not sent: restores the normal prospect row. */
export async function notSent(prisma: WriteDb, actor: Scope, id: string): Promise<Contact> {
  const scope = ownerOf(actor);
  const { record } = await prospectOf(prisma, scope, id);
  await savePipelineRecord(prisma, scope, record.id, { waitingSince: null });
  return contactRow(prisma, scope, id);
}

export const closeRound = (prisma: Db, actor: Scope, id: string) =>
  setClosedAt(prisma, actor, id, { closedAt: null }, new Date());

/** Throws FundraiseRoundOpenError while another round is open. */
export const reopenRound = (prisma: Db, actor: Scope, id: string) =>
  setClosedAt(prisma, actor, id, { closedAt: { not: null } }, null).catch((error: unknown) => {
    throw isUniqueViolation(error) ? new FundraiseRoundOpenError() : error;
  });

/**
 * Changes the pipeline fields of one of the user's prospects, named by its contact or, for a record
 * with no person yet, by the record. Throws IsolationError for anything else.
 */
export async function saveProspect(
  prisma: WriteDb,
  actor: Scope,
  { id, ...fields }: ProspectSaveInput,
): Promise<Contact> {
  const scope = ownerOf(actor);
  const changes = {
    ...(fields.stage === undefined ? {} : { stage: fields.stage }),
    ...(fields.status === undefined ? {} : { status: fields.status }),
    ...(fields.interest === undefined ? {} : { interest: fields.interest }),
    ...(fields.nextCallAt === undefined
      ? {}
      : { nextCallAt: fields.nextCallAt === null ? null : new Date(fields.nextCallAt) }),
    ...(fields.nextCallHasTime === undefined ? {} : { nextCallHasTime: fields.nextCallHasTime }),
    ...(fields.referredByContactId === undefined
      ? {}
      : { referredByContactId: fields.referredByContactId }),
    ...(fields.checkSizeCents === undefined ? {} : { amountCents: fields.checkSizeCents }),
    ...(fields.nextStep === undefined ? {} : { nextStep: fields.nextStep }),
  };
  const personless = await prisma.pipelineRecord.findFirst({
    where: { id, ...scope, people: { none: {} } },
    select: { id: true },
  });
  const guard: Prisma.PipelineRecordWhereInput = {
    ...(fields.expect?.status === undefined ? {} : { status: fields.expect.status }),
    ...(fields.expect?.interest === undefined ? {} : { interest: fields.expect.interest }),
    ...(fields.expect?.nextCallAt === undefined
      ? {}
      : {
          nextCallAt: fields.expect.nextCallAt === null ? null : new Date(fields.expect.nextCallAt),
        }),
  };
  if (personless) {
    await savePipelineRecord(prisma, scope, id, changes, guard);
    return personlessRow(await prisma.pipelineRecord.findFirstOrThrow({ where: { id, ...scope } }));
  }
  const { record } = await prospectOf(prisma, scope, id);
  await savePipelineRecord(prisma, scope, record.id, changes, guard);
  return contactRow(prisma, scope, id);
}

/** The record a contact or a person-less record id names; throws IsolationError for anything else. */
async function recordFor(prisma: WriteDb, scope: Scope, id: string) {
  const personless = await prisma.pipelineRecord.findFirst({
    where: { id, ...scope, people: { none: {} } },
  });
  return personless ?? (await prospectOf(prisma, scope, id)).record;
}

type CallBefore = { status: string; nextCallAt: string | null; nextCallHasTime: boolean };
/** What a logged call wrote, so Undo reverses only that, and only while it still holds. */
type CallSet = { status: "met" | null; next: { at: string | null; hasTime: boolean } | null };

/**
 * Logs a call: one `call` event, and the status moves forward only. Spoke moves a record that has
 * not reached Met to Met, decided at the write itself so a record that has advanced meanwhile is
 * left alone. Left message and No answer leave the status alone. `keep` leaves the next call as it
 * is, so the row stays due. The event keeps what it set and what was there before, for Undo.
 */
export async function logCall(
  prisma: WriteDb,
  actor: Scope,
  { id, outcome, note, nextCall }: PipelineCallLogInput,
): Promise<PipelineCallLogResult> {
  const scope = ownerOf(actor);
  const record = await recordFor(prisma, scope, id);
  const before: CallBefore = {
    status: record.status,
    nextCallAt: record.nextCallAt?.toISOString() ?? null,
    nextCallHasTime: record.nextCallHasTime,
  };
  const order = PipelineStatusSchema.options;
  const earlier = order.slice(0, order.indexOf("met"));
  const moved =
    outcome === "spoke"
      ? (
          await prisma.pipelineRecord.updateMany({
            where: { id: record.id, ...scope, status: { in: earlier } },
            data: { status: "met", roundId: null },
          })
        ).count > 0
      : false;
  const next =
    nextCall === "keep"
      ? null
      : {
          at: nextCall.at ? new Date(nextCall.at).toISOString() : null,
          hasTime: Boolean(nextCall.at) && nextCall.hasTime,
        };
  if (next)
    await prisma.pipelineRecord.updateMany({
      where: { id: record.id, ...scope },
      data: { nextCallAt: next.at ? new Date(next.at) : null, nextCallHasTime: next.hasTime },
    });
  const set: CallSet = { status: moved ? "met" : null, next };
  const event = await prisma.pipelineEvent.create({
    data: {
      ...scope,
      recordId: record.id,
      kind: "call",
      payload: { outcome, note: note?.trim() || null, before, set },
    },
  });
  if (moved)
    await prisma.pipelineEvent.create({
      data: {
        ...scope,
        recordId: record.id,
        kind: "status",
        payload: { from: before.status, to: "met" },
      },
    });
  return { eventId: event.id, movedToMet: moved };
}

/**
 * Undo of a logged call: removes it and puts back the status and next call it set, each only while
 * the record still has the value the call set. The round is never touched.
 */
export async function undoCall(prisma: WriteDb, actor: Scope, eventId: string): Promise<void> {
  const scope = ownerOf(actor);
  const event = await prisma.pipelineEvent.findFirst({
    where: { id: eventId, ...scope, kind: "call" },
  });
  if (!event) throw new IsolationError("Call not found");
  const { before, set } = event.payload as { before?: CallBefore; set?: CallSet };
  const where = { id: event.recordId, ...scope };
  if (before && set?.status)
    await prisma.pipelineRecord.updateMany({
      where: { ...where, status: set.status },
      data: { status: before.status },
    });
  if (before && set?.next)
    await prisma.pipelineRecord.updateMany({
      where: {
        ...where,
        nextCallAt: set.next.at ? new Date(set.next.at) : null,
        nextCallHasTime: set.next.hasTime,
      },
      data: {
        nextCallAt: before.nextCallAt ? new Date(before.nextCallAt) : null,
        nextCallHasTime: before.nextCallHasTime,
      },
    });
  await prisma.pipelineEvent.deleteMany({ where: { id: eventId, ...scope } });
}

type Known = { id: string; name: string; organization: string | null; email: string | null };
type ImportDb = PipelineDb & Pick<PrismaClient, "$transaction" | "$executeRaw">;

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
        const created = await tx.contact.create({
          data: {
            ...scope,
            name,
            organization,
            email: input.email ?? null,
            notes: input.notes ?? null,
            kind: "prospect",
            botId: options.botId ?? null,
          },
        });
        const fresh = await ensureRecord(tx, scope, created);
        await savePipelineRecord(tx, scope, fresh.id, {
          stage: input.stage ?? "target",
          amountCents: input.checkSizeCents ?? null,
          nextStep: input.nextStep ?? null,
        });
        known.push({ id: created.id, name, organization, email: input.email ?? null });
        result.added += 1;
        continue;
      }
      const record =
        existing.kind === "prospect"
          ? await ensureRecord(tx, scope, existing)
          : await recordOfContact(tx, scope, existing.id);
      const current = {
        organization: existing.organization,
        email: existing.email,
        notes: existing.notes,
        nextStep: record?.nextStep ?? null,
        checkSizeCents: record?.amountCents == null ? null : Number(record.amountCents),
        stage: record ? stageOf(record.status) : null,
      };
      const wanted = {
        organization,
        email: input.email,
        notes: input.notes,
        nextStep: input.nextStep,
        checkSizeCents: input.checkSizeCents,
        stage: input.stage,
      };
      const changes: Record<string, unknown> = {};
      for (const key of Object.keys(wanted) as (keyof typeof wanted)[]) {
        const next = wanted[key];
        if (next == null || next === current[key]) continue;
        if (options.overwrite || current[key] == null || current[key] === "")
          Object.assign(changes, { [key]: next });
      }
      if (Object.keys(changes).length === 0) {
        report("skipped", "Already saved; nothing to change.");
        continue;
      }
      // Without overwrite, a field is written only while it is still empty in the database, so an
      // owner's edit made after the read above is never replaced. A row changes whole or not at all.
      const emptyGuard = (keys: string[], names: Record<string, string> = {}) =>
        options.overwrite
          ? []
          : keys.map((key) => ({
              OR: [
                { [names[key] ?? key]: null },
                ...(typeof changes[key] === "string" ? [{ [names[key] ?? key]: "" }] : []),
              ],
            }));
      const { nextStep, checkSizeCents, stage, ...contactChanges } = changes;
      const onRecord = ["nextStep", "checkSizeCents", "stage"].filter((key) => key in changes);
      const left = async () => {
        await tx.$executeRaw`ROLLBACK TO SAVEPOINT import_row`;
        report("skipped", "Changed while importing; left as it is.");
      };
      if (onRecord.length > 0) {
        if (!record) {
          report("skipped", "Changed while importing; left as it is.");
          continue;
        }
        const saved = await savePipelineRecord(
          tx,
          scope,
          record.id,
          {
            ...(nextStep === undefined ? {} : { nextStep: nextStep as string }),
            ...(checkSizeCents === undefined ? {} : { amountCents: checkSizeCents as number }),
            ...(stage === undefined ? {} : { stage: stage as ContactStage }),
          },
          { AND: emptyGuard(onRecord, { checkSizeCents: "amountCents", stage: "status" }) },
        );
        if (!saved) {
          await left();
          continue;
        }
      }
      if (Object.keys(contactChanges).length > 0) {
        const { count } = await tx.contact.updateMany({
          where: {
            id: existing.id,
            ...scope,
            kind: "prospect",
            AND: emptyGuard(Object.keys(contactChanges)),
          },
          data: contactChanges,
        });
        if (count === 0) {
          await left();
          continue;
        }
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
