import { NO_REPLY_STOP_AT } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { protectedSenders } from "./mail-protected-senders.js";

type Scope = { spaceId: string; userId: string };

/**
 * The user says one message needs no reply. It counts toward its sender once, and only when it is
 * a message Needs reply shows: the user has not answered and has not already said so. Archiving
 * never calls this, because an archive can mean "answered somewhere else". Returns the sender when
 * (its name, else its address) when this was the correction that stops Needs reply for it, so the
 * caller can offer Undo.
 */
export async function dismissReply(
  prisma: PrismaClient,
  scope: Scope,
  messageId: string,
): Promise<{ stopped: string | null }> {
  const shown = {
    id: messageId,
    ...scope,
    fromSelf: false,
    needsReply: true,
    alreadyHandled: false,
    replyDismissedAt: null,
    connection: { status: "connected" as const },
  };
  const message = await prisma.cachedMailMessage.findFirst({
    where: shown,
    select: {
      connectionId: true,
      threadId: true,
      receivedAt: true,
      fromAddress: true,
      fromName: true,
    },
  });
  if (!message) return { stopped: null };
  const answered = await prisma.cachedMailMessage.findFirst({
    where: {
      ...scope,
      connectionId: message.connectionId,
      threadId: message.threadId,
      fromSelf: true,
      receivedAt: { gt: message.receivedAt },
    },
    select: { id: true },
  });
  if (answered) return { stopped: null };

  const address = message.fromAddress.trim().toLowerCase();
  const count = await prisma.$transaction(async (tx) => {
    // The guarded update is the once-per-message check: a second call finds nothing to change.
    const { count: changed } = await tx.cachedMailMessage.updateMany({
      where: shown,
      data: { replyDismissedAt: new Date(), needsReply: false },
    });
    if (changed === 0) return null;
    const [row] = await tx.$queryRaw<Array<{ noReplyCount: number }>>`
      UPDATE mail_sender_stats SET "noReplyCount" = "noReplyCount" + 1, "noReplyAt" = now()
      WHERE "connectionId" = ${message.connectionId} AND "senderAddress" = ${address}
        AND "spaceId" = ${scope.spaceId} AND "userId" = ${scope.userId}
      RETURNING "noReplyCount"`;
    return row?.noReplyCount ?? null;
  });
  if (count !== NO_REPLY_STOP_AT) return { stopped: null };
  // A protected sender is never stopped, so there is nothing to announce.
  return {
    stopped: (await protectedSenders(prisma, scope, [address])).has(address)
      ? null
      : message.fromName?.trim() || address,
  };
}

/** Undo for the "Stopped" toast: the sender is back to 2 corrections. */
export async function undoReplyStop(
  prisma: PrismaClient,
  scope: Scope,
  messageId: string,
): Promise<void> {
  const message = await prisma.cachedMailMessage.findFirst({
    where: { id: messageId, ...scope },
    select: { connectionId: true, fromAddress: true },
  });
  if (!message) return;
  await prisma.$executeRaw`
    UPDATE mail_sender_stats SET "noReplyCount" = ${NO_REPLY_STOP_AT - 1}
    WHERE "connectionId" = ${message.connectionId} AND "senderAddress" = ${message.fromAddress.trim().toLowerCase()}
      AND "spaceId" = ${scope.spaceId} AND "userId" = ${scope.userId}
      AND "noReplyCount" >= ${NO_REPLY_STOP_AT}`;
}
