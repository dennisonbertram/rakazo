import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ARTIFACT_SHARE_TTL_MS,
  createArtifactShare,
  getArtifactShare,
  openArtifactShare,
  revokeArtifactShare,
  UnshareableArtifactError,
} from "./artifact-shares.js";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import { IsolationError } from "./scope.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;
const html = (mimeType: string) => mimeType === "text/html";

describePostgres("artifact shares (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `as-org-${suffix}`;
  const mine = { spaceId: `as-space-a-${suffix}`, userId: `as-user-a-${suffix}` };
  const other = { spaceId: `as-space-b-${suffix}`, userId: `as-user-b-${suffix}` };
  const now = new Date("2026-03-01T12:00:00Z");
  let prisma: PrismaClient;
  let close: () => Promise<void>;

  const artifact = (who: typeof mine, name: string, extra: Record<string, unknown> = {}) =>
    prisma.artifact.create({
      data: {
        ...who,
        name,
        mimeType: "text/html",
        size: 4,
        hash: name,
        storageKey: `key-${name}-${suffix}`,
        ...extra,
      },
    });

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    await prisma.user.createMany({
      data: [mine.userId, other.userId].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Share Org", slug: organizationId, createdAt: new Date() },
    });
    await prisma.space.createMany({
      data: [mine.spaceId, other.spaceId].map((id) => ({ id, organizationId, name: `Co ${id}` })),
    });
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: [mine.userId, other.userId] } } });
    await close();
  });

  it("stores only the hash, expires after 30 days, and opens only while live", async () => {
    const a = await artifact(mine, "hash");
    const { token, expiresAt } = await createArtifactShare(prisma, mine, a.id, html, now);
    const row = await prisma.artifactShare.findFirstOrThrow({ where: { artifactId: a.id } });
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(row.tokenHash).not.toBe(token);
    expect(expiresAt.getTime() - now.getTime()).toBe(ARTIFACT_SHARE_TTL_MS);
    expect((await openArtifactShare(prisma, token, now))?.name).toBe("hash");
    expect(
      (await prisma.artifactShare.findUniqueOrThrow({ where: { id: row.id } })).lastOpenedAt,
    ).toEqual(now);
    expect(await openArtifactShare(prisma, token, expiresAt)).toBeNull();
    expect(await openArtifactShare(prisma, "unknown", now)).toBeNull();
    expect(await getArtifactShare(prisma, mine, a.id, expiresAt)).toBeNull();
  });

  it("creating again ends the old link and points the new one at the chosen version", async () => {
    const v1 = await artifact(mine, "family");
    const v2 = await artifact(mine, "family", { rootArtifactId: v1.id, version: 2 });
    const first = await createArtifactShare(prisma, mine, v1.id, html, now);
    const second = await createArtifactShare(prisma, mine, v2.id, html, now);
    expect(await openArtifactShare(prisma, first.token, now)).toBeNull();
    expect((await openArtifactShare(prisma, second.token, now))?.id).toBe(v2.id);
    // Read from any version of the family.
    expect((await getArtifactShare(prisma, mine, v1.id, now))?.artifactId).toBe(v2.id);
    await revokeArtifactShare(prisma, mine, v1.id, now);
    expect(await openArtifactShare(prisma, second.token, now)).toBeNull();
    expect(await getArtifactShare(prisma, mine, v2.id, now)).toBeNull();
  });

  it("refuses another owner's artifact and unsupported types, and cascades on delete", async () => {
    const theirs = await artifact(other, "theirs");
    await expect(createArtifactShare(prisma, mine, theirs.id, html, now)).rejects.toBeInstanceOf(
      IsolationError,
    );
    await expect(getArtifactShare(prisma, mine, theirs.id, now)).rejects.toBeInstanceOf(
      IsolationError,
    );
    await expect(revokeArtifactShare(prisma, mine, theirs.id, now)).rejects.toBeInstanceOf(
      IsolationError,
    );
    const zip = await artifact(mine, "zip", { mimeType: "application/zip" });
    await expect(createArtifactShare(prisma, mine, zip.id, html, now)).rejects.toBeInstanceOf(
      UnshareableArtifactError,
    );
    const doomed = await artifact(mine, "doomed");
    const { token } = await createArtifactShare(prisma, mine, doomed.id, html, now);
    await prisma.artifact.delete({ where: { id: doomed.id } });
    expect(await openArtifactShare(prisma, token, now)).toBeNull();
  });

  it("a revoke by another owner never touches my link", async () => {
    const a = await artifact(mine, "keep");
    const { token } = await createArtifactShare(prisma, mine, a.id, html, now);
    await expect(revokeArtifactShare(prisma, other, a.id, now)).rejects.toBeInstanceOf(
      IsolationError,
    );
    expect(await openArtifactShare(prisma, token, now)).not.toBeNull();
  });
});
