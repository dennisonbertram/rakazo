import type { OmiStatus } from "@rakazo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { desktopBridge } from "../desktop";
import { rpc, withSpaceHeaders } from "../rpc";
import type { BluetoothDevice } from "./bluetooth";
import {
  bluetoothSupported,
  browserDeviceId,
  openPendant,
  pickPendant,
  savedPendant,
} from "./bluetooth";
import type { RecordStore } from "./buffer";
import { createRecordStore, flushRecords } from "./buffer";
import { framesInRecord, isRingBufferFirmware, progressMinutes, RECORD_SIZE } from "./protocol";
import { runSync } from "./sync";

export type OmiSyncState =
  | { kind: "unsupported" }
  | { kind: "idle" }
  | { kind: "reconnect" }
  | { kind: "connecting" }
  | { kind: "downloading"; done: number | null; total: number | null }
  | { kind: "paused"; done: number; total: number | null }
  | { kind: "synced"; at: number }
  | { kind: "old_firmware" }
  | { kind: "failed" };

function recordStore(ref: { current: RecordStore | null }): RecordStore {
  if (!ref.current) ref.current = createRecordStore();
  return ref.current;
}

const AUTO_SYNC_MS = 15 * 60 * 1000;

async function post(
  path: string,
  connectionId: string,
  params: Record<string, string>,
  body?: Uint8Array,
) {
  const query = new URLSearchParams({ connectionId, ...params });
  const response = await fetch(`${path}?${query}`, {
    method: "POST",
    credentials: "include",
    headers: withSpaceHeaders({ "content-type": "application/octet-stream" }),
    ...(body ? { body: body as BodyInit } : {}),
  });
  if (!response.ok) throw new Error(`Upload failed (${response.status})`);
}

/** Pulls the pendant's recordings into the browser's buffer and on to the server. */
export function useOmiSync(status: OmiStatus | undefined, reload: () => Promise<void>) {
  const [state, setState] = useState<OmiSyncState>(
    bluetoothSupported() ? { kind: "idle" } : { kind: "unsupported" },
  );
  const store = useRef<RecordStore | null>(null);
  const running = useRef(false);
  const connectionId = status?.connectionId;

  const upload = useCallback(
    (id: string) =>
      flushRecords(recordStore(store), (batch) =>
        post(
          "/api/omi/records",
          id,
          {
            firstSeq: String(batch.firstSeq),
            codec: String(batch.codec),
            rtcValid: String(batch.rtcValid),
          },
          batch.bytes,
        ),
      ),
    [],
  );

  const sync = useCallback(
    async (chosen?: BluetoothDevice) => {
      if (running.current || !bluetoothSupported()) return;
      running.current = true;
      setState({ kind: "connecting" });
      let device: BluetoothDevice | null = null;
      let lastProgress = { done: 0, total: null as number | null };
      try {
        device = chosen ?? (await savedPendant()) ?? (await pickPendant());
        const link = await openPendant(device);
        if (!isRingBufferFirmware(link.firmware)) {
          setState({ kind: "old_firmware" });
          return;
        }
        if (link.frameMs === null) {
          setState({ kind: "failed" });
          return;
        }
        const id =
          connectionId ??
          (
            await rpc.omi.connect({
              model: link.model || "Omi",
              firmware: link.firmware,
              hardware: link.hardware || "Unknown",
              deviceId: browserDeviceId(),
            })
          ).connectionId;
        if (!connectionId) void reload();
        const records = recordStore(store);
        // Records left by a closed tab go first, in seq order.
        await upload(id);
        const { rtcValid } = await link.transport.readStatus();
        const abort = new AbortController();
        device.addEventListener("gattserverdisconnected", () => abort.abort(), {
          once: true,
        });
        setState({ kind: "downloading", done: null, total: null });
        let frames = 0;
        const result = await runSync(link.transport, {
          signal: abort.signal,
          onRecords: async (firstSeq, bytes) => {
            const batch = [];
            for (let at = 0; at < bytes.length; at += RECORD_SIZE) {
              const record = bytes.slice(at, at + RECORD_SIZE);
              frames += framesInRecord(record);
              batch.push({
                seq: firstSeq + at / RECORD_SIZE,
                bytes: record,
                codec: link.codec,
                rtcValid,
              });
            }
            await records.put(batch);
          },
          onProgress: (done, total) => {
            lastProgress = progressMinutes(done, total, frames, link.frameMs ?? 20);
            setState({ kind: "downloading", ...lastProgress });
          },
        });
        await upload(id);
        if (result.outcome === "complete") {
          await post("/api/omi/sync-complete", id, {});
          setState({ kind: "synced", at: Date.now() });
        } else {
          setState({ kind: "paused", ...lastProgress });
        }
        void reload();
      } catch (error) {
        // Closing the chooser is not a failure.
        if (error instanceof DOMException && error.name === "NotFoundError") {
          setState(connectionId ? { kind: "reconnect" } : { kind: "idle" });
        } else {
          setState(
            lastProgress.done > 0 ? { kind: "paused", ...lastProgress } : { kind: "failed" },
          );
        }
      } finally {
        device?.gatt?.disconnect();
        running.current = false;
      }
    },
    [connectionId, reload, upload],
  );

  // On open: send what an earlier tab left behind, then reuse the allowed pendant or ask to reconnect.
  const opened = useRef<string | null>(null);
  useEffect(() => {
    if (!connectionId || opened.current === connectionId || !bluetoothSupported()) return;
    opened.current = connectionId;
    void (async () => {
      await upload(connectionId).catch(() => undefined);
      const device = await savedPendant();
      if (device) void sync(device);
      else setState({ kind: "reconnect" });
    })();
  }, [connectionId, sync, upload]);

  // The desktop app stays open: sync again every 15 minutes after a first success.
  const synced = state.kind === "synced";
  useEffect(() => {
    if (!synced || !desktopBridge()) return;
    const timer = setInterval(
      () => void savedPendant().then((device) => device && sync(device)),
      AUTO_SYNC_MS,
    );
    return () => clearInterval(timer);
  }, [synced, sync]);

  return { state, sync: () => sync() };
}
