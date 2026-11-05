import type {
  Contact,
  FundraiseRound,
  FundraiseRoundSaveInput,
  FundraisingOverview,
  ProspectSaveInput,
} from "@rakazo/contracts";
import { isActiveSafe } from "@rakazo/core";
import type { Prisma, PrismaClient } from "./client.js";
import { contactInclude, toContact } from "./contacts.js";
import type { PipelineDb } from "./pipeline-records.js";
import {
  ensureRecord,
  FUNDRAISING_PIPELINE,
  personlessRow,
  recordOfContact,
  savePipelineRecord,
} from "./pipeline-records.js";
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
  const [records, people, contacts, safeRows] = await Promise.all([
    prisma.pipelineRecord.findMany({ where: { ...scope, pipeline }, orderBy: { id: "asc" } }),
    prisma.pipelineRecordPerson.findMany({
      where: { ...scope, pipeline },
      select: { recordId: true, contactId: true, contact: { select: { kind: true } } },
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
  ]);
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
  const withStage = [...rows, ...personless].map((p) => ({ ...p, stage: p.stage ?? "target" }));
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
    ...(fields.checkSizeCents === undefined ? {} : { amountCents: fields.checkSizeCents }),
    ...(fields.nextStep === undefined ? {} : { nextStep: fields.nextStep }),
  };
  const personless = await prisma.pipelineRecord.findFirst({
    where: { id, ...scope, people: { none: {} } },
    select: { id: true },
  });
  if (personless) {
    await savePipelineRecord(prisma, scope, id, changes);
    return personlessRow(await prisma.pipelineRecord.findFirstOrThrow({ where: { id, ...scope } }));
  }
  const { record } = await prospectOf(prisma, scope, id);
  await savePipelineRecord(prisma, scope, record.id, changes);
  return contactRow(prisma, scope, id);
}
