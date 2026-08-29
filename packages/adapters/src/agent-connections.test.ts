import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  connectAgent,
  messageConnectedAgent,
  respondAgentConnection,
  type AgentConnectionDeps,
} from "./agent-connections.js";

const requesterIdentity = {
  id: "pi-1",
  phoneE164: "+15551111111",
  userId: "user-1",
  workspaceId: "ws-1",
  botId: "bot-1",
  outboundSinceInbound: 0,
};
const targetIdentity = {
  id: "pi-2",
  phoneE164: "+15552222222",
  userId: "user-2",
  workspaceId: "ws-2",
  botId: "bot-2",
  outboundSinceInbound: 0,
};

function createDeps(overrides: {
  connection?: Record<string, unknown> | null;
  pendingConnection?: Record<string, unknown> | null;
  sourceHop?: number;
} = {}) {
  const outboundRows: Array<Record<string, unknown>> = [];
  const txCalls: Record<string, unknown[]> = { messageCreate: [], runCreate: [], taskCreate: [] };
  const txMock = {
    message: {
      findUnique: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: unknown }) => {
        txCalls.messageCreate.push(data);
        return { id: `msg-${txCalls.messageCreate.length}`, ...(data as object) };
      }),
      update: vi.fn(async () => ({})),
    },
    run: {
      findFirst: vi.fn(async () => ({ id: "run-1" })),
      create: vi.fn(async ({ data }: { data: unknown }) => {
        txCalls.runCreate.push(data);
        return { id: "run-wake", ...(data as object) };
      }),
      findUnique: vi.fn(async () => null),
    },
    task: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        txCalls.taskCreate.push(data);
        return { id: "task-1", ...(data as object) };
      }),
    },
    event: { create: vi.fn(async ({ data }: { data: object }) => ({ id: "evt-1", seq: 8, ...data })) },
    thread: { update: vi.fn(async () => ({ nextMessageSeq: 4, nextEventSeq: 9 })) },
    bot: { findFirst: vi.fn(async () => ({ id: "bot-2" })) },
  };
  const connection =
    overrides.connection === undefined
      ? null
      : overrides.connection;
  const prisma = {
    phoneIdentity: {
      findUnique: vi.fn(
        async ({ where }: { where: { phoneE164?: string; botId?: string; id?: string } }) => {
          if (where.phoneE164 === "+15552222222" || where.botId === "bot-2" || where.id === "pi-2")
            return targetIdentity;
          if (where.phoneE164 === "+15551111111" || where.botId === "bot-1" || where.id === "pi-1")
            return requesterIdentity;
          return null;
        },
      ),
    },
    bot: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "bot-2"
          ? {
              id: "bot-2",
              name: "Helper",
              workspaceId: "ws-2",
              userId: "user-2",
              archivedAt: null,
              thread: { id: "thread-2" },
            }
          : { id: "bot-1", name: "Assistant", workspaceId: "ws-1", userId: "user-1" },
      ),
    },
    agentConnection: {
      findUnique: vi.fn(async () => connection),
      findFirst: vi.fn(async () =>
        overrides.pendingConnection === undefined ? null : overrides.pendingConnection,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "ac-1",
        status: "pending",
        ...data,
      })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: unknown }) => ({
        id: where.id,
        ...(data as object),
      })),
    },
    phoneOutbound: {
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        outboundRows.push(...data);
        return { count: data.length };
      }),
    },
    message: {
      findUnique: vi.fn(async () =>
        overrides.sourceHop != null
          ? { blocks: [{ kind: "bot_message_received", hop: overrides.sourceHop }] }
          : null,
      ),
    },
    user: { findUnique: vi.fn(async () => ({ id: "user-1", name: "Alice Owner" })) },
    thread: { findFirst: vi.fn(async () => ({ id: "thread-2" })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
  };
  const sendUserMessage = vi.fn(async () => ({ messageId: "m", runId: "r", seq: 1 }));
  const notify = vi.fn(async () => undefined);
  const enqueue = vi.fn(async () => undefined);
  return {
    prisma: prisma as unknown as PrismaClient & typeof prisma,
    events: { sendUserMessage, notify } as unknown as Pick<
      ThreadEvents,
      "sendUserMessage" | "notify"
    >,
    jobs: { enqueue },
    outboundRows,
    txCalls,
    notify,
    enqueue,
  };
}

const run = {
  id: "run-1",
  workspaceId: "ws-1",
  threadId: "thread-1",
  botId: "bot-1",
  userId: "user-1",
  sourceMessageId: null,
};
const sender = { id: "bot-1", name: "Assistant" };

describe("connectAgent", () => {
  it("creates a pending connection and texts the target owner for approval", async () => {
    const deps = createDeps();
    const result = await connectAgent(deps, run, sender, {
      phone: "+15552222222",
      deliveryKey: "exec-1",
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, status: "pending" }));
    expect(deps.prisma.agentConnection.create).toHaveBeenCalledWith({
      data: { requesterBotId: "bot-1", targetBotId: "bot-2", status: "pending" },
    });
    expect(deps.outboundRows).toEqual([
      expect.objectContaining({
        kind: "dm",
        toNumber: "+15552222222",
        body: expect.stringMatching(/YES/),
      }),
    ]);
    expect(deps.enqueue).toHaveBeenCalled();
  });

  it("rejects unknown numbers, self-connections, and repeat requests", async () => {
    const unknown = createDeps();
    expect(
      await connectAgent(unknown, run, sender, { phone: "+15559999999" }),
    ).toEqual(expect.objectContaining({ ok: false }));

    const self = createDeps();
    expect(await connectAgent(self, run, sender, { phone: "+15551111111" })).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringMatching(/itself|self/i) }),
    );

    const approved = createDeps({
      connection: { id: "ac-1", requesterBotId: "bot-1", targetBotId: "bot-2", status: "approved" },
    });
    const result = await connectAgent(approved, run, sender, { phone: "+15552222222" });
    expect(result).toEqual(expect.objectContaining({ ok: true, status: "approved" }));
    expect(approved.prisma.agentConnection.create).not.toHaveBeenCalled();
  });
});

describe("respondAgentConnection", () => {
  it("approves a pending connection addressed to the current bot", async () => {
    const deps = createDeps({
      pendingConnection: {
        id: "ac-1",
        requesterBotId: "bot-2",
        targetBotId: "bot-1",
        status: "pending",
      },
    });
    const result = await respondAgentConnection(deps, run, sender, { accept: true });

    expect(result).toEqual(expect.objectContaining({ ok: true, status: "approved" }));
    expect(deps.prisma.agentConnection.update).toHaveBeenCalledWith({
      where: { id: "ac-1" },
      data: { status: "approved" },
    });
  });

  it("fails when nothing is pending", async () => {
    const deps = createDeps();
    const result = await respondAgentConnection(deps, run, sender, { accept: false });
    expect(result).toEqual(expect.objectContaining({ ok: false }));
  });
});

describe("messageConnectedAgent", () => {
  it("delivers across workspaces over an approved connection", async () => {
    const deps = createDeps({
      connection: { id: "ac-1", requesterBotId: "bot-1", targetBotId: "bot-2", status: "approved" },
    });
    const result = await messageConnectedAgent(deps, run, sender, {
      phone: "+15552222222",
      message: "results are in",
      deliveryKey: "exec-9",
    });

    expect(result).toEqual(expect.objectContaining({ ok: true, botId: "bot-2" }));
    const inbound = deps.txCalls.messageCreate[0] as Record<string, unknown>;
    expect(inbound.threadId).toBe("thread-2");
    expect(inbound.role).toBe("user");
    expect(inbound.blocks).toEqual([
      {
        kind: "bot_message_received",
        fromBotId: "bot-1",
        fromBotName: "Assistant",
        text: "results are in",
        hop: 1,
      },
    ]);
    const wake = deps.txCalls.runCreate[0] as Record<string, unknown>;
    expect(wake).toEqual(
      expect.objectContaining({
        workspaceId: "ws-2",
        userId: "user-2",
        botId: "bot-2",
        trigger: "bot_message",
      }),
    );
    expect(deps.enqueue).toHaveBeenCalled();
  });

  it("refuses without an approved connection", async () => {
    const deps = createDeps();
    const result = await messageConnectedAgent(deps, run, sender, {
      phone: "+15552222222",
      message: "hello?",
    });
    expect(result).toEqual(
      expect.objectContaining({ ok: false, error: expect.stringMatching(/connection/i) }),
    );
    expect(deps.txCalls.messageCreate).toHaveLength(0);
  });

  it("refuses when the hop budget is exhausted", async () => {
    const deps = createDeps({
      connection: { id: "ac-1", requesterBotId: "bot-1", targetBotId: "bot-2", status: "approved" },
      sourceHop: 6,
    });
    const result = await messageConnectedAgent(
      deps,
      { ...run, sourceMessageId: "msg-src" },
      sender,
      { phone: "+15552222222", message: "again" },
    );
    expect(result).toEqual(expect.objectContaining({ ok: false, error: expect.stringMatching(/limit/i) }));
  });
});
