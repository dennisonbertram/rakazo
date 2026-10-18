import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getCapTableSnapshot, saveCapTableSnapshot } from "./cap-table.js";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

const input = {
  companyName: "Example Co",
  asOf: "2026-01-31",
  fullyDilutedShares: 1000,
  shareClasses: [{ name: "Common", shares: 1000, percent: 100 }],
  holders: [{ name: "Ada Fund", security: "Common", shares: 1000 }],
};

describePostgres("cap table snapshot (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `cap-org-${suffix}`;
  const mine = {
    spaceId: `cap-space-a-${suffix}`,
    userId: `cap-user-a-${suffix}`,
  };
  const sameSpace = { spaceId: mine.spaceId, userId: `cap-user-b-${suffix}` };
  const otherSpace = { spaceId: `cap-space-b-${suffix}`, userId: mine.userId };
  let prisma: PrismaClient;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    await prisma.user.createMany({
      data: [mine.userId, sameSpace.userId].map((id) => ({
        id,
        name: id,
        email: `${id}@example.test`,
      })),
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        name: "Cap Org",
        slug: organizationId,
        createdAt: new Date(),
      },
    });
    await prisma.space.createMany({
      data: [mine.spaceId, otherSpace.spaceId].map((id) => ({
        id,
        organizationId,
        name: id,
      })),
    });
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({
      where: { id: { in: [mine.userId, sameSpace.userId] } },
    });
    await close();
  });

  it("saves, replaces, and reads back with nulls filled in", async () => {
    expect(await getCapTableSnapshot(prisma, mine)).toBeNull();
    await saveCapTableSnapshot(prisma, mine, input);
    await saveCapTableSnapshot(prisma, mine, {
      ...input,
      fullyDilutedShares: 2000,
    });
    const snapshot = await getCapTableSnapshot(prisma, mine);
    expect(snapshot?.fullyDilutedShares).toBe(2000);
    expect(snapshot?.amountRaisedUsd).toBeNull();
    expect(snapshot?.holders[0]?.email).toBeNull();
    expect(await prisma.capTableSnapshot.count({ where: mine })).toBe(1);
  });

  it("keeps each user and space separate", async () => {
    expect(await getCapTableSnapshot(prisma, sameSpace)).toBeNull();
    expect(await getCapTableSnapshot(prisma, otherSpace)).toBeNull();
  });

  it("rejects invalid figures without touching the stored snapshot", async () => {
    await expect(
      saveCapTableSnapshot(prisma, mine, { ...input, fullyDilutedShares: -5 }),
    ).rejects.toThrow();
    await expect(
      saveCapTableSnapshot(prisma, mine, { ...input, asOf: "last week" }),
    ).rejects.toThrow();
    expect((await getCapTableSnapshot(prisma, mine))?.fullyDilutedShares).toBe(2000);
  });

  describe("409A expiry deadline", () => {
    const TITLE = "409A valuation expires";
    beforeEach(async () => {
      await prisma.legalDeadline.deleteMany({ where: { spaceId: mine.spaceId } });
    });
    const deadlines = (who: { spaceId: string; userId: string }) =>
      prisma.legalDeadline.findMany({
        where: { ...who, title: TITLE },
        orderBy: { dueDate: "asc" },
      });
    const summary = async (who: { spaceId: string; userId: string }) =>
      (await deadlines(who)).map((r) => [r.dueDate.toISOString().slice(0, 10), r.status]);
    const with409a = (date: string, expiresOn?: string) => ({
      ...input,
      latest409a: { pricePerShareUsd: 1.5, date, expiresOn },
    });

    it("opens one derived deadline, dedupes on repeat, and supersedes on a newer 409A", async () => {
      await saveCapTableSnapshot(prisma, mine, with409a("2025-03-10"));
      await saveCapTableSnapshot(prisma, mine, with409a("2025-03-10"));
      const [first] = await deadlines(mine);
      expect(first).toMatchObject({
        kind: "compliance",
        derived: true,
        status: "open",
        contractId: null,
        sourceQuote: "From Carta: 409A dated 2025-03-10",
      });
      expect(await summary(mine)).toEqual([["2026-03-10", "open"]]);

      await saveCapTableSnapshot(prisma, mine, with409a("2026-02-01", "2027-01-15"));
      expect(await summary(mine)).toEqual([
        ["2026-03-10", "dismissed"],
        ["2027-01-15", "open"],
      ]);
    });

    it("keeps the newer deadline when an older snapshot is saved afterwards", async () => {
      await saveCapTableSnapshot(prisma, mine, with409a("2025-03-10"));
      await saveCapTableSnapshot(prisma, mine, with409a("2026-02-01", "2027-01-15"));
      await saveCapTableSnapshot(prisma, mine, with409a("2025-03-10"));
      expect((await summary(mine)).at(-1)).toEqual(["2027-01-15", "open"]);
    });

    it("uses the newest date across valuations409a", async () => {
      await saveCapTableSnapshot(prisma, mine, {
        ...input,
        valuations409a: [
          { pricePerShareUsd: 2, date: "2026-02-01", expiresOn: "2027-02-01" },
          { pricePerShareUsd: 1, date: "2025-02-01" },
        ],
      });
      expect((await summary(mine)).at(-1)).toEqual(["2027-02-01", "open"]);
    });

    it("never changes a deadline the user or the Legal agent made", async () => {
      const theirs = await prisma.legalDeadline.create({
        data: {
          ...mine,
          title: TITLE,
          kind: "compliance",
          dueDate: new Date("2026-03-10T00:00:00Z"),
          derived: false,
          sourceQuote: "From the report",
        },
      });
      await saveCapTableSnapshot(prisma, mine, with409a("2025-03-10"));
      await saveCapTableSnapshot(prisma, mine, with409a("2026-02-01", "2027-01-15"));
      const after = await prisma.legalDeadline.findUniqueOrThrow({ where: { id: theirs.id } });
      expect(after).toMatchObject({
        status: "open",
        derived: false,
        sourceQuote: "From the report",
      });
      expect((await deadlines(mine)).filter((r) => r.derived)).toHaveLength(2);
    });

    it("leaves exactly one open Carta deadline after concurrent saves", async () => {
      await Promise.all(
        [1, 2, 3, 4].map(() => saveCapTableSnapshot(prisma, mine, with409a("2025-05-05"))),
      );
      expect(await summary(mine)).toEqual([["2026-05-05", "open"]]);
    });

    it("never writes another user's or space's deadline", async () => {
      expect(await deadlines(sameSpace)).toHaveLength(0);
      expect(await deadlines(otherSpace)).toHaveLength(0);
    });
  });
});
