import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { BrexCardsControls } from "@rakazo/contracts";
import {
  BREX_CARDS_CONTROLS_DEFAULTS,
  BREX_CARDS_READ_TOOLS,
  BREX_CARDS_WRITE_TOOLS,
} from "@rakazo/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { createBrexClient } from "./client.js";
import { BrexApiEmulator } from "./emulator.js";
import type { BrexCardsStore } from "./server.js";
import { createBrexCardsServer } from "./server.js";

const TOKEN = "bxt_test_token_1234567890";
const NOW = new Date("2026-11-01T12:00:00Z");
const DEFAULT_CONTROLS: BrexCardsControls = {
  ...BREX_CARDS_CONTROLS_DEFAULTS,
  allowedDurations: [...BREX_CARDS_CONTROLS_DEFAULTS.allowedDurations],
};

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((fn) => fn()));
});

interface Options {
  controls?: Partial<BrexCardsControls>;
  maxPageSize?: number;
  /** The store refuses every reservation with this reason. */
  refuseReservation?: string;
  /** Replaces the network for these requests, to simulate a lost connection. */
  dropRequest?: (method: string, path: string) => boolean;
}

async function setup(options: Options = {}) {
  const emulator = new BrexApiEmulator({
    token: TOKEN,
    ...(options.maxPageSize ? { maxPageSize: options.maxPageSize } : {}),
  });
  const baseUrl = await emulator.start();
  const events: string[] = [];
  const settled: Array<{ id: string; status: string; cardId?: string }> = [];
  const reservations: string[] = [];
  const client = createBrexClient({
    token: TOKEN,
    baseUrl,
    sleep: async () => {},
    random: () => 0,
    fetch: async (url, init) => {
      const method = init?.method ?? "GET";
      const path = new URL(String(url)).pathname;
      events.push(`brex:${method} ${path}`);
      if (options.dropRequest?.(method, path)) throw new TypeError("connection lost");
      return fetch(url, init);
    },
  });
  const store: BrexCardsStore = {
    loadControls: async () => ({ ...DEFAULT_CONTROLS, ...options.controls }),
    reserveCard: async () => {
      events.push("store:reserve");
      if (options.refuseReservation) return { ok: false, reason: options.refuseReservation };
      const id = `res_${reservations.length + 1}`;
      reservations.push(id);
      return { ok: true, reservationId: id };
    },
    settleReservation: async (id, status, cardId) => {
      events.push(`store:settle:${status}`);
      settled.push({ id, status, ...(cardId ? { cardId } : {}) });
    },
    idempotencyKey: (meta) =>
      typeof meta?.idempotencyKey === "string" ? meta.idempotencyKey : undefined,
  };
  const server = createBrexCardsServer({ client, store, now: () => NOW });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const mcp = new Client({ name: "brex-test", version: "0.0.0" });
  await mcp.connect(clientTransport);
  cleanup.push(async () => {
    await mcp.close();
    await emulator.stop();
  });

  /** Calls a tool; a rejected call (bad arguments) is returned like any other refusal. */
  async function call(name: string, args: Record<string, unknown>, key: string | null = "eff-1") {
    try {
      const result = await mcp.callTool({
        name,
        arguments: args,
        ...(key ? { _meta: { idempotencyKey: key } } : {}),
      });
      const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
      return { isError: result.isError === true, text, json: safeJson(text) };
    } catch (error) {
      return { isError: true, text: String(error), json: undefined };
    }
  }
  const writes = () => emulator.requests.filter((r) => r.method !== "GET");
  return { emulator, mcp, call, events, settled, reservations, writes };
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

const ADA = { userId: "u_ada", name: "Ada Example" };
const FIGMA = { cardId: "card_figma", cardName: "Figma", lastFour: "4242" };
const createArgs = {
  cardName: "Notion",
  ownerUserId: "u_ada",
  ownerName: "Ada Example",
  amountCents: 25_000,
  duration: "MONTHLY",
};
const limitArgs = {
  name: "Design tools",
  amountCents: 50_000,
  period: "PER_MONTH",
  templateSpendLimitId: "sl_template",
  templateName: "Software template",
  members: [ADA],
};

describe("tool surface", () => {
  it("exposes the closed allowlist, marks reads read-only, and has no unlock, PAN or transfer tool", async () => {
    const { mcp } = await setup();
    const { tools } = await mcp.listTools();
    const names = tools.map((t) => t.name);
    for (const name of [...BREX_CARDS_READ_TOOLS, ...BREX_CARDS_WRITE_TOOLS])
      expect(names).toContain(name);
    expect(names.filter((n) => /unlock|pan|transfer|secure/i.test(n))).toEqual([]);
    for (const tool of tools) {
      const isRead = (BREX_CARDS_READ_TOOLS as readonly string[]).includes(tool.name);
      expect(tool.annotations?.readOnlyHint === true).toBe(isRead);
    }
  });
});

describe("create_vendor_card", () => {
  it("sends a VIRTUAL CARD with the caller's key, and reserves before the Brex call and settles after", async () => {
    const { emulator, call, events, settled } = await setup();
    const result = await call("create_vendor_card", createArgs);
    expect(result.isError).toBe(false);
    expect(result.json).toMatchObject({ name: "Notion", limitCents: 25_000, currency: "USD" });

    const post = emulator.requests.find((r) => r.method === "POST" && r.path === "/v2/cards");
    expect(post?.idempotencyKey).toBe("eff-1");
    expect(post?.body).toMatchObject({
      owner: { type: "USER", user_id: "u_ada" },
      card_name: "Notion",
      card_type: "VIRTUAL",
      limit_type: "CARD",
      spend_controls: {
        spend_limit: { amount: 25_000, currency: "USD" },
        spend_duration: "MONTHLY",
      },
    });
    const [reserve, create, settle] = [
      "store:reserve",
      "brex:POST /v2/cards",
      "store:settle:created",
    ].map((e) => events.indexOf(e));
    expect(reserve).toBeGreaterThanOrEqual(0);
    expect(reserve).toBeLessThan(create as number);
    expect(create).toBeLessThan(settle as number);
    expect(settled).toEqual([{ id: "res_1", status: "created", cardId: result.json.id }]);
  });

  const refusals: Array<
    [string, Partial<BrexCardsControls>, Record<string, unknown>, string | null]
  > = [
    ["amount over the new-card cap", {}, { amountCents: 200_000 }, "eff-1"],
    ["a duration the owner did not allow", { allowedDurations: ["ONE_TIME"] }, {}, "eff-1"],
    ["a ONE_TIME card without a lock date", {}, { duration: "ONE_TIME" }, "eff-1"],
    [
      "a ONE_TIME lock date beyond the limit",
      {},
      { duration: "ONE_TIME", lockAfterDate: "2027-03-01" },
      "eff-1",
    ],
    ["an owner whose name does not match", {}, { ownerName: "Ben Sample" }, "eff-1"],
    ["a missing idempotency key", {}, {}, null],
  ];
  it.each(refusals)(
    "refuses %s before any write or reservation",
    async (_label, controls, over, key) => {
      const { call, writes, events } = await setup({ controls });
      const result = await call("create_vendor_card", { ...createArgs, ...over }, key);
      expect(result.isError).toBe(true);
      expect(writes()).toEqual([]);
      expect(events).not.toContain("store:reserve");
    },
  );

  it("refuses without a Brex write when the store refuses the reservation (daily cap)", async () => {
    const { call, writes, events } = await setup({
      refuseReservation: "Daily card cap reached (5 in 24 hours)",
    });
    const result = await call("create_vendor_card", createArgs);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Daily card cap reached");
    expect(writes()).toEqual([]);
    expect(events.filter((e) => e.startsWith("store:settle"))).toEqual([]);
  });

  it("settles a definite Brex error as failed", async () => {
    const { emulator, call, settled } = await setup();
    emulator.failNext.push({ method: "POST", path: "/v2/cards", status: 400 });
    expect((await call("create_vendor_card", createArgs)).isError).toBe(true);
    expect(settled).toEqual([{ id: "res_1", status: "failed" }]);
  });

  it.each([
    [
      "a 5xx answer",
      (e: BrexApiEmulator) => e.failNext.push({ method: "POST", path: "/v2/cards", status: 502 }),
      undefined,
    ],
    [
      "an unreadable answer",
      (e: BrexApiEmulator) =>
        e.failNext.push({ method: "POST", path: "/v2/cards", status: 200, body: { nope: 1 } }),
      undefined,
    ],
    ["a lost connection", () => 0, (m: string, p: string) => m === "POST" && p === "/v2/cards"],
  ])(
    "settles %s as uncertain and tells the model to check before retrying",
    async (_label, arrange, drop) => {
      const { emulator, call, settled } = await setup(drop ? { dropRequest: drop } : {});
      arrange(emulator);
      const result = await call("create_vendor_card", createArgs);
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/list_cards/);
      expect(settled).toEqual([{ id: "res_1", status: "uncertain" }]);
    },
  );
});

describe("card writes name their target", () => {
  const wrong = [
    ["last four", { lastFour: "0000" }],
    ["name", { cardName: "Not Figma" }],
  ] as const;

  it.each(wrong)(
    "lock_card, terminate_card and update_card refuse a wrong %s before any write",
    async (_label, over) => {
      const { call, writes } = await setup();
      expect((await call("lock_card", { ...FIGMA, ...over, reason: "OTHER" })).isError).toBe(true);
      expect((await call("terminate_card", { ...FIGMA, ...over, reason: "OTHER" })).isError).toBe(
        true,
      );
      expect((await call("update_card", { ...FIGMA, ...over, amountCents: 1000 })).isError).toBe(
        true,
      );
      expect(writes()).toEqual([]);
    },
  );

  it("lock_card and terminate_card require a reason", async () => {
    const { call, writes } = await setup();
    expect((await call("lock_card", FIGMA)).isError).toBe(true);
    expect((await call("terminate_card", FIGMA)).isError).toBe(true);
    expect(writes()).toEqual([]);
  });

  it("locks and terminates a matching card with the reason", async () => {
    const { emulator, call } = await setup();
    expect((await call("lock_card", { ...FIGMA, reason: "CARD_LOST" })).json).toMatchObject({
      id: "card_figma",
      status: "LOCKED",
    });
    expect((await call("terminate_card", { ...FIGMA, reason: "FRAUD" })).json).toMatchObject({
      status: "TERMINATED",
    });
    const bodies = emulator.requests.filter((r) => r.method === "POST").map((r) => r.body);
    expect(bodies).toEqual([{ reason: "CARD_LOST" }, { reason: "FRAUD" }]);
  });
});

describe("update_card", () => {
  it("keeps every omitted field and sends the full resulting spend controls", async () => {
    const { emulator, call } = await setup();
    const result = await call("update_card", { ...FIGMA, amountCents: 70_000 });
    expect(result.isError).toBe(false);
    const put = emulator.requests.find((r) => r.method === "PUT");
    expect(put?.body).toEqual({
      spend_controls: {
        spend_limit: { amount: 70_000, currency: "USD" },
        spend_duration: "MONTHLY",
        lock_after_date: null,
        allowed_merchant_details: [{ name: "Figma" }],
        blocked_merchant_details: null,
      },
    });
  });

  it("clears the merchant list on explicit null", async () => {
    const { emulator, call } = await setup();
    await call("update_card", { ...FIGMA, allowedMerchants: null });
    const put = emulator.requests.find((r) => r.method === "PUT") as { body: any };
    expect(put.body.spend_controls.allowed_merchant_details).toBeNull();
    expect(put.body.spend_controls.spend_limit.amount).toBe(50_000);
  });

  it.each([
    ["a resulting amount over the cap", FIGMA, { amountCents: 600_000 }, /\$5,000\.00/],
    [
      "a non-USD card",
      { cardId: "card_eur", cardName: "Berlin tools", lastFour: "2222" },
      { amountCents: 1000 },
      /USD/,
    ],
    [
      "a USER-limit card",
      { cardId: "card_team", cardName: "Ada team card", lastFour: "1111" },
      { amountCents: 1000 },
      /update_spend_limit/,
    ],
  ])("refuses %s before any write", async (_label, target, patch, message) => {
    const { call, writes } = await setup();
    const result = await call("update_card", { ...target, ...patch });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(message);
    expect(writes()).toEqual([]);
  });
});

describe("create_spend_limit", () => {
  it("copies policy and visibility from the template and forces the safe settings", async () => {
    const { emulator, call } = await setup();
    const result = await call("create_spend_limit", limitArgs);
    expect(result.isError).toBe(false);
    const template = emulator.spendLimits.find((s) => s.id === "sl_template") as any;
    const post = emulator.requests.find(
      (r) => r.method === "POST" && r.path === "/v2/spend_limits",
    ) as { body: any; idempotencyKey: string };
    expect(post.idempotencyKey).toBe("eff-1");
    expect(post.body).toMatchObject({
      name: "Design tools",
      period_recurrence_type: "PER_MONTH",
      authorization_settings: {
        base_limit: { amount: 50_000, currency: "USD" },
        authorization_type: "HARD",
        rollover_refresh_rate: "OFF",
      },
      auto_create_limit_cards_setting: "DISABLED",
      auto_transfer_cards_setting: "DISABLED",
      expense_policy_id: template.expense_policy_id,
      expense_visibility: template.expense_visibility,
      authorization_visibility: template.authorization_visibility,
      limit_increase_setting: template.limit_increase_setting,
      spend_type: template.spend_type,
      member_user_ids: ["u_ada"],
    });
    expect(post.body.authorization_settings.limit_buffer_percentage ?? null).toBeNull();
    expect(template.expense_visibility).not.toBe("SHARED"); // the seed differs from a default, so a copy is observable
  });

  it.each([
    ["an unknown template", { templateSpendLimitId: "sl_nope" }, "eff-1"],
    ["a template name that does not match", { templateName: "Other" }, "eff-1"],
    [
      "a member whose name does not match",
      { members: [{ userId: "u_ada", name: "Ben Sample" }] },
      "eff-1",
    ],
    ["a base amount over the cap", { amountCents: 1_000_001 }, "eff-1"],
    ["a missing idempotency key", {}, null],
    ["no template at all", { templateSpendLimitId: undefined }, "eff-1"],
  ])("refuses %s before any write", async (_label, over, key) => {
    const { call, writes } = await setup();
    expect((await call("create_spend_limit", { ...limitArgs, ...over }, key)).isError).toBe(true);
    expect(writes()).toEqual([]);
  });
});

describe("update_spend_limit", () => {
  const TEMPLATE = { spendLimitId: "sl_template", spendLimitName: "Software template" };

  it("sends only the fields it was given", async () => {
    const { emulator, call } = await setup();
    expect((await call("update_spend_limit", { ...TEMPLATE, amountCents: 60_000 })).isError).toBe(
      false,
    );
    const put = emulator.requests.find((r) => r.method === "PUT") as {
      body: unknown;
      idempotencyKey: string;
    };
    expect(put.body).toEqual({
      authorization_settings: { base_limit: { amount: 60_000, currency: "USD" } },
    });
    expect(put.idempotencyKey).toBe("eff-1");
  });

  it("computes member ids from the current members, and archives", async () => {
    const { emulator, call } = await setup();
    await call("update_spend_limit", {
      ...TEMPLATE,
      addMembers: [{ userId: "u_cy", name: "Cy Demo" }],
      removeMembers: [ADA],
    });
    await call("update_spend_limit", { ...TEMPLATE, status: "ARCHIVED" });
    const bodies = emulator.requests.filter((r) => r.method === "PUT").map((r) => r.body);
    expect(bodies).toEqual([{ member_user_ids: ["u_cy"] }, { status: "ARCHIVED" }]);
  });

  it.each([
    ["a SOFT limit", { spendLimitId: "sl_soft", spendLimitName: "Soft travel" }],
    ["an auto-create (ALL_MEMBERS) limit", { spendLimitId: "sl_auto", spendLimitName: "Everyone" }],
    ["a buffered limit", { spendLimitId: "sl_buffered", spendLimitName: "Buffered limit" }],
  ])("refuses %s before any write", async (_label, target) => {
    const { call, writes } = await setup();
    const result = await call("update_spend_limit", { ...target, amountCents: 1000 });
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/Brex/);
    expect(writes()).toEqual([]);
  });

  it.each([
    ["a name mismatch", { spendLimitName: "Wrong" }, "eff-1"],
    ["a member name mismatch", { addMembers: [{ userId: "u_cy", name: "Wrong Name" }] }, "eff-1"],
    ["an amount over the base cap", { amountCents: 1_000_001 }, "eff-1"],
    ["a missing idempotency key", {}, null],
  ])("refuses %s before any write", async (_label, over, key) => {
    const { call, writes } = await setup();
    expect(
      (await call("update_spend_limit", { ...TEMPLATE, amountCents: 1000, ...over }, key)).isError,
    ).toBe(true);
    expect(writes()).toEqual([]);
  });

  it("rejects fields the narrow schema does not allow, so a safe limit cannot be made unsafe", async () => {
    const { call, writes } = await setup();
    for (const extra of [
      { authorizationType: "SOFT" },
      { bufferPercentage: 50 },
      { autoCreateLimitCards: "ALL_MEMBERS" },
      { rolloverRefreshRate: "NEVER" },
    ]) {
      expect(
        (await call("update_spend_limit", { ...TEMPLATE, amountCents: 1000, ...extra })).isError,
      ).toBe(true);
    }
    expect(writes()).toEqual([]);
  });
});

describe("reads", () => {
  it("list_card_transactions pages to the end, filters by card, and asks for expense ids", async () => {
    const { emulator, call } = await setup({ maxPageSize: 2 });
    const all = await call("list_card_transactions", {});
    expect(all.json.incomplete).toBe(false);
    expect(all.json.transactions).toHaveLength(emulator.transactions.length);
    expect(all.json.transactions[0]).toHaveProperty("expenseId");
    const pages = emulator.requests.filter((r) => r.path === "/v2/transactions/card/primary");
    expect(pages.length).toBeGreaterThan(2);
    expect(pages[0]?.query).toContain("expense_id");

    const one = await call("list_card_transactions", { cardId: "card_figma" });
    const expected = emulator.transactions.filter((t) => t.card_id === "card_figma");
    expect(one.json.transactions).toHaveLength(expected.length);
    expect(one.json.transactions.every((t: any) => t.cardId === "card_figma")).toBe(true);
  });

  it("list_card_transactions flags an incomplete result instead of failing, and says it lists settled transactions only", async () => {
    const { emulator, call, mcp } = await setup({ maxPageSize: 2 });
    emulator.failNext.push({ path: "/v2/transactions/card/primary", status: 500, after: 1 });
    const result = await call("list_card_transactions", {});
    expect(result.isError).toBe(false);
    expect(result.json.incomplete).toBe(true);
    expect(result.json.transactions).toHaveLength(2);
    const tool = (await mcp.listTools()).tools.find((t) => t.name === "list_card_transactions");
    expect(tool?.description).toMatch(/settled/i);
    expect(tool?.description).toMatch(/pending/i);
  });

  it("list_card_transactions still fails on an auth error", async () => {
    const { emulator, call } = await setup();
    emulator.failNext.push({ path: "/v2/transactions/card/primary", status: 401 });
    expect((await call("list_card_transactions", {})).isError).toBe(true);
  });

  it("list_expenses has no card filter and maps missingReceipt to the compliance filter", async () => {
    const { emulator, call, mcp } = await setup();
    const tool = (await mcp.listTools()).tools.find((t) => t.name === "list_expenses");
    expect(Object.keys(tool?.inputSchema.properties ?? {})).not.toContain("cardId");
    const all = await call("list_expenses", {});
    const missing = await call("list_expenses", { missingReceipt: true });
    const last = emulator.requests.at(-1);
    expect(last?.query).toContain("compliance_status");
    expect(missing.json.expenses.length).toBeGreaterThan(0);
    expect(missing.json.expenses.length).toBeLessThan(all.json.expenses.length);
  });

  it("list_cash_accounts leaves out account and routing numbers", async () => {
    const { emulator, call } = await setup();
    const result = await call("list_cash_accounts", {});
    const seeded = emulator.cashAccounts[0] as any;
    expect(result.json.accounts[0]).toMatchObject({ id: "ca_1", name: seeded.name, primary: true });
    expect(result.text).not.toContain(seeded.account_number);
    expect(result.text).not.toContain(seeded.routing_number);
  });

  it("returns cards, users, spend limits, trips and statements with Rakazo field names", async () => {
    const { call } = await setup();
    expect((await call("list_cards", {})).json.cards[0]).toMatchObject({
      id: expect.any(String),
      lastFour: expect.any(String),
    });
    expect((await call("get_card", { cardId: "card_figma" })).json).toMatchObject({
      name: "Figma",
      lastFour: "4242",
      duration: "MONTHLY",
      limitCents: 50_000,
    });
    expect((await call("list_users", {})).json.users).toContainEqual(
      expect.objectContaining({ id: "u_ada", name: "Ada Example" }),
    );
    expect((await call("list_spend_limits", {})).json.spendLimits.length).toBeGreaterThan(0);
    expect((await call("get_spend_limit", { spendLimitId: "sl_template" })).json).toMatchObject({
      id: "sl_template",
      name: "Software template",
      authorizationType: "HARD",
    });
    expect((await call("list_trips", {})).json.trips.length).toBeGreaterThan(0);
    const card = await call("list_statements", {});
    expect(card.json.statements[0]).toHaveProperty("startDate");
    const cash = await call("list_statements", { cashAccountId: "ca_1" });
    expect(cash.json.statements.length).toBeGreaterThan(0);
  });

  it("update_expense_memo writes the memo and a Brex 401 comes back as a token problem", async () => {
    const { emulator, call } = await setup();
    const expenseId = (emulator.expenses[0] as any).id;
    expect(
      (await call("update_expense_memo", { expenseId, memo: "Annual design software" })).isError,
    ).toBe(false);
    expect(emulator.requests.find((r) => r.method === "PUT")?.body).toEqual({
      memo: "Annual design software",
    });
    emulator.failNext.push({ path: "/v2/cards", status: 401 });
    const result = await call("list_cards", {});
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/token/i);
  });
});
