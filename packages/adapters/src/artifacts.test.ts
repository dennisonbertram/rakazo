import { mkdtemp, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createArtifactStore, LocalArtifactStore, PrismaArtifactStore } from "./artifacts.js";

const dirs: string[] = [];
const context = { spaceId: "space-1" } as never;

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("LocalArtifactStore", () => {
  it("creates artifact files with owner-only permissions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rakazo-artifacts-"));
    dirs.push(root);
    const store = new LocalArtifactStore(root);

    const stored = await store.put(
      { name: "private.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("private") },
      context,
    );

    const info = await stat(path.join(root, "artifacts", "space-1", stored.id));
    expect(info.mode & 0o777).toBe(0o600);
  });

  it("does not follow a replacement symlink when reading an artifact", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "rakazo-artifacts-"));
    dirs.push(root);
    const store = new LocalArtifactStore(root);
    const stored = await store.put(
      { name: "private.txt", mimeType: "text/plain", bytes: new TextEncoder().encode("private") },
      context,
    );
    const file = path.join(root, "artifacts", "space-1", stored.id);
    const target = path.join(root, "outside.txt");
    await writeFile(target, "outside");
    await rm(file);
    await symlink(target, file);

    await expect(store.get(stored.id, context)).rejects.toThrow();
  });
});

describe("PrismaArtifactStore", () => {
  const context = {
    operationId: "op",
    traceId: "op",
    spaceId: "ws-1",
    userId: "user-1",
    signal: new AbortController().signal,
  };

  function createStore() {
    const rows = new Map<string, { spaceId: string; bytes: Buffer }>();
    const prisma = {
      artifactBlob: {
        create: vi.fn(
          async ({ data }: { data: { id: string; spaceId: string; bytes: Buffer } }) => {
            rows.set(data.id, { spaceId: data.spaceId, bytes: data.bytes });
            return data;
          },
        ),
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
        ),
        deleteMany: vi.fn(async ({ where }: { where: { id: string; spaceId: string } }) => {
          const row = rows.get(where.id);
          if (row?.spaceId === where.spaceId) rows.delete(where.id);
          return { count: row ? 1 : 0 };
        }),
      },
    };
    return { store: new PrismaArtifactStore(prisma as never), rows };
  }

  it("round-trips bytes and scopes reads to the owning space", async () => {
    const { store } = createStore();
    const { id, hash } = await store.put(
      { name: "a.png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
      context,
    );
    expect(hash).toHaveLength(64);
    expect(Array.from(await store.get(id, context))).toEqual([1, 2, 3]);
    await expect(store.get(id, { ...context, spaceId: "ws-2" })).rejects.toThrow(/not found/);
    await store.remove(id, { ...context, spaceId: "ws-2" });
    expect(Array.from(await store.get(id, context))).toEqual([1, 2, 3]);
    await store.remove(id, context);
    await expect(store.get(id, context)).rejects.toThrow(/not found/);
  });

  it("selects the store by ARTIFACT_STORE", () => {
    const deps = { dataDir: "/tmp/x", prisma: {} as never };
    expect(createArtifactStore("postgres", deps).describe().id).toBe("postgres-artifacts");
    expect(createArtifactStore(undefined, deps).describe().id).toBe("local-artifacts");
  });
});
