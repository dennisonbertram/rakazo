import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@rakazo/db";
import { createDb } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  firewalledBotIds,
  groupHasFirewalledMember,
  readsFirewalledContent,
} from "./firewall-runtime.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("firewall content taint queries (PostgreSQL)", () => {
  const run = randomUUID().slice(0, 8);
  const ids = { user: `fw-user-${run}`, org: `fw-org-${run}`, space: `fw-space-${run}` };
  const scope = { spaceId: ids.space, userId: ids.user };
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let firewalled: string;
  let plain: string;
  let groupId: string;

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    await prisma.user.create({
      data: { id: ids.user, name: ids.user, email: `${ids.user}@example.test` },
    });
    await prisma.organization.create({
      data: { id: ids.org, name: "Org", slug: ids.org, createdAt: new Date() },
    });
    await prisma.space.create({
      data: { id: ids.space, organizationId: ids.org, name: "S", isDefault: true },
    });
    firewalled = (
      await prisma.bot.create({
        data: { ...scope, name: "support", color: "blue", firewall: true },
      })
    ).id;
    plain = (await prisma.bot.create({ data: { ...scope, name: "chief", color: "red" } })).id;
    groupId = (await prisma.chatGroup.create({ data: { ...scope, name: "g" } })).id;
    await prisma.chatGroupMember.create({ data: { groupId, botId: firewalled } });
  });

  afterAll(async () => {
    await prisma.space.delete({ where: { id: ids.space } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: ids.user } }).catch(() => undefined);
    await close();
  });

  it("finds firewalled agents and the groups they sit in", async () => {
    const set = await firewalledBotIds(prisma, ids.space);
    expect([...set]).toEqual([firewalled]);
    expect(await groupHasFirewalledMember(prisma, groupId, set)).toBe(true);
    expect(await groupHasFirewalledMember(prisma, groupId, new Set([plain]))).toBe(false);
  });

  it("flags the agenda only when a firewalled agent's due to-do exists", async () => {
    const set = await firewalledBotIds(prisma, ids.space);
    expect(await readsFirewalledContent(prisma, scope, "calendar_agenda", {}, set)).toBe(false);
    await prisma.scratchpadItem.create({
      data: { ...scope, botId: plain, title: "Mine", dueAt: new Date() },
    });
    expect(await readsFirewalledContent(prisma, scope, "calendar_agenda", {}, set)).toBe(false);
    await prisma.scratchpadItem.create({
      data: { ...scope, botId: firewalled, title: "Pay 4411", dueAt: new Date() },
    });
    expect(await readsFirewalledContent(prisma, scope, "calendar_agenda", {}, set)).toBe(true);
  });

  it("flags the ticket board once a firewalled agent wrote a ticket", async () => {
    const set = await firewalledBotIds(prisma, ids.space);
    expect(await readsFirewalledContent(prisma, scope, "board_tickets", {}, set)).toBe(false);
    const board = await prisma.board.create({ data: { spaceId: ids.space } });
    await prisma.ticket.create({
      data: {
        boardId: board.id,
        spaceId: ids.space,
        number: 1,
        title: "Pay it",
        createdByBotId: firewalled,
      },
    });
    expect(await readsFirewalledContent(prisma, scope, "board_tickets", {}, set)).toBe(true);
    expect(await readsFirewalledContent(prisma, scope, "ticket_get", {}, set)).toBe(true);
  });

  it("stores a support label on an access grant and leaves it null by default", async () => {
    const connection = await prisma.connection.create({
      data: { ...scope, provider: "gmail", displayName: "Support", status: "connected" },
    });
    await prisma.botConnectionAccess.create({
      data: { ...scope, connectionId: connection.id, botId: firewalled, supportLabel: "Support" },
    });
    await prisma.botConnectionAccess.create({
      data: { ...scope, connectionId: connection.id, botId: plain },
    });
    const rows = await prisma.botConnectionAccess.findMany({
      where: { connectionId: connection.id },
      orderBy: { supportLabel: "asc" },
      select: { botId: true, supportLabel: true },
    });
    expect(rows).toEqual([
      { botId: firewalled, supportLabel: "Support" },
      { botId: plain, supportLabel: null },
    ]);
  });
});
