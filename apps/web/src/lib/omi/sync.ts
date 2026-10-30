import type { RingStatus } from "./protocol";
import { INFO_COMMAND, parseNotification, RECORD_SIZE, Reassembler, readCommand } from "./protocol";

/** What the sync needs from the Bluetooth link; Web Bluetooth in the app, a fake in tests. */
export type RingTransport = {
  readStatus: () => Promise<RingStatus>;
  write: (bytes: Uint8Array) => Promise<void>;
  /** Calls `listener` for each notification until the returned function is called. */
  subscribe: (listener: (bytes: Uint8Array) => void) => () => void;
};

export type SyncResult = {
  /** "complete": the pendant said it was done. "paused": the link dropped, went quiet or was stopped. */
  outcome: "complete" | "paused";
  records: number;
};

type Options = {
  /** Called with each run of whole records. Awaited before the sync ends. */
  onRecords: (firstSeq: number, bytes: Uint8Array) => void | Promise<void>;
  onProgress?: (recordsDone: number, recordsTotal: number) => void;
  signal?: AbortSignal;
  /** Gives up on silence (default 15 s). */
  idleMs?: number;
};

/**
 * Reads everything unread from the pendant: status, ring info, then one read command. The pendant
 * frees records as it delivers them, so every record handed to `onRecords` must be stored.
 */
export async function runSync(transport: RingTransport, options: Options): Promise<SyncResult> {
  const { onRecords, onProgress, signal, idleMs = 15000 } = options;
  const status = await transport.readStatus();
  if (status.unreadPackets === 0) return { outcome: "complete", records: 0 };

  return new Promise<SyncResult>((resolve, reject) => {
    const reassembler = new Reassembler();
    let nextSeq: number | null = null;
    let records = 0;
    let chain: Promise<void> = Promise.resolve();
    let settled = false;
    let idle: ReturnType<typeof setTimeout> | undefined;
    let infoSeen = false;

    const finish = (outcome: SyncResult["outcome"], error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(idle);
      unsubscribe();
      signal?.removeEventListener("abort", onAbort);
      void chain.then(() => (error ? reject(error) : resolve({ outcome, records })), reject);
    };
    const onAbort = () => finish("paused");
    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(() => finish("paused"), idleMs);
    };

    const unsubscribe = transport.subscribe((bytes) => {
      if (settled) return;
      bump();
      const note = parseNotification(bytes);
      if (note.kind === "info" && !infoSeen) {
        infoSeen = true;
        nextSeq = note.readSeq;
        transport
          .write(readCommand(note.readSeq, Math.max(note.writeSeq - note.readSeq, 1)))
          .catch((error: unknown) => finish("paused", error));
      } else if (note.kind === "begin") {
        nextSeq = note.startSeq;
      } else if (note.kind === "data") {
        const whole = reassembler.push(note.bytes);
        if (whole.length === 0 || nextSeq === null) return;
        const firstSeq = nextSeq;
        const count = whole.length / RECORD_SIZE;
        nextSeq += count;
        records += count;
        const copy = whole.slice();
        chain = chain.then(() => onRecords(firstSeq, copy));
        chain.catch(() => finish("paused"));
        onProgress?.(records, status.unreadPackets);
      } else if (note.kind === "done") {
        finish(note.status === 0 ? "complete" : "paused");
      } else if (note.kind === "ack" && note.status !== 0) {
        finish("paused");
      }
    });
    signal?.addEventListener("abort", onAbort);
    bump();
    transport.write(INFO_COMMAND).catch((error: unknown) => finish("paused", error));
  });
}
