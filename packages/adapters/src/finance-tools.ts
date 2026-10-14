import type {
  FinanceAccount,
  FinanceBill,
  FinanceCard,
  FinanceTransaction,
  MessageBlock,
} from "@rakazo/contracts";
import { FinanceProviderSchema, financeProviderForEndpoint } from "@rakazo/contracts";
import {
  breakdown,
  cashSummary,
  categorySlug,
  detectRecurring,
  earliestDay,
  monthlyBurn,
  runway,
  spendTotals,
  subscriptions,
  upcoming,
} from "@rakazo/core";
import type { Prisma, PrismaClient } from "@rakazo/db";
import { mailToolsAllowed } from "./mail-tools.js";

export const FINANCE_TOOL_NAMES = new Set([
  "finance_overview",
  "finance_breakdown",
  "finance_transactions",
  "finance_recurring",
]);

/** Same owner-only rule as the mail tools. */
export const financeToolsAllowed = mailToolsAllowed;

/** Drop the finance tools when the run may not use them. */
export function selectFinanceTools<T extends { name: string }>(
  tools: T[],
  financeEnabled: boolean,
): T[] {
  return financeEnabled ? tools : tools.filter((tool) => !FINANCE_TOOL_NAMES.has(tool.name));
}

type Scope = { spaceId: string; userId: string };

export type FinanceToolDeps = {
  prisma: Pick<
    PrismaClient,
    "financeAccount" | "financeTransaction" | "financeBill" | "financeSyncState"
  >;
  /** From the run (the bot owner), never from model input. */
  scope: Scope;
  /** Puts a preview card in the run's thread. Without it the tools still return data. */
  publish?: (blocks: MessageBlock[]) => Promise<unknown>;
  now?: () => Date;
};

/** True when the user has an enabled Mercury or Brex MCP server, the finance sources. */
export async function hasFinanceSource(
  prisma: Pick<PrismaClient, "mcpServer">,
  scope: Scope,
): Promise<boolean> {
  const servers = await prisma.mcpServer.findMany({
    where: { spaceId: scope.spaceId, userId: scope.userId, enabled: true },
    select: { endpoint: true },
  });
  return servers.some((server) => financeProviderForEndpoint(server.endpoint) !== null);
}

// ---- Row mapping (shared with the API's Finance pages) ----

export const toFinanceAccount = (row: Prisma.FinanceAccountGetPayload<object>): FinanceAccount => ({
  id: row.id,
  provider: FinanceProviderSchema.parse(row.provider),
  externalId: row.externalId,
  name: row.name,
  lastFour: row.lastFour,
  kind: row.kind as FinanceAccount["kind"],
  balanceCents: Number(row.balanceCents),
  currency: row.currency,
});

export const toFinanceTransaction = (
  row: Prisma.FinanceTransactionGetPayload<object>,
): FinanceTransaction => ({
  id: row.id,
  provider: FinanceProviderSchema.parse(row.provider),
  externalId: row.externalId,
  accountExternalId: row.accountExternalId,
  postedAt: row.postedAt.toISOString(),
  purchasedAt: row.purchasedAt?.toISOString() ?? null,
  amountCents: Number(row.amountCents),
  currency: row.currency,
  counterparty: row.counterparty,
  vendorKey: row.vendorKey,
  category: row.category,
  status: row.status as FinanceTransaction["status"],
  kind: row.kind,
  classification: row.classification as FinanceTransaction["classification"],
  cardLastFour: row.cardLastFour,
  cardholder: row.cardholder,
  memo: row.memo,
  hasReceipt: row.hasReceipt,
  dashboardUrl: row.dashboardUrl,
});

export const toFinanceBill = (row: Prisma.FinanceBillGetPayload<object>): FinanceBill => ({
  provider: FinanceProviderSchema.parse(row.provider),
  externalId: row.externalId,
  vendorName: row.vendorName,
  vendorKey: row.vendorKey,
  dueAt: row.dueAt.toISOString(),
  amountCents: Number(row.amountCents),
  status: row.status,
});

// ---- Helpers ----

const DAY_MS = 86_400_000;
const DEFAULT_ROWS = 10;
const MAX_ROWS = 50;
const DEFAULT_TXNS = 50;
const MAX_TXNS = 200;
const MAX_LIST = 30;
/** Rows are dropped from the end until the JSON fits, like the mail tools' result budget. */
const MAX_OUTPUT_CHARS = 20_000;

const dayOf = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (day: string, days: number) =>
  dayOf(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS));
const txnDay = (t: FinanceTransaction) => (t.purchasedAt ?? t.postedAt).slice(0, 10);
const dollars = (cents: number) => Math.round(cents) / 100;
const isDay = (value: unknown): value is string =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

async function load(deps: FinanceToolDeps) {
  const where = { spaceId: deps.scope.spaceId, userId: deps.scope.userId };
  const [accounts, txns] = await Promise.all([
    deps.prisma.financeAccount.findMany({ where }),
    deps.prisma.financeTransaction.findMany({ where, orderBy: { postedAt: "desc" } }),
  ]);
  return { accounts: accounts.map(toFinanceAccount), txns: txns.map(toFinanceTransaction) };
}

const nowOf = (deps: FinanceToolDeps) => deps.now?.() ?? new Date();

async function show(deps: FinanceToolDeps, card: FinanceCard) {
  // A card is a preview; the tool result already holds the data.
  await deps.publish?.([{ kind: "finance", card }]).catch(() => undefined);
}

/** Trims `rows` from the end until the result fits the output budget. */
function withinBudget<T extends Record<string, unknown>>(result: T, key: keyof T): T {
  const rows = result[key];
  if (!Array.isArray(rows)) return result;
  let kept: unknown[] = rows;
  while (kept.length > 0 && JSON.stringify({ ...result, [key]: kept }).length > MAX_OUTPUT_CHARS) {
    kept = kept.slice(0, Math.floor(kept.length * 0.8));
  }
  return kept.length === rows.length ? result : { ...result, [key]: kept, truncated: true };
}

type Range = { start: string; end: string; label: string };

/** "30d" | "90d" | "365d" or {from, to} (inclusive days). Ranges are half-open for the calculations. */
function parseRange(value: unknown, now: Date): Range | { error: string } {
  const today = dayOf(now);
  if (value === undefined || value === null) {
    return { start: addDays(today, -89), end: addDays(today, 1), label: "Last 90 days" };
  }
  if (value === "30d" || value === "90d" || value === "365d") {
    const days = Number.parseInt(value, 10);
    return { start: addDays(today, 1 - days), end: addDays(today, 1), label: `Last ${days} days` };
  }
  const { from, to } = (value ?? {}) as Record<string, unknown>;
  if (typeof value === "object" && isDay(from) && isDay(to) && from <= to) {
    return { start: from, end: addDays(to, 1), label: `${from} to ${to}` };
  }
  return { error: 'range must be "30d", "90d", "365d" or {from, to} as YYYY-MM-DD' };
}

// ---- Activity labels ----

/** A one-line description of a finance tool call for the live activity line, or null for other tools. */
export function describeFinanceActivity(
  name: string,
  args: Record<string, unknown>,
): string | null {
  const rangeText = (value: unknown) => {
    const range = parseRange(value, new Date());
    return "error" in range ? "" : ` · ${range.label.toLowerCase()}`;
  };
  if (name === "finance_overview") return "Looking at cash, burn and runway";
  if (name === "finance_breakdown") {
    return `Reading spend by ${args.by === "vendor" ? "vendor" : "category"}${rangeText(args.range)}`;
  }
  if (name === "finance_transactions") return "Looking through transactions";
  if (name === "finance_recurring") return "Looking at subscriptions";
  return null;
}

// ---- Tools ----

export async function financeToolFromTool(
  name: string,
  deps: FinanceToolDeps,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    if (name === "finance_overview") return await financeOverview(deps);
    if (name === "finance_breakdown") return await financeBreakdown(deps, args);
    if (name === "finance_transactions") return await financeTransactions(deps, args);
    if (name === "finance_recurring") return await financeRecurring(deps);
    return { error: `Unknown finance tool ${name}` };
  } catch {
    return { error: "Finance tool failed" };
  }
}

async function financeOverview(deps: FinanceToolDeps) {
  const now = nowOf(deps);
  const [{ accounts, txns }, states] = await Promise.all([
    load(deps),
    deps.prisma.financeSyncState.findMany({
      where: { spaceId: deps.scope.spaceId, userId: deps.scope.userId },
    }),
  ]);
  const cash = cashSummary(accounts);
  const burn = monthlyBurn(txns, now);
  const rw = runway(cash.cashCents, burn.monthlyCents, now);
  const since = earliestDay(txns);
  const totals = (["week", "month", "quarter", "year"] as const).map((period) => {
    const t = spendTotals(txns, period, now, since);
    return {
      period,
      from: t.start,
      spend: dollars(t.currentCents),
      previous: t.previousCents === null ? null : dollars(t.previousCents),
      changePct: t.changePct,
    };
  });
  const synced = states.map((state) => state.lastSyncedAt);
  const lastSyncedAt =
    synced.length > 0 && synced.every(Boolean)
      ? new Date(Math.min(...synced.map((d) => (d as Date).getTime()))).toISOString()
      : null;
  await show(deps, {
    card: "overview",
    cashCents: cash.cashCents,
    burnCents: burn.monthlyCents,
    runwayMonths: rw.months,
    monthSpendCents: spendTotals(txns, "month", now, since).currentCents,
  });
  return {
    asOf: dayOf(now),
    lastSyncedAt,
    cash: {
      total: dollars(cash.cashCents),
      checking: dollars(cash.checkingCents),
      savings: dollars(cash.savingsCents),
      treasury: dollars(cash.treasuryCents),
      cardOwed: cash.cardOwedCents === null ? null : dollars(cash.cardOwedCents),
    },
    monthlyBurn: dollars(burn.monthlyCents),
    burnMonths: burn.months,
    runwayMonths: rw.months,
    runOutDate: rw.runOutDate,
    spend: totals,
  };
}

async function financeBreakdown(deps: FinanceToolDeps, args: Record<string, unknown>) {
  const by = args.by === "vendor" ? "vendor" : args.by === "category" ? "category" : null;
  if (!by) return { error: 'by must be "category" or "vendor"' };
  const range = parseRange(args.range, nowOf(deps));
  if ("error" in range) return range;
  const limit = Math.min(
    MAX_ROWS,
    Math.max(1, typeof args.limit === "number" ? Math.floor(args.limit) : DEFAULT_ROWS),
  );
  const { txns } = await load(deps);
  const rows = breakdown(txns, by, { start: range.start, end: range.end });
  const totalCents = rows.reduce((sum, row) => sum + row.cents, 0);
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit).reduce((sum, row) => sum + row.cents, 0);
  await show(deps, {
    card: "breakdown",
    by,
    range: range.label,
    totalCents,
    rows: rows.slice(0, 5),
  });
  return withinBudget(
    {
      by,
      range: { from: range.start, to: addDays(range.end, -1), label: range.label },
      total: dollars(totalCents),
      rows: top.map((row) => ({
        name: row.label,
        key: row.key,
        amount: dollars(row.cents),
        sharePct: totalCents > 0 ? Math.round((row.cents / totalCents) * 1000) / 10 : 0,
      })),
      ...(rest > 0 ? { other: dollars(rest), otherRows: rows.length - limit } : {}),
    },
    "rows",
  );
}

async function financeTransactions(deps: FinanceToolDeps, args: Record<string, unknown>) {
  const from = isDay(args.from) ? args.from : undefined;
  const to = isDay(args.to) ? args.to : undefined;
  const vendor = typeof args.vendor === "string" ? args.vendor.trim().toLowerCase() : "";
  const category = typeof args.category === "string" ? args.category.trim().toLowerCase() : "";
  const minAmountCents =
    typeof args.minAmount === "number" ? Math.round(Math.abs(args.minAmount) * 100) : 0;
  const classification = typeof args.classification === "string" ? args.classification : undefined;
  const limit = Math.min(
    MAX_TXNS,
    Math.max(1, typeof args.limit === "number" ? Math.floor(args.limit) : DEFAULT_TXNS),
  );
  const { txns } = await load(deps);
  const matches = txns
    .filter((t) => {
      const day = txnDay(t);
      return (
        (!from || day >= from) &&
        (!to || day <= to) &&
        (!vendor ||
          t.counterparty.toLowerCase().includes(vendor) ||
          t.vendorKey.includes(vendor)) &&
        (!category ||
          categorySlug(t.category) === category ||
          (t.category ?? "uncategorized").toLowerCase().includes(category)) &&
        Math.abs(t.amountCents) >= minAmountCents &&
        (!classification || t.classification === classification)
      );
    })
    .sort((a, b) => txnDay(b).localeCompare(txnDay(a)) || a.id.localeCompare(b.id));
  const shown = matches.slice(0, limit);
  const totalCents = matches.reduce((sum, t) => sum + t.amountCents, 0);
  await show(deps, {
    card: "transactions",
    count: matches.length,
    totalCents,
    rows: shown.slice(0, 5).map((t) => ({
      id: t.id,
      day: txnDay(t),
      label: t.counterparty,
      cents: t.amountCents,
    })),
  });
  return withinBudget(
    {
      count: matches.length,
      total: dollars(totalCents),
      transactions: shown.map((t) => ({
        id: t.id,
        date: txnDay(t),
        vendor: t.counterparty,
        amount: dollars(t.amountCents),
        category: t.category,
        status: t.status,
        class: t.classification,
        ...(t.cardLastFour ? { card: t.cardLastFour } : {}),
      })),
    },
    "transactions",
  );
}

async function financeRecurring(deps: FinanceToolDeps) {
  const now = nowOf(deps);
  const [{ accounts, txns }, bills] = await Promise.all([
    load(deps),
    deps.prisma.financeBill.findMany({
      where: { spaceId: deps.scope.spaceId, userId: deps.scope.userId },
      orderBy: { dueAt: "asc" },
    }),
  ]);
  const recurring = detectRecurring(txns, now, accounts);
  const subs = subscriptions(recurring);
  const soon = upcoming(
    recurring,
    txns.filter((t) => t.status === "pending"),
    bills.map(toFinanceBill),
    now,
  );
  const byKey = new Map(recurring.map((r) => [r.key, r]));
  await show(deps, {
    card: "recurring",
    monthlyCents: subs.totalMonthlyCents,
    upcomingCents: soon.totalCents,
    rows: subs.items.slice(0, 5).map((s) => ({ key: s.key, label: s.name, cents: s.monthlyCents })),
  });
  return withinBudget(
    withinBudget(
      {
        monthlyTotal: dollars(subs.totalMonthlyCents),
        subscriptions: subs.items.slice(0, MAX_LIST).map((s) => ({
          name: s.name,
          key: s.key,
          monthly: dollars(s.monthlyCents),
          cadence: byKey.get(s.key)?.cadence,
          lastCharge: s.lastChargeAt.slice(0, 10),
          next: byKey.get(s.key)?.nextExpectedAt.slice(0, 10),
          ...(s.overlapGroup ? { overlap: s.overlapGroup } : {}),
        })),
        upcoming30Total: dollars(soon.totalCents),
        upcoming30: soon.items.slice(0, MAX_LIST).map((item) => ({
          name: item.name,
          kind: item.kind,
          dates: item.dates,
          amount: dollars(item.amountCents),
        })),
      },
      "subscriptions",
    ),
    "upcoming30",
  );
}
