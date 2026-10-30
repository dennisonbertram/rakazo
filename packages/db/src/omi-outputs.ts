import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "./client.js";

/** Deletes meetings with their Inbox to-dos, as `deleteMeeting` does (no tombstone: the user did not delete them). */
export async function deleteMeetingsWithTodos(
  db: Pick<PrismaClient, "meeting" | "inboxTodo">,
  actor: Pick<Actor, "spaceId" | "userId">,
  ids: string[],
): Promise<void> {
  const owner = { spaceId: actor.spaceId, userId: actor.userId };
  await db.inboxTodo.deleteMany({ where: { ...owner, meetingId: { in: ids } } });
  await db.meeting.deleteMany({ where: { ...owner, id: { in: ids } } });
}

/**
 * Deletes the meetings and note items made from Omi recordings (one audio item, or every one of a
 * connection) and returns the blob keys of the removed notes. The segments go with the audio item.
 */
export async function deleteOmiOutputs(
  prisma: PrismaClient,
  actor: Pick<Actor, "spaceId" | "userId">,
  where: { audioItemId: string } | { connectionId: string },
): Promise<string[]> {
  const owner = { spaceId: actor.spaceId, userId: actor.userId };
  const segments = await prisma.omiSegment.findMany({
    where: { ...owner, ...where },
    select: { meetingId: true, noteItemId: true },
  });
  const meetingIds = segments.flatMap((s) => (s.meetingId ? [s.meetingId] : []));
  const noteIds = segments.flatMap((s) => (s.noteItemId ? [s.noteItemId] : []));
  const notes = await prisma.dataRoomItem.findMany({
    where: { ...owner, id: { in: noteIds } },
    select: { storageKey: true, thumbnailKey: true },
  });
  await prisma.$transaction(async (tx) => {
    await deleteMeetingsWithTodos(tx, owner, meetingIds);
    await tx.dataRoomItem.deleteMany({ where: { ...owner, id: { in: noteIds } } });
  });
  return notes.flatMap((n) => [n.storageKey, n.thumbnailKey].filter((k): k is string => !!k));
}
