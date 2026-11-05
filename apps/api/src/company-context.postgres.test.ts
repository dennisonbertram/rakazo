import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import { COMPANY_SECTION_MAX_BYTES, COMPANY_SECTION_MAX_COUNT } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { createDb } from "@rakazo/db";
import { MarkdownMemoryStore } from "@rakazo/memory";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("company context (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `cc-org-${suffix}`;
  const spaceA = `cc-space-a-${suffix}`;
  const spaceB = `cc-space-b-${suffix}`;
  const alice: Actor = {
    spaceId: spaceA,
    userId: `cc-alice-${suffix}`,
    email: "a@example.test",
    isDeploymentOwner: false,
  };
  const bob: Actor = { ...alice, userId: `cc-bob-${suffix}`, email: "b@example.test" };
  const aliceInB: Actor = { ...alice, spaceId: spaceB };
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  const clientFor = (actor: Actor) =>
    createRouterClient(
      createRouter({
        prisma,
        memory: new MarkdownMemoryStore(prisma),
        env: { mailWritesDisabled: false },
      } as unknown as RouterDeps),
      { context: { actor } },
    );

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    await prisma.user.createMany({
      data: [alice, bob].map((a) => ({
        id: a.userId,
        name: a.userId,
        email: `${a.userId}@x.test`,
      })),
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "CC Org", slug: organizationId, createdAt: new Date() },
    });
    for (const id of [spaceA, spaceB]) {
      await prisma.space.create({ data: { id, organizationId, name: id } });
    }
  });

  afterAll(async () => {
    if (!prisma) return;
    try {
      await prisma.organization.deleteMany({ where: { id: organizationId } });
      await prisma.user.deleteMany({ where: { id: { in: [alice.userId, bob.userId] } } });
    } finally {
      await close();
    }
  });

  it("starts empty and keeps each user and space apart", async () => {
    const mine = clientFor(alice).companyContext;
    expect(await mine.list()).toEqual([]);
    const saved = await mine.save({ title: "Acme Widget", text: "Makes widgets. More text." });
    expect(saved).toMatchObject({
      slug: "acme-widget",
      title: "Acme Widget",
      summary: "Makes widgets.",
      revision: 1,
    });
    expect(await mine.list()).toHaveLength(1);
    expect(await clientFor(bob).companyContext.list()).toEqual([]);
    expect(await clientFor(aliceInB).companyContext.list()).toEqual([]);
    // Another user or space cannot edit, read the history of, restore or delete it by id.
    for (const other of [clientFor(bob), clientFor(aliceInB)]) {
      await expect(
        other.companyContext.save({ id: saved.id, title: "Acme Widget", text: "Changed." }),
      ).rejects.toThrow();
      await expect(other.companyContext.history({ id: saved.id })).rejects.toThrow();
      await expect(
        other.companyContext.restore({ id: saved.id, revision: 1, expectedRevision: 1 }),
      ).rejects.toThrow();
      await expect(other.companyContext.remove({ id: saved.id, revision: 1 })).rejects.toThrow();
    }
    expect((await mine.list())[0]?.text).toBe("Makes widgets. More text.");
    // Both users may use the same name.
    await clientFor(bob).companyContext.save({ title: "Acme Widget", text: "Bob's own." });
  });

  it("keeps sections out of the memory procedures and refuses to change them there", async () => {
    const client = clientFor(alice);
    const [section] = await client.companyContext.list();
    expect(await client.memory.list({})).toEqual([]);
    expect(await client.memory.list({ scope: "user" })).toEqual([]);
    expect(await client.memory.exportMarkdown({})).not.toContain("widgets");
    await expect(
      client.memory.update({ documentId: section!.id, content: "overwritten" }),
    ).rejects.toThrow();
    await expect(
      client.memory.remove({ documentId: section!.id, revision: section!.revision }),
    ).rejects.toThrow();
    expect((await client.companyContext.list())[0]?.text).toBe("Makes widgets. More text.");
  });

  it("is not returned by a memory search over all scopes", async () => {
    const store = new MarkdownMemoryStore(prisma);
    const context = {
      operationId: "t",
      traceId: "t",
      spaceId: alice.spaceId,
      userId: alice.userId,
      signal: new AbortController().signal,
    };
    expect(await store.search({ query: "widgets", scope: "all" }, context)).toEqual([]);
    expect(await store.search({ query: "widgets", scope: "company" }, context)).toHaveLength(1);
  });

  it("records revisions, restores one as a new revision, and refuses a stale save", async () => {
    const client = clientFor(alice).companyContext;
    const [first] = await client.list();
    const second = await client.save({
      id: first!.id,
      title: "Acme Widget",
      text: "Now it makes gadgets.",
      expectedRevision: 1,
    });
    expect(second.revision).toBe(2);
    await expect(
      client.save({ id: first!.id, title: "Acme Widget", text: "Late.", expectedRevision: 1 }),
    ).rejects.toThrow(/changed/);
    const history = await client.history({ id: first!.id });
    expect(history.map((row) => [row.revision, row.text])).toEqual([
      [2, "Now it makes gadgets."],
      [1, "Makes widgets. More text."],
    ]);
    const restored = await client.restore({ id: first!.id, revision: 1, expectedRevision: 2 });
    expect(restored).toMatchObject({ revision: 3, text: "Makes widgets. More text." });
    expect(await client.history({ id: first!.id })).toHaveLength(3);
  });

  it("refuses a taken name, an empty section, and text over the limit", async () => {
    const client = clientFor(alice).companyContext;
    await expect(client.save({ title: "acme widget", text: "Again." })).rejects.toThrow(/taken/);
    await expect(client.save({ title: "Empty", text: "  " })).rejects.toThrow();
    await expect(
      client.save({ title: "Big", text: "x".repeat(COMPANY_SECTION_MAX_BYTES) }),
    ).rejects.toThrow(/long/);
    expect(await client.list()).toHaveLength(1);
  });

  it("holds at most the section count", async () => {
    const client = clientFor(aliceInB).companyContext;
    for (let i = 0; i < COMPANY_SECTION_MAX_COUNT; i += 1) {
      await client.save({ title: `Topic ${i}`, text: "Text." });
    }
    await expect(client.save({ title: "One more", text: "Text." })).rejects.toThrow(/full/);
  });

  it("makes a deleted section disappear, with its history", async () => {
    const client = clientFor(alice).companyContext;
    const [section] = await client.list();
    await expect(client.remove({ id: section!.id, revision: 1 })).rejects.toThrow(/changed/);
    await client.remove({ id: section!.id, revision: section!.revision });
    expect(await client.list()).toEqual([]);
    expect(await prisma.memoryRevision.count({ where: { documentId: section!.id } })).toBe(0);
  });
});
