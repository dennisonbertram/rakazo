// @vitest-environment jsdom

import type { FinanceOverview, FinanceTransactionOutput, SpendTotals } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const text = vi.hoisted(
  () =>
    (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce((out, part, i) => out + part + String(values[i] ?? ""), ""),
);
vi.mock("@lingui/core/macro", () => ({
  t: text,
  plural: (n: number, forms: { one: string; other: string }) =>
    (n === 1 ? forms.one : forms.other).replace("#", String(n)),
}));
vi.mock("@lingui/react/macro", () => ({
  useLingui: () => ({ t: text, i18n: { locale: "en" } }),
  Trans: ({ children }: { children: ReactNode }) => children,
}));

const rpcMock = vi.hoisted(() => ({
  overview: vi.fn(),
  refresh: vi.fn(),
  vendor: vi.fn(),
  transaction: vi.fn(),
  receiptUrl: vi.fn(),
  connect: vi.fn(),
}));
vi.mock("../lib/rpc", () => ({ rpc: { finance: rpcMock } }));
vi.mock("../lib/finance-connect", () => ({ connectFinanceProvider: rpcMock.connect }));

import { FinancePage } from "./Finance";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const totals = (period: SpendTotals["period"], current: number, previous: number): SpendTotals => ({
  period,
  currentCents: current,
  previousCents: previous,
  changePct: previous ? ((current - previous) / previous) * 100 : null,
  start: "2026-10-01",
  end: "2026-10-14",
  previousStart: "2026-09-01",
  previousEnd: "2026-09-30",
});

const connectedOverview = (over: Partial<FinanceOverview> = {}): FinanceOverview => ({
  sources: [
    { provider: "mercury", serverId: "s1", status: "ok", lastSyncedAt: "2026-10-14T10:00:00.000Z" },
    { provider: "brex", serverId: null, status: "not_connected", lastSyncedAt: null },
  ],
  agent: null,
  cash: {
    cashCents: 5_000_000,
    checkingCents: 1_000_000,
    savingsCents: 0,
    treasuryCents: 4_000_000,
    cardOwedCents: null,
  },
  burn: { monthlyCents: 800_000, months: ["2026-07", "2026-08", "2026-09"] },
  runway: { months: 6.25, runOutDate: "2027-04-20" },
  spendTotals: {
    week: totals("week", 11_100, 50_000),
    month: totals("month", 1_800_000, 3_600_000),
    quarter: totals("quarter", 2_222_200, 9_000_000),
    year: totals("year", 7_777_700, 9_000_000),
  },
  monthlySeries: [],
  breakdown: {
    category: [{ key: "software", label: "Software", cents: 120_000 }],
    vendor: [{ key: "acme-hosting", label: "Acme Hosting", cents: 90_000 }],
  },
  upcoming: {
    items: [
      {
        key: "acme-hosting",
        kind: "recurring",
        name: "Acme Hosting",
        dates: ["2026-10-20", "2026-10-27"],
        amountCents: 50_000,
      },
    ],
    totalCents: 100_000,
  },
  subscriptions: {
    items: [
      {
        key: "acme-hosting",
        name: "Acme Hosting",
        monthlyCents: 50_000,
        trendCents: [40_000, 45_000, 50_000],
        lastChargeAt: "2026-10-01T00:00:00.000Z",
        overlapGroup: null,
        paidWith: [{ provider: "brex", kind: "card", name: "Card", lastFour: "4321" }],
      },
    ],
    totalMonthlyCents: 50_000,
  },
  treasuryYieldLastMonth: { month: "2026-09", netCents: 91_100 },
  lastSyncedAt: "2026-10-14T10:00:00.000Z",
  excludedNonUsdCount: 0,
  ...over,
});

const emptyOverview = (): FinanceOverview =>
  connectedOverview({
    sources: [
      { provider: "mercury", serverId: null, status: "not_connected", lastSyncedAt: null },
      { provider: "brex", serverId: null, status: "not_connected", lastSyncedAt: null },
    ],
    lastSyncedAt: null,
  });

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function show(path: string, onAskAgent?: () => void) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <FinancePage onAskAgent={onAskAgent} />
      </MemoryRouter>,
    );
  });
}
const flush = () => act(async () => {});
const button = (name: RegExp | string) =>
  [...container.querySelectorAll("button")].find((b) =>
    typeof name === "string"
      ? b.textContent === name
      : name.test(b.getAttribute("aria-label") ?? b.textContent ?? ""),
  );

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  rpcMock.refresh.mockResolvedValue({ ok: true });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.resetAllMocks();
});

it("shows Connect Mercury and Connect Brex when nothing is connected, and connects then syncs", async () => {
  rpcMock.overview.mockResolvedValueOnce(emptyOverview()).mockResolvedValue(connectedOverview());
  rpcMock.connect.mockResolvedValue("connected");
  await show("/app/finance");
  expect(button("Connect Brex")).toBeDefined();
  expect(container.textContent).not.toContain("Ask agent");

  await act(async () => button("Connect Mercury")?.click());
  await flush();

  expect(rpcMock.connect).toHaveBeenCalledWith("mercury", false);
  expect(rpcMock.refresh).toHaveBeenCalledTimes(1);
  // The dashboard is read again after the sync.
  expect(container.textContent).toContain("$50,000");
});

it("notes non-USD transactions only when some are left out", async () => {
  rpcMock.overview.mockResolvedValue(connectedOverview());
  await show("/app/finance");
  expect(container.textContent).not.toContain("non-USD");

  rpcMock.overview.mockResolvedValue(connectedOverview({ excludedNonUsdCount: 3 }));
  await act(async () => root.unmount());
  root = createRoot(container);
  await show("/app/finance");
  await flush();
  expect(container.textContent).toContain("3 non-USD not counted");
});

it("sends reconnect: true from the Reconnect chip", async () => {
  const base = connectedOverview();
  rpcMock.overview.mockResolvedValue({
    ...base,
    sources: [
      { provider: "mercury", serverId: "s1", status: "needs_reconnect", lastSyncedAt: null },
      ...base.sources.slice(1),
    ],
  });
  rpcMock.connect.mockResolvedValue("connected");
  await show("/app/finance");
  await flush();
  await act(async () => button(/Reconnect Mercury/)?.click());
  expect(rpcMock.connect).toHaveBeenCalledWith("mercury", true);
});

it("hides the comparison when the previous period is not fully synced", async () => {
  const base = connectedOverview();
  rpcMock.overview.mockResolvedValue(
    connectedOverview({
      spendTotals: {
        ...base.spendTotals,
        month: { ...base.spendTotals.month, previousCents: null, changePct: null },
        year: { ...base.spendTotals.year, previousCents: null, changePct: null },
      },
    }),
  );
  await show("/app/finance");
  await flush();
  expect(container.textContent).not.toMatch(/vs \$[\d,]+ last month/);
  expect(container.textContent).not.toContain("vs previous");
});

it("reports a failed connect without leaving the empty state", async () => {
  rpcMock.overview.mockResolvedValue(emptyOverview());
  rpcMock.connect.mockRejectedValue(new Error("Could not reach the server"));
  await show("/app/finance");
  await act(async () => button("Connect Brex")?.click());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not reach");
  expect(button("Connect Brex")).toBeDefined();
});

it("shows the figures, syncs once, and lets the period chips change the spend number", async () => {
  rpcMock.overview.mockResolvedValue(connectedOverview());
  await show("/app/finance");
  await flush();

  expect(rpcMock.refresh).toHaveBeenCalledTimes(1);
  const text = container.textContent ?? "";
  expect(text).toContain("$50,000"); // cash
  expect(text).toContain("$8,000"); // burn
  expect(text).toContain("6.3 mo");
  expect(text).toContain("Until April 2027");
  expect(text).toContain("$18,000"); // spend this month, and the chips' default period
  expect(text).toContain("1 subscription");

  const total = () =>
    [...container.querySelectorAll('a[href^="/app/finance/spend"]')].map((a) => a.textContent);
  expect(total()).toContain("$18,000");

  const week = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "Week",
  );
  await act(async () => (week as HTMLElement).click());
  expect(total()).toContain("$111");
  expect(container.querySelector('a[href="/app/finance/spend?period=week"]')).not.toBeNull();
  expect(container.textContent).toContain("vs previous week");

  const year = [...container.querySelectorAll('[role="tab"]')].find(
    (tab) => tab.textContent === "Year",
  );
  await act(async () => (year as HTMLElement).click());
  expect(total()).toContain("$77,777");
});

it("switches the breakdown between category and vendor", async () => {
  rpcMock.overview.mockResolvedValue(connectedOverview());
  await show("/app/finance");
  await flush();
  expect(container.querySelector('a[href="/app/finance/category/software"]')).not.toBeNull();
  await act(async () => button("Vendor")?.click());
  expect(container.querySelector('a[href="/app/finance/vendor/acme-hosting"]')).not.toBeNull();
  expect(container.querySelector('a[href="/app/finance/category/software"]')).toBeNull();
});

it("puts the paid-with text on the subscription row and links the row to its vendor", async () => {
  rpcMock.overview.mockResolvedValue(connectedOverview());
  await show("/app/finance");
  await flush();
  const row = container.querySelector("tbody tr");
  expect(row?.querySelector('[role="tooltip"]')?.textContent).toBe("Brex ••4321");
  const link = row?.querySelector("a");
  expect(link?.getAttribute("href")).toBe("/app/finance/vendor/acme-hosting");
  expect(link?.getAttribute("aria-label")).toBe("Acme Hosting, paid with Brex ••4321");
});

it("offers Ask agent only while the panel is closed", async () => {
  rpcMock.overview.mockResolvedValue(connectedOverview());
  const ask = vi.fn();
  await show("/app/finance", ask);
  await flush();
  await act(async () => button("Ask agent")?.click());
  expect(ask).toHaveBeenCalledTimes(1);

  act(() => root.unmount());
  root = createRoot(container);
  await show("/app/finance", undefined);
  await flush();
  expect(button("Ask agent")).toBeUndefined();
});

it("refreshes on demand and shows a sync failure with a retry", async () => {
  rpcMock.overview.mockResolvedValue(connectedOverview());
  await show("/app/finance");
  await flush();
  rpcMock.refresh.mockRejectedValueOnce(new Error("Could not reach the server"));
  await act(async () => button(/^Refresh$/)?.click());
  await flush();
  expect(rpcMock.refresh).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not reach");
});

it("shows an error with Try again when the dashboard cannot load", async () => {
  rpcMock.overview.mockRejectedValueOnce(new Error("Could not reach the server"));
  rpcMock.overview.mockResolvedValue(connectedOverview());
  await show("/app/finance");
  await flush();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("Could not reach");
  await act(async () => button("Try again")?.click());
  await flush();
  expect(container.textContent).toContain("$50,000");
});

it("labels a vendor page, breadcrumb and back link", async () => {
  rpcMock.vendor.mockResolvedValue({
    key: "acme-hosting",
    name: "Acme Hosting",
    isSubscription: true,
    monthlyAvgCents: 50_000,
    changePct: 25,
    firstSeenAt: "2025-03-02T00:00:00.000Z",
    paidWith: [{ provider: "brex", kind: "card", name: "Card", lastFour: "4321" }],
    monthly: [],
    charges: [],
  });
  await show("/app/finance/vendor/acme-hosting");
  await flush();
  expect(rpcMock.vendor).toHaveBeenCalledWith({ key: "acme-hosting" });
  expect(container.querySelector("h1")?.textContent).toBe("Acme Hosting");
  expect(container.querySelector("nav")?.textContent).toContain("Subscriptions");
  expect(container.querySelector('a[href="/app/finance"]')?.textContent).toContain("Subscriptions");
  expect(container.textContent).toContain("↑ 25%");
  expect(container.textContent).toContain("Brex ••4321");
});

const spendTransaction = (hasReceipt: boolean): FinanceTransactionOutput => ({
  transaction: {
    id: "t1",
    provider: "brex",
    externalId: "e1",
    accountExternalId: "a1",
    postedAt: "2026-10-03T12:00:00.000Z",
    purchasedAt: "2026-10-02T12:00:00.000Z",
    amountCents: -4_200,
    currency: "USD",
    counterparty: "Acme Hosting",
    vendorKey: "acme-hosting",
    category: "Software",
    status: "posted",
    kind: "card",
    classification: "spend",
    cardLastFour: "4321",
    cardholder: "Sam Example",
    memo: "Pro plan",
    hasReceipt,
    dashboardUrl: "https://dashboard.example.test/expenses/e1",
  },
  vendorName: "Acme Hosting",
  account: null,
  vendorIsSubscription: true,
});

it("shows No receipt without an upload action when a charge has no receipt", async () => {
  rpcMock.transaction.mockResolvedValue(spendTransaction(false));
  await show("/app/finance/transaction/t1");
  await flush();
  expect(container.textContent).toContain("No receipt");
  expect(container.textContent).not.toContain("Upload");
  expect(rpcMock.receiptUrl).not.toHaveBeenCalled();
  // Subscription charges sit under the vendor in the breadcrumb.
  expect(container.querySelector('nav a[href="/app/finance/vendor/acme-hosting"]')).not.toBeNull();
  const external = container.querySelector('a[href="https://dashboard.example.test/expenses/e1"]');
  expect(external?.getAttribute("rel")).toContain("noopener");
});

it("lets a Mercury charge check for a receipt on demand and says No receipt when none exists", async () => {
  const data = spendTransaction(false);
  data.transaction.provider = "mercury";
  rpcMock.transaction.mockResolvedValue(data);
  rpcMock.receiptUrl.mockRejectedValue({ code: "NOT_FOUND" });
  await show("/app/finance/transaction/t1");
  await flush();
  expect(container.textContent).not.toContain("No receipt");
  expect(rpcMock.receiptUrl).not.toHaveBeenCalled();

  await act(async () => button("Check for receipt")?.click());
  await flush();
  expect(rpcMock.receiptUrl).toHaveBeenCalledWith({ transactionId: "t1" });
  expect(container.textContent).toContain("No receipt");
});

it("links a charge with a receipt to the receipt page, which fetches the link on demand", async () => {
  rpcMock.transaction.mockResolvedValue(spendTransaction(true));
  rpcMock.receiptUrl.mockResolvedValue({
    url: "https://files.example.test/r.png",
    mimeType: "image/png",
  });
  await show("/app/finance/transaction/t1");
  await flush();
  expect(container.querySelector('a[href="/app/finance/receipt/t1"]')).not.toBeNull();

  act(() => root.unmount());
  root = createRoot(container);
  await show("/app/finance/receipt/t1");
  await flush();
  expect(rpcMock.receiptUrl).toHaveBeenCalledWith({ transactionId: "t1" });
  expect(container.querySelector("img")?.getAttribute("src")).toBe(
    "https://files.example.test/r.png",
  );
  expect(container.querySelector("nav")?.textContent).toContain("Receipt");
});

it("does not render a non-https vendor link", async () => {
  const data = spendTransaction(false);
  data.transaction.dashboardUrl = "javascript:alert(1)";
  rpcMock.transaction.mockResolvedValue(data);
  await show("/app/finance/transaction/t1");
  await flush();
  expect(container.querySelector('a[href^="javascript"]')).toBeNull();
  expect(container.textContent).not.toContain("Open in Brex");
});

it("shows not found for an unknown Finance path", async () => {
  await show("/app/finance/nope");
  expect(container.querySelector("h1")?.textContent).toBe("Not found");
});
