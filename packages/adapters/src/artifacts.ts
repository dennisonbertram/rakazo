import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";
import type {
  AdapterContext,
  ArtifactPut,
  ArtifactStore,
  NotificationMessage,
  NotificationProvider,
} from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";

const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export class LocalArtifactStore implements ArtifactStore {
  constructor(private readonly root: string) {}

  describe() {
    return {
      id: "local-artifacts",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { stream: true },
    };
  }

  async put(artifact: ArtifactPut, context: AdapterContext) {
    const id = randomUUID();
    const dir = path.join(this.root, "artifacts", context.spaceId);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, id);
    const handle = await open(
      file,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | O_NOFOLLOW,
      0o600,
    );
    try {
      await handle.writeFile(artifact.bytes);
    } finally {
      await handle.close();
    }
    return { id, hash: String(artifact.bytes.byteLength) };
  }

  async get(id: string, context: AdapterContext) {
    const handle = await open(
      path.join(this.root, "artifacts", context.spaceId, id),
      constants.O_RDONLY | O_NOFOLLOW,
    );
    try {
      return new Uint8Array(await handle.readFile());
    } finally {
      await handle.close();
    }
  }

  async remove(id: string, context: AdapterContext) {
    await rm(path.join(this.root, "artifacts", context.spaceId, id), { force: true });
  }
}

/**
 * Artifact bytes in Postgres. The api stores uploads and the worker reads
 * them for the model; when those run as separate services with separate
 * disks (Railway, most container hosts) the local store silently loses every
 * image, so this keeps both sides on the database they already share.
 */
export class PrismaArtifactStore implements ArtifactStore {
  /** `fallback` serves artifacts stored on disk before the switch to Postgres. */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly fallback?: ArtifactStore,
  ) {}

  describe() {
    return {
      id: "postgres-artifacts",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { stream: false },
    };
  }

  async put(artifact: ArtifactPut, context: AdapterContext) {
    const id = randomUUID();
    await this.prisma.artifactBlob.create({
      data: { id, spaceId: context.spaceId, bytes: Buffer.from(artifact.bytes) },
    });
    return { id, hash: createHash("sha256").update(artifact.bytes).digest("hex") };
  }

  async get(id: string, context: AdapterContext) {
    const row = await this.prisma.artifactBlob.findUnique({
      where: { id },
      select: { spaceId: true, bytes: true },
    });
    if (row) {
      if (row.spaceId !== context.spaceId) throw new Error(`Artifact ${id} not found`);
      return new Uint8Array(row.bytes);
    }
    if (this.fallback) return this.fallback.get(id, context);
    throw new Error(`Artifact ${id} not found`);
  }

  async remove(id: string, context: AdapterContext) {
    await this.prisma.artifactBlob.deleteMany({ where: { id, spaceId: context.spaceId } });
    await this.fallback?.remove(id, context);
  }
}

/**
 * ARTIFACT_STORE selects where artifact bytes live: `local` (default, the
 * data directory) or `postgres` (shared across api and worker hosts; disk
 * artifacts from before the switch stay readable). Anything else is a
 * misconfiguration and fails at startup rather than silently going local.
 */
export function createArtifactStore(
  kind: string | undefined,
  deps: { dataDir: string; prisma: PrismaClient },
): ArtifactStore {
  const local = new LocalArtifactStore(deps.dataDir);
  switch (kind?.trim().toLowerCase() || "local") {
    case "local":
      return local;
    case "postgres":
      return new PrismaArtifactStore(deps.prisma, local);
    default:
      throw new Error(`Unsupported ARTIFACT_STORE: ${kind}`);
  }
}

export class CapturingNotificationProvider implements NotificationProvider {
  readonly sent: NotificationMessage[] = [];

  describe() {
    return {
      id: "capturing",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { push: false, email: false },
    };
  }

  async send(message: NotificationMessage, _context: AdapterContext): Promise<void> {
    this.sent.push(message);
  }
}
