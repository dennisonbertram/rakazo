import { rm } from "node:fs/promises";
import path from "node:path";
import type { Transcriber } from "@kitlangton/hex";
import { create, isHexError } from "@kitlangton/hex";
import type { DesktopSpeechResult, DesktopSpeechStatus } from "@rakazo/contracts";
import { readPrivateFile, writePrivateFile } from "./setup-store.js";

/**
 * On-device speech to text through the installed Hex helper. The renderer sends PCM WAV bytes and
 * gets text back; the helper's URL, token and error messages never leave this module. One helper is
 * kept per app run and all calls are serialized, because Hex answers simultaneous requests with
 * "busy".
 */

const MODEL = "parakeet_unified_en";
const LANGUAGE = "en";
const FILE_NAME = "speech.json";
const MAX_WAV_BYTES = 16 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;

const ascii = (bytes: Uint8Array, offset: number, text: string) =>
  [...text].every((char, i) => bytes[offset + i] === char.charCodeAt(0));

/** A canonical PCM WAV: RIFF/WAVE header, a "fmt " chunk first, audio format 1. */
function isPcmWav(wav: unknown): wav is Uint8Array {
  return (
    wav instanceof Uint8Array &&
    wav.length >= 44 &&
    wav.length <= MAX_WAV_BYTES &&
    ascii(wav, 0, "RIFF") &&
    ascii(wav, 8, "WAVE") &&
    ascii(wav, 12, "fmt ") &&
    wav[20] === 1 &&
    wav[21] === 0
  );
}

const refused: DesktopSpeechResult = { ok: false, retry: false };

export function createDeviceSpeech(options: {
  userDataDir: string;
  command: () => string[] | undefined;
  /** macOS on Apple silicon. */
  supported: boolean;
  onStatus: (status: DesktopSpeechStatus) => void;
  timeoutMs?: number;
}) {
  const file = path.join(options.userDataDir, FILE_NAME);
  const quit = new AbortController();
  let transcriber: Promise<Transcriber> | null = null;
  let preparing = false;
  let progress: number | null = null;
  let failed = false;
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(work: () => Promise<T>): Promise<T> => {
    const run = queue.then(work, work);
    queue = run.catch(() => undefined);
    return run;
  };

  const picked = async () => {
    const raw = await readPrivateFile(file, 1024);
    try {
      return raw !== null && (JSON.parse(raw) as { model?: unknown }).model === MODEL;
    } catch {
      return false;
    }
  };

  async function status(): Promise<DesktopSpeechStatus> {
    if (!options.supported || options.command() === undefined) return { state: "unavailable" };
    if (preparing) return { state: "preparing", progress };
    if (failed) return { state: "error" };
    return (await picked()) ? { state: "ready" } : { state: "not-prepared" };
  }

  const emit = async () => options.onStatus(await status());

  const dropTranscriber = async () => {
    const current = transcriber;
    transcriber = null;
    await current?.then((t) => t.close()).catch(() => undefined);
  };

  const onProgress = (event: { type: string; downloadedBytes?: number; totalBytes?: number }) => {
    const next =
      event.type === "downloading" && event.totalBytes
        ? Math.min(1, Math.max(0, (event.downloadedBytes ?? 0) / event.totalBytes))
        : null;
    if (next !== progress) {
      progress = next;
      void emit();
    }
  };

  const prepare = () =>
    enqueue(async () => {
      const command = options.command();
      if (!options.supported || command === undefined) return status();
      await dropTranscriber();
      preparing = true;
      progress = null;
      failed = false;
      await emit();
      try {
        transcriber = create({
          command: command as [string, ...string[]],
          model: MODEL,
          language: LANGUAGE,
          signal: quit.signal,
          onProgress,
        });
        await transcriber;
        await writePrivateFile(file, JSON.stringify({ model: MODEL }));
      } catch {
        transcriber = null;
        failed = true;
      }
      preparing = false;
      await emit();
      return status();
    });

  const forget = () =>
    enqueue(async () => {
      await dropTranscriber();
      await rm(file, { force: true });
      failed = false;
      await emit();
      return status();
    });

  /** After a restart the helper is created on first use. Transcription never downloads a model. */
  async function lazyCreate(command: string[]): Promise<Transcriber | null> {
    const download = new AbortController();
    let downloading = false;
    transcriber = create({
      command: command as [string, ...string[]],
      model: MODEL,
      language: LANGUAGE,
      signal: AbortSignal.any([quit.signal, download.signal]),
      onProgress: (event) => {
        if (event.type !== "downloading") return;
        downloading = true;
        download.abort();
      },
    });
    try {
      return await transcriber;
    } catch {
      transcriber = null;
      if (downloading) await rm(file, { force: true });
      else failed = true;
      await emit();
      return null;
    }
  }

  const transcribe = (wav: unknown): Promise<DesktopSpeechResult> => {
    if (!isPcmWav(wav)) return Promise.resolve(refused);
    return enqueue(async () => {
      const command = options.command();
      if (!options.supported || command === undefined || (await status()).state !== "ready")
        return refused;
      const active = transcriber ? await transcriber.catch(() => null) : await lazyCreate(command);
      if (active === null) {
        transcriber = null;
        return refused;
      }
      try {
        const result = await active.transcribe(wav, {
          signal: AbortSignal.any([
            quit.signal,
            AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
          ]),
        });
        return { ok: true, text: result.transcript };
      } catch (error) {
        const rejected = isHexError(error) && error.status !== undefined && error.status < 500;
        // A 4xx means the request was bad and the helper is fine; anything else may have killed it.
        if (!rejected) await dropTranscriber();
        return { ok: false, retry: !rejected };
      }
    });
  };

  const close = async () => {
    quit.abort();
    await queue;
    await dropTranscriber();
  };

  return { status, prepare, forget, transcribe, close };
}
