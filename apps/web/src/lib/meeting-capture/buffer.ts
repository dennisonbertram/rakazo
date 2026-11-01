import type { MeetingCaptureTrack } from "@rakazo/contracts";

/** One cut piece of audio, kept until the server confirms it. */
export type BufferedChunk = {
  /** `${captureId}:${track}:${seq}` */
  key: string;
  captureId: string;
  track: MeetingCaptureTrack;
  seq: number;
  startMs: number;
  endMs: number;
  blob: Blob;
};

export const chunkKey = (captureId: string, track: MeetingCaptureTrack, seq: number) =>
  `${captureId}:${track}:${seq}`;

export type ChunkStore = {
  put: (chunk: BufferedChunk) => Promise<void>;
  all: () => Promise<BufferedChunk[]>;
  remove: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

export function memoryChunkStore(): ChunkStore {
  const map = new Map<string, BufferedChunk>();
  return {
    put: async (chunk) => void map.set(chunk.key, chunk),
    all: async () => [...map.values()],
    remove: async (key) => void map.delete(key),
    clear: async () => map.clear(),
  };
}

const DB_NAME = "praci-meeting-capture";
const STORE = "chunks";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Chunks in IndexedDB, so a closed tab does not lose audio that was not uploaded yet. */
export function indexedDbChunkStore(): ChunkStore {
  const open = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const write = async (change: (store: IDBObjectStore) => void) => {
    const tx = (await open).transaction(STORE, "readwrite");
    change(tx.objectStore(STORE));
    await done(tx);
  };
  return {
    put: (chunk) => write((store) => void store.put(chunk)),
    all: async () =>
      (await request(
        (await open).transaction(STORE).objectStore(STORE).getAll(),
      )) as BufferedChunk[],
    remove: (key) => write((store) => void store.delete(key)),
    clear: () => write((store) => void store.clear()),
  };
}

/** IndexedDB when it works, memory for any call that fails (private windows, blocked storage). */
export function createChunkStore(
  idb: ChunkStore | null = typeof indexedDB === "undefined" ? null : indexedDbChunkStore(),
): ChunkStore {
  const memory = memoryChunkStore();
  return {
    put: async (chunk) => {
      try {
        if (!idb) throw new Error("no IndexedDB");
        await idb.put(chunk);
      } catch {
        await memory.put(chunk);
      }
    },
    all: async () => {
      const stored = (await idb?.all().catch(() => [] as BufferedChunk[])) ?? [];
      const merged = new Map<string, BufferedChunk>();
      for (const chunk of [...stored, ...(await memory.all())]) merged.set(chunk.key, chunk);
      return [...merged.values()];
    },
    remove: async (key) => {
      await memory.remove(key);
      await idb?.remove(key).catch(() => undefined);
    },
    clear: async () => {
      await memory.clear();
      await idb?.clear().catch(() => undefined);
    },
  };
}

/**
 * Uploads stored chunks of one capture in time order. A chunk is deleted only after its upload
 * resolved (the caller resolves on a 2xx); the first failure stops the pass and leaves that chunk
 * and every later one in the store. Returns how many were uploaded and whether the pass failed.
 */
export async function flushChunks(
  store: ChunkStore,
  captureId: string,
  upload: (chunk: BufferedChunk) => Promise<void>,
): Promise<{ uploaded: number; failed: boolean }> {
  const chunks = (await store.all())
    .filter((chunk) => chunk.captureId === captureId)
    .sort((a, b) => a.startMs - b.startMs || a.seq - b.seq);
  let uploaded = 0;
  for (const chunk of chunks) {
    try {
      await upload(chunk);
    } catch {
      return { uploaded, failed: true };
    }
    await store.remove(chunk.key);
    uploaded += 1;
  }
  return { uploaded, failed: false };
}
