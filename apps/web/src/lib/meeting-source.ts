import type { StoredMeeting } from "@rakazo/contracts";

const NAMES: Record<string, string> = {
  granola: "Granola",
  omi: "Omi",
  hex: "Hex",
  praci: "Praci",
};

/** The source's display name; a provider this app does not know shows as its own id. */
export const meetingSourceName = (provider: string) => NAMES[provider] ?? provider;

/** Whole minutes between start and end, or null while the end is unknown. */
export const meetingMinutes = (meeting: Pick<StoredMeeting, "startedAt" | "endedAt">) =>
  meeting.endedAt
    ? Math.max(
        1,
        Math.round((Date.parse(meeting.endedAt) - Date.parse(meeting.startedAt)) / 60_000),
      )
    : null;
