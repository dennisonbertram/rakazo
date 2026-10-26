import type { AdapterContext } from "@rakazo/adapter-kit";
import type { CalendarAgenda, CalendarItem } from "@rakazo/contracts";
import { isOneShotRoutineCrons } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { Prisma } from "@rakazo/db";
import type { CalendarAccount, CalendarToolDeps } from "./calendar-tools.js";
import { CALENDAR_API, errorText, request } from "./calendar-tools.js";
import { asRecord } from "./connector-http.js";
import { OPEN_SCRATCHPAD_STATUSES } from "./scratchpad-tools.js";

const MAX_PER_QUERY = 250;
const OPEN_BOT = { archivedAt: null };

export type CalendarAgendaDeps = Pick<CalendarToolDeps, "connectors" | "google"> & {
  prisma: Pick<PrismaClient, "scratchpadItem" | "inboxTodo" | "routine">;
};

const str = (value: unknown) => (typeof value === "string" ? value : undefined);

/**
 * The user's Google events (every account, every selected calendar), open to-dos with a due time,
 * one-shot check-backs and the next run of each repeating routine, in start order. The API page
 * and the bot tool both call this. `accounts` is null when Google is off for this caller.
 *
 * ponytail: a repeating routine shows only its next run, not every cron occurrence; expand the
 * occurrences when a month view needs them. Page watches (every few minutes) and the managed
 * check-in routine are left out because they would bury everything else.
 */
export async function calendarAgenda(
  deps: CalendarAgendaDeps,
  scope: { spaceId: string; userId: string },
  range: { from: Date; to: Date },
  google: { accounts: CalendarAccount[]; context: AdapterContext } | null,
): Promise<CalendarAgenda> {
  const errors: CalendarAgenda["errors"] = [];
  const accounts = google?.accounts ?? [];
  const [events, todos, inboxTodos, routines] = await Promise.all([
    Promise.all(
      accounts.map(async (account) => {
        const result = await accountEvents(deps, account, google!.context, range).catch(
          (error: unknown) => ({ items: [] as CalendarItem[], failed: errorText(error) }),
        );
        if (result.failed) errors.push({ account: account.label, message: result.failed });
        return result.items;
      }),
    ),
    deps.prisma.scratchpadItem.findMany({
      where: {
        ...scope,
        status: { in: OPEN_SCRATCHPAD_STATUSES },
        dueAt: { gte: range.from, lt: range.to },
        bot: OPEN_BOT,
      },
      select: { id: true, title: true, dueAt: true, botId: true, bot: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
      take: MAX_PER_QUERY,
    }),
    deps.prisma.inboxTodo.findMany({
      where: { ...scope, doneAt: null, dueOn: { gte: range.from, lt: range.to } },
      select: { id: true, text: true, dueOn: true },
      orderBy: { dueOn: "asc" },
      take: MAX_PER_QUERY,
    }),
    deps.prisma.routine.findMany({
      where: {
        ...scope,
        active: true,
        managedKind: null,
        watch: { equals: Prisma.DbNull },
        nextRunAt: { gte: range.from, lt: range.to },
        bot: OPEN_BOT,
      },
      select: {
        id: true,
        name: true,
        crons: true,
        nextRunAt: true,
        botId: true,
        bot: { select: { name: true } },
      },
      orderBy: { nextRunAt: "asc" },
      take: MAX_PER_QUERY,
    }),
  ]);
  const local = (
    item: Pick<CalendarItem, "id" | "kind" | "title" | "allDay" | "botId" | "botName">,
    start: Date,
  ): CalendarItem => ({
    ...item,
    start: start.toISOString(),
    end: null,
    account: null,
    href: null,
  });
  const items: CalendarItem[] = [
    ...events.flat(),
    ...todos.flatMap((row) =>
      row.dueAt
        ? [
            local(
              {
                id: `todo:${row.id}`,
                kind: "todo",
                title: row.title,
                allDay: false,
                botId: row.botId,
                botName: row.bot.name,
              },
              row.dueAt,
            ),
          ]
        : [],
    ),
    ...inboxTodos.flatMap((row) =>
      row.dueOn
        ? [
            local(
              {
                id: `inbox-todo:${row.id}`,
                kind: "todo",
                title: row.text,
                allDay: true,
                botId: null,
                botName: null,
              },
              row.dueOn,
            ),
          ]
        : [],
    ),
    ...routines.flatMap((row) =>
      row.nextRunAt
        ? [
            local(
              {
                id: `routine:${row.id}`,
                kind: isOneShotRoutineCrons(row.crons) ? "check_back" : "routine",
                title: row.name,
                allDay: false,
                botId: row.botId,
                botName: row.bot.name,
              },
              row.nextRunAt,
            ),
          ]
        : [],
    ),
  ].sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  return { items, errors, googleConnected: accounts.length > 0 };
}

/** Events of every selected calendar of one account. A failed calendar marks the account as failed but keeps the others. */
async function accountEvents(
  deps: Pick<CalendarToolDeps, "connectors" | "google">,
  account: CalendarAccount,
  context: AdapterContext,
  range: { from: Date; to: Date },
): Promise<{ items: CalendarItem[]; failed?: string }> {
  const get = (url: string) => request(deps, account, context, "GET", url);
  const listed = asRecord(
    await get(`${CALENDAR_API}/users/me/calendarList?minAccessRole=reader&maxResults=100`),
  );
  const calendars = (Array.isArray(listed?.items) ? listed.items : [])
    .map(asRecord)
    .filter((entry) => entry && entry.selected === true && !entry.deleted && str(entry.id));
  const items: CalendarItem[] = [];
  let failed: string | undefined;
  await Promise.all(
    calendars.map(async (calendar) => {
      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "startTime",
        timeMin: range.from.toISOString(),
        timeMax: range.to.toISOString(),
        maxResults: String(MAX_PER_QUERY),
      });
      try {
        const data = asRecord(
          await get(
            `${CALENDAR_API}/calendars/${encodeURIComponent(str(calendar!.id)!)}/events?${params}`,
          ),
        );
        for (const raw of Array.isArray(data?.items) ? data.items : []) {
          const item = eventItem(raw, account, str(calendar!.id)!);
          if (item) items.push(item);
        }
      } catch (error) {
        failed ??= errorText(error);
      }
    }),
  );
  return { items, ...(failed ? { failed } : {}) };
}

function eventItem(
  raw: unknown,
  account: CalendarAccount,
  calendarId: string,
): CalendarItem | null {
  const event = asRecord(raw);
  const id = str(event?.id);
  if (!event || !id || event.status === "cancelled") return null;
  const attendees = Array.isArray(event.attendees) ? event.attendees.map(asRecord) : [];
  if (attendees.some((a) => a?.self === true && a.responseStatus === "declined")) return null;
  const when = (value: unknown) => {
    const point = asRecord(value);
    const dateTime = str(point?.dateTime);
    const date = str(point?.date);
    const iso = dateTime ?? (date ? `${date}T00:00:00.000Z` : undefined);
    const time = iso ? new Date(iso) : undefined;
    return time && !Number.isNaN(time.getTime())
      ? { iso: time.toISOString(), allDay: !dateTime }
      : null;
  };
  const start = when(event.start);
  if (!start) return null;
  const end = when(event.end);
  return {
    id: `event:${account.id}:${calendarId}:${id}`,
    kind: "event",
    title: str(event.summary)?.trim() || "(No title)",
    start: start.iso,
    end: end?.iso ?? null,
    allDay: start.allDay,
    botId: null,
    botName: null,
    account: account.label,
    href: str(event.htmlLink) ?? null,
  };
}
