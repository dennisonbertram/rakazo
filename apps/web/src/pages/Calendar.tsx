import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Bot, CalendarAgenda, CalendarItem, CalendarItemKind } from "@rakazo/contracts";
import { CalendarItemKindSchema } from "@rakazo/contracts";
import { companyCalendarMonth } from "@rakazo/core";
import { BotAvatar, Button, Input } from "@rakazo/ui-web";
import { Bell, CalendarDays, CircleCheck, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PickFilter, SearchField } from "../components/ListControls";
import { PAGE_GUTTER_X, PageHeader } from "../components/PageHeader";
import { RowsSkeleton } from "../components/RowsSkeleton";
import { useListParams } from "../lib/list-params";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

const DAY_MS = 86_400_000;
const AGENDA_DAYS = 30;
const CONNECT_GOOGLE = "/app/integrations?connect=googlecalendar&returnTo=/app/calendar";

const KIND_ICON = {
  event: CalendarDays,
  todo: CircleCheck,
  check_back: Bell,
  routine: Repeat,
} as const;

const kindNames = (): Record<CalendarItemKind, string> => ({
  event: t`Events`,
  todo: t`To-dos`,
  check_back: t`Check-backs`,
  routine: t`Routines`,
});

const pad = (n: number) => String(n).padStart(2, "0");
const utcDay = (date: Date) => date.toISOString().slice(0, 10);
const localDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** The day an item is on: an all-day item keeps its date, a timed one is read in the viewer's time zone. */
const dayOf = (item: CalendarItem) =>
  item.allDay ? item.start.slice(0, 10) : localDay(new Date(item.start));

/** The window the page asks for. UTC midnights, so an all-day item on the first day is inside it. */
function windowFor(view: "agenda" | "month", month: string) {
  if (view === "month") {
    const { start, end } = companyCalendarMonth(month);
    return {
      from: new Date(`${start}T00:00:00Z`),
      to: new Date(new Date(`${end}T00:00:00Z`).getTime() + DAY_MS),
    };
  }
  const now = new Date();
  const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  return { from, to: new Date(from.getTime() + AGENDA_DAYS * DAY_MS) };
}

/** Everything scheduled for the user: their Google events and what their bots set for later. */
export function CalendarPage({
  spaceName,
  bots = [],
  onOpenBot,
}: {
  spaceName?: string;
  /** The shell's bots, for avatars. */
  bots?: Bot[];
  /** Opens a bot's panel, where its Open work and schedules are. */
  onOpenBot?: (botId: string) => void;
}) {
  const list = useListParams(["time"] as const, { field: "time", dir: "asc" });
  const view = list.param("view") === "month" ? "month" : "agenda";
  const thisMonth = localDay(new Date()).slice(0, 7);
  const monthParam = list.param("month");
  const month = monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) ? monthParam : thisMonth;
  const kindParsed = CalendarItemKindSchema.safeParse(list.param("kind"));
  const kind = kindParsed.success ? kindParsed.data : undefined;
  const botId = list.param("bot");
  const query = list.param("q") ?? "";
  const names = kindNames();

  const [data, setData] = useState<CalendarAgenda | null>(null);
  const [error, setError] = useState("");
  const latest = useRef(0);
  const load = useCallback(() => {
    const request = ++latest.current;
    setData(null);
    setError("");
    const { from, to } = windowFor(view, month);
    rpc.calendar
      .agenda({ from: from.toISOString(), to: to.toISOString() })
      .then((agenda) => request === latest.current && setData(agenda))
      .catch(
        (cause) =>
          request === latest.current && setError(errorText(cause, t`Could not load the calendar`)),
      );
  }, [view, month]);
  useEffect(load, [load]);

  const needle = query.trim().toLowerCase();
  const today = localDay(new Date());
  const shown = (data?.items ?? []).filter(
    (item) =>
      (view === "month" || dayOf(item) >= today) &&
      (!kind || item.kind === kind) &&
      (!botId || item.botId === botId) &&
      (!needle ||
        [item.title, item.botName, item.account].some((field) =>
          field?.toLowerCase().includes(needle),
        )),
  );
  const botOptions = [
    ...new Map(
      (data?.items ?? []).flatMap((item): [string, string][] =>
        item.botId && item.botName ? [[item.botId, item.botName]] : [],
      ),
    ),
  ];
  const filtered = Boolean(kind || botId || needle);

  const row = (item: CalendarItem, compact = false) => {
    const bot = bots.find((candidate) => candidate.id === item.botId);
    const Icon = KIND_ICON[item.kind];
    const time = item.allDay
      ? t`All day`
      : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
          new Date(item.start),
        );
    const body = (
      <>
        <span
          role="img"
          aria-label={names[item.kind]}
          title={names[item.kind]}
          className="shrink-0 text-muted-foreground"
        >
          <Icon size={14} aria-hidden="true" />
        </span>
        {compact ? null : (
          <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">{time}</span>
        )}
        <span
          className="min-w-0 flex-1 truncate"
          title={compact ? `${time} ${item.title}` : item.title}
        >
          {item.title}
        </span>
        {!compact && item.botName ? (
          <span className="flex max-w-[30%] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {bot ? (
              <BotAvatar color={bot.color} identity={bot.id} size={16} status={bot.status} />
            ) : null}
            <span className="truncate">{item.botName}</span>
          </span>
        ) : null}
      </>
    );
    const className = compact
      ? "flex w-full items-center gap-1 py-0.5 text-start text-xs hover:underline"
      : "flex w-full items-center gap-3 rounded-md px-2 py-2 text-start text-sm hover:bg-accent";
    if (item.href)
      return (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
        >
          {body}
        </a>
      );
    if (item.botId && onOpenBot)
      return (
        <button
          key={item.id}
          type="button"
          className={className}
          onClick={() => onOpenBot(item.botId!)}
        >
          {body}
        </button>
      );
    // An inbox to-do belongs to no bot; its list is in the Inbox.
    return (
      <Link key={item.id} to="/app/inbox" className={className}>
        {body}
      </Link>
    );
  };

  let content: ReactNode;
  if (error) {
    content = (
      <div role="alert" className="flex flex-col items-center gap-3 py-8 text-center text-sm">
        <span className="text-destructive">{error}</span>
        <Button variant="outline" size="sm" onClick={load}>
          <Trans>Try again</Trans>
        </Button>
      </div>
    );
  } else if (!data) {
    content = <RowsSkeleton className="pt-2" />;
  } else if (view === "month") {
    const bounds = companyCalendarMonth(month);
    content = (
      <table className="w-full table-fixed border-collapse" aria-label={month}>
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, day) => (
              <th
                key={day}
                scope="col"
                className="p-1 text-start text-xs font-normal text-muted-foreground sm:p-2"
              >
                {new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" }).format(
                  new Date(Date.UTC(2024, 0, 7 + day)),
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil((bounds.offset + bounds.days) / 7) }, (_, week) => (
            <tr key={week}>
              {Array.from({ length: 7 }, (_, weekday) => {
                const day = week * 7 + weekday - bounds.offset + 1;
                const date = `${month}-${pad(day)}`;
                return (
                  <td
                    key={weekday}
                    className="h-16 overflow-hidden border p-1 align-top sm:h-24 sm:p-2"
                  >
                    {day > 0 && day <= bounds.days && (
                      <>
                        <time dateTime={date} className="text-xs text-muted-foreground">
                          {day}
                        </time>
                        {shown
                          .filter((item) => dayOf(item) === date)
                          .map((item) => row(item, true))}
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    );
  } else if (shown.length === 0) {
    content = (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          {filtered ? <Trans>No matches</Trans> : <Trans>Nothing scheduled</Trans>}
        </p>
        {filtered ? (
          <Button variant="outline" size="sm" onClick={() => list.clear("q", "kind", "bot")}>
            <Trans>Clear filters</Trans>
          </Button>
        ) : null}
      </div>
    );
  } else {
    const days = [...new Set(shown.map(dayOf))];
    content = (
      <div className="space-y-4">
        {days.map((day) => (
          <section key={day} aria-label={day}>
            <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">
              {day === today ? t`Today` : null}
              {day === today ? " · " : null}
              <time dateTime={day}>
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                }).format(new Date(`${day}T00:00:00Z`))}
              </time>
            </h2>
            <div>{shown.filter((item) => dayOf(item) === day).map((item) => row(item))}</div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="@container/bd flex min-h-0 min-w-0 flex-1 flex-col">
      <div className={`${PAGE_GUTTER_X} pt-2`}>
        <PageHeader
          className="max-sm:[&_[data-page-header-meta]]:hidden"
          title={<Trans>Calendar</Trans>}
          spaceName={spaceName}
          actions={
            <>
              {view === "month" ? (
                <Input
                  type="month"
                  className="w-auto"
                  value={month}
                  aria-label={t`Month`}
                  onChange={(event) => {
                    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value))
                      list.setParam("month", event.target.value);
                  }}
                />
              ) : null}
              <Button
                variant={view === "agenda" ? "secondary" : "ghost"}
                aria-pressed={view === "agenda"}
                onClick={() => list.setParam("view", undefined)}
              >
                <Trans>Agenda</Trans>
              </Button>
              <Button
                variant={view === "month" ? "secondary" : "ghost"}
                aria-pressed={view === "month"}
                onClick={() => list.setParam("view", "month")}
              >
                <Trans>Month</Trans>
              </Button>
            </>
          }
        />
      </div>
      <div className={`rk-scroll flex-1 overflow-y-auto ${PAGE_GUTTER_X} pb-6`}>
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <SearchField
            className="w-full @md:w-72"
            value={query}
            onChange={(next) => list.setParam("q", next)}
            placeholder={t`Search`}
            label={t`Search`}
            name="calendar-search"
          />
          <PickFilter
            label={t`Kind`}
            value={kind}
            anyLabel={t`All`}
            options={(Object.keys(names) as CalendarItemKind[]).map((value) => [
              value,
              names[value],
            ])}
            onChange={(next) => list.setParam("kind", next)}
          />
          <PickFilter
            label={t`Bot`}
            value={botId}
            anyLabel={t`All`}
            options={botOptions}
            empty={t`No bots`}
            onChange={(next) => list.setParam("bot", next)}
          />
        </div>
        {data?.errors.map(({ account }) => (
          <p key={account} role="status" className="mb-2 text-sm text-muted-foreground">
            <Trans>Couldn't load {account}</Trans>
          </p>
        ))}
        {content}
        {data && !data.googleConnected ? (
          <p className="mt-4 text-sm">
            <Link
              to={CONNECT_GOOGLE}
              className="text-muted-foreground underline underline-offset-4"
            >
              <Trans>Connect Google Calendar</Trans>
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
