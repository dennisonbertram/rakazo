import type { PrismaClient } from "@rakazo/db";
import { createDb, runAsSystem } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handleMcpRequest, McpAccessError, resolveMcpCall } from "./mcp-server.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("MCP per-call checks (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `mcp-org-${suffix}`;
  const [spaceA, spaceB] = [`mcp-space-a-${suffix}`, `mcp-space-b-${suffix}`];
  const alice = `mcp-alice-${suffix}`;
  const bob = `mcp-bob-${suffix}`;
  const client = "mcp-client";
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  const claims = (sub: string, spaceId: string) => ({ sub, azp: client, space_id: spaceId });
  const connect = (userId: string, spaceId: string, extra = {}) =>
    runAsSystem("mcp test", () =>
      prisma.mcpConnection.create({
        data: { userId, spaceId, kind: "oauth", label: "test", oauthClientId: client, ...extra },
      }),
    );
  const agents = async (userId: string, spaceId: string) => {
    const { actor } = await resolveMcpCall(prisma, claims(userId, spaceId));
    const response = await handleMcpRequest(
      prisma,
      actor,
      new Request("http://mcp.test/mcp", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "agents_list", arguments: {} },
        }),
      }),
    );
    const body = (await response.json()) as { result: { content: Array<{ text: string }> } };
    return (JSON.parse(body.result.content[0]!.text) as { agents: Array<{ name: string }> }).agents;
  };

  beforeAll(async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await prisma.$disconnect();
      await db.pool.end();
    };
    await prisma.user.createMany({
      data: [alice, bob].map((id) => ({ id, name: id, email: `${id}@x.test` })),
    });
    await prisma.organization.create({
      data: { id: organizationId, name: "MCP Org", slug: organizationId, createdAt: new Date() },
    });
    await prisma.space.createMany({
      data: [spaceA, spaceB].map((id) => ({ id, organizationId, name: id })),
    });
    await prisma.member.createMany({
      data: [alice, bob].map((userId) => ({
        id: `m-${userId}`,
        organizationId,
        userId,
        role: "member",
        createdAt: new Date(),
      })),
    });
    const memberships = [
      [alice, spaceA],
      [alice, spaceB],
      [bob, spaceA],
    ] as const;
    await prisma.spaceMember.createMany({
      data: memberships.map(([userId, spaceId]) => ({
        id: `sm-${userId}-${spaceId}`,
        organizationId,
        spaceId,
        userId,
        createdAt: new Date(),
      })),
    });
    await runAsSystem("mcp test", () =>
      prisma.bot.createMany({
        data: [
          {
            id: `b-a-${suffix}`,
            spaceId: spaceA,
            userId: alice,
            name: "Alpha",
            description: "In A",
          },
          { id: `b-b-${suffix}`, spaceId: spaceB, userId: alice, name: "Beta" },
          {
            id: `b-x-${suffix}`,
            spaceId: spaceA,
            userId: alice,
            name: "Gone",
            archivedAt: new Date(),
          },
        ].map((bot) => ({ color: "#000", ...bot })),
      }),
    );
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: [alice, bob] } } });
    await close();
  });

  it("keeps two connections in two Spaces apart", async () => {
    await connect(alice, spaceA);
    await connect(alice, spaceB);
    expect(await agents(alice, spaceA)).toEqual([
      { id: `b-a-${suffix}`, name: "Alpha", description: "In A" },
    ]);
    expect(await agents(alice, spaceB)).toEqual([{ id: `b-b-${suffix}`, name: "Beta" }]);
  });

  it("rejects a token that names a Space without a connection", async () => {
    await expect(resolveMcpCall(prisma, claims(bob, spaceB))).rejects.toMatchObject({
      status: 401,
    });
    await expect(resolveMcpCall(prisma, { sub: alice })).rejects.toBeInstanceOf(McpAccessError);
  });

  it("rejects a revoked connection on the next call", async () => {
    const connection = await connect(bob, spaceA);
    await expect(resolveMcpCall(prisma, claims(bob, spaceA))).resolves.toMatchObject({
      connectionId: connection.id,
    });
    await runAsSystem("mcp test", () =>
      prisma.mcpConnection.update({
        where: { id: connection.id },
        data: { revokedAt: new Date() },
      }),
    );
    await expect(resolveMcpCall(prisma, claims(bob, spaceA))).rejects.toMatchObject({
      message: "This connection was revoked",
      status: 401,
    });
  });

  it("rejects a member who left the Space even though the connection is active", async () => {
    await connect(bob, spaceA);
    await expect(resolveMcpCall(prisma, claims(bob, spaceA))).resolves.toBeDefined();
    await prisma.spaceMember.deleteMany({ where: { userId: bob, spaceId: spaceA } });
    await expect(resolveMcpCall(prisma, claims(bob, spaceA))).rejects.toMatchObject({
      message: "No access to this space",
      status: 403,
    });
  });
});
