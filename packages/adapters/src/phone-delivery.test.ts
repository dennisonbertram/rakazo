import type { AdapterContext, MessagingProvider } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  applyPhoneOutboundStatus,
  deliverPhoneOutbound,
  PHONE_DM_OUTBOUND_CAP,
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

  it("skips runs triggered by channel messages", async () => {
    const deps = createDeps({
      run: {
        ...phoneRun,
        sourceMessage: {
          blocks: [{ kind: "phone_channel_message", channelId: "ch-1", text: "group hi" }],
        },
      },
    });
    await deliverPhoneOutbound(deps, { runId: "run-1" }, context);

    expect(deps.sendDirect).not.toHaveBeenCalled();
    expect(deps.prisma.phoneOutbound.createMany).not.toHaveBeenCalled();
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
