import { randomUUID } from "node:crypto";
import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { SharedArtifact } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { openArtifactShare } from "@rakazo/db";
import type { Hono } from "hono";
import * as z from "zod";

const PATH = "/api/share";

/** What the public lookup needs: the artifact the token names, or null. */
export interface ShareStore {
  open(token: string): Promise<{
    name: string;
    mimeType: string;
    spaceId: string;
    userId: string;
    storageKey: string;
  } | null>;
}

export const prismaShareStore = (prisma: PrismaClient): ShareStore => ({
  open: (token) => openArtifactShare(prisma, token),
});

// ponytail: per-process fixed window. Tokens carry 256 bits, so this only blunts floods; move it to
// a shared store if the public endpoint needs a hard cap across API processes.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

export function createRateLimiter(now: () => number = Date.now) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string): boolean => {
    const t = now();
    const hit = hits.get(key);
    if (!hit || t - hit.start >= WINDOW_MS) {
      if (hits.size > 10_000) hits.clear();
      hits.set(key, { start: t, count: 1 });
      return true;
    }
    hit.count += 1;
    return hit.count <= MAX_PER_WINDOW;
  };
}

const OpenBody = z.object({ token: z.string().min(1).max(512) });

/**
 * The public share endpoint. It never reads the session cookie or any other credential: the only
 * input is the link token in the POST body (the page reads it from the URL fragment), and the only
 * data it can return is the artifact row that token names.
 */
export function mountArtifactShare(
  app: Hono,
  deps: {
    store: ShareStore;
    artifacts: ArtifactStore;
    allow?: (key: string) => boolean;
  },
): void {
  const allow = deps.allow ?? createRateLimiter();

  // Set before the handler runs so refusals and errors carry them too.
  app.use(`${PATH}/*`, async (c, next) => {
    c.header("cache-control", "private, no-store");
    c.header("referrer-policy", "no-referrer");
    c.header("x-content-type-options", "nosniff");
    await next();
  });

  const gone = (c: import("hono").Context) => c.json({ error: "Not found" }, 404);

  app.post(`${PATH}/open`, async (c) => {
    // The proxy sets X-Forwarded-For to the connecting address; direct callers share one bucket.
    const caller = c.req.header("x-forwarded-for")?.split(",").pop()?.trim() || "direct";
    if (!allow(caller)) {
      c.header("retry-after", "60");
      return c.json({ error: "Too many requests" }, 429);
    }
    const body = OpenBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return gone(c);
    try {
      const artifact = await deps.store.open(body.data.token);
      if (!artifact) return gone(c);
      const operationId = `share.open:${randomUUID()}`;
      const bytes = await deps.artifacts.get(artifact.storageKey, {
        operationId,
        traceId: operationId,
        spaceId: artifact.spaceId,
        userId: artifact.userId,
        signal: c.req.raw.signal,
      });
      return c.json({
        name: artifact.name,
        mimeType: artifact.mimeType,
        contentBase64: Buffer.from(bytes).toString("base64"),
      } satisfies SharedArtifact);
    } catch {
      return c.json({ error: "Unavailable" }, 500);
    }
  });
}
