import type { PrismaClient } from "@rakazo/db";

type Scope = { spaceId: string; userId: string };

/**
 * Agents in the space with the Firewall switch on, read fresh each time so a switch change applies
 * to the next call. Rows without `firewall: true` are ignored, whatever the query returned.
 */
export async function firewalledBotIds(
  prisma: Pick<PrismaClient, "bot">,
  spaceId: string,
): Promise<Set<string>> {
  const rows = await prisma.bot.findMany({
    where: { spaceId, firewall: true },
    select: { id: true, firewall: true },
  });
  return new Set(rows.filter((row) => row.firewall === true).map((row) => row.id));
}

/** A group that has a firewalled member loads that member's text into every member's run. */
export async function groupHasFirewalledMember(
  prisma: Pick<PrismaClient, "chatGroupMember">,
  groupId: string,
  firewalled: ReadonlySet<string>,
): Promise<boolean> {
  if (firewalled.size === 0) return false;
  const members = await prisma.chatGroupMember.findMany({
    where: { groupId, botId: { in: [...firewalled] } },
    select: { botId: true },
  });
  return members.some((member) => firewalled.has(member.botId));
}

/** Tools whose results can carry records another agent wrote (see `readsFirewalledContent`). */
export const FIREWALL_CONTENT_READERS: ReadonlySet<string> = new Set([
  "agent_context",
  "search_agent_history",
  "read_agent_history",
  "calendar_agenda",
  "board_tickets",
  "ticket_get",
]);

const AGENT_RECORD_TOOLS = new Set(["agent_context", "search_agent_history", "read_agent_history"]);

/**
 * Whether a call reads records a firewalled agent wrote. Pages, pins and an agent's own to-do list
 * are scoped to the calling agent, so they only cross agents through the readers below: the
 * calendar agenda (to-dos and routines of every agent), the ticket board, and the voice agent's
 * views of another agent. Checked by author, so the records carry no mark.
 */
export async function readsFirewalledContent(
  prisma: Pick<PrismaClient, "scratchpadItem" | "routine" | "ticket" | "ticketComment">,
  scope: Scope,
  name: string,
  args: Record<string, unknown>,
  firewalled: ReadonlySet<string>,
): Promise<boolean> {
  if (firewalled.size === 0) return false;
  const authors = [...firewalled];
  const written = (rows: { botId?: string | null }[]) =>
    rows.some((row) => row.botId != null && firewalled.has(row.botId));
  if (AGENT_RECORD_TOOLS.has(name))
    return typeof args.botId === "string" && firewalled.has(args.botId);
  if (name === "calendar_agenda") {
    const [items, routines] = await Promise.all([
      prisma.scratchpadItem.findMany({
        where: { ...scope, botId: { in: authors }, status: { not: "done" }, dueAt: { not: null } },
        select: { botId: true },
        take: 50,
      }),
      prisma.routine.findMany({
        where: { ...scope, botId: { in: authors }, active: true },
        select: { botId: true },
        take: 50,
      }),
    ]);
    return written(items) || written(routines);
  }
  if (name === "board_tickets" || name === "ticket_get") {
    const [tickets, comments] = await Promise.all([
      prisma.ticket.findMany({
        where: { spaceId: scope.spaceId, createdByBotId: { in: authors } },
        select: { createdByBotId: true },
        take: 50,
      }),
      prisma.ticketComment.findMany({
        where: { spaceId: scope.spaceId, authorBotId: { in: authors } },
        select: { authorBotId: true },
        take: 50,
      }),
    ]);
    return (
      tickets.some((row) => row.createdByBotId != null && firewalled.has(row.createdByBotId)) ||
      comments.some((row) => row.authorBotId != null && firewalled.has(row.authorBotId))
    );
  }
  return false;
}
