import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { Bot, CalendarItem, CalendarItemKind } from "@rakazo/contracts";
import { CalendarItemKindSchema } from "@rakazo/contracts";
import { companyCalendarMonth } from "@rakazo/core";
import { BotAvatar, Button, parseBotAvatar } from "@rakazo/ui-web";
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Loader2,
  Repeat,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { BotTodos } from "../components/BotTodos";
import { PickFilter, SearchField } from "../components/ListControls";
import { PAGE_GUTTER_X, PageHeader } from "../components/PageHeader";
import { useListParams } from "../lib/list-params";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

const HOUR_MS = 3_600_000;
const HOUR_PX = 48;
const SCHEDULE_DAYS = 30;
/** Bot items have no end; they get this much room in a time grid. */
const DEFAULT_ITEM_MS = 30 * 60_000;
const MIN_ITEM_MS = 20 * 60_000;
const MONTH_CHIPS = 3;
const CONNECT_GOOGLE = "/app/integrations?connect=googlecalendar&returnTo=/app/calendar";

const VIEWS = ["day", "week", "month", "schedule"] as const;
type View = (typeof VIEWS)[number];
const DEFAULT_VIEW: View = "week";

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

const viewNames = (): Record<View, string> => ({
  day: t`Day`,
  week: t`Week`,
  month: t`Month`,
  schedule: t`Schedule`,
});

const pad = (n: number) => String(n).padStart(2, "0");
const localDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
/** A "YYYY-MM-DD" day as local midnight. */
const startOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d);
};
const addDays = (day: string, days: number) => {
  const date = startOf(day);
  date.setDate(date.getDate() + days);
  return localDay(date);
};
const addMonths = (day: string, months: number) => {
  const date = startOf(`${day.slice(0, 7)}-01`);
  date.setMonth(date.getMonth() + months);
  return localDay(date);
};
const DAY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** The day an item is on: an all-day item keeps its date, a timed one is read in the viewer's time zone. */
const dayOf = (item: CalendarItem) =>
  item.allDay ? item.start.slice(0, 10) : localDay(new Date(item.start));
/** Every day an item shows on: an all-day event runs until its (exclusive) end date. */
function daysOf(item: CalendarItem): string[] {
  const first = dayOf(item);
  if (!item.allDay || !item.end) return [first];
  const days = [first];
  for (let day = addDays(first, 1); day < item.end.slice(0, 10) && days.length < 31; ) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

/** The days a view covers: `start` first, `end` the day after the last. */
function visibleRange(view: View, focus: string, today: string) {
  if (view === "day") return { start: focus, end: addDays(focus, 1) };
  if (view === "week") {
    const start = addDays(focus, -startOf(focus).getDay());
    return { start, end: addDays(start, 7) };
  }
  if (view === "month") {
    const start = `${focus.slice(0, 7)}-01`;
    return { start, end: addMonths(start, 1) };
  }
  return { start: today, end: addDays(today, SCHEDULE_DAYS) };
}

function rangeTitle(view: View, start: string, end: string) {
  const first = startOf(start);
  const last = startOf(addDays(end, -1));
  if (view === "month")
    return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(first);
  if (view === "day")
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(first);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).formatRange(first, last);
}

const timeText = (item: CalendarItem) =>
  item.allDay
    ? t`All day`
    : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
        new Date(item.start),
      );

type Block = { item: CalendarItem; start: number; end: number; col: number; cols: number };

/** Timed items of one day with side-by-side columns for the ones that overlap. */
function layoutDay(items: CalendarItem[], day: string): Block[] {
  const dayStart = startOf(day).getTime();
  const dayEnd = startOf(addDays(day, 1)).getTime();
  const raw = items
    .filter((item) => !item.allDay)
    .map((item) => {
      const start = Math.max(Date.parse(item.start), dayStart);
      const end = Math.min(
        item.end ? Date.parse(item.end) : Date.parse(item.start) + DEFAULT_ITEM_MS,
        dayEnd,
      );
      return { item, start, end: Math.max(end, start + MIN_ITEM_MS) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Block[] = [];
  let cluster: Block[] = [];
  let colEnds: number[] = [];
  let clusterEnd = 0;
  const flush = () => {
    for (const block of cluster) out.push({ ...block, cols: colEnds.length });
    cluster = [];
    colEnds = [];
  };
  for (const block of raw) {
    if (cluster.length && block.start >= clusterEnd) flush();
    let col = colEnds.findIndex((end) => end <= block.start);
    if (col < 0) col = colEnds.push(0) - 1;
    colEnds[col] = block.end;
    clusterEnd = Math.max(clusterEnd, block.end);
    cluster.push({ ...block, col, cols: 1 });
  }
  flush();
  return out;
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
  const viewParam = list.param("view");
  const view: View = VIEWS.find((name) => name === viewParam) ?? DEFAULT_VIEW;
  const today = localDay(new Date());
  const dateParam = list.param("date");
  const focus = dateParam && DAY_PATTERN.test(dateParam) ? dateParam : today;
  const kindParsed = CalendarItemKindSchema.safeParse(list.param("kind"));
  const kind = kindParsed.success ? kindParsed.data : undefined;
  const botId = list.param("bot");
  const query = list.param("q") ?? "";
  const names = kindNames();
  const { start, end } = visibleRange(view, focus, today);

  // Bot items and Google events load apart, so a slow Google never holds back the bots' items.
  // They keep the last answer while a new range loads, and the grid never waits for either.
  const [local, setLocal] = useState<CalendarItem[]>([]);
  const [google, setGoogle] = useState<CalendarItem[]>([]);
  const [googleErrors, setGoogleErrors] = useState<string[]>([]);
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [localLoading, setLocalLoading] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(true);
  const [error, setError] = useState("");
  const latest = useRef({ local: 0, google: 0 });
  // A day of slack each side: an all-day item is midnight UTC, which can be a day off local time.
  const from = startOf(addDays(start, -1)).toISOString();
  const to = startOf(addDays(end, 1)).toISOString();
  const loadLocal = useCallback(() => {
    const request = ++latest.current.local;
    setLocalLoading(true);
    setError("");
    rpc.calendar
      .agenda({ from, to, sources: "local" })
      .then((agenda) => {
        if (request !== latest.current.local) return;
        setLocal(agenda.items);
        setGoogleConnected(agenda.googleConnected);
      })
      .catch(
        (cause) =>
          request === latest.current.local &&
          setError(errorText(cause, t`Could not load the calendar`)),
      )
      .finally(() => request === latest.current.local && setLocalLoading(false));
  }, [from, to]);
  const loadGoogle = useCallback(() => {
    const request = ++latest.current.google;
    setGoogleLoading(true);
    rpc.calendar
      .agenda({ from, to, sources: "google" })
      .then((agenda) => {
        if (request !== latest.current.google) return;
        setGoogle(agenda.items);
        setGoogleErrors(agenda.errors.map(({ account }) => account));
        setGoogleConnected(agenda.googleConnected);
      })
      .catch(() => {
        if (request !== latest.current.google) return;
        setGoogleErrors([t`Google Calendar`]);
      })
      .finally(() => request === latest.current.google && setGoogleLoading(false));
  }, [from, to]);
  useEffect(loadLocal, [loadLocal]);
  useEffect(loadGoogle, [loadGoogle]);
  const loading = localLoading || googleLoading;

  const needle = query.trim().toLowerCase();
  const shown = [...google, ...local]
    .filter(
      (item) =>
        (view !== "schedule" || dayOf(item) >= today) &&
        (!kind || item.kind === kind) &&
        (!botId || item.botId === botId) &&
        (!needle ||
          [item.title, item.botName, item.account].some((field) =>
            field?.toLowerCase().includes(needle),
          )),
    )
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
  const itemsOn = (day: string) => shown.filter((item) => daysOf(item).includes(day));
  const botOptions = [
    ...new Map(
      [...google, ...local].flatMap((item): [string, string][] =>
        item.botId && item.botName ? [[item.botId, item.botName]] : [],
      ),
    ),
  ];
  const filtered = Boolean(kind || botId || needle);

  const setView = (next: View) => list.setParam("view", next === DEFAULT_VIEW ? undefined : next);
  const goTo = (day: string) => list.setParam("date", day === today ? undefined : day);
  const step = (direction: 1 | -1) =>
    goTo(
      view === "month"
        ? addMonths(focus, direction)
        : addDays(focus, direction * (view === "week" ? 7 : 1)),
    );

  // One tick a minute moves the "now" line.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const wrap = (
    item: CalendarItem,
    className: string,
    body: ReactNode,
    style?: CSSProperties,
    label?: string,
  ) => {
    if (item.href)
      return (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          style={style}
          aria-label={label}
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
          style={style}
          aria-label={label}
          onClick={() => onOpenBot(item.botId!)}
        >
          {body}
        </button>
      );
    // An inbox to-do belongs to no bot; its list is in the Inbox.
    return (
      <Link key={item.id} to="/app/inbox" className={className} style={style} aria-label={label}>
        {body}
      </Link>
    );
  };

  const kindIcon = (item: CalendarItem) => {
    const Icon = KIND_ICON[item.kind];
    return (
      <span
        role="img"
        aria-label={names[item.kind]}
        title={names[item.kind]}
        className="shrink-0 text-muted-foreground"
      >
        <Icon size={14} aria-hidden="true" />
      </span>
    );
  };
  const avatar = (item: CalendarItem, size: number) => {
    const bot = bots.find((candidate) => candidate.id === item.botId);
    return bot ? (
      <BotAvatar color={bot.color} identity={bot.id} size={size} status={bot.status} />
    ) : null;
  };

  /** A month cell's line. */
  const chip = (item: CalendarItem) =>
    wrap(
      item,
      "flex w-full items-center gap-1 py-0.5 text-start text-xs hover:underline",
      <>
        {kindIcon(item)}
        <span className="min-w-0 flex-1 truncate" title={`${timeText(item)} ${item.title}`}>
          {item.title}
        </span>
      </>,
    );

  /** A schedule row. */
  const row = (item: CalendarItem) =>
    wrap(
      item,
      "flex w-full items-center gap-3 rounded-md px-2 py-2 text-start text-sm hover:bg-accent",
      <>
        {kindIcon(item)}
        <span className="w-16 shrink-0 text-xs text-muted-foreground tabular-nums">
          {timeText(item)}
        </span>
        <span className="min-w-0 flex-1 truncate" title={item.title}>
          {item.title}
        </span>
        {item.botName ? (
          <span className="flex max-w-[30%] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {avatar(item, 16)}
            <span className="truncate">{item.botName}</span>
          </span>
        ) : null}
      </>,
    );

  /** A time-grid block (timed) or all-day bar. Google events are neutral; a bot's carry a left border in its colour. Overlapping blocks drop the icon and avatar so the title stays readable. */
  const block = (item: CalendarItem, style?: CSSProperties, crowded = false) => {
    const bot = bots.find((candidate) => candidate.id === item.botId);
    const parsed = bot ? parseBotAvatar(bot.color) : null;
    const accent = parsed && !parsed.isImage && /^#[0-9a-f]{3,8}$/i.test(parsed.color);
    const full = [timeText(item), item.title, item.botName].filter(Boolean).join(" · ");
    return wrap(
      item,
      `${style ? "absolute" : ""} flex items-center gap-1 overflow-hidden rounded-md border px-1 py-0.5 text-start text-xs hover:bg-accent ${
        item.kind === "event" ? "bg-muted" : "bg-card"
      } ${item.botId ? "border-s-2" : ""}`,
      <>
        {crowded ? null : kindIcon(item)}
        <span className="min-w-0 flex-1 truncate" title={full}>
          {item.title}
        </span>
        {crowded ? null : avatar(item, 14)}
      </>,
      { ...style, ...(accent ? { borderInlineStartColor: parsed.color } : {}) },
      full,
    );
  };

  const scroller = useRef<HTMLDivElement>(null);
  const isGrid = view === "day" || view === "week";
  useEffect(() => {
    const el = scroller.current;
    if (!el || !isGrid) return;
    const hour = start <= today && today < end ? Math.max(new Date().getHours() - 1, 0) : 7;
    el.scrollTop = hour * HOUR_PX;
  }, [isGrid, start, end, today]);

  let content: ReactNode;
  if (view === "month") {
    const bounds = companyCalendarMonth(start.slice(0, 7));
    const month = start.slice(0, 7);
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
                const items = day > 0 && day <= bounds.days ? itemsOn(date) : [];
                return (
                  <td
                    key={weekday}
                    data-day={date}
                    className={`h-20 overflow-hidden border p-1 align-top sm:h-28 sm:p-2 ${date === today ? "bg-muted/50" : ""}`}
                  >
                    {day > 0 && day <= bounds.days && (
                      <>
                        <time
                          dateTime={date}
                          className={`inline-block text-xs ${date === today ? "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground" : "text-muted-foreground"}`}
                        >
                          {day}
                        </time>
                        {items.slice(0, MONTH_CHIPS).map(chip)}
                        {items.length > MONTH_CHIPS ? (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline"
                            onClick={() => {
                              list.setParams({
                                view: "day",
                                date: date === today ? undefined : date,
                              });
                            }}
                          >
                            <Trans>+{items.length - MONTH_CHIPS} more</Trans>
                          </button>
                        ) : null}
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
  } else if (view === "schedule") {
    const days = [...new Set(shown.flatMap(daysOf))].filter((day) => day >= today && day < end);
    content =
      days.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            {loading ? null : filtered ? (
              <Trans>No matches</Trans>
            ) : (
              <Trans>Nothing scheduled</Trans>
            )}
          </p>
          {filtered ? (
            <Button variant="outline" size="sm" onClick={() => list.clear("q", "kind", "bot")}>
              <Trans>Clear filters</Trans>
            </Button>
          ) : null}
        </div>
      ) : (
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
                  }).format(startOf(day))}
                </time>
              </h2>
              <div>{itemsOn(day).map(row)}</div>
            </section>
          ))}
        </div>
      );
  } else {
    const days = Array.from({ length: view === "day" ? 1 : 7 }, (_, i) => addDays(start, i));
    const columns = { gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` };
    content = (
      <div className={view === "week" ? "min-w-[40rem]" : undefined}>
        <div className="sticky top-0 z-20 grid border-b bg-background" style={columns}>
          <div />
          {days.map((day) => (
            <div key={day} className={`min-w-0 border-s p-1 ${day === today ? "bg-muted/50" : ""}`}>
              <time
                dateTime={day}
                className={`inline-block text-xs ${day === today ? "rounded-full bg-primary px-1.5 font-semibold text-primary-foreground" : "text-muted-foreground"}`}
              >
                {new Intl.DateTimeFormat(undefined, {
                  weekday: "short",
                  day: "numeric",
                }).format(startOf(day))}
              </time>
              <div data-all-day={day} className="mt-1 min-h-5 space-y-0.5">
                {itemsOn(day)
                  .filter((item) => item.allDay)
                  .map((item) => block(item))}
              </div>
            </div>
          ))}
        </div>
        <div className="relative grid" style={{ ...columns, height: 24 * HOUR_PX }}>
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {Array.from({ length: 24 }, (_, hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-t border-border/60"
                style={{ top: hour * HOUR_PX }}
              />
            ))}
          </div>
          <div className="relative" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => (
              <span
                key={i}
                className="absolute end-1 -translate-y-1/2 text-[10px] text-muted-foreground"
                style={{ top: (i + 1) * HOUR_PX }}
              >
                {new Intl.DateTimeFormat(undefined, { hour: "numeric" }).format(
                  new Date(2000, 0, 1, i + 1),
                )}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const dayStart = startOf(day).getTime();
            return (
              <div
                key={day}
                data-day={day}
                className={`relative border-s ${day === today ? "bg-muted/50" : ""}`}
              >
                {layoutDay(itemsOn(day), day).map((entry) =>
                  block(
                    entry.item,
                    {
                      top: ((entry.start - dayStart) / HOUR_MS) * HOUR_PX,
                      height: ((entry.end - entry.start) / HOUR_MS) * HOUR_PX,
                      // Cascade like Google: each overlapping item starts a share further right and
                      // is drawn over the one before it, so every title keeps some width.
                      left: `${(entry.col / entry.cols) * 100}%`,
                      width: `calc(${100 - (entry.col / entry.cols) * 100}% - 2px)`,
                      zIndex: entry.col + 1,
                    },
                    entry.cols > 1,
                  ),
                )}
                {day === today ? (
                  <div
                    role="presentation"
                    data-now-line
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-destructive"
                    style={{ top: ((now - dayStart) / HOUR_MS) * HOUR_PX }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
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
            loading ? (
              <Loader2
                size={16}
                role="status"
                aria-label={t`Loading`}
                className="animate-spin text-muted-foreground"
              />
            ) : null
          }
        />
      </div>
      <div className={`${PAGE_GUTTER_X} mb-2 flex flex-wrap items-center gap-1.5`}>
        <Button variant="outline" size="sm" onClick={() => list.clear("date")}>
          <Trans>Today</Trans>
        </Button>
        {view === "schedule" ? null : (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t`Previous`}
              onClick={() => step(-1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={t`Next`} onClick={() => step(1)}>
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </>
        )}
        <h2 className="min-w-0 flex-1 truncate ps-1 text-sm font-medium">
          {rangeTitle(view, start, end)}
        </h2>
        <div className="flex gap-0.5">
          {VIEWS.map((name) => (
            <Button
              key={name}
              size="sm"
              variant={view === name ? "secondary" : "ghost"}
              aria-pressed={view === name}
              onClick={() => setView(name)}
            >
              {viewNames()[name]}
            </Button>
          ))}
        </div>
      </div>
      <div className={`${PAGE_GUTTER_X} mb-2 flex flex-wrap items-center gap-1.5`}>
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
          options={(Object.keys(names) as CalendarItemKind[]).map((value) => [value, names[value]])}
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
      {error ? (
        <div role="alert" className={`${PAGE_GUTTER_X} mb-2 flex items-center gap-3 text-sm`}>
          <span className="text-destructive">{error}</span>
          <Button variant="outline" size="sm" onClick={loadLocal}>
            <Trans>Try again</Trans>
          </Button>
        </div>
      ) : null}
      {googleErrors.map((account) => (
        <p
          key={account}
          role="status"
          className={`${PAGE_GUTTER_X} mb-2 text-sm text-muted-foreground`}
        >
          <Trans>Couldn't load {account}</Trans>
        </p>
      ))}
      <div className={PAGE_GUTTER_X}>
        <BotTodos hideDueBetween={{ from: startOf(start), to: startOf(end) }} />
      </div>
      <div
        ref={scroller}
        className={`rk-scroll min-h-0 flex-1 overflow-auto ${PAGE_GUTTER_X} pb-6`}
      >
        {content}
        {googleConnected === false ? (
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
