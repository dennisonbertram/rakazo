import type { CapTableSnapshot, CapTableSnapshotInput } from "@rakazo/contracts";
import { CapTableSnapshotInputSchema } from "@rakazo/contracts";
import type { Prisma, PrismaClient } from "./client.js";
import { parseLegalDay } from "./legal.js";

type Scope = { spaceId: string; userId: string };
type Db = Pick<PrismaClient, "capTableSnapshot">;
/** Only space and user: callers may pass a whole actor, which must not reach a Prisma query. */
const ownerOf = ({ spaceId, userId }: Scope): Scope => ({ spaceId, userId });

/** The user's latest cap table snapshot, or null before the first sync. */
export async function getCapTableSnapshot(
  prisma: Db,
  actor: Scope,
): Promise<CapTableSnapshot | null> {
  const row = await prisma.capTableSnapshot.findUnique({
    where: { spaceId_userId: ownerOf(actor) },
  });
  if (!row) return null;
  const data = CapTableSnapshotInputSchema.safeParse(row.data);
  return data.success ? { ...data.data, updatedAt: row.updatedAt.toISOString() } : null;
}

const DEADLINE_TITLE = "409A valuation expires";
const SUPERSEDED_NOTE = "Dismissed: a newer 409A replaced this one.";
const QUOTE_PREFIX = "From Carta:";
type Tx = Pick<Prisma.TransactionClient, "legalDeadline">;

/**
 * Keeps one open "409A valuation expires" deadline for the newest 409A in the snapshot: the expiry
 * Carta gives, else 12 months after the valuation date. It only reads or changes Carta-owned rows
 * (derived, no contract, no data room item, source quote "From Carta: ..."), never a row the user
 * or the Legal agent made. It has no contract, so contract analysis never dismisses it.
 */
async function syncExpiryDeadline(
  tx: Tx,
  scope: Scope,
  data: ReturnType<typeof CapTableSnapshotInputSchema.parse>,
) {
  const dated = [data.latest409a, ...data.valuations409a].filter((v) => v != null);
  const newest = dated.reduce<(typeof dated)[number] | undefined>(
    (a, b) => (!a || b.date > a.date ? b : a),
    undefined,
  );
  const valuedOn = newest && parseLegalDay(newest.date);
  if (!newest || !valuedOn) return;
  const expiresOn = dated.find((v) => v.date === newest.date && v.expiresOn)?.expiresOn;
  const dueDate = (expiresOn && parseLegalDay(expiresOn)) || new Date(valuedOn);
  if (!expiresOn) dueDate.setUTCFullYear(dueDate.getUTCFullYear() + 1);

  const owned = await tx.legalDeadline.findMany({
    where: {
      ...scope,
      title: DEADLINE_TITLE,
      derived: true,
      contractId: null,
      dataRoomItemId: null,
      sourceQuote: { startsWith: QUOTE_PREFIX },
    },
  });
  // A snapshot older than one already synced must not undo it.
  if (owned.some((row) => row.dueDate > dueDate)) return;
  const sourceQuote = `${QUOTE_PREFIX} 409A dated ${newest.date}`;
  const current = owned.find((row) => row.dueDate.getTime() === dueDate.getTime());
  if (!current) {
    await tx.legalDeadline.create({
      data: {
        ...scope,
        title: DEADLINE_TITLE,
        kind: "compliance",
        dueDate,
        derived: true,
        sourceQuote,
      },
    });
  } else if (current.status === "dismissed" && current.notes === SUPERSEDED_NOTE) {
    await tx.legalDeadline.update({
      where: { id: current.id },
      data: { status: "open", notes: null, sourceQuote },
    });
  }
  const older = owned.filter((row) => row.status === "open" && row.dueDate < dueDate);
  if (older.length)
    await tx.legalDeadline.updateMany({
      where: { id: { in: older.map((row) => row.id) } },
      data: { status: "dismissed", notes: SUPERSEDED_NOTE },
    });
}

/** Validates the input and replaces the user's snapshot. Throws a ZodError for invalid input. */
export async function saveCapTableSnapshot(
  prisma: Pick<PrismaClient, "$transaction">,
  actor: Scope,
  input: CapTableSnapshotInput,
): Promise<void> {
  const data = CapTableSnapshotInputSchema.parse(input);
  const scope = ownerOf(actor);
  // One save at a time per space and user, so two syncs cannot both open the deadline.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`cap-table:${scope.spaceId}:${scope.userId}`}, 0))`;
    await tx.capTableSnapshot.upsert({
      where: { spaceId_userId: scope },
      create: { ...scope, data },
      update: { data },
    });
    await syncExpiryDeadline(tx, scope, data);
  });
}
