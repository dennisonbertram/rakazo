import { expect, it, vi } from "vitest";
import type { BufferedChunk } from "./buffer";
import { chunkKey, flushChunks, memoryChunkStore } from "./buffer";

const chunk = (seq: number, captureId = "c1"): BufferedChunk => ({
  key: chunkKey(captureId, "microphone", seq),
  captureId,
  track: "microphone",
  seq,
  startMs: seq * 1000,
  endMs: seq * 1000 + 900,
  blob: new Blob(["x"]),
});

it("deletes a chunk only after its upload succeeded", async () => {
  const store = memoryChunkStore();
  await store.put(chunk(1));
  const upload = vi.fn(async () => {
    // Still stored while the request is in flight.
    expect(await store.all()).toHaveLength(1);
  });
  expect(await flushChunks(store, "c1", upload)).toEqual({ uploaded: 1, failed: false });
  expect(await store.all()).toHaveLength(0);
});

it("keeps the failed chunk and every later one, then sends them on retry", async () => {
  const store = memoryChunkStore();
  for (const seq of [1, 2, 3]) await store.put(chunk(seq));
  const upload = vi.fn(async (c: BufferedChunk) => {
    if (c.seq === 2) throw new Error("offline");
  });
  expect(await flushChunks(store, "c1", upload)).toEqual({ uploaded: 1, failed: true });
  expect((await store.all()).map((c) => c.seq).sort()).toEqual([2, 3]);
  upload.mockResolvedValue(undefined);
  expect(await flushChunks(store, "c1", upload)).toEqual({ uploaded: 2, failed: false });
  expect(await store.all()).toHaveLength(0);
});

it("leaves another capture's chunks alone and clears everything on discard", async () => {
  const store = memoryChunkStore();
  await store.put(chunk(1));
  await store.put(chunk(1, "c2"));
  const upload = vi.fn(async () => undefined);
  await flushChunks(store, "c1", upload);
  expect((await store.all()).map((c) => c.captureId)).toEqual(["c2"]);
  await store.clear();
  expect(await store.all()).toEqual([]);
});
