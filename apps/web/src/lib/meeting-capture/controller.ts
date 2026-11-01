import { t } from "@lingui/core/macro";
import type { MeetingCaptureTrack } from "@rakazo/contracts";
import { enqueueNotificationToast } from "@rakazo/ui-web";
import { rpc, selectedSpaceId, withSpaceHeaders } from "../rpc";
import type { BufferedChunk } from "./buffer";
import { classifyUpload, createChunkStore, flushChunks } from "./buffer";
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
  | { phase: "transcribing"; captureId: string; title: string | null; startedAt: number }
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
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Session = {
  captureId: string;
  spaceId: string | null;
  startedAt: number;
  recorders: Map<MeetingCaptureTrack, TrackRecorder>;
  /** A tab was meant to be recorded, with or without sound. */
  expectsTabAudio: boolean;
  retry: ReturnType<typeof setTimeout> | null;
  closing: boolean;
};

let view: CaptureView = { phase: "idle" };
let session: Session | null = null;
let flushing: Promise<boolean> | null = null;
const store = createChunkStore();
let silenceTimer: ReturnType<typeof setInterval> | null = null;
let storedCount = 0;
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

const context = (s: Session | null) => (s ? { context: { spaceId: s.spaceId } } : undefined);

const onBeforeUnload = (event: BeforeUnloadEvent) => {
  event.preventDefault();
};

function watch(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}

async function upload(chunk: BufferedChunk, spaceId: string | null) {
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
      headers: withSpaceHeaders({ "content-type": "application/octet-stream" }, spaceId),
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

const STOPPED_KEY = "praci-capture-stopped";
/** Remembers that Stop was pressed, so a reload finishes the capture instead of resuming the microphone. */
function markStopped(captureId: string | null) {
  try {
    if (captureId) localStorage.setItem(STOPPED_KEY, captureId);
    else localStorage.removeItem(STOPPED_KEY);
  } catch {
    // Without storage a reload resumes the microphone; the person can press Stop again.
  }
}
function stoppedMarker(): string | null {
  try {
    return localStorage.getItem(STOPPED_KEY);
  } catch {
    return null;
  }
}

/** The server no longer takes this capture's audio: end it here too. */
async function endLocal(s: Session) {
  if (session !== s) return;
  session = null;
  for (const recorder of s.recorders.values()) recorder.abandon();
  release(s);
  markStopped(null);
  await store.clear();
  set({ phase: "idle" });
  enqueueNotificationToast({
    id: "capture-ended",
    title: t`This recording was closed and could not be saved.`,
  });
}

/** Sends every buffered chunk of the capture; true when none is left. One pass at a time. */
function flush(s: Session): Promise<boolean> {
  flushing ??= flushChunks(store, s.captureId, (chunk) => upload(chunk, s.spaceId))
    .then(async ({ failed, rejected }) => {
      if (rejected.some((r) => r.endsCapture)) await endLocal(s);
      else if (rejected.length > 0)
        enqueueNotificationToast({
          id: "capture-chunk-dropped",
          title: t`Part of the recording could not be saved.`,
        });
      if (view.phase === "recording" && view.offline !== failed) set({ ...view, offline: failed });
      if (failed && !s.closing && session === s) {
        s.retry = setTimeout(() => void flush(s), RETRY_MS);
      }
      return !failed;
    })
    .finally(() => {
      flushing = null;
    });
  return flushing;
}

async function buffer(s: Session, chunk: BufferedChunk) {
  await store.put(chunk);
  if (s.retry) {
    clearTimeout(s.retry);
    s.retry = null;
  }
  void flush(s);
}

function watchSilence(s: Session) {
  if (silenceTimer) clearInterval(silenceTimer);
  silenceTimer = setInterval(() => {
    if (view.phase !== "recording" || session !== s) return;
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
      captureId: s.captureId,
      startedAt: s.startedAt,
      seqBase,
      onChunk: (chunk) => buffer(s, chunk),
    });
    s.recorders.set(track, recorder);
    recorder.start();
  }
  watchSilence(s);
  watch(true);
}

function release(s: Session) {
  if (silenceTimer) clearInterval(silenceTimer);
  silenceTimer = null;
  if (s.retry) clearTimeout(s.retry);
  watch(false);
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

/** Starts a recording from the Record popover. Throws a readable message when it cannot. */
export async function startCapture(options: StartOptions): Promise<void> {
  if (session) throw new Error(t`A recording is already running.`);
  const streams = new Map<MeetingCaptureTrack, MediaStream>();
  const stopAll = () => {
    for (const stream of streams.values()) for (const track of stream.getTracks()) track.stop();
  };
  try {
    streams.set("microphone", await microphone());
    if (options.tabAudio) {
      const tab = await tabAudio();
      if (tab) streams.set("system", tab);
    }
    const title = options.title?.trim() || undefined;
    const { captureId } = await rpc.meetingCaptures.start({
      clientId: crypto.randomUUID(),
      engine: "server",
      tracks: [...streams.keys()],
      ...(title ? { title } : {}),
      ...(options.consentConfirmed ? { consentConfirmed: true } : {}),
    });
    const s: Session = {
      captureId,
      spaceId: selectedSpaceId(),
      startedAt: Date.now(),
      recorders: new Map(),
      expectsTabAudio: Boolean(options.tabAudio),
      retry: null,
      closing: false,
    };
    session = s;
    set({
      phase: "recording",
      captureId,
      title: title ?? null,
      startedAt: s.startedAt,
      noCallAudio: false,
      offline: false,
    });
    begin(s, streams, 0);
  } catch (error) {
    stopAll();
    throw error;
  }
}

/** Finds the stored meeting once the capture has left `active`. */
async function waitForStored(s: Session) {
  for (;;) {
    await sleep(POLL_MS);
    if (session !== s) return;
    let active: Awaited<ReturnType<typeof rpc.meetingCaptures.active>>;
    try {
      active = await rpc.meetingCaptures.active(undefined, context(s));
    } catch {
      continue;
    }
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
    session = null;
    markStopped(null);
    await store.clear();
    storedCount += 1;
    set({ phase: "stored", meetingId });
    return;
  }
}

/** Stops recording, uploads what is left, and waits for the meeting to be stored. */
export async function stopCapture(): Promise<void> {
  const s = session;
  if (!s || s.closing) return;
  s.closing = true;
  const title = view.phase === "recording" ? view.title : null;
  set({ phase: "transcribing", captureId: s.captureId, title, startedAt: s.startedAt });
  markStopped(s.captureId);
  await Promise.all([...s.recorders.values()].map((recorder) => recorder.stop()));
  release(s);
  await finishCapture(s);
}

/** Uploads what is left, tells the server the recording is over, and waits for the meeting. */
async function finishCapture(s: Session) {
  // Finishing before the last chunk arrived would leave it out of the meeting.
  while (!(await flush(s))) await sleep(RETRY_MS);
  for (;;) {
    if (session !== s) return; // the server closed it meanwhile
    try {
      await rpc.meetingCaptures.finish(
        { captureId: s.captureId, endedAt: new Date().toISOString() },
        context(s),
      );
      break;
    } catch {
      await sleep(RETRY_MS);
    }
  }
  await waitForStored(s);
}

/** Looks for a capture this browser lost track of (reload, crash) and picks it up. */
export async function recoverCapture(): Promise<void> {
  if (session) return;
  const active = await rpc.meetingCaptures.active().catch(() => null);
  if (!active) {
    await store.clear();
    return;
  }
  const s: Session = {
    captureId: active.captureId,
    spaceId: selectedSpaceId(),
    startedAt: Date.parse(active.startedAt),
    recorders: new Map(),
    expectsTabAudio: false,
    retry: null,
    closing: false,
  };
  session = s;
  if (active.status === "finishing") {
    s.closing = true;
    set({
      phase: "transcribing",
      captureId: s.captureId,
      title: active.title,
      startedAt: s.startedAt,
    });
    await waitForStored(s);
    return;
  }
  if (stoppedMarker() === s.captureId) {
    // Stop was pressed before the page closed: finish, do not record again.
    s.closing = true;
    set({
      phase: "transcribing",
      captureId: s.captureId,
      title: active.title,
      startedAt: s.startedAt,
    });
    await finishCapture(s);
    return;
  }
  set({
    phase: "recording",
    captureId: s.captureId,
    title: active.title,
    startedAt: s.startedAt,
    noCallAudio: false,
    offline: false,
  });
  void flush(s);
  try {
    // Unique among the earlier chunks, which cannot be more than one per second.
    begin(
      s,
      new Map([["microphone", await microphone()]]),
      Math.floor((Date.now() - s.startedAt) / 1000),
    );
  } catch {
    // The microphone is not available any more: store what arrived.
    await stopCapture();
  }
}

/** The pill is dismissed once the meeting is stored (and opened, when the user was on the list). */
export function dismissStored() {
  if (view.phase === "stored") set({ phase: "idle" });
}

/** Sign-out: stop recording and drop every buffered chunk. The server finalizes what it has. */
export async function clearCaptureOnSignOut(): Promise<void> {
  const s = session;
  session = null;
  if (s) {
    s.closing = true;
    for (const recorder of s.recorders.values()) recorder.abandon();
    release(s);
  }
  await store.clear();
  set({ phase: "idle" });
}
