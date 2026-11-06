import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { OmiCloudSegment } from "@rakazo/contracts";

export interface OmiEmulatorConversation {
  id: string;
  title: string;
  overview: string;
  startedAt: string;
  finishedAt: string;
  segments: OmiCloudSegment[];
}

const seg = (text: string, start: number, speaker = "SPEAKER_0", is_user = false) => ({
  text,
  speaker,
  is_user,
  start,
  end: start + 5,
});

const HOUR = 3_600_000;
const iso = (base: Date, hoursAgo: number, minutes = 0) =>
  new Date(base.getTime() - hoursAgo * HOUR + minutes * 60_000).toISOString();

/**
 * Invented conversations, dated back from `now`: two real ones, one under two minutes and one
 * with no transcript. The demo uses the current time so they fall inside the import window.
 */
export const omiEmulatorConversations = (now = new Date()): OmiEmulatorConversation[] => [
  {
    id: "omi-conv-4",
    title: "Roadmap sync",
    overview: "Agreed the Q3 roadmap order.",
    startedAt: iso(now, 9),
    finishedAt: iso(now, 9, 20),
    segments: [
      seg("Let's start with the roadmap.", 0, "SPEAKER_0", true),
      seg("Sounds good.", 6, "SPEAKER_1"),
    ],
  },
  {
    id: "omi-conv-3",
    title: "Quick hello",
    overview: "A short greeting.",
    startedAt: iso(now, 36),
    finishedAt: iso(now, 36, 0.75),
    segments: [seg("Hi there.", 0)],
  },
  {
    id: "omi-conv-2",
    title: "Silent recording",
    overview: "",
    startedAt: iso(now, 63),
    finishedAt: iso(now, 63, 10),
    segments: [],
  },
  {
    id: "omi-conv-1",
    title: "Hiring debrief",
    overview: "Decided to extend an offer.",
    startedAt: iso(now, 86),
    finishedAt: iso(now, 86, 30),
    segments: [{ text: "I liked the second candidate." }, seg("Same here.", 12, "SPEAKER_1")],
  },
];

export interface OmiCloudApiEmulatorOptions {
  conversations?: OmiEmulatorConversation[];
  apiKey?: string;
  /** 0 picks a free port. */
  port?: number;
  /** Upper bound on `limit`, so small values exercise cursor paging. */
  maxPageSize?: number;
}

/**
 * Offline stand-in for the Omi Developer API endpoints the sync uses: conversations list (cursor
 * paging through `x-omi-next-cursor` and `x-omi-has-more`), conversation detail with
 * `include_transcript`, and an empty memories list. Encodes what the S0 probe saw. Newest first.
 */
export class OmiCloudApiEmulator {
  readonly apiKey: string;
  /** Respond 429 (with Retry-After) to this many next API calls. */
  rateLimitNext = 0;
  retryAfterSeconds = 7;
  /** Answer every call 401, as for a revoked key. */
  rejectAll = false;
  /** Answer every call 503. */
  down = false;
  readonly requests: Array<{ path: string; query: string; authorization: string | null }> = [];
  private server: ReturnType<typeof createServer> | undefined;
  private readonly conversations: OmiEmulatorConversation[];
  private readonly maxPageSize: number;
  private readonly port: number;

  constructor(options: OmiCloudApiEmulatorOptions = {}) {
    this.apiKey = options.apiKey ?? "omi_dev_emulator_key";
    this.maxPageSize = options.maxPageSize ?? 25;
    this.port = options.port ?? 0;
    this.conversations = [...(options.conversations ?? omiEmulatorConversations())].sort(
      (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt) || b.id.localeCompare(a.id),
    );
  }

  /** Starts listening on 127.0.0.1 and returns the base URL (no path). */
  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://emulator.test");
      const [status, body, headers] = this.handle(url, req.headers.authorization ?? null);
      res.writeHead(status, { "content-type": "application/json", ...headers });
      res.end(JSON.stringify(body));
    });
    await new Promise<void>((resolve) => this.server?.listen(this.port, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  }

  private shape(c: OmiEmulatorConversation, withTranscript: boolean) {
    return {
      id: c.id,
      created_at: c.finishedAt,
      started_at: c.startedAt,
      finished_at: c.finishedAt,
      structured: { title: c.title, overview: c.overview, emoji: "", category: "other" },
      language: "en",
      source: "omi",
      transcript_segments: withTranscript ? c.segments : null,
      transcript_included: withTranscript,
    };
  }

  private handle(
    url: URL,
    authorization: string | null,
  ): [number, unknown, Record<string, string>?] {
    this.requests.push({ path: url.pathname, query: url.search, authorization });
    if (this.rejectAll || authorization !== `Bearer ${this.apiKey}`)
      return [401, { detail: "Invalid API key" }];
    if (this.down) return [503, { detail: "unavailable" }];
    if (this.rateLimitNext > 0) {
      this.rateLimitNext -= 1;
      return [429, { detail: "rate limited" }, { "retry-after": String(this.retryAfterSeconds) }];
    }
    const q = url.searchParams;
    if (url.pathname === "/v1/dev/user/memories") return [200, []];
    if (url.pathname === "/v1/dev/user/conversations") {
      const limit = q.has("limit") ? Number(q.get("limit")) : 25;
      const decoded = q.has("cursor")
        ? Buffer.from(q.get("cursor") ?? "", "base64url").toString()
        : "0";
      const start = /^\d+$/.test(decoded) ? Number(decoded) : -1;
      if (!Number.isInteger(limit) || limit < 1) return [400, { detail: "bad limit" }];
      if (start < 0) return [400, { detail: "invalid cursor" }];
      const next = start + Math.min(limit, this.maxPageSize);
      const more = next < this.conversations.length;
      return [
        200,
        this.conversations.slice(start, next).map((c) => this.shape(c, false)),
        {
          "x-omi-has-more": String(more),
          ...(more ? { "x-omi-next-cursor": Buffer.from(String(next)).toString("base64url") } : {}),
          "x-omi-effective-limit": String(Math.min(limit, this.maxPageSize)),
        },
      ];
    }
    const match = /^\/v1\/dev\/user\/conversations\/([^/]+)$/.exec(url.pathname);
    const found =
      match && this.conversations.find((c) => c.id === decodeURIComponent(match[1] ?? ""));
    if (!found) return [404, { detail: "Not found" }];
    return [200, this.shape(found, q.get("include_transcript") === "true")];
  }
}
