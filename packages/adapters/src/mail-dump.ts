import type { AdapterContext, ConnectorCall, ConnectorEvent } from "@rakazo/adapter-kit";

/**
 * High-recall email search: run several wide Gmail queries, collect every
 * match into a grep-friendly workspace file, and report coverage honestly.
 * The corpus never enters model context — the model greps the file next.
 * Ported from pi-google's gmail_dump_search design.
 */

export const MAIL_DUMP_DEFAULT_MAX = 500;
export const MAIL_DUMP_HARD_MAX = 2_000;
export const MAIL_DUMP_MAX_QUERIES = 10;
const PAGE_SIZE = 500;
const MAX_PAGES_PER_QUERY = 20;

export type MailDumpRecord = {
  id: string;
  threadId: string;
  timestamp: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
};

export type MailDumpQuerySummary = {
  query: string;
  found: number;
  pages: number;
  capped: boolean;
  error?: string;
};

type ConnectorLike = {
  execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent>;
};

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const body = (value as { body?: unknown; text?: unknown }).body ?? (value as { text?: unknown }).text;
    if (typeof body === "string") return body;
  }
  return "";
}

function oneLine(value: string, limit: number): string {
  const collapsed = value.replaceAll(/\s+/g, " ").trim();
  return collapsed.length > limit ? `${collapsed.slice(0, limit)}…` : collapsed;
}

export function toMailDumpRecord(raw: unknown): MailDumpRecord | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const message = raw as Record<string, unknown>;
  const id = String(message.messageId ?? message.id ?? "");
  if (!id) return undefined;
  return {
    id,
    threadId: String(message.threadId ?? ""),
    timestamp: String(message.messageTimestamp ?? message.internalDate ?? ""),
    from: oneLine(String(message.sender ?? message.from ?? ""), 80),
    to: oneLine(String(message.to ?? ""), 80),
    subject: oneLine(String(message.subject ?? "(no subject)"), 140),
    preview: oneLine(asText(message.preview) || asText(message.messageText) || String(message.snippet ?? ""), 200),
  };
}

export function mailDumpLine(record: MailDumpRecord): string {
  return [
    record.timestamp,
    record.from,
    record.to,
    record.subject,
    record.preview,
    `id=${record.id}`,
    `thread=${record.threadId}`,
  ].join(" | ");
}

export function buildMailDumpFile(input: {
  intent: string;
  records: MailDumpRecord[];
  summaries: MailDumpQuerySummary[];
  cappedTotal: boolean;
}): string {
  const header = [
    `# Email dump — ${input.intent}`,
    "",
    "One message per line: timestamp | from | to | subject | preview | id | thread.",
    "Grep this file; do not assume the first matches are the only matches.",
    "",
    "## Coverage",
    ...input.summaries.map(
      (summary) =>
        `- query \`${summary.query}\`: ${summary.error ? `FAILED (${summary.error})` : `${summary.found} messages${summary.capped ? " (capped — results incomplete)" : ""}`}`,
    ),
    input.cappedTotal
      ? "- TOTAL CAPPED: the overall message cap was hit; narrow the queries or raise max_messages."
      : "- Collection completed within limits.",
    "",
    "## Messages",
  ];
  const lines = input.records
    .slice()
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .map(mailDumpLine);
  return [...header, ...lines, ""].join("\n");
}

export async function collectMailDump(input: {
  connector: ConnectorLike;
  context: AdapterContext;
  queries: string[];
  maxMessages: number;
}): Promise<{ records: MailDumpRecord[]; summaries: MailDumpQuerySummary[]; cappedTotal: boolean }> {
  const queries = input.queries
    .map((query) => query.trim())
    .filter(Boolean)
    .slice(0, MAIL_DUMP_MAX_QUERIES);
  const byId = new Map<string, MailDumpRecord>();
  const summaries: MailDumpQuerySummary[] = [];
  let cappedTotal = false;

  for (const query of queries) {
    const summary: MailDumpQuerySummary = { query, found: 0, pages: 0, capped: false };
    summaries.push(summary);
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
      if (byId.size >= input.maxMessages) {
        cappedTotal = true;
        summary.capped = true;
        break;
      }
      const args: Record<string, unknown> = {
        query,
        max_results: Math.min(PAGE_SIZE, input.maxMessages),
        include_payload: false,
        verbose: false,
        ...(pageToken ? { page_token: pageToken } : {}),
      };
      let data: Record<string, unknown> | undefined;
      let errorMessage: string | undefined;
      for await (const event of input.connector.execute(
        { tool: "GMAIL_FETCH_EMAILS", args, route: { kind: "composio" } } as ConnectorCall,
        input.context,
      )) {
        if (event.type === "result") {
          const payload = (event as { data?: { data?: unknown } }).data?.data;
          data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : undefined;
        } else if (event.type === "error") {
          errorMessage = (event as { message?: string }).message ?? "unknown error";
        }
      }
      if (errorMessage) {
        summary.error = errorMessage;
        break;
      }
      summary.pages += 1;
      const messages = Array.isArray(data?.messages) ? (data?.messages as unknown[]) : [];
      for (const raw of messages) {
        const record = toMailDumpRecord(raw);
        if (!record) continue;
        if (!byId.has(record.id)) {
          if (byId.size >= input.maxMessages) {
            cappedTotal = true;
            summary.capped = true;
            break;
          }
          byId.set(record.id, record);
        }
        summary.found += 1;
      }
      pageToken = typeof data?.nextPageToken === "string" && data.nextPageToken ? data.nextPageToken : undefined;
      if (!pageToken || summary.capped) break;
    }
  }
  return { records: [...byId.values()], summaries, cappedTotal };
}
