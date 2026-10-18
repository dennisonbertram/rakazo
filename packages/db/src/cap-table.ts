import type { Actor, CapTableSnapshot, CapTableSnapshotInput } from "@rakazo/contracts";
import { CapTableSnapshotInputSchema } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";
import { createLegalRepos, parseLegalDay } from "./legal.js";

type Scope = { spaceId: string; userId: string };
type Db = Pick<PrismaClient, "capTableSnapshot" | "legalDeadline">;
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

/**
 * Keeps one open derived "409A valuation expires" deadline for the snapshot's latest 409A: the
 * expiry Carta gives, else 12 months after the valuation date. It has no contract, so contract
 * analysis never dismisses it. An open one for an older 409A is dismissed.
 */
async function syncExpiryDeadline(
  prisma: Db,
  scope: Scope,
  latest: CapTableSnapshot["latest409a"],
) {
  const valuedOn = latest && parseLegalDay(latest.date);
  if (!latest || !valuedOn) return;
  const dueDate = (latest.expiresOn && parseLegalDay(latest.expiresOn)) || new Date(valuedOn);
  if (!latest.expiresOn) dueDate.setUTCFullYear(dueDate.getUTCFullYear() + 1);
  // upsertDeadline touches only legalDeadline here (no contract or data room item).
  const repo = createLegalRepos(prisma as PrismaClient);
  await repo.upsertDeadline(scope as Actor, {
    title: DEADLINE_TITLE,
    kind: "compliance",
    dueDate,
    derived: true,
    sourceQuote: `From Carta: 409A dated ${latest.date}`,
    contractId: null,
  });
  await prisma.legalDeadline.updateMany({
    where: {
      ...scope,
      title: DEADLINE_TITLE,
      kind: "compliance",
      derived: true,
      contractId: null,
      dataRoomItemId: null,
      status: "open",
      dueDate: { not: dueDate },
    },
    data: { status: "dismissed", notes: SUPERSEDED_NOTE },
  });
}

/** Validates the input and replaces the user's snapshot. Throws a ZodError for invalid input. */
export async function saveCapTableSnapshot(
  prisma: Db,
  actor: Scope,
  input: CapTableSnapshotInput,
): Promise<void> {
  const data = CapTableSnapshotInputSchema.parse(input);
  const scope = ownerOf(actor);
  await prisma.capTableSnapshot.upsert({
    where: { spaceId_userId: scope },
    create: { ...scope, data },
    update: { data },
  });
  await syncExpiryDeadline(prisma, scope, data.latest409a);
}
