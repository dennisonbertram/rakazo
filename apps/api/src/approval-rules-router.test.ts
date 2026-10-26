import { RPCHandler } from "@orpc/server/fetch";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

// Offline boundary: a fake Prisma client drives the real handlers and the real repos.getBot check.
const actor = {
  spaceId: "space-1",
  userId: "user-1",
  email: "user@rakazo.test",
  isDeploymentOwner: true,
} satisfies Actor;

function setup() {
  const bots = [
    { id: "bot-1", userId: "user-1", spaceId: "space-1", archivedAt: null },
    { id: "bot-other-user", userId: "user-2", spaceId: "space-1", archivedAt: null },
    { id: "bot-other-space", userId: "user-1", spaceId: "space-2", archivedAt: null },
  ];
  const rule = {
    findMany: vi.fn(async () => []),
    deleteMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(),
  };
  const prisma = {
    bot: {
      findFirst: vi.fn(async (args: { where: Record<string, unknown> }) => {
        const bot = bots.find((entry) =>
          Object.entries(args.where).every(
            ([key, value]) =>
              key === "archivedAt" || (entry as Record<string, unknown>)[key] === value,
          ),
        );
        return bot ? { ...bot, thread: null, computer: null } : null;
      }),
    },
    actionApprovalRule: rule,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ actionApprovalRule: rule })),
  };
  const handler = new RPCHandler(
    createRouter({
      prisma: prisma as unknown as PrismaClient,
      secrets: {},
      env: {
        defaultProvider: "fake",
        defaultModel: "fake-model",
        webOrigin: "http://127.0.0.1:5173",
        screenProxySecret: "fake-test-secret",
        sandboxProvider: "fake",
      },
      dataDir: "/tmp/rakazo-router-test",
    } as unknown as RouterDeps),
  );
  async function call(path: "table" | "setActionType", input: unknown) {
    const { response } = await handler.handle(
      new Request(`http://127.0.0.1/rpc/approvalRules/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      }),
      { prefix: "/rpc", context: { actor } },
    );
    if (!response) throw new Error("Procedure did not match");
    return response.status;
  }
  return { rule, call };
}

describe("approvalRules router", () => {
  it("rejects a bot of another user or space and a missing bot before touching rules", async () => {
    const { rule, call } = setup();
    for (const botId of ["bot-other-user", "bot-other-space", "missing"]) {
      expect(await call("table", { botId })).toBeGreaterThanOrEqual(400);
      expect(
        await call("setActionType", { botId, actionType: "send_email", effect: "block" }),
      ).toBeGreaterThanOrEqual(400);
    }
    expect(rule.findMany).not.toHaveBeenCalled();
    expect(rule.deleteMany).not.toHaveBeenCalled();
    expect(rule.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown action type or effect", async () => {
    const { rule, call } = setup();
    expect(await call("setActionType", { actionType: "nope", effect: "allow" })).toBe(400);
    expect(await call("setActionType", { actionType: "send_email", effect: "maybe" })).toBe(400);
    expect(rule.create).not.toHaveBeenCalled();
  });

  it("reads the table for the caller's own bot", async () => {
    const { call } = setup();
    expect(await call("table", { botId: "bot-1" })).toBe(200);
  });
});
