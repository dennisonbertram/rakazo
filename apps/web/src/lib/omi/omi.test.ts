import { describe, expect, it } from "vitest";
import type { BufferedRecord, RecordStore } from "./buffer";
import { createRecordStore, flushRecords, memoryStore } from "./buffer";
import {
  framesInRecord,
  isRingBufferFirmware,
  parseNotification,
  parseStatus,
  progressMinutes,
  RECORD_SIZE,
  Reassembler,
  readCommand,
} from "./protocol";
import type { RingTransport } from "./sync";
import { runSync } from "./sync";

/** A record with `frames` Opus-like frames of 20 bytes each, then zero padding. */
function record(seed: number, frames = 3): Uint8Array {
  const out = new Uint8Array(RECORD_SIZE);
  out[3] = seed;
  let offset = 4;
  for (let i = 0; i < frames; i++) {
    out[offset] = 20;
    out.fill(seed, offset + 1, offset + 21);
    offset += 21;
  }
  return out;
}
const join = (parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const u64 = (n: number) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, BigInt(n));
  return b;
};
const info = (read: number, write: number) =>
  join([Uint8Array.of(0x02), u64(read), u64(write), new Uint8Array(14)]);
const begin = (start: number, count: number) => {
  const c = new Uint8Array(4);
  new DataView(c.buffer).setUint32(0, count);
  return join([Uint8Array.of(0x05), u64(start), c]);
};
const done = (next: number) => join([Uint8Array.of(0x04, 0), u64(next)]);
const data = (bytes: Uint8Array) => join([Uint8Array.of(0x03), bytes]);

describe("protocol", () => {
  it("compares firmware like the Omi app", () => {
    expect(isRingBufferFirmware("3.0.20")).toBe(true);
    expect(isRingBufferFirmware("3.1.0")).toBe(true);
    expect(isRingBufferFirmware("4.0.0")).toBe(true);
    expect(isRingBufferFirmware("3.0.19")).toBe(false);
    expect(isRingBufferFirmware("2.9.99")).toBe(false);
    expect(isRingBufferFirmware("Unknown")).toBe(false);
    expect(isRingBufferFirmware(null)).toBe(false);
  });

  it("parses the status read as little-endian", () => {
    const view = new DataView(new ArrayBuffer(16));
    view.setUint32(0, 1000, true);
    view.setUint32(4, 38, true);
    view.setUint32(8, 5, true);
    view.setUint32(12, 1, true);
    expect(parseStatus(view)).toEqual({
      usedBytes: 1000,
      unreadPackets: 38,
      freeBytes: 5,
      rtcValid: true,
    });
    expect(parseStatus(new DataView(new ArrayBuffer(8)))).toBeNull();
  });

  it("parses notifications and encodes the read command", () => {
    expect(parseNotification(info(7, 45))).toEqual({
      kind: "info",
      readSeq: 7,
      writeSeq: 45,
    });
    expect(parseNotification(begin(7, 38))).toEqual({
      kind: "begin",
      startSeq: 7,
      count: 38,
    });
    expect(parseNotification(done(45))).toEqual({
      kind: "done",
      status: 0,
      nextSeq: 45,
    });
    expect(parseNotification(Uint8Array.of(1, 10))).toEqual({
      kind: "ack",
      status: 10,
    });
    expect(parseNotification(Uint8Array.of(0x04, 0))).toEqual({
      kind: "other",
    });
    expect([...readCommand(7, 38)]).toEqual([0x11, 0, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 38]);
  });

  it("reassembles unaligned chunks into whole records", () => {
    const stream = join([record(1), record(2), record(3)]);
    const reassembler = new Reassembler();
    const out: Uint8Array[] = [];
    for (let at = 0; at < stream.length; at += 200) {
      out.push(reassembler.push(stream.subarray(at, at + 200)));
    }
    expect(join(out)).toEqual(stream);
    expect(out.every((chunk) => chunk.length % RECORD_SIZE === 0)).toBe(true);
  });

  it("counts frames and estimates minutes", () => {
    expect(framesInRecord(record(1, 3))).toBe(3);
    expect(framesInRecord(new Uint8Array(RECORD_SIZE))).toBe(0);
    // 3000 frames of 20 ms = 1 minute for 10 of 40 records.
    expect(progressMinutes(10, 40, 3000, 20)).toEqual({ done: 1, total: 4 });
    expect(progressMinutes(0, 40, 0, 20)).toEqual({ done: 0, total: null });
  });
});

function fakePendant(records: Uint8Array[], firstSeq: number, chunk: number) {
  const listeners = new Set<(bytes: Uint8Array) => void>();
  const emit = (bytes: Uint8Array) => {
    for (const listener of listeners) listener(bytes);
  };
  const stream = join(records);
  const writes: Uint8Array[] = [];
  const transport: RingTransport = {
    readStatus: async () => ({
      usedBytes: stream.length,
      unreadPackets: records.length,
      freeBytes: 0,
      rtcValid: true,
    }),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    write: async (bytes) => {
      writes.push(bytes);
      if (bytes[0] === 0x10) queueMicrotask(() => emit(info(firstSeq, firstSeq + records.length)));
      if (bytes[0] === 0x11) {
        queueMicrotask(() => {
          emit(begin(firstSeq, records.length));
          for (let at = 0; at < stream.length; at += chunk) {
            emit(data(stream.subarray(at, at + chunk)));
          }
          emit(done(firstSeq + records.length));
        });
      }
    },
  };
  return { transport, writes };
}

describe("runSync", () => {
  it("reads every record with its sequence number", async () => {
    const records = [record(1), record(2), record(3), record(4)];
    const { transport, writes } = fakePendant(records, 100, 197);
    const got: { seq: number; bytes: Uint8Array }[] = [];
    const result = await runSync(transport, {
      onRecords: (seq, bytes) => {
        for (let i = 0; i < bytes.length / RECORD_SIZE; i++) {
          got.push({
            seq: seq + i,
            bytes: bytes.slice(i * RECORD_SIZE, (i + 1) * RECORD_SIZE),
          });
        }
      },
    });
    expect(result).toEqual({ outcome: "complete", records: 4 });
    expect(got.map((entry) => entry.seq)).toEqual([100, 101, 102, 103]);
    expect(join(got.map((entry) => entry.bytes))).toEqual(join(records));
    expect([...(writes[1] ?? [])].slice(8)).toEqual([100, 0, 0, 0, 4]);
  });

  it("does nothing when nothing is unread", async () => {
    const { transport, writes } = fakePendant([], 0, 100);
    expect(await runSync(transport, { onRecords: () => undefined })).toEqual({
      outcome: "complete",
      records: 0,
    });
    expect(writes).toHaveLength(0);
  });

  it("pauses and keeps what arrived when the pendant goes quiet", async () => {
    const seen: number[] = [];
    const listeners: ((b: Uint8Array) => void)[] = [];
    const custom: RingTransport = {
      readStatus: async () => ({
        usedBytes: 0,
        unreadPackets: 2,
        freeBytes: 0,
        rtcValid: true,
      }),
      subscribe: (l) => {
        listeners.push(l);
        return () => undefined;
      },
      write: async (bytes) => {
        if (bytes[0] === 0x10) for (const l of listeners) l(info(5, 7));
        if (bytes[0] === 0x11) for (const l of listeners) l(data(record(1)));
      },
    };
    const result = await runSync(custom, {
      idleMs: 20,
      onRecords: (seq) => void seen.push(seq),
    });
    expect(result).toEqual({ outcome: "paused", records: 1 });
    expect(seen).toEqual([5]);
  });
});

const rec = (seq: number, extra: Partial<BufferedRecord> = {}): BufferedRecord => ({
  seq,
  bytes: record(seq % 250),
  codec: 21,
  rtcValid: true,
  ...extra,
});

describe("record buffer", () => {
  it("uploads in seq order, in batches, and deletes only after success", async () => {
    const store = memoryStore();
    await store.put([rec(3), rec(1), rec(2), rec(7), rec(8, { codec: 20 })]);
    const batches: { firstSeq: number; size: number }[] = [];
    let failOn = 2;
    const upload = async (batch: { firstSeq: number; bytes: Uint8Array }) => {
      if (batches.length + 1 === failOn) throw new Error("offline");
      batches.push({
        firstSeq: batch.firstSeq,
        size: batch.bytes.length / RECORD_SIZE,
      });
    };
    await expect(flushRecords(store, upload)).rejects.toThrow("offline");
    // seq 1-3 went; 7 (gap) failed and stays with 8.
    expect(batches).toEqual([{ firstSeq: 1, size: 3 }]);
    expect((await store.all()).map((r) => r.seq)).toEqual([7, 8]);
    failOn = 99;
    expect(await flushRecords(store, upload)).toBe(2);
    expect(batches.map((b) => b.firstSeq)).toEqual([1, 7, 8]);
    expect(await store.all()).toEqual([]);
  });

  it("splits batches at the byte limit", async () => {
    const store = memoryStore();
    await store.put([rec(1), rec(2), rec(3)]);
    const sizes: number[] = [];
    await flushRecords(
      store,
      async (b) => void sizes.push(b.bytes.length / RECORD_SIZE),
      undefined,
      RECORD_SIZE * 2,
    );
    expect(sizes).toEqual([2, 1]);
  });

  it("keeps records in memory when IndexedDB fails", async () => {
    const broken: RecordStore = {
      put: async () => {
        throw new Error("blocked");
      },
      all: async () => {
        throw new Error("blocked");
      },
      remove: async () => {
        throw new Error("blocked");
      },
    };
    const store = createRecordStore(broken);
    await store.put([rec(2), rec(1)]);
    expect((await store.all()).map((r) => r.seq)).toEqual([1, 2]);
    const uploaded: number[] = [];
    await flushRecords(store, async (b) => void uploaded.push(b.firstSeq));
    expect(uploaded).toEqual([1]);
    expect(await store.all()).toEqual([]);
  });
});
