import type { GoogleAuthBroker } from "./google-gmail.js";

/**
 * Native Google Workspace read-only services beyond Gmail: Drive, Calendar,
 * and Meet (conference records + transcripts), all sharing the broker's
 * authorized fetch and encrypted token storage.
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";

type Actor = { workspaceId: string; userId: string };

export type DriveFileSummary = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  owner: string;
};

const GOOGLE_DOC_EXPORTS: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};

/** Raw Drive queries pass through; plain text becomes a fullText search. */
export function driveQuery(input: string): string {
  const raw = /\b(contains|=|!=|<|>|\bin\b)\b/i.test(input);
  if (raw) return input;
  const escaped = input.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  return `fullText contains '${escaped}'`;
}

export class DriveNative {
  constructor(private readonly broker: GoogleAuthBroker) {}

  async search(actor: Actor, input: { query: string; maxResults?: number }): Promise<DriveFileSummary[]> {
    const params = new URLSearchParams({
      q: driveQuery(input.query),
      pageSize: String(Math.min(25, Math.max(1, input.maxResults ?? 15))),
      fields: "files(id,name,mimeType,modifiedTime,owners(displayName))",
      orderBy: "modifiedTime desc",
    });
    const data = await this.broker.apiGet(actor, `${DRIVE_API}/files?${params}`);
    const files = Array.isArray(data.files) ? (data.files as Record<string, unknown>[]) : [];
    return files.map((file) => ({
      id: String(file.id ?? ""),
      name: String(file.name ?? ""),
      mimeType: String(file.mimeType ?? ""),
      modifiedTime: String(file.modifiedTime ?? ""),
      owner: String((file.owners as { displayName?: string }[] | undefined)?.[0]?.displayName ?? ""),
    }));
  }

  async read(actor: Actor, id: string): Promise<DriveFileSummary & { body: string }> {
    const meta = await this.broker.apiGet(
      actor,
      `${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,modifiedTime,owners(displayName)`,
    );
    const summary: DriveFileSummary = {
      id: String(meta.id ?? id),
      name: String(meta.name ?? ""),
      mimeType: String(meta.mimeType ?? ""),
      modifiedTime: String(meta.modifiedTime ?? ""),
      owner: String((meta.owners as { displayName?: string }[] | undefined)?.[0]?.displayName ?? ""),
    };
    const exportMime = GOOGLE_DOC_EXPORTS[summary.mimeType];
    if (exportMime) {
      const body = await this.broker.apiGetText(
        actor,
        `${DRIVE_API}/files/${encodeURIComponent(id)}/export?mimeType=${encodeURIComponent(exportMime)}`,
      );
      return { ...summary, body: body.slice(0, 40_000) };
    }
    if (/^(text\/|application\/(json|xml))/.test(summary.mimeType)) {
      const body = await this.broker.apiGetText(
        actor,
        `${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`,
      );
      return { ...summary, body: body.slice(0, 40_000) };
    }
    return {
      ...summary,
      body: `[binary ${summary.mimeType} — not readable as text; ${summary.name}]`,
    };
  }
}

export type CalendarEventSummary = {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendees: string[];
  location: string;
  meetLink: string;
};

export class CalendarNative {
  constructor(private readonly broker: GoogleAuthBroker) {}

  async events(
    actor: Actor,
    input: { timeMin?: string; timeMax?: string; query?: string; maxResults?: number },
  ): Promise<CalendarEventSummary[]> {
    const params = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(Math.min(50, Math.max(1, input.maxResults ?? 25))),
    });
    if (input.timeMin) params.set("timeMin", input.timeMin);
    if (input.timeMax) params.set("timeMax", input.timeMax);
    if (input.query) params.set("q", input.query);
    const data = await this.broker.apiGet(actor, `${CALENDAR_API}/calendars/primary/events?${params}`);
    const items = Array.isArray(data.items) ? (data.items as Record<string, unknown>[]) : [];
    return items.map((event) => ({
      id: String(event.id ?? ""),
      summary: String(event.summary ?? "(no title)"),
      start: String((event.start as { dateTime?: string; date?: string } | undefined)?.dateTime ?? (event.start as { date?: string } | undefined)?.date ?? ""),
      end: String((event.end as { dateTime?: string; date?: string } | undefined)?.dateTime ?? (event.end as { date?: string } | undefined)?.date ?? ""),
      attendees: Array.isArray(event.attendees)
        ? (event.attendees as { email?: string }[]).map((a) => String(a.email ?? "")).filter(Boolean)
        : [],
      location: String(event.location ?? ""),
      meetLink: String(event.hangoutLink ?? ""),
    }));
  }
}

export type MeetRecordSummary = {
  record: string;
  startTime: string;
  endTime: string;
  transcripts: string[];
};

export class MeetNative {
  constructor(private readonly broker: GoogleAuthBroker) {}

  /** Recent conference records with the transcript resources each one has. */
  async recentTranscripts(actor: Actor, maxRecords = 10): Promise<MeetRecordSummary[]> {
    const data = await this.broker.apiGet(actor, `${MEET_API}/conferenceRecords`);
    const records = Array.isArray(data.conferenceRecords)
      ? (data.conferenceRecords as Record<string, unknown>[]).slice(0, Math.max(1, maxRecords))
      : [];
    const summaries: MeetRecordSummary[] = [];
    for (const record of records) {
      const name = String(record.name ?? "");
      if (!name) continue;
      let transcripts: string[] = [];
      try {
        const list = await this.broker.apiGet(actor, `${MEET_API}/${name}/transcripts`);
        transcripts = Array.isArray(list.transcripts)
          ? (list.transcripts as { name?: string }[]).map((t) => String(t.name ?? "")).filter(Boolean)
          : [];
      } catch {
        // A record without readable transcripts still belongs in the listing.
      }
      summaries.push({
        record: name,
        startTime: String(record.startTime ?? ""),
        endTime: String(record.endTime ?? ""),
        transcripts,
      });
    }
    return summaries;
  }

  /** Full transcript stitched into "participant: text" lines, page by page. */
  async transcriptText(actor: Actor, transcriptName: string, maxChars = 30_000): Promise<string> {
    const lines: string[] = [];
    let pageToken: string | undefined;
    let total = 0;
    for (let page = 0; page < 50; page += 1) {
      const params = new URLSearchParams({ pageSize: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const data = await this.broker.apiGet(
        actor,
        `${MEET_API}/${transcriptName}/entries?${params}`,
      );
      const entries = Array.isArray(data.transcriptEntries)
        ? (data.transcriptEntries as Record<string, unknown>[])
        : [];
      for (const entry of entries) {
        const line = `${String(entry.participant ?? "unknown")}: ${String(entry.text ?? "")}`;
        total += line.length;
        lines.push(line);
        if (total >= maxChars) {
          lines.push(`[truncated at ${maxChars} characters]`);
          return lines.join("\n");
        }
      }
      pageToken = typeof data.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : undefined;
      if (!pageToken) break;
    }
    return lines.join("\n");
  }
}
