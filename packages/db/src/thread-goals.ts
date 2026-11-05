import type { ThreadGoal } from "@rakazo/contracts";
import type { Prisma } from "./client.js";
import { appendEventInTransaction } from "./events.js";

/** Every goal query is scoped to the Space and the owning user; the thread belongs to a bot. */
export type GoalScope = { spaceId: string; userId: string; threadId: string; botId: string };

type GoalRow = Awaited<ReturnType<Prisma.TransactionClient["threadGoal"]["findFirstOrThrow"]>>;

const OPEN = ["active", "paused"];

/** What clients see: only an open goal; an ended one is null. */
export function threadGoalView(row: GoalRow | null | undefined): ThreadGoal | null {
  if (!row || !OPEN.includes(row.status)) return null;
  const verdict = row.lastVerdict as { reason?: unknown } | null;
  return {
    id: row.id,
    text: row.text,
    status: row.status as ThreadGoal["status"],
    stopReason: row.stopReason as ThreadGoal["stopReason"],
    lastReason: typeof verdict?.reason === "string" ? verdict.reason : null,
    continuations: row.continuations,
    startedAt: row.startedAt.toISOString(),
  };
}

export function findOpenGoal(
  tx: Pick<Prisma.TransactionClient, "threadGoal">,
  scope: Pick<GoalScope, "spaceId" | "userId" | "threadId">,
) {
  return tx.threadGoal.findFirst({
    where: {
      spaceId: scope.spaceId,
      userId: scope.userId,
      threadId: scope.threadId,
      status: { in: OPEN },
    },
  });
}

async function emitGoal(tx: Prisma.TransactionClient, scope: GoalScope, row: GoalRow) {
  const event = await appendEventInTransaction(tx, {
    spaceId: scope.spaceId,
    threadId: scope.threadId,
    botId: scope.botId,
    type: "thread.goal.updated",
    payload: { goal: threadGoalView(row) },
  });
  return event.seq;
}

/** Changes the open goal if it is in one of `from`, and tells clients. Returns the event seq, or null when nothing changed. */
async function changeOpenGoal(
  tx: Prisma.TransactionClient,
  scope: GoalScope,
  from: string[],
  data: Prisma.ThreadGoalUpdateInput,
) {
  const goal = await findOpenGoal(tx, scope);
  if (!goal || !from.includes(goal.status)) return null;
  return emitGoal(tx, scope, await tx.threadGoal.update({ where: { id: goal.id }, data }));
}

export const clearOpenGoal = (tx: Prisma.TransactionClient, scope: GoalScope) =>
  changeOpenGoal(tx, scope, OPEN, { status: "cleared", endedAt: new Date() });

export const pauseActiveGoal = (tx: Prisma.TransactionClient, scope: GoalScope) =>
  changeOpenGoal(tx, scope, ["active"], { status: "paused", stopReason: "owner" });

/** The owner's next message resumes a paused goal with fresh limits. */
export const resumePausedGoal = (tx: Prisma.TransactionClient, scope: GoalScope) =>
  changeOpenGoal(tx, scope, ["paused"], {
    status: "active",
    stopReason: null,
    startedAt: new Date(),
    continuations: 0,
    stalls: 0,
  });

/** Ends any open goal as cleared and opens a new active one. The caller holds the thread lock or runs serializable. */
export async function startGoal(tx: Prisma.TransactionClient, scope: GoalScope, text: string) {
  await tx.threadGoal.updateMany({
    where: {
      spaceId: scope.spaceId,
      userId: scope.userId,
      threadId: scope.threadId,
      status: { in: OPEN },
    },
    data: { status: "cleared", endedAt: new Date() },
  });
  const goal = await tx.threadGoal.create({
    data: {
      spaceId: scope.spaceId,
      userId: scope.userId,
      threadId: scope.threadId,
      botId: scope.botId,
      text,
      status: "active",
    },
  });
  return { goal, seq: await emitGoal(tx, scope, goal) };
}
