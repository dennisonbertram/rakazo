// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { BufferedChunk, CaptureRecord } from "./buffer";

vi.mock("@lingui/core/macro", () => ({
  t: (parts: TemplateStringsArray, ...values: unknown[]) =>
    parts.reduce((out, part, i) => out + part + (i < values.length ? String(values[i]) : ""), ""),
}));
const rpc = vi.hoisted(() => ({
  me: vi.fn(),
  meetingCaptures: { start: vi.fn(), active: vi.fn(), finish: vi.fn(), discard: vi.fn() },
  meetings: { list: vi.fn() },
}));
vi.mock("../rpc", () => ({
  rpc,
  withSpaceHeaders: (init?: HeadersInit) => new Headers(init),
}));

type Opts = {
  onChunk: (chunk: unknown) => Promise<void>;
  onEnded?: () => void;
  owner: Record<string, string>;
  track: string;
};
const fakes = vi.hoisted(() => ({ list: [] as unknown[], failStart: false }));
vi.mock("./recorder", () => ({
  TrackRecorder: class {
    peak = 0;
    constructor(public options: Opts) {
      fakes.list.push(this);
    }
    start() {
      if (fakes.failStart) throw new Error("no recorder");
    }
    async stop() {
      await this.options.onChunk(fakeChunk(this.options, 9));
    }
    abandon() {}
  },
}));

function fakeChunk(options: Opts, seq: number) {
  return {
    key: `${options.owner.userId}:${options.owner.spaceId}:${options.owner.captureId}:${options.track}:${seq}`,
    ...options.owner,
    track: options.track,
    seq,
    startMs: 0,
    endMs: 1000,
    blob: new Blob(["x"]),
  };
}

type Controller = typeof import("./controller");
let c: Controller;
const gum = vi.fn();
const stream = () => ({
  getTracks: () => [{ stop: vi.fn() }],
  getVideoTracks: () => [],
  getAudioTracks: () => [],
});
const active = (status = "recording") => ({
  captureId: "c1",
  title: null,
  engine: "server",
  tracks: ["microphone"],
  status,
  startedAt: new Date().toISOString(),
});
const record = (extra: Partial<CaptureRecord> = {}): CaptureRecord => ({
  captureId: "c1",
  userId: "u1",
  spaceId: "sA",
  tracks: ["microphone"],
  title: null,
  startedAt: Date.now(),
  stopped: false,
  ...extra,
});
const owner = { userId: "u1", spaceId: "sA", captureId: "c1" };
const seeded = (seq = 1): BufferedChunk => ({
  key: `u1:sA:c1:microphone:${seq}`,
  ...owner,
  track: "microphone" as const,
  seq,
  startMs: 0,
  endMs: 1000,
  blob: new Blob(["x"]),
});
const created = (status = 201) =>
  vi.fn(async () => new Response(JSON.stringify({ error: "Capture is closed" }), { status }));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  fakes.list.length = 0;
  fakes.failStart = false;
  gum.mockReset().mockImplementation(async () => stream());
  Object.defineProperty(navigator, "mediaDevices", {
    value: { getUserMedia: gum },
    configurable: true,
  });
  Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
  rpc.me.mockResolvedValue({ userId: "u1", spaceId: "sA" });
  rpc.meetingCaptures.start.mockResolvedValue({ captureId: "c1" });
  rpc.meetingCaptures.finish.mockResolvedValue({ ok: true });
  rpc.meetingCaptures.discard.mockResolvedValue({ ok: true });
  rpc.meetings.list.mockResolvedValue({ items: [] });
  vi.stubGlobal("fetch", created(201));
  c = await import("./controller");
});
afterEach(() => vi.useRealTimers());

const settle = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

it("Stop waits for a slow upload before it finishes the capture", async () => {
  await c.startCapture({});
  let finishUpload: () => void = () => {};
  vi.stubGlobal(
    "fetch",
    vi.fn(
      () =>
        new Promise<Response>(
          (resolve) => (finishUpload = () => resolve(new Response("{}", { status: 201 }))),
        ),
    ),
  );
  rpc.meetingCaptures.active.mockResolvedValue(null);
  void c.stopCapture();
  await settle(100);
  expect(rpc.meetingCaptures.finish).not.toHaveBeenCalled();
  finishUpload();
  await settle(100);
  expect(rpc.meetingCaptures.finish).toHaveBeenCalledTimes(1);
  expect(await c.chunkStore.all()).toEqual([]);
});

it("keeps the buffer and record when the server cannot be asked, and drops them once it says there is no capture", async () => {
  await c.chunkStore.putRecord(record());
  await c.chunkStore.put(seeded());
  rpc.meetingCaptures.active.mockRejectedValue(new Error("offline"));
  await c.recoverCapture();
  expect(await c.chunkStore.all()).toHaveLength(1);
  expect(await c.chunkStore.records()).toHaveLength(1);
  rpc.meetingCaptures.active.mockResolvedValue(null);
  await settle(10_000); // the retry
  expect(await c.chunkStore.all()).toHaveLength(0);
  expect(await c.chunkStore.records()).toHaveLength(0);
});

it("a capture without a local record is not adopted", async () => {
  rpc.meetingCaptures.active.mockResolvedValue(active());
  await c.recoverCapture();
  expect(c.captureView().phase).toBe("idle");
  expect(gum).not.toHaveBeenCalled();
});

it("a microphone permission granted after Stop starts nothing", async () => {
  await c.chunkStore.putRecord(record());
  rpc.meetingCaptures.active.mockResolvedValue(active());
  let grant: (value: unknown) => void = () => {};
  gum.mockImplementation(() => new Promise((resolve) => (grant = resolve)));
  const recovering = c.recoverCapture();
  await settle(10);
  rpc.meetingCaptures.active.mockResolvedValue(null);
  void c.stopCapture();
  await settle(10);
  const tracks = [{ stop: vi.fn() }];
  grant({ getTracks: () => tracks });
  await recovering;
  expect(fakes.list).toHaveLength(0);
  expect(tracks[0]?.stop).toHaveBeenCalled();
});

it("a late chunk after sign-out writes nothing", async () => {
  await c.startCapture({});
  const recorder = fakes.list[0] as { options: Opts };
  await c.clearCaptureOnSignOut("u1");
  await recorder.options.onChunk(fakeChunk(recorder.options, 5));
  expect(await c.chunkStore.all()).toEqual([]);
  expect(c.captureView().phase).toBe("idle");
});

it("a second tab shows the pill but does not record", async () => {
  Object.defineProperty(navigator, "locks", {
    value: { request: (_name: string, _o: unknown, cb: (lock: null) => void) => cb(null) },
    configurable: true,
  });
  await c.chunkStore.putRecord(record());
  rpc.meetingCaptures.active.mockResolvedValue(active());
  await c.recoverCapture();
  expect(c.captureView().phase).toBe("recording");
  expect(gum).not.toHaveBeenCalled();
  expect(fakes.list).toHaveLength(0);
});

it("a closed capture (409) ends Transcribing with an error", async () => {
  await c.startCapture({});
  vi.stubGlobal("fetch", created(409));
  rpc.meetingCaptures.active.mockResolvedValue(active());
  void c.stopCapture();
  await settle(100);
  expect(c.captureView()).toEqual({
    phase: "failed",
    message: "This recording was closed and could not be saved.",
  });
  expect(await c.chunkStore.all()).toEqual([]);
  c.dismissStored();
  expect(c.captureView().phase).toBe("idle");
});

it("a reload after Stop uploads the leftovers and finishes without opening the microphone", async () => {
  await c.chunkStore.putRecord(record({ stopped: true }));
  await c.chunkStore.put(seeded());
  rpc.meetingCaptures.active.mockResolvedValueOnce(active()).mockResolvedValue(null);
  const fetchMock = created(201);
  vi.stubGlobal("fetch", fetchMock);
  const done = c.recoverCapture();
  await settle(5000);
  await done;
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(rpc.meetingCaptures.finish).toHaveBeenCalledTimes(1);
  expect(gum).not.toHaveBeenCalled();
  expect(c.captureView().phase).toBe("stored");
});

it("a failed startup leaves no session, no record and an idle pill", async () => {
  fakes.failStart = true;
  await expect(c.startCapture({})).rejects.toThrow("no recorder");
  expect(c.captureView().phase).toBe("idle");
  expect(await c.chunkStore.records()).toEqual([]);
  expect(rpc.meetingCaptures.discard).toHaveBeenCalled();
  fakes.failStart = false;
  await c.startCapture({}); // a new recording may start
  expect(c.captureView().phase).toBe("recording");
});

it("a microphone that ends stops the capture and says so", async () => {
  await c.startCapture({});
  rpc.meetingCaptures.active.mockResolvedValue(active());
  const recorder = fakes.list[0] as { options: Opts };
  recorder.options.onEnded?.();
  await settle(50);
  expect(c.captureView()).toMatchObject({ phase: "transcribing", micStopped: true });
});

it("a recovered call recording shows No call audio and resumes the microphone only", async () => {
  await c.chunkStore.putRecord(record({ tracks: ["microphone", "system"] }));
  rpc.meetingCaptures.active.mockResolvedValue(active());
  await c.recoverCapture();
  expect(c.captureView()).toMatchObject({ phase: "recording", noCallAudio: true });
  expect(fakes.list).toHaveLength(1);
});
