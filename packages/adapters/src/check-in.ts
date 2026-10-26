import { watchDay } from "@rakazo/core";
import type { Prisma, PrismaClient } from "@rakazo/db";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * True when the check-in routine already posted a message today (calendar day in the routine's
 * time zone). A check-in posts at most once per bot per day; a silent run posted nothing.
 */
export async function checkInPostedToday(
  db: Db,
  routine: { id: string; timezone: string },
  now: Date,
): Promise<boolean> {
  const runs = await db.run.findMany({
    where: { routineId: routine.id, createdAt: { gte: new Date(now.getTime() - 48 * 3_600_000) } },
    select: { id: true },
  });
  if (runs.length === 0) return false;
  const messages = await db.message.findMany({
    where: { runId: { in: runs.map((run) => run.id) }, role: "bot" },
    select: { createdAt: true },
  });
  const today = watchDay(now, routine.timezone);
  return messages.some((message) => watchDay(message.createdAt, routine.timezone) === today);
}
