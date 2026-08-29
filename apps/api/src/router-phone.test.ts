import { RPCHandler } from "@orpc/server/fetch";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { createRouter, type RouterDeps } from "./router.js";

const identity = {
  id: "pi-1",
  phoneE164: "+15551111111",
  userId: "user-1",
  workspaceId: "ws-1",
  botId: "bot-1",
  outboundSinceInbound: 0,
};

function phoneDeps(overrides: {
  enabled?: boolean;
  identity?: unknown;
  membership?: Record<string, unknown> | null;
  memberships?: Array<Record<string, unknown>>;
  connection?: Record<string, unknown> | null;
  connections?: Array<Record<string, unknown>>;
} = {}) {
  const resolvedIdentity = overrides.identity === undefined ? identity : overrides.identity;
  const membership =
    overrides.membership === undefined
      ? {
          id: "pm-1",
          channelId: "ch-1",
          phoneE164: "+15551111111",
          identityId: "pi-1",
          status: "invited",
          channel: { id: "ch-1", name: "Family", members: [{ id: "pm-1" }, { id: "pm-2" }] },
        }
      : overrides.membership;
  const connection =
    overrides.connection === undefined
      ? {
          id: "ac-1",
          requesterBotId: "bot-9",
          targetBotId: "bot-1",
          status: "pending",
        }
      : overrides.connection;
  const prisma = {
    phoneIdentity: {
      findFirst: vi.fn(async () => resolvedIdentity),
      findUnique: vi.fn(async ({ where }: { where: { botId?: string } }) =>
        where.botId === "bot-9"
          ? { id: "pi-9", phoneE164: "+15559999999", userId: "user-9", botId: "bot-9" }
          : resolvedIdentity,
      ),
    },
    phoneChannelMember: {
      findMany: vi.fn(async () =>
        overrides.memberships ?? (membership ? [membership] : []),
      ),
      findFirst: vi.fn(async () => membership),
      update: vi.fn(async ({ data }: { data: unknown }) => ({
        ...membership,
        ...(data as object),
        channel: membership?.channel ?? { id: "ch-1", name: "Family", members: [] },
      })),
    },
    agentConnection: {
      findMany: vi.fn(async () =>
        overrides.connections ?? (connection ? [connection] : []),
      ),
      findFirst: vi.fn(async () => connection),
      update: vi.fn(async ({ data }: { data: unknown }) => ({
        ...connection,
        ...(data as object),
      })),
    },
    bot: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => ({
        id: where.id,
        name: where.id === "bot-9" ? "Helper" : "Assistant",
      })),
    },
    user: {
      findUnique: vi.fn(async () => ({ id: "user-9", name: "Bob Owner" })),
    },
  } as unknown as PrismaClient;
  const deps = {
    prisma,
    env: {
      defaultProvider: "fake",
      defaultModel: "fake-model",
      webOrigin: "http://127.0.0.1:5173",
      screenProxySecret: "fake-test-secret",
      sandboxProvider: "fake",
    },
    phone: { enabled: overrides.enabled ?? true },
    dataDir: "/tmp/rakazo-router-test",
  } as unknown as RouterDeps;
  const actor = {
    workspaceId: "ws-1",
    userId: "user-1",
    email: "user@rakazo.test",
    isDeploymentOwner: false,
  } satisfies Actor;
  return { prisma, deps, actor, handler: new RPCHandler(createRouter(deps)) };
}

async function call(
  handler: RPCHandler<never>,
  actor: Actor,
  path: string,
  body: unknown = {},
) {
  const { response } = await handler.handle(
    new Request(`http://127.0.0.1/rpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: body }),
    }),
    { prefix: "/rpc", context: { actor } },
  );
  return response;
}

describe("phone.status", () => {
  it("reports enablement and the caller's link state", async () => {
    const { handler, actor } = phoneDeps({ enabled: true });
    const response = await call(handler, actor, "phone/status");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      json: {
        enabled: true,
        linked: true,
        phoneE164: "+15551111111",
        botId: "bot-1",
      },
    });
  });

  it("reports unlinked when the caller has no phone identity", async () => {
    const { handler, actor } = phoneDeps({ identity: null });
    const response = await call(handler, actor, "phone/status");
    await expect(response.json()).resolves.toEqual({
      json: { enabled: true, linked: false, phoneE164: null, botId: null },
    });
  });
});

describe("phone.channels", () => {
  it("lists the caller's memberships with channel names", async () => {
    const { handler, actor } = phoneDeps();
    const response = await call(handler, actor, "phone/channels/list");
    await expect(response.json()).resolves.toEqual({
      json: [
        { channelId: "ch-1", name: "Family", status: "invited", memberCount: 2 },
      ],
    });
  });

  it("approves an invited membership and declines on accept=false", async () => {
    const { handler, actor, prisma } = phoneDeps();
    const approved = await call(handler, actor, "phone/channels/respond", {
      channelId: "ch-1",
      accept: true,
    });
    expect(prisma.phoneChannelMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "approved" } }),
    );
    await expect(approved.json()).resolves.toEqual({
      json: expect.objectContaining({ status: "approved" }),
    });

    const declined = await call(handler, actor, "phone/channels/respond", {
      channelId: "ch-1",
      accept: false,
    });
    await expect(declined.json()).resolves.toEqual({
      json: expect.objectContaining({ status: "declined" }),
    });
  });

  it("rejects respond on another user's membership or a non-invited one", async () => {
    const foreign = phoneDeps({ membership: null });
    const response = await call(foreign.handler, foreign.actor, "phone/channels/respond", {
      channelId: "ch-1",
      accept: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);

    const already = phoneDeps({
      membership: {
        id: "pm-1",
        channelId: "ch-1",
        identityId: "pi-1",
        status: "approved",
        channel: { id: "ch-1", name: "Family", members: [] },
      },
    });
    const second = await call(already.handler, already.actor, "phone/channels/respond", {
      channelId: "ch-1",
      accept: true,
    });
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it("leaves an approved channel", async () => {
    const { handler, actor, prisma } = phoneDeps({
      membership: {
        id: "pm-1",
        channelId: "ch-1",
        identityId: "pi-1",
        status: "approved",
        channel: { id: "ch-1", name: "Family", members: [] },
      },
    });
    const response = await call(handler, actor, "phone/channels/leave", { channelId: "ch-1" });
    expect(prisma.phoneChannelMember.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "left" } }),
    );
    await expect(response.json()).resolves.toEqual({ json: { ok: true } });
  });
});

describe("phone.connections", () => {
  it("lists connections with the peer label and direction", async () => {
    const { handler, actor } = phoneDeps();
    const response = await call(handler, actor, "phone/connections/list");
    await expect(response.json()).resolves.toEqual({
      json: [
        {
          id: "ac-1",
          peerBotName: "Helper",
          peerOwnerLabel: "Bob",
          status: "pending",
          incoming: true,
        },
      ],
    });
  });

  it("approves a pending incoming connection", async () => {
    const { handler, actor, prisma } = phoneDeps();
    const response = await call(handler, actor, "phone/connections/respond", {
      connectionId: "ac-1",
      accept: true,
    });
    expect(prisma.agentConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "approved" } }),
    );
    await expect(response.json()).resolves.toEqual({
      json: expect.objectContaining({ status: "approved" }),
    });
  });

  it("rejects respond from the requester side", async () => {
    const outgoing = phoneDeps({
      connection: { id: "ac-2", requesterBotId: "bot-1", targetBotId: "bot-9", status: "pending" },
    });
    const response = await call(outgoing.handler, outgoing.actor, "phone/connections/respond", {
      connectionId: "ac-2",
      accept: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("revokes an approved connection from either side", async () => {
    const { handler, actor, prisma } = phoneDeps({
      connection: { id: "ac-3", requesterBotId: "bot-1", targetBotId: "bot-9", status: "approved" },
    });
    const response = await call(handler, actor, "phone/connections/revoke", {
      connectionId: "ac-3",
    });
    expect(prisma.agentConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "revoked" } }),
    );
    await expect(response.json()).resolves.toEqual({ json: { ok: true } });
  });
});
