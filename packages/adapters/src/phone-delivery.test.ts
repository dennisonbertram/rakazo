import type { AdapterContext, MessagingProvider } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  applyPhoneOutboundStatus,
  deliverPhoneOutbound,
  PHONE_DM_OUTBOUND_CAP,
  type PhoneDeliveryDeps,
} from "./phone-delivery.js";

const context: AdapterContext = {
  operationId: "op-1",
  traceId: "trace-1",
  workspaceId: "ws-1",
  userId: "user-1",
  signal: new AbortController().signal,
};

const identity = {
  id: "pi-1",
  phoneE164: "+15551234567",
  userId: "user-1",
  workspaceId: "ws-1",
  botId: "bot-1",
  outboundSinceInbound: 0,
};

const phoneRun = {
  id: "run-1",
  botId: "bot-1",
  trigger: "phone",
  sourceMessage: { blocks: [{ kind: "text", text: "hi" }] },
};

function createDeps(overrides: {
  run?: unknown;
  identity?: unknown;
  messages?: unknown[];
  outboundRows?: unknown[];
  existingOutbox?: unknown;
  sendError?: Error;
}) {
  const rows = [...(overrides.outboundRows ?? [])] as Array<Record<string, unknown>>;
  const sendDirect = vi.fn(async () => ({ handle: "handle-out-1" }));
  const sendGroup = vi.fn(async () => ({ handle: "handle-group-1" }));
  if (overrides.sendError) {
    sendDirect.mockRejectedValue(overrides.sendError);
    sendGroup.mockRejectedValue(overrides.sendError);
  }
  const messaging = {
    describe: () => ({
      id: "sendblue",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { direct: true, groups: true },
    }),
    sendDirect,
    sendGroup,
    getGroup: vi.fn(),
  } as unknown as MessagingProvider;
  const prisma = {
    run: { findUnique: vi.fn(async () => overrides.run ?? phoneRun) },
    message: {
      findMany: vi.fn(
        async () =>
          overrides.messages ?? [
            { id: "m-1", blocks: [{ kind: "text", text: "Hello from your bot" }] },
          ],
      ),
    },
    phoneIdentity: {
      findUnique: vi.fn(async () =>
        overrides.identity === null ? null : (overrides.identity ?? identity),
      ),
      update: vi.fn(async () => identity),
    },
    phoneOutbound: {
      findUnique: vi.fn(async () => overrides.existingOutbox ?? null),
      findMany: vi.fn(async () => rows.filter((row) => row.status === "pending")),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const item of data) {
          // Simulates skipDuplicates against the idempotencyKey unique key.
          const duplicate =
            rows.some((row) => row.idempotencyKey === item.idempotencyKey) ||
            (overrides.existingOutbox as { idempotencyKey?: string } | null)?.idempotencyKey ===
              item.idempotencyKey;
          if (duplicate) continue;
          rows.push({ id: `out-${rows.length + 1}`, status: "pending", ...item });
          count += 1;
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: unknown }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id?: string; providerHandle?: string; status?: string };
          data: Record<string, unknown>;
        }) => {
          let count = 0;
          for (const row of rows) {
            if (where.id && row.id !== where.id) continue;
            if (where.providerHandle && row.providerHandle !== where.providerHandle) continue;
            if (where.status && row.status !== where.status) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
  };
  return {
    prisma: prisma as unknown as PrismaClient & typeof prisma,
    messaging,
    events: {
      sendUserMessage: vi.fn(),
      notify: vi.fn(async () => undefined),
    } as unknown as PhoneDeliveryDeps["events"],
    jobs: { enqueue: vi.fn(async () => undefined) },
    sendDirect,
    sendGroup,
    rows,
  };
}

describe("deliverPhoneOutbound", () => {
  it("mirrors a phone DM run's bot text to the identity's number", async () => {
    const deps = createDeps({});
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.sendDirect).toHaveBeenCalledWith(
      { to: "+15551234567", body: "Hello from your bot" },
      context,
    );
    expect(deps.rows).toEqual([
      expect.objectContaining({
        idempotencyKey: "msg:m-1",
        kind: "dm",
        toNumber: "+15551234567",
        status: "sent",
        providerHandle: "handle-out-1",
        sourceMessageId: "m-1",
      }),
    ]);
    expect(deps.prisma.phoneIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { outboundSinceInbound: { increment: 1 } } }),
    );
  });

  it("does not mirror a message that already has an outbox row", async () => {
    const deps = createDeps({
      existingOutbox: { id: "out-1", idempotencyKey: "msg:m-1", status: "sent" },
    });
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.rows).toHaveLength(0);
    expect(deps.sendDirect).not.toHaveBeenCalled();
  });

  it("ignores non-phone runs and runs without a phone identity", async () => {
    const notPhone = createDeps({ run: { ...phoneRun, trigger: "user" } });
    await deliverPhoneOutbound(notPhone, { runId: "run-1" }, context);
    expect(notPhone.sendDirect).not.toHaveBeenCalled();

    const noIdentity = createDeps({ identity: null });
    await deliverPhoneOutbound(noIdentity, { runId: "run-1" }, context);
    expect(noIdentity.sendDirect).not.toHaveBeenCalled();
  });

  it("holds DM sends at the consecutive-outbound cap", async () => {
    const deps = createDeps({
      identity: { ...identity, outboundSinceInbound: PHONE_DM_OUTBOUND_CAP },
    });
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.sendDirect).not.toHaveBeenCalled();
    expect(deps.rows).toEqual([expect.objectContaining({ kind: "dm", status: "pending" })]);
  });

  it("marks rows failed when the provider send throws", async () => {
    const deps = createDeps({ sendError: new Error("SendBlue 500") });
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.rows).toEqual([expect.objectContaining({ kind: "dm", status: "failed" })]);
    expect(deps.rows[0]!.providerHandle ?? null).toBeNull();
  });

  it("drains leftover pending rows without a run id", async () => {
    const deps = createDeps({
      run: null,
      outboundRows: [
        {
          id: "out-9",
          idempotencyKey: "invite:ch-1:+15551234567",
          kind: "dm",
          toNumber: "+15551234567",
          body: "pending earlier",
          status: "pending",
          providerHandle: null,
        },
      ],
    });
    await deliverPhoneOutbound(deps, {}, context);

    expect(deps.sendDirect).toHaveBeenCalledWith(
      { to: "+15551234567", body: "pending earlier" },
      context,
    );
    expect(deps.rows[0]).toEqual(expect.objectContaining({ status: "sent" }));
  });

  it("claims a row before sending so concurrent drains cannot double-send", async () => {
    const deps = createDeps({});
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    const calls = deps.prisma.phoneOutbound.updateMany.mock.calls as Array<
      [{ where?: { status?: string } }]
    >;
    const claimIndex = calls.findIndex(([args]) => args.where?.status === "pending");
    expect(claimIndex).toBeGreaterThanOrEqual(0);
    expect(deps.prisma.phoneOutbound.updateMany.mock.invocationCallOrder[claimIndex]!).toBeLessThan(
      deps.sendDirect.mock.invocationCallOrder[0]!,
    );
  });

  it("skips the send when another drain won the claim", async () => {
    const deps = createDeps({});
    deps.prisma.phoneOutbound.updateMany = vi.fn(async () => ({
      count: 0,
    })) as unknown as typeof deps.prisma.phoneOutbound.updateMany;
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.sendDirect).not.toHaveBeenCalled();
  });

  it("fails malformed rows instead of re-scanning them forever", async () => {
    const deps = createDeps({
      run: null,
      outboundRows: [
        {
          id: "out-bad",
          idempotencyKey: "broken:1",
          kind: "dm",
          toNumber: null,
          body: "nowhere to go",
          status: "pending",
          providerHandle: null,
        },
      ],
    });
    await deliverPhoneOutbound(deps, {}, context);

    expect(deps.sendDirect).not.toHaveBeenCalled();
    expect(deps.rows[0]).toEqual(expect.objectContaining({ status: "failed" }));
  });
});

describe("applyPhoneOutboundStatus", () => {
  it("maps terminal statuses onto outbox rows by handle", async () => {
    const deps = createDeps({});
    await applyPhoneOutboundStatus(deps.prisma, { type: "status", handle: "h-1", status: "ERROR" });
    expect(deps.prisma.phoneOutbound.updateMany).toHaveBeenCalledWith({
      where: { providerHandle: "h-1" },
      data: { status: "failed" },
    });

    await applyPhoneOutboundStatus(deps.prisma, {
      type: "status",
      handle: "h-2",
      status: "DELIVERED",
    });
    expect(deps.prisma.phoneOutbound.updateMany).toHaveBeenCalledWith({
      where: { providerHandle: "h-2" },
      data: { status: "sent" },
    });

    await applyPhoneOutboundStatus(deps.prisma, {
      type: "status",
      handle: "h-3",
      status: "QUEUED",
    });
    expect(deps.prisma.phoneOutbound.updateMany).toHaveBeenCalledTimes(2);
  });
});

function createChannelDeps(
  overrides: {
    text?: string;
    sourceHop?: number;
    peerBotName?: string | null;
    messages?: unknown[];
  } = {},
) {
  const text = overrides.text ?? "found it";
  const channelRun = {
    id: "run-1",
    botId: "bot-1",
    trigger: "phone",
    sourceMessage: {
      blocks: [
        {
          kind: "phone_channel_message",
          channelId: "ch-1",
          fromNumber: "+15551111111",
          fromLabel: "Alice",
          text: "group hi",
          hop: overrides.sourceHop ?? 0,
        },
      ],
    },
  };
  const posterIdentity = {
    id: "pi-1",
    phoneE164: "+15551111111",
    userId: "user-1",
    workspaceId: "ws-1",
    botId: "bot-1",
    outboundSinceInbound: 0,
  };
  const peerIdentity = {
    id: "pi-2",
    phoneE164: "+15553333333",
    userId: "user-2",
    workspaceId: "ws-2",
    botId: "bot-2",
    outboundSinceInbound: 0,
  };
  const rows: Array<Record<string, unknown>> = [];
  const contextMessages: Array<Record<string, unknown>> = [];
  const sendGroup = vi.fn(async () => ({ handle: "handle-group-1" }));
  const sendUserMessage = vi.fn(async () => ({ messageId: "msg-wake", runId: "run-wake", seq: 4 }));
  const notify = vi.fn(async () => undefined);
  const enqueue = vi.fn(async () => undefined);
  const peerBotName = overrides.peerBotName === undefined ? "Helper" : overrides.peerBotName;
  const txMock = {
    thread: { update: vi.fn(async () => ({ nextMessageSeq: 5, nextEventSeq: 10 })) },
    message: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const message = { id: `ctx-${contextMessages.length + 1}`, seq: 4, ...data };
        contextMessages.push(message);
        return message;
      }),
    },
    run: { findUnique: vi.fn(async () => null) },
    event: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "evt-1",
        ...data,
      })),
    },
  };
  const prisma = {
    run: { findUnique: vi.fn(async () => channelRun) },
    message: {
      findMany: vi.fn(
        async () => overrides.messages ?? [{ id: "m-1", blocks: [{ kind: "text", text }] }],
      ),
      findUnique: vi.fn(async () => null),
    },
    phoneIdentity: {
      findUnique: vi.fn(
        async ({ where }: { where: { botId?: string; id?: string; phoneE164?: string } }) => {
          if (where.botId === "bot-1" || where.id === "pi-1") return posterIdentity;
          if (where.botId === "bot-2" || where.id === "pi-2") return peerIdentity;
          return null;
        },
      ),
      update: vi.fn(async () => posterIdentity),
    },
    phoneChannel: {
      findUnique: vi.fn(async () => ({
        id: "ch-1",
        providerGroupId: "grp-1",
        name: "Family",
        introPostedAt: null,
      })),
    },
    phoneChannelMember: {
      findMany: vi.fn(async () => [
        {
          id: "pm-2",
          channelId: "ch-1",
          phoneE164: "+15553333333",
          identityId: "pi-2",
          status: "approved",
        },
      ]),
    },
    phoneOutbound: {
      findMany: vi.fn(async () => rows.filter((row) => row.status === "pending")),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        for (const item of data)
          rows.push({ id: `out-${rows.length + 1}`, status: "pending", ...item });
        return { count: data.length };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: unknown }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id?: string; status?: string }; data: unknown }) => {
          let count = 0;
          for (const row of rows) {
            if (where.id && row.id !== where.id) continue;
            if (where.status && row.status !== where.status) continue;
            Object.assign(row, data);
            count += 1;
          }
          return { count };
        },
      ),
    },
    user: { findUnique: vi.fn(async () => ({ id: "user-1", name: "Alice Owner" })) },
    bot: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "bot-1"
          ? { id: "bot-1", name: "Assistant" }
          : peerBotName
            ? { id: "bot-2", name: peerBotName }
            : null,
      ),
    },
    thread: { findFirst: vi.fn(async () => ({ id: "thread-2" })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)),
  };
  const messaging = {
    describe: () => ({
      id: "sendblue",
      contractVersion: "1",
      adapterVersion: "0.1.0",
      capabilities: { direct: true, groups: true },
    }),
    sendDirect: vi.fn(async () => ({ handle: "h-dm" })),
    sendGroup,
    getGroup: vi.fn(),
  } as unknown as MessagingProvider;
  return {
    prisma: prisma as unknown as PrismaClient & typeof prisma,
    messaging,
    events: { sendUserMessage, notify } as unknown as PhoneDeliveryDeps["events"],
    jobs: { enqueue },
    sendGroup,
    sendUserMessage,
    notify,
    enqueue,
    rows,
    contextMessages,
    txMock,
  };
}

describe("deliverPhoneOutbound channel runs", () => {
  it("posts the bot reply to the group with owner attribution and fans it out to peers", async () => {
    const deps = createChannelDeps();
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.sendGroup).toHaveBeenCalledWith(
      { groupId: "grp-1", body: "Alice's agent: found it" },
      context,
    );
    expect(deps.rows).toEqual([
      expect.objectContaining({
        idempotencyKey: "msg:m-1",
        kind: "group",
        providerGroupId: "grp-1",
        status: "sent",
      }),
    ]);
    // peer context: appended without a run, carrying the next hop
    expect(deps.contextMessages).toEqual([
      expect.objectContaining({
        threadId: "thread-2",
        role: "user",
        clientNonce: "phone-peer:m-1:bot-2",
        blocks: [
          {
            kind: "phone_channel_message",
            channelId: "ch-1",
            fromNumber: "+15551111111",
            fromLabel: "Alice's agent",
            text: "found it",
            hop: 1,
          },
        ],
      }),
    ]);
    expect(deps.sendUserMessage).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("wakes an @-mentioned peer bot with a run", async () => {
    const deps = createChannelDeps({ text: "@Helper what do you think?" });
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.sendUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-2",
        threadId: "thread-2",
        botId: "bot-2",
        trigger: "phone",
        clientNonce: "phone-peer:m-1:bot-2",
      }),
    );
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ name: "run.continue", payload: { runId: "run-wake" } }),
    );
    expect(deps.contextMessages).toHaveLength(0);
  });

  it("does not wake anyone when the hop budget is exhausted", async () => {
    const deps = createChannelDeps({ text: "@Helper again?", sourceHop: 6 });
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.sendUserMessage).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
    // still delivered as context, with the clamped hop recorded
    expect(deps.contextMessages[0]).toEqual(
      expect.objectContaining({ clientNonce: "phone-peer:m-1:bot-2" }),
    );
  });
});
