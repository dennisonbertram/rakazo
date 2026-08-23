import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarNative, DriveNative, MeetNative } from "./google-workspace.js";
import { GOOGLE_SCOPES, GoogleAuthBroker } from "./google-gmail.js";

afterEach(() => vi.unstubAllGlobals());

const ACTOR = { workspaceId: "w1", userId: "u1" };

function brokerWith(tokens: Record<string, unknown> | null) {
  const secretRow = tokens ? { id: "s1", ciphertext: "ct" } : null;
  const prisma = {
    secret: {
      findFirst: vi.fn().mockResolvedValue(secretRow),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const secrets = {
    load: vi.fn().mockReturnValue(JSON.stringify(tokens ?? {})),
    put: vi.fn().mockResolvedValue({ id: "s2", ciphertext: "ct2" }),
  };
  return new GoogleAuthBroker(prisma as never, secrets as never, "client-id");
}

const LIVE = { access_token: "live", expires_in: 3600, obtainedAt: Date.now(), scope: GOOGLE_SCOPES.join(" ") };

describe("OAuth architecture", () => {
  it("requests all four service scopes", () => {
    const joined = GOOGLE_SCOPES.join(" ");
    for (const part of ["gmail.readonly", "drive.readonly", "calendar.readonly", "meetings.space.readonly"]) {
      expect(joined).toContain(part);
    }
    const broker = brokerWith(null);
    const { authorizationUrl } = broker.begin(ACTOR, "http://127.0.0.1:5173/google/oauth/callback");
    expect(new URL(authorizationUrl).searchParams.get("scope")).toBe(joined);
  });

  it("reports reconnect when stored scopes miss newly required ones", async () => {
    const legacy = brokerWith({ ...LIVE, scope: "https://www.googleapis.com/auth/gmail.readonly" });
    expect(await legacy.status(ACTOR)).toBe("reconnect");
    const current = brokerWith(LIVE);
    expect(await current.status(ACTOR)).toBe("connected");
    // Tokens stored before scope tracking existed must not break: treat as connected.
    const prescope = brokerWith({ access_token: "x", expires_in: 3600, obtainedAt: Date.now() });
    expect(await prescope.status(ACTOR)).toBe("connected");
  });

  it("deduplicates concurrent refreshes into one token request", async () => {
    const stale = brokerWith({ ...LIVE, access_token: "old", refresh_token: "r", obtainedAt: Date.now() - 7200_000 });
    const fetchMock = vi.fn(async () => Response.json({ access_token: "renewed", expires_in: 3600 }));
    vi.stubGlobal("fetch", fetchMock);
    const [a, b] = await Promise.all([stale.accessToken(ACTOR), stale.accessToken(ACTOR)]);
    expect(a).toBe("renewed");
    expect(b).toBe("renewed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("revokes the refresh token on disconnect", async () => {
    const broker = brokerWith({ ...LIVE, refresh_token: "revoked-me" });
    const calls: { url: string; body: string }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        calls.push({ url: String(input), body: String(init?.body ?? "") });
        return new Response(null, { status: 200 });
      }),
    );
    await broker.disconnect(ACTOR);
    expect(calls[0]?.url).toContain("oauth2.googleapis.com/revoke");
    expect(calls[0]?.body).toContain("revoked-me");
  });
});

describe("DriveNative", () => {
  it("wraps plain text into a fullText query and passes raw queries through", async () => {
    const drive = new DriveNative(brokerWith(LIVE));
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      urls.push(String(input));
      return Response.json({ files: [{ id: "f1", name: "Plan", mimeType: "application/vnd.google-apps.document", modifiedTime: "2026-08-01T00:00:00Z", owners: [{ displayName: "Me" }] }] });
    }));
    const decoded = (index: number) => decodeURIComponent((urls[index] ?? "").replaceAll("+", " "));
    const results = await drive.search(ACTOR, { query: "meet transcript" });
    expect(decoded(0)).toContain("fullText contains 'meet transcript'");
    expect(results[0]).toMatchObject({ id: "f1", name: "Plan" });
    await drive.search(ACTOR, { query: "name contains 'Q3'" });
    expect(decoded(1)).toContain("name contains 'Q3'");
  });

  it("escapes quotes in plain-text queries", async () => {
    const drive = new DriveNative(brokerWith(LIVE));
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      urls.push(String(input));
      return Response.json({ files: [] });
    }));
    await drive.search(ACTOR, { query: "bob's plan" });
    expect(decodeURIComponent((urls[0] ?? "").replaceAll("+", " "))).toContain("fullText contains 'bob\\'s plan'");
  });

  it("exports Google Docs as text and downloads text files directly", async () => {
    const drive = new DriveNative(brokerWith(LIVE));
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("alt=media")) return new Response("raw text");
      if (url.includes("/export")) return new Response("doc text");
      return Response.json({ id: "f1", name: "Plan", mimeType: "application/vnd.google-apps.document" });
    }));
    const doc = await drive.read(ACTOR, "f1");
    expect(doc.body).toBe("doc text");
    expect(urls.some((url) => url.includes("export?mimeType=text%2Fplain"))).toBe(true);

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("alt=media")) return new Response("raw text");
      return Response.json({ id: "f2", name: "notes.txt", mimeType: "text/plain" });
    }));
    const text = await drive.read(ACTOR, "f2");
    expect(text.body).toBe("raw text");
  });
});

describe("CalendarNative", () => {
  it("lists events in a window with expanded recurrences ordered by start", async () => {
    const calendar = new CalendarNative(brokerWith(LIVE));
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      urls.push(String(input));
      return Response.json({
        items: [{ id: "e1", summary: "Standup", start: { dateTime: "2026-08-24T09:00:00Z" }, end: { dateTime: "2026-08-24T09:15:00Z" }, attendees: [{ email: "a@x" }], hangoutLink: "https://meet.google.com/abc" }],
      });
    }));
    const events = await calendar.events(ACTOR, { timeMin: "2026-08-24T00:00:00Z", timeMax: "2026-08-25T00:00:00Z" });
    const url = decodeURIComponent(urls[0] ?? "");
    expect(url).toContain("singleEvents=true");
    expect(url).toContain("orderBy=startTime");
    expect(url).toContain("timeMin=2026-08-24T00:00:00Z");
    expect(events[0]).toMatchObject({ id: "e1", summary: "Standup", meetLink: "https://meet.google.com/abc" });
  });
});

describe("MeetNative", () => {
  it("lists conference records with their transcripts", async () => {
    const meet = new MeetNative(brokerWith(LIVE));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/v2/conferenceRecords")) {
        return Response.json({ conferenceRecords: [{ name: "conferenceRecords/c1", startTime: "2026-08-20T10:00:00Z", endTime: "2026-08-20T11:00:00Z" }] });
      }
      if (url.includes("/transcripts") && !url.includes("/entries")) {
        return Response.json({ transcripts: [{ name: "conferenceRecords/c1/transcripts/t1", state: "ENDED" }] });
      }
      throw new Error(`unexpected ${url}`);
    }));
    const records = await meet.recentTranscripts(ACTOR, 5);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ record: "conferenceRecords/c1", transcripts: ["conferenceRecords/c1/transcripts/t1"] });
  });

  it("stitches transcript entries across pages into speaker-labelled lines", async () => {
    const meet = new MeetNative(brokerWith(LIVE));
    let page = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      page += 1;
      if (page === 1) {
        return Response.json({
          transcriptEntries: [{ participant: "participants/p1", text: "Hello team", startTime: "2026-08-20T10:00:01Z" }],
          nextPageToken: "n1",
        });
      }
      return Response.json({
        transcriptEntries: [{ participant: "participants/p2", text: "Hi!", startTime: "2026-08-20T10:00:05Z" }],
      });
    }));
    const text = await meet.transcriptText(ACTOR, "conferenceRecords/c1/transcripts/t1");
    expect(text).toContain("participants/p1: Hello team");
    expect(text).toContain("participants/p2: Hi!");
    expect(text.indexOf("Hello team")).toBeLessThan(text.indexOf("Hi!"));
  });
});
