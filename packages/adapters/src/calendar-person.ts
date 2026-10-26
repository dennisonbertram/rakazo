import type { AdapterContext } from "@rakazo/adapter-kit";
import type { CalendarAccount, CalendarToolDeps } from "./calendar-tools.js";
import { CALENDAR_API, request } from "./calendar-tools.js";
import { asRecord } from "./connector-http.js";

export interface PersonMeeting {
  title: string;
  start: string;
  href: string | null;
}

const WINDOW_MS = 180 * 86_400_000;
const str = (value: unknown) => (typeof value === "string" ? value : undefined);

/**
 * Events on each account's primary calendar that list `email` as an attendee or organizer,
 * within half a year either side of `now`. A failing account is skipped, so one bad Google
 * connection leaves the others.
 * ponytail: primary calendar only; add the user's other selected calendars if people miss meetings.
 */
export async function personCalendarMeetings(
  deps: Pick<CalendarToolDeps, "connectors" | "google">,
  accounts: CalendarAccount[],
  context: AdapterContext,
  email: string,
  now = new Date(),
): Promise<PersonMeeting[]> {
  const wanted = email.toLowerCase();
  const params = new URLSearchParams({
    q: email,
    singleEvents: "true",
    orderBy: "startTime",
    timeMin: new Date(now.getTime() - WINDOW_MS).toISOString(),
    timeMax: new Date(now.getTime() + WINDOW_MS).toISOString(),
    maxResults: "100",
  });
  const lists = await Promise.all(
    accounts.map((account) =>
      request(deps, account, context, "GET", `${CALENDAR_API}/calendars/primary/events?${params}`)
        .then((data) =>
          Array.isArray(asRecord(data)?.items) ? (asRecord(data)?.items as unknown[]) : [],
        )
        .catch(() => [] as unknown[]),
    ),
  );
  const meetings: PersonMeeting[] = [];
  for (const raw of lists.flat()) {
    const event = asRecord(raw);
    if (!event || event.status === "cancelled") continue;
    const people = [
      ...(Array.isArray(event.attendees) ? event.attendees : []),
      event.organizer,
    ].map((person) => str(asRecord(person)?.email)?.toLowerCase());
    if (!people.includes(wanted)) continue;
    const start = asRecord(event.start);
    const iso = str(start?.dateTime) ?? (str(start?.date) ? `${str(start?.date)}T00:00:00Z` : null);
    const time = iso ? new Date(iso) : null;
    if (!time || Number.isNaN(time.getTime())) continue;
    meetings.push({
      title: str(event.summary)?.trim() || "(No title)",
      start: time.toISOString(),
      href: str(event.htmlLink) ?? null,
    });
  }
  return meetings;
}
