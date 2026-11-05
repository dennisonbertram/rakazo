import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import { saveContact } from "./contacts.js";
import {
  getFundraisingOverview,
  logCall,
  saveProspect,
  saveRound,
  undoCall,
} from "./fundraising.js";
import { IsolationError } from "./scope.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("pipeline table writes (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `ptab-org-${suffix}`;
  const space = `ptab-space-${suffix}`;
  const users = ["a", "b"].map((u) => `ptab-user-${u}-${suffix}`);
  const owner = { spaceId: space, userId: users[0] as string };
  const other = { spaceId: space, userId: users[1] as string };
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
      data: users.map((id) => ({ id, name: id, email: `${id}@example.test` })),
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Ptab Org", slug: organizationId, createdAt: new Date() },
    });
    await prisma.space.create({ data: { id: space, organizationId, name: space } });
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await close();
  });

  const add = (scope: typeof owner, name: string, extra: Record<string, unknown> = {}) =>
    saveContact(prisma, scope, { name, kind: "prospect", ...extra });
  const infoOf = async (scope: typeof owner, id: string) =>
    (await getFundraisingOverview(prisma, scope)).prospects.find((p) => p.id === id)
      ?.pipelineRecord;
  const recordOf = async (scope: typeof owner, contactId: string) =>
    (
      await prisma.pipelineRecordPerson.findFirstOrThrow({
        where: { ...scope, contactId },
        include: { record: true },
      })
    ).record;

  it("Out moves to Passed and clears the next call; undoing restores status, stance and date", async () => {
    const p = await add(owner, "Sample Out");
    await saveProspect(prisma, owner, {
      id: p.id,
      status: "met",
      interest: "maybe",
      nextCallAt: "2026-11-10T00:00:00.000Z",
    });
    await saveProspect(prisma, owner, { id: p.id, interest: "out" });
    expect(await infoOf(owner, p.id)).toMatchObject({
      status: "passed",
      interest: "out",
      nextCallAt: null,
    });
    await saveProspect(prisma, owner, {
      id: p.id,
      status: "met",
      interest: "maybe",
      nextCallAt: "2026-11-10T00:00:00.000Z",
      nextCallHasTime: false,
    });
    expect(await infoOf(owner, p.id)).toMatchObject({
      status: "met",
      interest: "maybe",
      nextCallAt: "2026-11-10T00:00:00.000Z",
    });
  });

  it("In or Maybe on a Passed row returns to the status before Passed; untoggling Out does too", async () => {
    const p = await add(owner, "Sample Back");
    await saveProspect(prisma, owner, { id: p.id, status: "diligence" });
    await saveProspect(prisma, owner, { id: p.id, interest: "out" });
    await saveProspect(prisma, owner, { id: p.id, interest: "in" });
    expect(await infoOf(owner, p.id)).toMatchObject({ status: "diligence", interest: "in" });
    await saveProspect(prisma, owner, { id: p.id, interest: "out" });
    await saveProspect(prisma, owner, { id: p.id, interest: null });
    expect(await infoOf(owner, p.id)).toMatchObject({ status: "diligence", interest: null });
  });

  it("refuses a referrer that is not the user's contact, and keeps one that is", async () => {
    const p = await add(owner, "Sample Referred");
    const foreign = await add(other, "Sample Foreign Referrer");
    await expect(
      saveProspect(prisma, owner, { id: p.id, referredByContactId: foreign.id }),
    ).rejects.toBeInstanceOf(IsolationError);
    const mine = await add(owner, "Sample Referrer");
    await saveProspect(prisma, owner, { id: p.id, referredByContactId: mine.id });
    expect((await infoOf(owner, p.id))?.referredBy).toEqual({ id: mine.id, name: mine.name });
  });

  describe("logging a call", () => {
    it("Left message and No answer never move the status; Spoke moves Not reached to Met", async () => {
      const p = await add(owner, "Sample Caller");
      await logCall(prisma, owner, {
        id: p.id,
        outcome: "left_message",
        note: "Try Thursday",
        nextCall: { at: "2026-11-12T00:00:00.000Z", hasTime: false },
      });
      await logCall(prisma, owner, { id: p.id, outcome: "no_answer", nextCall: "keep" });
      expect(await infoOf(owner, p.id)).toMatchObject({
        status: "not_reached",
        nextCallAt: "2026-11-12T00:00:00.000Z",
        lastCall: { outcome: "no_answer", note: null },
      });
      const spoke = await logCall(prisma, owner, { id: p.id, outcome: "spoke", nextCall: "keep" });
      expect(spoke.movedToMet).toBe(true);
      expect((await infoOf(owner, p.id))?.status).toBe("met");
    });

    it("moves forward only: Spoke leaves Diligence and Passed alone", async () => {
      const a = await add(owner, "Sample Far");
      await saveProspect(prisma, owner, { id: a.id, status: "diligence" });
      const b = await add(owner, "Sample Gone");
      await saveProspect(prisma, owner, { id: b.id, status: "passed" });
      for (const id of [a.id, b.id]) {
        const result = await logCall(prisma, owner, { id, outcome: "spoke", nextCall: "keep" });
        expect(result.movedToMet).toBe(false);
      }
      expect((await infoOf(owner, a.id))?.status).toBe("diligence");
      expect((await infoOf(owner, b.id))?.status).toBe("passed");
    });

    it("Keep leaves the date, None clears it", async () => {
      const p = await add(owner, "Sample Keep");
      await saveProspect(prisma, owner, { id: p.id, nextCallAt: "2026-11-03T00:00:00.000Z" });
      await logCall(prisma, owner, { id: p.id, outcome: "left_message", nextCall: "keep" });
      expect((await infoOf(owner, p.id))?.nextCallAt).toBe("2026-11-03T00:00:00.000Z");
      await logCall(prisma, owner, {
        id: p.id,
        outcome: "left_message",
        nextCall: { at: null, hasTime: false },
      });
      expect((await infoOf(owner, p.id))?.nextCallAt).toBeNull();
    });

    it("Undo removes the call and restores the status and date", async () => {
      const p = await add(owner, "Sample Undo");
      await saveProspect(prisma, owner, { id: p.id, nextCallAt: "2026-11-03T00:00:00.000Z" });
      const { eventId } = await logCall(prisma, owner, {
        id: p.id,
        outcome: "spoke",
        nextCall: { at: "2026-11-20T00:00:00.000Z", hasTime: false },
      });
      await undoCall(prisma, owner, eventId);
      expect(await infoOf(owner, p.id)).toMatchObject({
        status: "not_reached",
        nextCallAt: "2026-11-03T00:00:00.000Z",
        lastCall: null,
      });
    });

    it("refuses another user's contact and another user's call", async () => {
      const mine = await add(owner, "Sample Mine");
      const theirs = await add(other, "Sample Theirs");
      await expect(
        logCall(prisma, owner, { id: theirs.id, outcome: "spoke", nextCall: "keep" }),
      ).rejects.toBeInstanceOf(IsolationError);
      const { eventId } = await logCall(prisma, owner, {
        id: mine.id,
        outcome: "spoke",
        nextCall: "keep",
      });
      await expect(undoCall(prisma, other, eventId)).rejects.toBeInstanceOf(IsolationError);
      expect((await recordOf(owner, mine.id)).status).toBe("met");
    });

    it("logs on a record with no person by its record id", async () => {
      const record = await prisma.pipelineRecord.create({
        data: { ...owner, name: "Sample Firm Only", normalizedName: "samplefirmonly" },
      });
      await logCall(prisma, owner, { id: record.id, outcome: "spoke", nextCall: "keep" });
      expect(
        (await prisma.pipelineRecord.findUniqueOrThrow({ where: { id: record.id } })).status,
      ).toBe("met");
    });
  });

  it("keeps a Committed round untouched by interest changes", async () => {
    await saveRound(prisma, owner, { name: "Seed", targetCents: 1_000_000, capCents: 5_000_000 });
    const p = await add(owner, "Sample Committed");
    await saveProspect(prisma, owner, { id: p.id, status: "committed" });
    expect((await infoOf(owner, p.id))?.interest).toBe("in");
  });
});
