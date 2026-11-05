import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import { addContactIfNew, deleteContact, listContacts, saveContact } from "./contacts.js";
import { getFundraisingOverview, importProspects, saveProspect, saveRound } from "./fundraising.js";
import { saveSafe } from "./safes.js";
import { IsolationError } from "./scope.js";

const databaseUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL ?? databaseUrl;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

const migration = readFileSync(
  new URL("../prisma/migrations/20261231000052_pipeline_records/migration.sql", import.meta.url),
  "utf8",
);
const backfill = migration.slice(
  migration.indexOf("-- backfill:start"),
  migration.indexOf("-- backfill:end"),
);

describePostgres("pipeline records (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `pipe-org-${suffix}`;
  const users = ["a", "b", "c", "d", "e", "f", "g", "h"].map((u) => `pipe-user-${u}-${suffix}`);
  const spaceA = `pipe-space-a-${suffix}`;
  const spaceB = `pipe-space-b-${suffix}`;
  const scopeOf = (index: number, spaceId = spaceA) => ({
    spaceId,
    userId: users[index] as string,
  });
  const mine = scopeOf(0);
  const sameSpace = scopeOf(1);
  const otherSpace = scopeOf(0, spaceB);
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let pool: Pool;

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    pool = new Pool({ connectionString: migrationUrl, max: 1 });
    await prisma.user.createMany({
      data: users.map((id) => ({ id, name: id, email: `${id}@example.test` })),
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "Pipe Org", slug: organizationId, createdAt: new Date() },
    });
    await prisma.space.createMany({
      data: [spaceA, spaceB].map((id) => ({ id, organizationId, name: id })),
    });
  });
  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await pool.end();
    await close();
  });

  const round = { name: "Seed", targetCents: 200_000_000, capCents: 1_000_000_000 };
  const recordOf = async (scope: typeof mine, contactId: string) =>
    (
      await prisma.pipelineRecordPerson.findFirstOrThrow({
        where: { ...scope, contactId },
        include: { record: true },
      })
    ).record;

  describe("backfill", () => {
    const owner = scopeOf(2);
    /** A prospect saved before records existed: the old columns, and nothing on a record. */
    const legacy = (data: Record<string, unknown>) =>
      prisma.contact.create({
        data: { ...owner, name: "Unnamed", kind: "prospect", ...data },
      }) as Promise<{ id: string; name: string }>;
    const counts = async () => ({
      records: await prisma.pipelineRecord.count({ where: owner }),
      people: await prisma.pipelineRecordPerson.count({ where: owner }),
      events: await prisma.pipelineEvent.count({ where: owner }),
    });

    it("gives every prospect a record with the same page, totals and rows, and a re-run adds nothing", async () => {
      const open = await saveRound(prisma, owner, round);
      const closed = await prisma.fundraiseRound.create({
        data: { ...owner, name: "Earlier", targetCents: 1n, capCents: 1n, closedAt: new Date() },
      });
      const target = await legacy({
        name: "Sample Target",
        stage: "target",
        notes: "Met at a demo",
      });
      const intro = await legacy({ name: "Sample Intro", stage: "intro", nextStep: "Ask Riley" });
      const meeting = await legacy({ name: "Sample Meeting", stage: "meeting" });
      const diligence = await legacy({ name: "Sample Diligence", stage: "diligence" });
      const committed = await legacy({
        name: "Sample Committed",
        email: "committed@example.test",
        stage: "committed",
        checkSizeCents: 5_000_000n,
        roundId: open.id,
      });
      const otherRound = await legacy({
        name: "Sample Earlier",
        stage: "committed",
        checkSizeCents: 9_000_000n,
        roundId: closed.id,
      });
      const passed = await legacy({ name: "Sample Passed", stage: "passed" });
      const noStage = await legacy({ name: "Sample Blank", stage: null });
      const wave = await legacy({ name: "Sample Wave", stage: "target", nextStep: " Wave 2 " });
      const waiting = await legacy({
        name: "Sample Waiting",
        email: "waiting@example.test",
        stage: "committed",
        checkSizeCents: 1_000_000n,
        roundId: open.id,
        mercurySentAt: new Date("2026-02-01T00:00:00Z"),
      });
      // Two prospects at one firm stay two rows, as they are today.
      const firmOne = await legacy({
        name: "Alex One",
        organization: "Sample Fund",
        stage: "target",
      });
      const firmTwo = await legacy({
        name: "Blair Two",
        organization: "Sample Fund",
        stage: "intro",
      });
      const twin = await legacy({ name: "Alex One", organization: "Sample Fund", stage: "target" });
      const triplet = await legacy({
        name: "Alex One",
        organization: "Sample Fund",
        stage: "target",
      });
      // A prospect with an active SAFE has left the pipeline; the SAFE counts, its check size does not.
      const safeHolder = await legacy({
        name: "Sample Safe",
        stage: "committed",
        checkSizeCents: 7_000_000n,
        roundId: open.id,
      });
      await prisma.safe.create({
        data: {
          ...owner,
          contactId: safeHolder.id,
          roundId: open.id,
          investorName: "Sample Safe",
          amountCents: 4_000_000n,
          capCents: 1_000_000_000n,
        },
      });
      // An investor who signed earlier is not a prospect and stays off the pipeline.
      const investor = await prisma.contact.create({
        data: {
          ...owner,
          name: "Sample Signed",
          kind: "investor",
          stage: "committed",
          checkSizeCents: 3_000_000n,
          roundId: open.id,
        },
      });

      await pool.query(backfill);
      const first = await counts();
      expect(first).toEqual({ records: 15, people: 15, events: 1 });

      const overview = await getFundraisingOverview(prisma, owner);
      // Committed in the open round at check size, plus the Draft SAFE instead of its check size.
      expect(overview.pendingCents).toBe(5_000_000 + 1_000_000 + 4_000_000);
      const rows = new Map(overview.prospects.map((p) => [p.id, p]));
      expect(rows.has(safeHolder.id)).toBe(false);
      expect(rows.has(investor.id)).toBe(false);
      expect(rows.size).toBe(14);
      expect(rows.get(target.id)).toMatchObject({ stage: "target" });
      expect(rows.get(intro.id)).toMatchObject({ stage: "intro", nextStep: "Ask Riley" });
      expect(rows.get(meeting.id)).toMatchObject({ stage: "meeting" });
      expect(rows.get(diligence.id)).toMatchObject({ stage: "diligence" });
      expect(rows.get(committed.id)).toMatchObject({
        stage: "committed",
        checkSizeCents: 5_000_000,
        roundId: open.id,
      });
      expect(rows.get(otherRound.id)).toMatchObject({ roundId: closed.id });
      expect(rows.get(passed.id)).toMatchObject({ stage: "passed" });
      expect(rows.get(noStage.id)).toMatchObject({ stage: "target" });
      expect(rows.get(waiting.id)?.mercurySentAt).toBe("2026-02-01T00:00:00.000Z");
      expect(rows.get(firmOne.id)).toBeTruthy();
      expect(rows.get(firmTwo.id)).toBeTruthy();
      expect(rows.get(twin.id)).toBeTruthy();

      // Each stage is the first status of its group.
      const statuses = await Promise.all(
        [target, intro, meeting, diligence, committed, passed, noStage].map(
          async (c) => (await recordOf(owner, c.id)).status,
        ),
      );
      expect(statuses).toEqual([
        "not_reached",
        "intro_requested",
        "meeting_booked",
        "diligence",
        "committed",
        "passed",
        "not_reached",
      ]);
      // A Wave label moves to group; notes become one event and stay on the contact.
      expect(await recordOf(owner, wave.id)).toMatchObject({ group: "Wave 2", nextStep: null });
      expect(rows.get(wave.id)?.nextStep).toBeNull();
      const note = await prisma.pipelineEvent.findFirstOrThrow({
        where: { ...owner, kind: "note" },
      });
      expect(note.payload).toEqual({ text: "Met at a demo" });
      expect(rows.get(target.id)?.notes).toBe("Met at a demo");
      // Interest follows Committed and Passed; the firm name is unique however many share it.
      expect(await recordOf(owner, committed.id)).toMatchObject({ interest: "in" });
      expect(await recordOf(owner, passed.id)).toMatchObject({ interest: "out" });
      expect((await recordOf(owner, firmOne.id)).name).toBe("Sample Fund");
      expect((await recordOf(owner, firmTwo.id)).name).toBe("Blair Two, Sample Fund");
      expect((await recordOf(owner, twin.id)).name).toBe("Alex One, Sample Fund");
      expect((await recordOf(owner, triplet.id)).normalizedName).toContain(triplet.id);

      // A second run adds nothing and keeps what changed in between.
      await saveProspect(prisma, owner, { id: intro.id, nextStep: "Owner edit" });
      await pool.query(backfill);
      expect(await counts()).toEqual(first);
      expect((await recordOf(owner, intro.id)).nextStep).toBe("Owner edit");
      expect((await getFundraisingOverview(prisma, owner)).pendingCents).toBe(
        overview.pendingCents,
      );
      // Contacts of other kinds read as having no pipeline fields.
      const contacts = await listContacts(prisma, owner);
      expect(contacts.find((c) => c.id === investor.id)).toMatchObject({
        stage: null,
        checkSizeCents: null,
        pipelineRecord: null,
      });
    });
  });

  describe("one writer", () => {
    it("leaves status, amount and next step alone when a contact's email is edited", async () => {
      const p = await saveContact(prisma, mine, {
        name: "Sample Editor",
        kind: "prospect",
        stage: "meeting",
        checkSizeCents: 2_000_000,
        nextStep: "Send the deck",
      });
      const record = await recordOf(mine, p.id);
      await prisma.pipelineRecord.update({ where: { id: record.id }, data: { status: "met" } });
      const saved = await saveContact(prisma, mine, {
        id: p.id,
        name: p.name,
        email: "editor@example.test",
      });
      expect(saved).toMatchObject({
        email: "editor@example.test",
        stage: "meeting",
        checkSizeCents: 2_000_000,
        nextStep: "Send the deck",
        pipelineRecord: { id: record.id, status: "met" },
      });
    });

    it("keeps the finer status when a save names the stage it is already in", async () => {
      const p = await saveContact(prisma, mine, { name: "Sample Fine", kind: "prospect" });
      const { id } = await recordOf(mine, p.id);
      await prisma.pipelineRecord.update({ where: { id }, data: { status: "intro_made" } });
      await saveProspect(prisma, mine, { id: p.id, stage: "intro" });
      expect((await recordOf(mine, p.id)).status).toBe("intro_made");
      await saveProspect(prisma, mine, { id: p.id, stage: "meeting" });
      expect((await recordOf(mine, p.id)).status).toBe("meeting_booked");
      expect(await prisma.pipelineEvent.count({ where: { recordId: id, kind: "status" } })).toBe(1);
    });

    it("sets Interest from Committed and Passed, and clears Out on leaving Passed", async () => {
      const p = await saveContact(prisma, mine, { name: "Sample Stance", kind: "prospect" });
      await saveProspect(prisma, mine, { id: p.id, stage: "committed" });
      expect((await recordOf(mine, p.id)).interest).toBe("in");
      await saveProspect(prisma, mine, { id: p.id, stage: "passed" });
      expect(await recordOf(mine, p.id)).toMatchObject({
        interest: "out",
        statusBeforePassed: "committed",
      });
      await saveProspect(prisma, mine, { id: p.id, stage: "target" });
      expect(await recordOf(mine, p.id)).toMatchObject({
        interest: null,
        statusBeforePassed: null,
        status: "not_reached",
      });
    });

    it("creates a record for a prospect from any route, and never writes the old columns", async () => {
      const owner = scopeOf(3);
      const open = await saveRound(prisma, owner, round);
      // The Contacts page.
      const fromContacts = await saveContact(prisma, owner, {
        name: "From Contacts",
        kind: "prospect",
      });
      // An agent's contacts_add.
      const fromAgent = await addContactIfNew(prisma, owner, {
        name: "From Agent",
        kind: "prospect",
      });
      // A contact later changed to prospect.
      const vendor = await saveContact(prisma, owner, { name: "From Vendor", kind: "vendor" });
      const turned = await saveContact(prisma, owner, {
        id: vendor.id,
        name: vendor.name,
        kind: "prospect",
      });
      // The agent's list import.
      await importProspects(prisma, owner, [
        { firm: "From Import", stage: "committed", checkSizeCents: 500_000, nextStep: "Call" },
      ]);
      // Add prospect with its pipeline fields.
      const added = await saveContact(prisma, owner, {
        name: "From Page",
        kind: "prospect",
        stage: "committed",
        checkSizeCents: 700_000,
      });
      expect(added).toMatchObject({
        stage: "committed",
        checkSizeCents: 700_000,
        roundId: open.id,
      });
      const overview = await getFundraisingOverview(prisma, owner);
      expect(overview.prospects.map((p) => p.name).sort()).toEqual([
        "From Agent",
        "From Contacts",
        "From Import",
        "From Page",
        "From Vendor",
      ]);
      expect(overview.pendingCents).toBe(1_200_000);
      expect(await prisma.pipelineRecord.count({ where: owner })).toBe(5);
      for (const c of [fromContacts, fromAgent.contact, turned])
        expect((await recordOf(owner, c.id)).status).toBe("not_reached");
      // Saved twice, one record.
      await saveContact(prisma, owner, { id: fromContacts.id, name: "From Contacts", notes: "x" });
      expect(await prisma.pipelineRecord.count({ where: owner })).toBe(5);
      // The old columns stay frozen.
      const row = await prisma.contact.findUniqueOrThrow({ where: { id: added.id } });
      expect(row).toMatchObject({ stage: null, checkSizeCents: null, roundId: null });
      // A non-prospect gets none.
      const board = await saveContact(prisma, owner, { name: "Board Person", kind: "board" });
      expect(board.pipelineRecord).toBeNull();
    });

    it("gives two prospects at one firm their own rows, with unique record names", async () => {
      const owner = scopeOf(3, spaceB);
      const one = await saveContact(prisma, owner, {
        name: "Alex",
        organization: "Example Peak",
        kind: "prospect",
      });
      const two = await saveContact(prisma, owner, {
        name: "Blair",
        organization: "Example Peak",
        kind: "prospect",
      });
      const firm = await saveContact(prisma, owner, {
        name: "Example Peak",
        organization: "Example Peak",
        kind: "prospect",
      });
      expect((await recordOf(owner, one.id)).name).toBe("Example Peak");
      expect((await recordOf(owner, two.id)).name).toBe("Blair, Example Peak");
      expect((await recordOf(owner, firm.id)).normalizedName).toContain(firm.id);
    });

    it("takes a contact whose kind leaves prospect off the pipeline, as today", async () => {
      const owner = scopeOf(4);
      const open = await saveRound(prisma, owner, round);
      const p = await saveContact(prisma, owner, {
        name: "Sample Leaver",
        kind: "prospect",
        stage: "committed",
        checkSizeCents: 800_000,
      });
      expect(p.roundId).toBe(open.id);
      expect((await getFundraisingOverview(prisma, owner)).pendingCents).toBe(800_000);
      await saveContact(prisma, owner, { id: p.id, name: p.name, kind: "vendor" });
      const overview = await getFundraisingOverview(prisma, owner);
      expect(overview.pendingCents).toBe(0);
      expect(overview.prospects).toEqual([]);
      expect(await prisma.pipelineRecord.count({ where: owner })).toBe(0);
    });
  });

  describe("isolation", () => {
    it("refuses another user's and another space's contact or record", async () => {
      const p = await saveContact(prisma, mine, { name: "Sample Private", kind: "prospect" });
      const { id: recordId } = await recordOf(mine, p.id);
      for (const scope of [sameSpace, otherSpace]) {
        await expect(
          saveProspect(prisma, scope, { id: p.id, stage: "passed" }),
        ).rejects.toBeInstanceOf(IsolationError);
        await expect(
          saveProspect(prisma, scope, { id: recordId, stage: "passed" }),
        ).rejects.toBeInstanceOf(IsolationError);
        expect(
          (await getFundraisingOverview(prisma, scope)).prospects.map((r) => r.id),
        ).not.toContain(p.id);
        expect((await listContacts(prisma, scope)).map((c) => c.id)).not.toContain(p.id);
      }
      expect((await recordOf(mine, p.id)).status).toBe("not_reached");
    });

    it("refuses at the database a person from another user or space, or in two records", async () => {
      const p = await saveContact(prisma, mine, { name: "Sample Solo", kind: "prospect" });
      const q = await saveContact(prisma, mine, { name: "Sample Second", kind: "prospect" });
      const theirs = await saveContact(prisma, sameSpace, {
        name: "Sample Theirs",
        kind: "prospect",
      });
      const elsewhere = await saveContact(prisma, otherSpace, {
        name: "Sample Away",
        kind: "prospect",
      });
      const record = await recordOf(mine, p.id);
      const link = (contactId: string, scope = mine) =>
        prisma.pipelineRecordPerson.create({ data: { ...scope, recordId: record.id, contactId } });
      await expect(link(theirs.id)).rejects.toThrow();
      await expect(link(elsewhere.id)).rejects.toThrow();
      await expect(link(theirs.id, sameSpace)).rejects.toThrow();
      // Already in its own record of this pipeline.
      await expect(link(q.id)).rejects.toThrow();
      // Two primaries.
      const friend = await saveContact(prisma, mine, { name: "Sample Friend", kind: "other" });
      await expect(
        prisma.pipelineRecordPerson.create({
          data: { ...mine, recordId: record.id, contactId: friend.id, isPrimary: true },
        }),
      ).rejects.toThrow();
    });
  });

  describe("records with no person", () => {
    it("keep their row and amount when the last contact is deleted, and take the first person back", async () => {
      const owner = scopeOf(5);
      await saveRound(prisma, owner, round);
      const p = await saveContact(prisma, owner, {
        name: "Sample Lonely",
        kind: "prospect",
        stage: "committed",
        checkSizeCents: 600_000,
      });
      const record = await recordOf(owner, p.id);
      await deleteContact(prisma, owner, p.id);
      const overview = await getFundraisingOverview(prisma, owner);
      expect(overview.pendingCents).toBe(600_000);
      expect(overview.prospects).toHaveLength(1);
      expect(overview.prospects[0]).toMatchObject({
        id: record.id,
        name: "Sample Lonely",
        email: null,
        stage: "committed",
        checkSizeCents: 600_000,
        pipelineRecord: { id: record.id },
      });
      // Moved by its record id, since it has no contact.
      await saveProspect(prisma, owner, { id: record.id, stage: "passed" });
      expect((await getFundraisingOverview(prisma, owner)).pendingCents).toBe(0);
      await saveProspect(prisma, owner, { id: record.id, stage: "committed" });
      // The same name attaches the first person to the record instead of making a second one.
      const back = await saveContact(prisma, owner, { name: "Sample Lonely", kind: "prospect" });
      expect(back.pipelineRecord?.id).toBe(record.id);
      expect(back.stage).toBe("committed");
      expect(await prisma.pipelineRecord.count({ where: owner })).toBe(1);
      const rows = await getFundraisingOverview(prisma, owner);
      expect(rows.prospects.map((r) => r.id)).toEqual([back.id]);
    });

    it("promotes the next person when the primary is deleted", async () => {
      const owner = scopeOf(5, spaceB);
      const p = await saveContact(prisma, owner, { name: "Sample Primary", kind: "prospect" });
      const record = await recordOf(owner, p.id);
      const next = await saveContact(prisma, owner, { name: "Sample Next", kind: "other" });
      await prisma.pipelineRecordPerson.create({
        data: { ...owner, recordId: record.id, contactId: next.id },
      });
      await deleteContact(prisma, owner, p.id);
      const overview = await getFundraisingOverview(prisma, owner);
      expect(overview.prospects.map((r) => r.id)).toEqual([next.id]);
    });

    it("does not count a commitment twice once the contact holding its SAFE is deleted", async () => {
      const owner = scopeOf(6);
      await saveRound(prisma, owner, round);
      const p = await saveContact(prisma, owner, {
        name: "Sample Holder",
        kind: "prospect",
        stage: "committed",
        checkSizeCents: 900_000,
      });
      await saveSafe(prisma, owner, {
        contactId: p.id,
        investorName: "Sample Holder",
        amountCents: 900_000,
        proRata: false,
      });
      expect((await getFundraisingOverview(prisma, owner)).pendingCents).toBe(900_000);
      await deleteContact(prisma, owner, p.id);
      expect((await getFundraisingOverview(prisma, owner)).pendingCents).toBe(900_000);
    });
  });

  it("does not let an agent's contact write carry a stage past the writer's scope", async () => {
    const owner = scopeOf(7);
    const p = await saveContact(prisma, owner, {
      name: "Sample Carried",
      kind: "prospect",
      stage: "intro",
    });
    const foreign = await saveRound(prisma, sameSpace, {
      ...round,
      name: `Foreign ${suffix}`,
    }).catch(() => getFundraisingOverview(prisma, sameSpace).then((o) => o.round!));
    await expect(
      saveContact(prisma, owner, {
        id: p.id,
        name: p.name,
        stage: "committed",
        roundId: foreign.id,
      }),
    ).rejects.toBeInstanceOf(IsolationError);
    expect((await recordOf(owner, p.id)).status).toBe("intro_requested");
  });
});
