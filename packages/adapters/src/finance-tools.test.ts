import type { MessageBlock } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { selectBuiltinToolsForRun } from "./executor.js";
import {
  describeFinanceActivity,
  FINANCE_TOOL_NAMES,
  type FinanceToolDeps,
  financeToolFromTool,
  financeToolsAllowed,
  hasFinanceSource,
} from "./finance-tools.js";

const MINE = { spaceId: "space-1", userId: "user-1" };
const THEIRS = { spaceId: "space-1", userId: "user-2" };

type Row = Record<string, unknown> & { spaceId: string; userId: string };

const txn = (
  id: string,
  owner: { spaceId: string; userId: string },
  fields: Record<string, unknown>,
): Row => ({
  id,
  ...owner,
  provider: "mercury",
  externalId: id,
  accountExternalId: "chk",
  postedAt: new Date("2026-10-05T12:00:00Z"),
  purchasedAt: null,
  amountCents: -10_000n,
  currency: "USD",
  counterparty: "Vendor A",
  vendorKey: "vendor-a",
  category: "Software",
  status: "posted",
  kind: "externalTransfer",
  classification: "spend",
  cardLastFour: null,
  cardholder: null,
  memo: null,
  hasReceipt: false,
  dashboardUrl: null,
  ...fields,
});

const monthly = (id: string, month: string) =>
  txn(id, MINE, {
    postedAt: new Date(`${month}-10T12:00:00Z`),
    amountCents: -2_000n,
    counterparty: "Streamly",
    vendorKey: "streamly",
    category: "Entertainment",
  });

const transactions: Row[] = [
  txn("a", MINE, {}),
  txn("b", MINE, {
    provider: "brex",
    accountExternalId: "card",
    purchasedAt: new Date("2026-10-06T12:00:00Z"),
    amountCents: -5_000n,
    counterparty: "Vendor B",
    vendorKey: "vendor-b",
    category: "Travel",
    cardLastFour: "4242",
  }),
  // The Mercury payment of that Brex card bill: counting it too would count the spend twice.
  txn("pay", MINE, {
    amountCents: -5_000n,
    counterparty: "Brex",
    vendorKey: "brex",
    category: "Credit & Loan Payments",
    classification: "card_payment",
    postedAt: new Date("2026-10-07T12:00:00Z"),
  }),
  txn("x", THEIRS, { amountCents: -999_999n, counterparty: "Secret Corp", vendorKey: "secret" }),
  monthly("s1", "2026-07"),
  monthly("s2", "2026-08"),
  monthly("s3", "2026-09"),
];
const accounts: Row[] = [
  {
    id: "acc-1",
    ...MINE,
    provider: "mercury",
    externalId: "chk",
    name: "Checking",
    lastFour: "1111",
    kind: "checking",
    balanceCents: 1_000_000n,
    currency: "USD",
  },
  {
    id: "acc-2",
    ...THEIRS,
    provider: "mercury",
    externalId: "chk2",
    name: "Other",
    lastFour: null,
    kind: "checking",
    balanceCents: 9_000_000n,
    currency: "USD",
  },
];

function fakePrisma(rows: { txns: Row[]; accounts: Row[] }) {
  const table = (list: Row[]) => ({
    findMany: async ({ where }: { where: { spaceId: string; userId: string } }) =>
      list.filter((row) => row.spaceId === where.spaceId && row.userId === where.userId),
  });
  return {
    financeTransaction: table(rows.txns),
    financeAccount: table(rows.accounts),
    financeBill: table([]),
    financeSyncState: table([]),
  } as unknown as FinanceToolDeps["prisma"];
}

function setup(scope = MINE) {
  const published: MessageBlock[] = [];
  const deps: FinanceToolDeps = {
    prisma: fakePrisma({ txns: transactions, accounts }),
    scope,
    publish: async (blocks) => {
      published.push(...blocks);
    },
    now: () => new Date("2026-10-14T12:00:00Z"),
  };
  return { deps, published };
}

describe("finance_breakdown", () => {
  it("groups the owner's spend once, in dollars, and shows a card", async () => {
    const { deps, published } = setup();
    const result = (await financeToolFromTool("finance_breakdown", deps, {
      by: "vendor",
      range: "30d",
    })) as { total: number; rows: Array<{ name: string; amount: number; sharePct: number }> };
    // Vendor A 100 + Vendor B 50 + Streamly (none in the last 30 days). The card payment is left out.
    expect(result.total).toBe(150);
    expect(result.rows.map((row) => [row.name, row.amount, row.sharePct])).toEqual([
      ["Vendor A", 100, 66.7],
      ["Vendor B", 50, 33.3],
    ]);
    expect(published).toEqual([
      {
        kind: "finance",
        card: expect.objectContaining({ card: "breakdown", by: "vendor", totalCents: 15_000 }),
      },
    ]);
  });

  it("never returns another user's rows", async () => {
    const { deps } = setup(THEIRS);
    const result = await financeToolFromTool("finance_breakdown", deps, { by: "vendor" });
    expect(JSON.stringify(result)).toContain("Secret Corp");
    expect(JSON.stringify(result)).not.toContain("Vendor A");
    const mine = setup().deps;
    expect(
      JSON.stringify(await financeToolFromTool("finance_breakdown", mine, { by: "vendor" })),
    ).not.toContain("Secret");
  });

  it("limits rows and accepts an explicit range", async () => {
    const { deps } = setup();
    const result = (await financeToolFromTool("finance_breakdown", deps, {
      by: "category",
      range: { from: "2026-07-01", to: "2026-10-14" },
      limit: 1,
    })) as { rows: unknown[]; other: number; total: number };
    expect(result.rows).toHaveLength(1);
    expect(result.total).toBe(210);
    expect(result.other).toBe(110);
    expect(await financeToolFromTool("finance_breakdown", deps, { by: "x" })).toHaveProperty(
      "error",
    );
    expect(
      await financeToolFromTool("finance_breakdown", deps, { by: "vendor", range: "7d" }),
    ).toHaveProperty("error");
  });
});

describe("finance_transactions", () => {
  it("filters, counts everything that matched and trims rows", async () => {
    const { deps, published } = setup();
    const result = (await financeToolFromTool("finance_transactions", deps, {
      from: "2026-10-01",
      classification: "spend",
      limit: 1,
    })) as { count: number; total: number; transactions: Array<{ id: string; amount: number }> };
    expect(result.count).toBe(2);
    expect(result.total).toBe(-150);
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ id: "b", amount: -50 });
    expect(published[0]).toMatchObject({ card: { card: "transactions", count: 2 } });

    const big = (await financeToolFromTool("finance_transactions", deps, {
      vendor: "vendor a",
      minAmount: 500,
    })) as { count: number };
    expect(big.count).toBe(0);
  });
});

describe("finance_overview", () => {
  it("reports cash, burn and spend with the same metrics as the dashboard", async () => {
    const { deps, published } = setup();
    const result = (await financeToolFromTool("finance_overview", deps, {})) as {
      cash: { total: number };
      monthlyBurn: number;
      spend: Array<{ period: string; spend: number }>;
    };
    expect(result.cash.total).toBe(10_000);
    expect(result.monthlyBurn).toBe(20);
    expect(result.spend.find((s) => s.period === "month")?.spend).toBe(150);
    expect(published[0]).toMatchObject({ card: { card: "overview", cashCents: 1_000_000 } });
  });
});

describe("finance_recurring", () => {
  it("lists subscriptions with monthly cost and what is coming", async () => {
    const { deps, published } = setup();
    const result = (await financeToolFromTool("finance_recurring", deps, {})) as {
      monthlyTotal: number;
      subscriptions: Array<{ name: string; monthly: number }>;
    };
    expect(result.subscriptions).toEqual([
      expect.objectContaining({ name: "Streamly", monthly: 20 }),
    ]);
    expect(result.monthlyTotal).toBe(20);
    expect(published[0]).toMatchObject({ card: { card: "recurring", monthlyCents: 2000 } });
  });
});

describe("offering the tools", () => {
  const offered = (financeEnabled: boolean) =>
    selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      pageBrowserAllowed: false,
      groupId: null,
      trigger: "message",
      semanticMemoryEnabled: false,
      messagingChannelRun: false,
      financeEnabled,
    })
      .map((tool) => tool.name)
      .filter((name) => FINANCE_TOOL_NAMES.has(name))
      .sort();

  it("offers them only when finance is enabled, and marks them read-only", () => {
    expect(offered(false)).toEqual([]);
    expect(offered(true)).toEqual([...FINANCE_TOOL_NAMES].sort());
    for (const tool of selectBuiltinToolsForRun({
      graphicalToolsAllowed: false,
      pageBrowserAllowed: false,
      groupId: null,
      trigger: "message",
      semanticMemoryEnabled: false,
      messagingChannelRun: false,
      financeEnabled: true,
    }).filter((t) => FINANCE_TOOL_NAMES.has(t.name))) {
      expect(tool.readOnly).toBe(true);
    }
  });

  it("is for the owner's own direct runs only", () => {
    const base = { hasProvider: true, groupId: null, runUserId: "u", botUserId: "u" };
    expect(financeToolsAllowed({ ...base, messagingChannelRun: false })).toBe(true);
    expect(financeToolsAllowed({ ...base, messagingChannelRun: true })).toBe(false);
    expect(financeToolsAllowed({ ...base, groupId: "g", messagingChannelRun: false })).toBe(false);
    expect(financeToolsAllowed({ ...base, runUserId: "someone", messagingChannelRun: false })).toBe(
      false,
    );
  });

  it("needs an enabled Mercury or Brex server of the owner", async () => {
    const servers = [
      { spaceId: "s", userId: "u", endpoint: "https://mcp.mercury.com/mcp" },
      { spaceId: "s", userId: "other", endpoint: "https://api.brex.com/mcp" },
      { spaceId: "s", userId: "v", endpoint: "https://example.com/mcp" },
    ];
    const prisma = {
      mcpServer: {
        findMany: async ({ where }: { where: { spaceId: string; userId: string } }) =>
          servers.filter((s) => s.spaceId === where.spaceId && s.userId === where.userId),
      },
    } as unknown as Parameters<typeof hasFinanceSource>[0];
    expect(await hasFinanceSource(prisma, { spaceId: "s", userId: "u" })).toBe(true);
    expect(await hasFinanceSource(prisma, { spaceId: "s", userId: "v" })).toBe(false);
    expect(await hasFinanceSource(prisma, { spaceId: "s", userId: "none" })).toBe(false);
  });
});

describe("activity labels", () => {
  it("describes each finance call in plain words", () => {
    expect(describeFinanceActivity("finance_breakdown", { by: "category", range: "90d" })).toBe(
      "Reading spend by category · last 90 days",
    );
    expect(describeFinanceActivity("finance_recurring", {})).toBe("Looking at subscriptions");
    expect(describeFinanceActivity("shell", {})).toBeNull();
  });
});
