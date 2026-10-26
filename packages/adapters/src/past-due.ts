import { watchDay } from "@rakazo/core";
import type { NotificationEvents, PrismaClient } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { notifyThreadEvent } from "./run-notification.js";

// ponytail: one sweep reads at most this many past-due items; counts above it undercount. Page by bot if it matters.
const SWEEP_LIMIT = 1_000;

/**
 * One attention notification per bot per day for open items past their dueAt, whether or not the
 * bot checks in. The dedupe key is bot + the owner's local day, so later sweeps are no-ops.
 */
export async function notifyPastDueItems(deps: {
  prisma: PrismaClient;
  notificationEvents?: NotificationEvents;
  now: Date;
}): Promise<number> {
  const items = await deps.prisma.scratchpadItem.findMany({
    where: {
      status: { in: ["open", "parked"] },
      dueAt: { lt: deps.now },
      bot: { archivedAt: null },
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: SWEEP_LIMIT,
    select: {
      spaceId: true,
      userId: true,
      botId: true,
      title: true,
      bot: { select: { name: true, thread: { select: { id: true, groupId: true } } } },
    },
  });
  const byBot = new Map<string, typeof items>();
  for (const item of items) {
    const key = `${item.spaceId}:${item.userId}:${item.botId}`;
    byBot.set(key, [...(byBot.get(key) ?? []), item]);
  }
  const users = byBot.size
    ? await deps.prisma.user.findMany({
        where: { id: { in: [...new Set(items.map((item) => item.userId))] } },
        select: { id: true, timezone: true },
      })
    : [];
  const zones = new Map(users.map((user) => [user.id, user.timezone ?? "UTC"]));

  let sent = 0;
  for (const group of byBot.values()) {
    const first = group[0]!;
    const thread = first.bot.thread;
    if (!thread) continue;
    const day = watchDay(deps.now, zones.get(first.userId) ?? "UTC");
    const title =
      group.length === 1
        ? `${first.bot.name}: 1 item is past due`
        : `${first.bot.name}: ${group.length} items are past due`;
    try {
      const result = await notifyThreadEvent(
        deps.prisma,
        deps.notificationEvents,
        { spaceId: first.spaceId, userId: first.userId, botId: first.botId, threadId: thread.id },
        {
          kind: "help",
          title,
          body: first.title,
          botId: first.botId,
          threadId: thread.id,
          ...(thread.groupId ? { groupId: thread.groupId } : {}),
        },
        `past-due:${first.botId}:${day}`,
      );
      if (result === "created") sent += 1;
    } catch (error) {
      getLogger().error("past-due notification", error);
    }
  }
  return sent;
}
