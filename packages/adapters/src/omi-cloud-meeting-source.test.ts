import { MeetingSourceError } from "@rakazo/adapter-kit";
import { afterEach, describe, expect, it } from "vitest";
import { createMeetingSourceRegistry } from "./meeting-source-registry.js";
import { CHAIN_DELAY_MS } from "./meeting-sync-job.js";
import { OmiCloudApiEmulator } from "./omi-cloud-api-emulator.js";
import { createOmiCloudMeetingSource } from "./omi-cloud-meeting-source.js";

const KEY = "omi_dev_test_key";
const open: OmiCloudApiEmulator[] = [];

async function setup(options: ConstructorParameters<typeof OmiCloudApiEmulator>[0] = {}) {
  const emulator = new OmiCloudApiEmulator({ apiKey: KEY, ...options });
  open.push(emulator);
  const baseUrl = await emulator.start();
  return { emulator, source: createOmiCloudMeetingSource({ apiKey: KEY, baseUrl }) };
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((e) => e.stop()));
});

describe("omi cloud source", () => {
  it("pages with the cursor headers and drops conversations under two minutes", async () => {
    const { emulator, source } = await setup({ maxPageSize: 2 });
    const first = await source.list({});
    expect(first.items.map((i) => i.externalId)).toEqual(["omi-conv-4"]);
    expect(first.nextCursor).toBeTruthy();
    const second = await source.list({ cursor: first.nextCursor });
    expect(second.items.map((i) => i.externalId)).toEqual(["omi-conv-2", "omi-conv-1"]);
    expect(second.nextCursor).toBeUndefined();
    const [req] = emulator.requests;
    expect(req?.query).toContain("include_transcript=false");
    expect(req?.authorization).toBe(`Bearer ${KEY}`);
    expect(emulator.requests[1]?.query).toContain("cursor=");
  });

  it("fetches the transcript and maps title, overview, times and speakers", async () => {
    const { emulator, source } = await setup();
    const m = await source.get("omi-conv-1", { includeTranscript: true });
    expect(emulator.requests.at(-1)?.query).toContain("include_transcript=true");
    expect(m).toMatchObject({
      title: "Hiring debrief",
      summary: "Decided to extend an offer.",
      startedAt: "2026-02-01T10:00:00.000Z",
      endedAt: "2026-02-01T10:30:00.000Z",
      attendees: [],
    });
    // A segment with only text still maps; one with times gets an absolute time.
    expect(m.transcript).toEqual([
      { text: "I liked the second candidate." },
      { text: "Same here.", speaker: "SPEAKER_1", at: "2026-02-01T10:00:12.000Z" },
    ]);
  });

  it("marks a conversation with an empty transcript as deleted", async () => {
    const { source } = await setup();
    const m = await source.get("omi-conv-2", { includeTranscript: true });
    expect(m.deleted).toBe(true);
    expect((await source.get("omi-conv-4", { includeTranscript: true })).deleted).toBeUndefined();
  });

  it("maps 429 to rate_limit with Retry-After in milliseconds", async () => {
    const { emulator, source } = await setup();
    emulator.rateLimitNext = 1;
    emulator.retryAfterSeconds = 42;
    await expect(source.list({})).rejects.toMatchObject({
      kind: "rate_limit",
      retryAfterMs: 42_000,
    });
  });

  it("maps 5xx and network errors to unavailable, and a bad cursor too", async () => {
    const { emulator, source } = await setup();
    await expect(source.list({ cursor: "!!" })).rejects.toMatchObject({ kind: "unavailable" });
    emulator.down = true;
    await expect(source.list({})).rejects.toMatchObject({ kind: "unavailable" });
    const gone = createOmiCloudMeetingSource({ apiKey: KEY, baseUrl: "http://127.0.0.1:1" });
    await expect(gone.list({})).rejects.toBeInstanceOf(MeetingSourceError);
    await expect(gone.list({})).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("rejects a mapping with no usable time", async () => {
    const source = createOmiCloudMeetingSource({
      apiKey: KEY,
      baseUrl: "http://omi.test",
      fetch: (async () =>
        new Response(JSON.stringify([{ id: "x", extra: 1 }]), { status: 200 })) as typeof fetch,
    });
    await expect(source.list({})).rejects.toMatchObject({ kind: "mapping" });
  });

  it("tolerates missing optional fields and unknown extras", async () => {
    const source = createOmiCloudMeetingSource({
      apiKey: KEY,
      baseUrl: "http://omi.test",
      fetch: (async () =>
        new Response(
          JSON.stringify({
            id: "x",
            started_at: "2026-02-01T10:00:00Z",
            unknown: { a: 1 },
            transcript_segments: [{ text: "hi", is_user: true, extra: 1 }],
          }),
          { status: 200 },
        )) as typeof fetch,
    });
    const m = await source.get("x", { includeTranscript: true });
    expect(m.title).toBe("");
    expect(m.endedAt).toBeNull();
    expect(m.transcript).toEqual([{ text: "hi", speaker: "Me" }]);
  });
});

describe("omi cloud keys", () => {
  it("throws auth for an omi_mcp_ key before any request", () => {
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response("[]");
    }) as typeof fetch;
    expect(() => createOmiCloudMeetingSource({ apiKey: "omi_mcp_abc", fetch: fetcher })).toThrow(
      MeetingSourceError,
    );
    expect(called).toBe(false);
  });

  it("maps 401 and 403 to auth", async () => {
    const { emulator, source } = await setup();
    emulator.rejectAll = true;
    await expect(source.list({})).rejects.toMatchObject({ kind: "auth" });
    const forbidden = createOmiCloudMeetingSource({
      apiKey: KEY,
      baseUrl: "http://omi.test",
      fetch: (async () => new Response("{}", { status: 403 })) as typeof fetch,
    });
    await expect(forbidden.list({})).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("meeting source registry chain delay", () => {
  it("is slower for Omi than the default that other providers use", () => {
    const registry = createMeetingSourceRegistry();
    expect(registry.omi_cloud?.chainDelayMs).toBe(120_000);
    expect(registry.omi_cloud?.connectorId).toBe("omi-cloud");
    expect(registry.granola?.chainDelayMs).toBeUndefined();
    expect(CHAIN_DELAY_MS).toBe(1_000);
  });
});
