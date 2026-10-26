import type {
  Contact,
  ContactDetail,
  ContactKind,
  ContactLinked,
  ContactSaveInput,
  ContactStage,
} from "@rakazo/contracts";
import { CONTACT_DETAIL_LIMIT } from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "./client.js";
import { endPortalAccess } from "./investor-portal.js";
import { listMeetings } from "./meetings.js";
import { isUniqueViolation } from "./prisma-errors.js";
import { toSafe } from "./safes.js";
import { IsolationError } from "./scope.js";

export class ContactEmailTakenError extends Error {
  constructor() {
    super("Another contact already has this email.");
    this.name = "ContactEmailTakenError";
  }
}

type Scope = { spaceId: string; userId: string };
/** Only space and user: callers may pass a whole actor, which must not reach a Prisma query. */
const ownerOf = ({ spaceId, userId }: Scope): Scope => ({ spaceId, userId });
type Db = Pick<PrismaClient, "contact" | "fundraiseRound" | "safe">;
type WriteDb = Db & Pick<PrismaClient, "$transaction">;

const withBot = { bot: { select: { id: true, name: true } } } as const;

export const toContact = (row: Prisma.ContactGetPayload<{ include: typeof withBot }>): Contact => ({
  id: row.id,
  name: row.name,
  email: row.email,
  organization: row.organization,
  kind: row.kind as ContactKind,
  notes: row.notes,
  stage: row.stage as ContactStage | null,
  checkSizeCents: row.checkSizeCents == null ? null : Number(row.checkSizeCents),
  nextStep: row.nextStep,
  roundId: row.roundId,
  portalLinkSentAt: row.portalLinkSentAt?.toISOString() ?? null,
  portalLastSeenAt: row.portalLastSeenAt?.toISOString() ?? null,
  portalBlockedAt: row.portalBlockedAt?.toISOString() ?? null,
  mercurySentAt: row.mercurySentAt?.toISOString() ?? null,
  addedBy: row.bot,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

/** The user's contacts by name, optionally one kind and/or text found in name, email, organization or notes. */
export async function listContacts(
  prisma: Db,
  actor: Scope,
  filter: { kind?: ContactKind; text?: string } = {},
): Promise<Contact[]> {
  const scope = ownerOf(actor);
  const text = filter.text?.trim();
  const contains = (field: "name" | "email" | "organization" | "notes") => ({
    [field]: { contains: text, mode: "insensitive" as const },
  });
  const rows = await prisma.contact.findMany({
    where: {
      ...scope,
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(text
        ? { OR: [contains("name"), contains("email"), contains("organization"), contains("notes")] }
        : {}),
    },
    include: withBot,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return rows.map(toContact);
}

/**
 * The round a stage save puts a prospect in: the open round for Committed (none when no round is
 * open), none for any other stage, and undefined (keep it) when the stage is not part of the save.
 */
export async function roundIdForStage(
  prisma: Pick<PrismaClient, "fundraiseRound">,
  actor: Scope,
  stage: ContactStage | null | undefined,
): Promise<string | null | undefined> {
  if (stage === undefined) return undefined;
  if (stage !== "committed") return null;
  const open = await prisma.fundraiseRound.findFirst({
    where: { ...ownerOf(actor), closedAt: null },
    select: { id: true },
  });
  return open?.id ?? null;
}

export const contactPhotoPath = (email: string) =>
  `/api/contacts/photo?email=${encodeURIComponent(email)}`;

/** Adds `photoUrl` to the contacts whose email has a stored photo of this user's. */
export async function withContactPhotos<T extends Contact>(
  prisma: Pick<PrismaClient, "contactPhoto">,
  actor: Scope,
  contacts: T[],
): Promise<T[]> {
  const emails = [...new Set(contacts.flatMap((c) => (c.email ? [c.email.toLowerCase()] : [])))];
  if (emails.length === 0) return contacts;
  const rows = await prisma.contactPhoto.findMany({
    where: { ...ownerOf(actor), email: { in: emails } },
    select: { email: true },
  });
  const have = new Set(rows.map((row) => row.email));
  return contacts.map((c) =>
    c.email && have.has(c.email.toLowerCase())
      ? { ...c, photoUrl: contactPhotoPath(c.email.toLowerCase()) }
      : c,
  );
}

/**
 * Updates the contact with `id`, keeping omitted fields; without `id`, creates one.
 * Throws IsolationError for an `id` that is not the user's.
 */
async function writeContact(
  prisma: WriteDb,
  actor: Scope,
  input: ContactSaveInput,
): Promise<Contact> {
  const scope = ownerOf(actor);
  const { id, roundId: keepRound, ...fields } = input;
  let roundId = await roundIdForStage(prisma, scope, fields.stage);
  if (keepRound && fields.stage === "committed") {
    const own = await prisma.fundraiseRound.findFirst({
      where: { id: keepRound, ...scope },
      select: { id: true },
    });
    if (!own) throw new IsolationError("Round not found");
    roundId = own.id;
  }
  const data = { ...fields, roundId };
  if (!id)
    return toContact(
      await prisma.contact.create({ data: { ...scope, ...data }, include: withBot }),
    );
  // The contact row is locked first, so portal exchanges and link mints queue behind a change of
  // email or kind and cannot leave a session that outlives it.
  return prisma.$transaction(async (tx) => {
    const [before] = await tx.$queryRaw<{ email: string | null; kind: string }[]>`
      SELECT "email", "kind" FROM "contacts"
      WHERE "id" = ${id} AND "spaceId" = ${scope.spaceId} AND "userId" = ${scope.userId}
      FOR UPDATE`;
    if (!before) throw new IsolationError("Contact not found");
    await tx.contact.update({ where: { id }, data });
    const emailChanged = fields.email !== undefined && fields.email !== before.email;
    const leftInvestors =
      before.kind === "investor" && fields.kind !== undefined && fields.kind !== "investor";
    if (emailChanged || leftInvestors) {
      await endPortalAccess(tx, id);
      await tx.contact.update({
        where: { id },
        data: { portalLinkSentAt: null, portalLastSeenAt: null },
      });
    }
    if (leftInvestors) await tx.investorShare.deleteMany({ where: { contactId: id } });
    return toContact(await tx.contact.findUniqueOrThrow({ where: { id }, include: withBot }));
  });
}

/** One of the user's contacts; IsolationError when it is not theirs. */
export async function getContact(prisma: Db, actor: Scope, id: string): Promise<Contact> {
  const row = await prisma.contact.findFirst({
    where: { id, ...ownerOf(actor) },
    include: withBot,
  });
  if (!row) throw new IsolationError("Contact not found");
  return toContact(row);
}

/**
 * The contact and what is stored against it. Mail and meetings match the contact's email address
 * (sender or recipient; attendee); documents (shared from the Data room) and SAFEs match its id.
 * Every query is scoped to the user's space and user; IsolationError when the contact is not theirs.
 */
export async function contactDetail(
  prisma: PrismaClient,
  actor: Scope,
  id: string,
): Promise<ContactDetail> {
  const scope = ownerOf(actor);
  const contact = await getContact(prisma, scope, id);
  const email = contact.email?.toLowerCase();
  const limit = CONTACT_DETAIL_LIMIT;
  const [messageIds, meetings, shares, safes] = await Promise.all([
    email
      ? prisma.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM (
            SELECT DISTINCT ON ("threadId") "id", "receivedAt" FROM "mail_messages"
            WHERE "spaceId" = ${scope.spaceId} AND "userId" = ${scope.userId} AND NOT "isSpam"
              AND (lower("fromAddress") = ${email}
                OR EXISTS (SELECT 1 FROM unnest("toAddresses" || "ccAddresses") AS a WHERE lower(a) = ${email}))
            ORDER BY "threadId", "receivedAt" DESC
          ) AS newest ORDER BY "receivedAt" DESC LIMIT ${limit}`
      : [],
    email ? listMeetings(prisma, scope, { attendeeEmail: email, limit }) : [],
    prisma.investorShare.findMany({
      where: { ...scope, contactId: id },
      select: { dataRoomItem: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.safe.findMany({
      where: { ...scope, contactId: id },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);
  const messages = await prisma.cachedMailMessage.findMany({
    where: { ...scope, id: { in: messageIds.map((row) => row.id) } },
  });
  const byId = new Map(messages.map((message) => [message.id, message]));
  return {
    contact,
    mail: messageIds.flatMap(({ id: messageId }) => {
      const m = byId.get(messageId);
      return m
        ? [
            {
              id: m.id,
              subject: m.subject,
              from: m.fromName || m.fromAddress,
              snippet: m.snippet,
              receivedAt: m.receivedAt.toISOString(),
            },
          ]
        : [];
    }),
    meetings: meetings.map((m) => ({
      id: m.id,
      title: m.title,
      startedAt: m.startedAt.toISOString(),
    })),
    documents: shares.map((share) => share.dataRoomItem),
    safes: safes.map((row) => {
      const safe = toSafe(row);
      return { id: safe.id, amountCents: safe.amountCents, status: safe.status };
    }),
  };
}

/** What deleting the contact removes besides its own fields; later slices add their links here. */
export async function linkedContact(
  prisma: Pick<PrismaClient, "contact">,
  actor: Scope,
  id: string,
): Promise<ContactLinked> {
  const row = await prisma.contact.findFirst({
    where: { id, ...ownerOf(actor) },
    select: {
      _count: { select: { portalTokens: true, portalSessions: true } },
      shares: { select: { dataRoomItem: { select: { name: true } } } },
    },
  });
  if (!row) throw new IsolationError("Contact not found");
  return {
    portal: row._count.portalTokens + row._count.portalSessions > 0,
    documents: row.shares.map((share) => share.dataRoomItem.name).sort(),
  };
}

export async function deleteContact(prisma: WriteDb, actor: Scope, id: string): Promise<void> {
  const scope = ownerOf(actor);
  // A detached Mercury SAFE counts in no round (the foreign key clears contactId only).
  const count = await prisma.$transaction(async (tx) => {
    await tx.safe.updateMany({
      where: { ...scope, contactId: id, source: "mercury" },
      data: { roundId: null },
    });
    return (await tx.contact.deleteMany({ where: { id, ...scope } })).count;
  });
  if (count === 0) throw new IsolationError("Contact not found");
}

/**
 * Saves a contact without ever changing an existing one: a contact with the same email
 * or, without an email, the same name and organization (case-insensitive) is returned as is.
 * Safe for unattended callers. `botId` is the agent adding it, set by the caller, never from model input.
 */
export async function addContactIfNew(
  prisma: Db,
  actor: Scope,
  input: Omit<ContactSaveInput, "id">,
  botId: string | null = null,
): Promise<{ contact: Contact; created: boolean }> {
  const scope = ownerOf(actor);
  // Prisma turns an insensitive equals into ILIKE, so escape its wildcards.
  const insensitive = (value: string) => ({
    equals: value.replace(/[\\%_]/g, "\\$&"),
    mode: "insensitive" as const,
  });
  const name = input.name.trim();
  const organization = input.organization?.trim() || null;
  // The schema lowercases email, so it matches exactly.
  const where = input.email
    ? { ...scope, email: input.email }
    : {
        ...scope,
        name: insensitive(name),
        organization: organization ? insensitive(organization) : null,
      };
  const existing = await prisma.contact.findFirst({
    where,
    orderBy: { id: "asc" },
    include: withBot,
  });
  if (existing) return { contact: toContact(existing), created: false };
  // ponytail: only email is unique, so concurrent no-email adds can both insert a duplicate row;
  // upgrade to a unique index on lower(name) plus organization, or an advisory lock.
  try {
    const row = await prisma.contact.create({
      data: { ...scope, ...input, name, organization, botId },
      include: withBot,
    });
    return { contact: toContact(row), created: true };
  } catch (error) {
    // A concurrent run saved the same email first.
    if (isUniqueViolation(error) && input.email) {
      const row = await prisma.contact.findFirst({
        where: { ...scope, email: input.email },
        include: withBot,
      });
      if (row) return { contact: toContact(row), created: false };
    }
    throw error;
  }
}

/** Creates or updates a contact. Throws ContactEmailTakenError when another contact has the email. */
export const saveContact = (prisma: WriteDb, actor: Scope, input: ContactSaveInput) =>
  writeContact(prisma, actor, input).catch((error: unknown) => {
    throw isUniqueViolation(error) ? new ContactEmailTakenError() : error;
  });
