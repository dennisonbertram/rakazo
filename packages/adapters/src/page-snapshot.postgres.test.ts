import type { ArtifactStore } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { createArtifactShare, createDb, openArtifactShare } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sharePageSnapshot } from "./page-snapshot.js";
import { resolvePageData } from "./page-sources.js";
import { createBotPage, getBotPage } from "./pages.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("page snapshot sharing (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `psh-org-${suffix}`;
  const spaceId = `psh-space-${suffix}`;
  const userId = `psh-user-${suffix}`;
  const otherUserId = `psh-other-${suffix}`;
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let botId: string;
  let pageId: string;
  const blobs = new Map<string, Uint8Array>();
  const artifacts = {
    put: vi.fn(async (input: { bytes: Uint8Array }) => {
      const id = `blob-${blobs.size}`;
      blobs.set(id, input.bytes);
      return { id, hash: "h" };
    }),
    remove: vi.fn(async () => undefined),
  } as unknown as ArtifactStore;

  const share = async (userIdOverride = userId) => {
    const page = (await getBotPage(prisma, { spaceId, botId, pageId }))!;
    return sharePageSnapshot(
      { prisma, artifacts },
      {
        spaceId,
        userId: userIdOverride,
        botId,
        page,
        data: await resolvePageData({ prisma }, { spaceId }, page),
      },
    );
  };

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    for (const id of [userId, otherUserId]) {
      await prisma.user.create({ data: { id, name: id, email: `${id}@example.test` } });
    }
    await prisma.organization.create({
      data: { id: organizationId, name: "PSH Org", slug: organizationId, createdAt: new Date() },
    });
    await prisma.space.create({
      data: { id: spaceId, organizationId, name: "General", isDefault: true },
    });
    botId = (await prisma.bot.create({ data: { spaceId, userId, name: "Chief", color: "blue" } }))
      .id;
    pageId = (
      await createBotPage(
        { prisma, events: { append: vi.fn(async () => ({}) as never) } },
        { spaceId, botId, userId, title: "Cash" },
      )
    ).id;
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await close();
  });

  it("a re-share is a new version of the same artifact and ends the earlier link", async () => {
    const first = await share();
    const second = await share();
    const rows = await prisma.artifact.findMany({
      where: { spaceId, botId },
      orderBy: { version: "asc" },
    });
    expect(rows.map((r) => [r.version, r.mimeType, r.userId])).toEqual([
      [1, "text/html", userId],
      [2, "text/html", userId],
    ]);
    expect(rows[1]?.rootArtifactId).toBe(rows[0]?.id);
    expect(await openArtifactShare(prisma, first.token)).toBeNull();
    const opened = await openArtifactShare(prisma, second.token);
    expect(opened).toMatchObject({ id: second.artifactId, mimeType: "text/html" });
    const bytes = blobs.get((opened as { storageKey: string }).storageKey)!;
    expect(new TextDecoder().decode(bytes)).toContain("<h1>Cash</h1>");
  });

  it("refuses to share for a user who does not own the bot's artifacts", async () => {
    const { artifactId } = await share();
    expect(artifactId).toBeTruthy();
    // The share is made under the artifact owner; a different user cannot touch it.
    await expect(
      createArtifactShare(prisma, { spaceId, userId: otherUserId }, artifactId, () => true),
    ).rejects.toThrow();
  });
});
