import { t } from "@lingui/core/macro";
import type { MeetingCaptureTrack } from "@rakazo/contracts";
import { rpc, withSpaceHeaders } from "../rpc";
import type { BufferedChunk, CaptureOwner, CaptureRecord } from "./buffer";
import {
  classifyUpload,
  createChunkStore,
  dropCapture,
  dropUser,
  flushChunks,
  pendingChunks,
} from "./buffer";
import { callAudioMissing } from "./chunker";
import { TrackRecorder } from "./recorder";

/** What the recording pill shows. */
export type CaptureView =
  | { phase: "idle" }
  | {
      phase: "recording";
      captureId: string;
      title: string | null;
      startedAt: number;
      /** The shared tab has made no sound for its first 10 seconds. */
      noCallAudio: boolean;
      /** Chunks are waiting in this browser because an upload failed. */
      offline: boolean;
    }
  | {
      phase: "transcribing";
      captureId: string;
      title: string | null;
      startedAt: number;
      /** The microphone went away, so the recording was stopped. */
      micStopped?: boolean;
    }
  /** The server closed the capture; what was recorded here could not be kept. */
  | { phase: "failed"; message: string }
  /** The meeting is stored; `meetingId` is null when the capture produced none. */
  | { phase: "stored"; meetingId: string | null };

export type StartOptions = {
  title?: string;
  consentConfirmed?: boolean;
  /** Also record the audio of a browser tab (Chrome and Edge). */
  tabAudio?: boolean;
};

const RETRY_MS = 5_000;
const POLL_MS = 2_000;
const RECOVER_RETRY_MS = 10_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** One recording run in this tab. Every async continuation checks `live(s)` before it acts. */
type Session = {
  owner: CaptureOwner;
  record: CaptureRecord;
  startedAt: number;
  recorders: Map<MeetingCaptureTrack, TrackRecorder>;
  /** A tab was meant to be recorded, with or without sound. */
  expectsTabAudio: boolean;
  retry: ReturnType<typeof setTimeout> | null;
  /** New chunks are taken while true. */
  accepting: boolean;
  stopping: boolean;
  /** Sign-out, a closed capture or the end: nothing more may happen for this session. */
  ended: boolean;
  /** Another tab of this browser owns the recording; this one can only Stop. */
  observer: boolean;
  releaseLock: (() => void) | null;
};

let view: CaptureView = { phase: "idle" };
let session: Session | null = null;
let starting = false;
/** Grows on sign-out, so a startup or recovery that was waiting knows it is out of date. */
let generation = 0;
let flushQueue: Promise<unknown> = Promise.resolve();
let silenceTimer: ReturnType<typeof setInterval> | null = null;
let recoverTimer: ReturnType<typeof setTimeout> | null = null;
let lastUserId: string | null = null;
let storedCount = 0;
/** Exposed for tests. */
export const chunkStore = createChunkStore();
const listeners = new Set<() => void>();

function set(next: CaptureView) {
  view = next;
  for (const listener of listeners) listener();
}

export const subscribeCapture = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const captureView = () => view;
/** Grows each time a recording becomes a stored meeting, so the list knows to reload. */
export const storedCaptures = () => storedCount;

const live = (s: Session) => session === s && !s.ended;
const context = (s: Session) => ({ context: { spaceId: s.owner.spaceId } });

const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
function watch(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}

/** Only one tab may record a capture: the Web Locks owner. Null when another tab holds it. */
async function acquireLock(captureId: string): Promise<(() => void) | null> {
  if (typeof navigator === "undefined" || !navigator.locks) return () => undefined;
  return new Promise((resolve) => {
    void navigator.locks.request(`meeting-capture:${captureId}`, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve(null);
        return;
      }
      // Holding the lock means keeping this promise pending until the session is over.
      return new Promise<void>((release) => resolve(() => release()));
    });
  });
}

async function upload(chunk: BufferedChunk) {
  const query = new URLSearchParams({
    track: chunk.track,
    seq: String(chunk.seq),
    startMs: String(chunk.startMs),
    endMs: String(chunk.endMs),
  });
  const response = await fetch(
    `/api/meeting-captures/${encodeURIComponent(chunk.captureId)}/chunks?${query}`,
    {
      method: "POST",
      headers: withSpaceHeaders({ "content-type": "application/octet-stream" }, chunk.spaceId),
      credentials: "include",
      body: chunk.blob,
    },
  );
  if (response.ok) return;
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  throw (
    classifyUpload(response.status, body?.error) ?? new Error(`Upload failed (${response.status})`)
  );
}

/** Ends the session because the server closed the capture. The pill says so until dismissed. */
async function endLocal(s: Session, message: string) {
  if (!live(s)) return;
  s.ended = true;
  session = null;
  teardown(s);
  await dropCapture(chunkStore, s.owner);
  set({ phase: "failed", message });
}

/** One upload pass over this capture's chunks, after any pass already running. */
function flush(s: Session): Promise<{ failed: boolean }> {
  const run = flushQueue.then(() => pass(s));
  flushQueue = run.catch(() => undefined);
  return run;
}

async function pass(s: Session): Promise<{ failed: boolean }> {
  if (!live(s) || s.observer) return { failed: false };
  const { failed, rejected } = await flushChunks(chunkStore, s.owner, upload);
  if (!live(s)) return { failed: false };
  if (rejected.some((r) => r.endsCapture)) {
    await endLocal(s, t`This recording was closed and could not be saved.`);
    return { failed: false };
  }
  if (view.phase === "recording" && view.offline !== failed) set({ ...view, offline: failed });
  if (failed && !s.stopping && !s.retry) {
    s.retry = setTimeout(() => {
      s.retry = null;
      void flush(s);
    }, RETRY_MS);
  }
  return { failed };
}

async function accept(s: Session, chunk: BufferedChunk) {
  if (!s.accepting || s.ended) return;
  await chunkStore.put(chunk);
  // Sign-out or an ended capture while the write was running: leave nothing behind.
  if (s.ended) {
    await chunkStore.remove(chunk.key);
    return;
  }
  void flush(s);
}

function watchSilence(s: Session) {
  if (silenceTimer) clearInterval(silenceTimer);
  silenceTimer = setInterval(() => {
    if (!live(s) || view.phase !== "recording") return;
    const system = s.recorders.get("system");
    const missing = s.expectsTabAudio
      ? !system || callAudioMissing(system.peak, Date.now() - s.startedAt)
      : false;
    if (missing !== view.noCallAudio) set({ ...view, noCallAudio: missing });
  }, 1_000);
}

function begin(s: Session, streams: Map<MeetingCaptureTrack, MediaStream>, seqBase: number) {
  for (const [track, stream] of streams) {
    const recorder = new TrackRecorder({
      stream,
      track,
      owner: s.owner,
      startedAt: s.startedAt,
      seqBase,
      onChunk: (chunk) => accept(s, chunk),
      ...(track === "microphone" ? { onEnded: () => void stopCapture({ micStopped: true }) } : {}),
    });
    s.recorders.set(track, recorder);
    recorder.start();
  }
  watchSilence(s);
  watch(true);
}

/** Timers and the leave prompt; the lock stays until the session is over. */
function quiet(s: Session) {
  if (silenceTimer) clearInterval(silenceTimer);
  silenceTimer = null;
  if (s.retry) clearTimeout(s.retry);
  s.retry = null;
  watch(false);
}

function teardown(s: Session) {
  for (const recorder of s.recorders.values()) recorder.abandon();
  quiet(s);
  s.releaseLock?.();
  s.releaseLock = null;
}

async function microphone(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true } });
  } catch {
    throw new Error(t`Microphone access is blocked. Allow it in your browser and try again.`);
  }
}

async function tabAudio(): Promise<MediaStream | null> {
  let display: MediaStream;
  try {
    display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  } catch {
    throw new Error(t`No tab was shared. Start again to pick one.`);
  }
  for (const video of display.getVideoTracks()) video.stop();
  // Nothing to record when the tab was shared without its sound.
  return display.getAudioTracks().length > 0 ? new MediaStream(display.getAudioTracks()) : null;
}

const stopTracks = (streams: Iterable<MediaStream>) => {
  for (const stream of streams) for (const track of stream.getTracks()) track.stop();
};

/** Starts a recording from the Record popover. Throws a readable message when it cannot. */
export async function startCapture(options: StartOptions): Promise<void> {
  if (session || starting) throw new Error(t`A recording is already running.`);
  starting = true;
  const gen = generation;
  const streams = new Map<MeetingCaptureTrack, MediaStream>();
  let s: Session | null = null;
  let captureId: string | null = null;
  let spaceId = "";
  const outdated = () => {
    if (gen !== generation) throw new Error(t`You were signed out.`);
  };
  try {
    const me = await rpc.me();
    spaceId = me.spaceId;
    lastUserId = me.userId;
    streams.set("microphone", await microphone());
    outdated();
    if (options.tabAudio) {
      const tab = await tabAudio();
      if (tab) streams.set("system", tab);
      outdated();
    }
    const title = options.title?.trim() || undefined;
    const started = await rpc.meetingCaptures.start(
      {
        clientId: crypto.randomUUID(),
        engine: "server",
        tracks: [...streams.keys()],
        ...(title ? { title } : {}),
        ...(options.consentConfirmed ? { consentConfirmed: true } : {}),
      },
      { context: { spaceId } },
    );
    captureId = started.captureId;
    outdated();
    const owner = { userId: me.userId, spaceId, captureId };
    const startedAt = Date.now();
    const record: CaptureRecord = {
      ...owner,
      tracks: [...streams.keys()],
      title: title ?? null,
      startedAt,
      stopped: false,
    };
    s = {
      owner,
      record,
      startedAt,
      recorders: new Map(),
      expectsTabAudio: Boolean(options.tabAudio),
      retry: null,
      accepting: true,
      stopping: false,
      ended: false,
      observer: false,
      releaseLock: await acquireLock(captureId),
    };
    session = s;
    await chunkStore.putRecord(record);
    set({
      phase: "recording",
      captureId,
      title: title ?? null,
      startedAt,
      noCallAudio: false,
      offline: false,
    });
    begin(s, streams, 0);
  } catch (error) {
    // Roll everything back: no phantom session, no open microphone, no half-made capture.
    stopTracks(streams.values());
    if (s) {
      s.ended = true;
      if (session === s) session = null;
      teardown(s);
      await dropCapture(chunkStore, s.owner).catch(() => undefined);
      set({ phase: "idle" });
    }
    if (captureId)
      await rpc.meetingCaptures
        .discard({ captureId }, { context: { spaceId } })
        .catch(() => undefined);
    throw error;
  } finally {
    starting = false;
  }
}

/** Finds the stored meeting once the capture has left `active`. */
async function waitForStored(s: Session) {
  for (;;) {
    await sleep(POLL_MS);
    if (!live(s)) return;
    let active: Awaited<ReturnType<typeof rpc.meetingCaptures.active>>;
    try {
      active = await rpc.meetingCaptures.active(undefined, context(s));
    } catch {
      continue;
    }
    if (!live(s)) return;
    if (active) continue;
    let meetingId: string | null = null;
    try {
      const page = await rpc.meetings.list({}, context(s));
      meetingId =
        page.items.find(
          (meeting) =>
            meeting.provider === "praci" && Date.parse(meeting.startedAt) >= s.startedAt - 60_000,
        )?.id ?? null;
    } catch {
      // The list refreshes on its own; only the automatic open is lost.
    }
    if (!live(s)) return;
    s.ended = true;
    session = null;
    teardown(s);
    await dropCapture(chunkStore, s.owner);
    storedCount += 1;
    set({ phase: "stored", meetingId });
    return;
  }
}

async function finishRpc(s: Session) {
  while (live(s)) {
    try {
      await rpc.meetingCaptures.finish(
        { captureId: s.owner.captureId, endedAt: new Date().toISOString() },
        context(s),
      );
      return;
    } catch {
      await sleep(RETRY_MS);
    }
  }
}

/** Uploads what is left, tells the server the recording is over, and waits for the meeting. */
async function finishFlow(s: Session) {
  // Finishing before the last chunk arrived would leave it out of the meeting.
  for (;;) {
    if (!live(s)) return;
    const { failed } = await flush(s);
    if (!live(s)) return;
    if (!failed && (await pendingChunks(chunkStore, s.owner)).length === 0) break;
    await sleep(RETRY_MS);
  }
  await finishRpc(s);
  if (!live(s)) return;
  await dropCapture(chunkStore, s.owner);
  await waitForStored(s);
}

/** Stops recording, uploads what is left, and waits for the meeting to be stored. */
export async function stopCapture(options: { micStopped?: boolean } = {}): Promise<void> {
  const s = session;
  if (!s || s.stopping || s.ended) return;
  s.stopping = true;
  set({
    phase: "transcribing",
    captureId: s.owner.captureId,
    title: s.record.title,
    startedAt: s.startedAt,
    ...(options.micStopped ? { micStopped: true } : {}),
  });
  if (s.observer) {
    // The other tab owns the audio; it will see the capture close and end itself.
    await finishRpc(s);
    await waitForStored(s);
    return;
  }
  // Written before anything else, so a reload at any point after this finishes instead of recording.
  s.record = { ...s.record, stopped: true };
  await chunkStore.putRecord(s.record);
  await Promise.all([...s.recorders.values()].map((recorder) => recorder.stop()));
  s.accepting = false;
  quiet(s);
  await finishFlow(s);
}

function scheduleRecover() {
  if (recoverTimer) return;
  recoverTimer = setTimeout(() => {
    recoverTimer = null;
    void recoverCapture();
  }, RECOVER_RETRY_MS);
}

/**
 * Picks up a capture this browser started and lost track of (reload, crash). Only a capture with a
 * local record is adopted. When the server cannot be reached nothing is cleared; it asks again later.
 */
export async function recoverCapture(): Promise<void> {
  if (session || starting) return;
  const gen = generation;
  let me: Awaited<ReturnType<typeof rpc.me>>;
  let active: Awaited<ReturnType<typeof rpc.meetingCaptures.active>>;
  try {
    me = await rpc.me();
    active = await rpc.meetingCaptures.active();
  } catch {
    if ((await chunkStore.records()).length > 0) scheduleRecover();
    return;
  }
  if (!me || gen !== generation || session || starting) return;
  lastUserId = me.userId;
  // The server answered: a record for a capture of this space that is not active is finished business.
  const mine = (await chunkStore.records()).filter(
    (record) => record.userId === me.userId && record.spaceId === me.spaceId,
  );
  for (const record of mine)
    if (record.captureId !== active?.captureId) await dropCapture(chunkStore, record);
  const record = mine.find((item) => item.captureId === active?.captureId);
  if (!active || !record || gen !== generation || session) return;

  const owner = { userId: me.userId, spaceId: me.spaceId, captureId: active.captureId };
  const s: Session = {
    owner,
    record,
    startedAt: Date.parse(active.startedAt),
    recorders: new Map(),
    expectsTabAudio: record.tracks.includes("system"),
    retry: null,
    accepting: false,
    stopping: false,
    ended: false,
    observer: false,
    releaseLock: null,
  };
  session = s;
  const transcribing = () =>
    set({
      phase: "transcribing",
      captureId: owner.captureId,
      title: active.title,
      startedAt: s.startedAt,
    });
  if (active.status === "finishing") {
    s.stopping = true;
    transcribing();
    await flush(s);
    await waitForStored(s);
    return;
  }
  if (record.stopped) {
    // Stop was pressed before the page closed: finish, never record again.
    s.stopping = true;
    transcribing();
    await finishFlow(s);
    return;
  }
  const release = await acquireLock(owner.captureId);
  if (!live(s) || s.stopping) {
    release?.();
    return;
  }
  const recording = {
    phase: "recording" as const,
    captureId: owner.captureId,
    title: active.title,
    startedAt: s.startedAt,
    // Sharing a tab again needs a click, so a recovered call recording has no call audio until then.
    noCallAudio: s.expectsTabAudio,
    offline: false,
  };
  if (!release) {
    // Another tab records it: this one shows the pill and can Stop.
    s.observer = true;
    set(recording);
    return;
  }
  s.releaseLock = release;
  s.accepting = true;
  set(recording);
  void flush(s);
  let mic: MediaStream;
  try {
    mic = await microphone();
  } catch {
    // The microphone is not available any more: store what arrived.
    await stopCapture();
    return;
  }
  if (!live(s) || s.stopping) {
    stopTracks([mic]);
    return;
  }
  // Unique among the earlier chunks, which cannot be more than one per second.
  begin(s, new Map([["microphone", mic]]), Math.floor((Date.now() - s.startedAt) / 1000));
}

/** The pill goes once the meeting is stored (and opened, when the user was on the list) or the error is read. */
export function dismissStored() {
  if (view.phase === "stored" || view.phase === "failed") set({ phase: "idle" });
}

/** Sign-out: end the session first, then drop everything this user buffered. */
export async function clearCaptureOnSignOut(userId?: string | null): Promise<void> {
  generation += 1;
  if (recoverTimer) clearTimeout(recoverTimer);
  recoverTimer = null;
  const s = session;
  if (s) {
    s.ended = true;
    session = null;
    teardown(s);
  }
  await dropUser(chunkStore, userId ?? s?.owner.userId ?? lastUserId);
  set({ phase: "idle" });
}
