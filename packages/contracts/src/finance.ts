import * as z from "zod";
import { Id, IsoDate } from "./ids.js";

/** The one place the Finance agent's spawn key is built. */
export const financeAgentSpawnKey = (userId: string) => `finance-agent:${userId}`;

export const isFinanceAgentSpawnKey = (spawnKey: string | null | undefined) =>
  Boolean(spawnKey?.startsWith(financeAgentSpawnKey("")));

export const FinanceProviderSchema = z.enum(["mercury", "brex"]);
export type FinanceProvider = z.infer<typeof FinanceProviderSchema>;

/** The vendors' official remote MCP servers. A server counts as a finance source by its endpoint. */
export const FINANCE_MCP_ENDPOINTS = {
  mercury: "https://mcp.mercury.com/mcp",
  brex: "https://api.brex.com/mcp",
} as const satisfies Record<FinanceProvider, string>;

/** Which finance provider an MCP server endpoint belongs to, matched by https host; null for any other. */
export function financeProviderForEndpoint(
  endpoint: string | null | undefined,
): FinanceProvider | null {
  if (!endpoint) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  for (const provider of FinanceProviderSchema.options) {
    if (new URL(FINANCE_MCP_ENDPOINTS[provider]).host === url.host) return provider;
  }
  return null;
}

/**
 * The read-only tools each provider's agent assignment (BotMcpServer.allowedTools) may use, and the
 * only ones sync calls. Write tools (payments, transfers, card changes, memo edits, receipt uploads)
 * are never listed. Mercury's getCashflowSummary is left out because it counts Treasury transfers as flows.
 */
export const FINANCE_READ_TOOLS = {
  mercury: [
    "getAccounts",
    "getAccount",
    "getAttachment",
    "getCurrentDate",
    "getTransaction",
    "getTransactionById",
    "getTreasury",
    "getTreasuryTransactions",
    "listCategories",
    "listCredit",
    "listMerchants",
    "listTransactions",
  ],
  brex: [
    "list_business_accounts",
    "get_business_account",
    "list_expenses",
    "get_expense_by_id",
    "query_expense_analytics",
    "list_bills",
    "get_bill_by_id",
    "list_banking_transactions",
    "get_banking_transaction",
    "list_cards",
    "get_card_by_id",
    "list_vendors",
    "get_vendor_by_id",
    "list_expense_categories",
    "list_spend_limits",
  ],
} as const satisfies Record<FinanceProvider, readonly string[]>;

/** Money is whole cents in a JS number (safe to about 90 trillion dollars). */
const Cents = z.number().int();
/** YYYY-MM */
const MonthId = z.string().regex(/^\d{4}-\d{2}$/);
/** YYYY-MM-DD */
const DayId = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ---- Normalized records (what sync stores and the pure calculations read) ----

export const FinanceAccountKindSchema = z.enum(["checking", "savings", "treasury", "card"]);

/** For a `card` account, `balanceCents` is the balance owed (positive) and is not cash. */
export const FinanceAccountSchema = z.object({
  id: Id,
  provider: FinanceProviderSchema,
  externalId: z.string(),
  name: z.string(),
  lastFour: z.string().nullable(),
  kind: FinanceAccountKindSchema,
  balanceCents: Cents,
  currency: z.string(),
});

export const FinanceTxnStatusSchema = z.enum(["pending", "posted", "other"]);

/**
 * `internal_transfer`: Treasury moves and moves between the user's own accounts.
 * `card_payment`: a Mercury payment to Brex; excluded from spend while Brex is connected.
 */
export const FinanceClassificationSchema = z.enum([
  "spend",
  "revenue",
  "financing",
  "internal_transfer",
  "card_payment",
]);

export const FinanceTransactionSchema = z.object({
  id: Id,
  provider: FinanceProviderSchema,
  externalId: z.string(),
  accountExternalId: z.string(),
  /** ISO datetime. */
  postedAt: IsoDate,
  /** Brex: the purchase date, which is what spend is counted by. */
  purchasedAt: IsoDate.nullable(),
  /** Signed; negative means money out. */
  amountCents: Cents,
  currency: z.string(),
  counterparty: z.string(),
  /** Normalized counterparty (`vendorKey`), the grouping key for vendors, recurring charges and subscriptions. */
  vendorKey: z.string(),
  /** The provider's category as given; null when it has none. Shown as "Uncategorized". */
  category: z.string().nullable(),
  status: FinanceTxnStatusSchema,
  /** The provider's own kind or expense type, unchanged. */
  kind: z.string(),
  classification: FinanceClassificationSchema,
  cardLastFour: z.string().nullable(),
  cardholder: z.string().nullable(),
  memo: z.string().nullable(),
  hasReceipt: z.boolean(),
  dashboardUrl: z.string().nullable(),
});

export const TreasuryYieldMonthSchema = z.object({
  accountExternalId: z.string(),
  month: MonthId,
  dividendsCents: Cents,
  feeCents: Cents,
  netCents: Cents,
});

/** A Brex bill that is not yet paid. Replaced on every sync; used for Upcoming only. */
export const FinanceBillSchema = z.object({
  provider: FinanceProviderSchema,
  externalId: z.string(),
  vendorName: z.string(),
  vendorKey: z.string(),
  dueAt: IsoDate,
  amountCents: Cents,
  status: z.string(),
});

// ---- Calculation results (packages/core/src/finance/metrics.ts) ----

export const SpendPeriodSchema = z.enum(["week", "month", "quarter", "year"]);

export const CashSummarySchema = z.object({
  /** Mercury checking + savings + Treasury. */
  cashCents: Cents,
  checkingCents: Cents,
  savingsCents: Cents,
  treasuryCents: Cents,
  /** Brex balance owed; null when no card account is known. Not part of cash. */
  cardOwedCents: Cents.nullable(),
});

/** The current calendar period to date against the full previous one. */
export const SpendTotalsSchema = z.object({
  period: SpendPeriodSchema,
  currentCents: Cents,
  /** Null when the previous period starts before the earliest synced data, so its total is incomplete. */
  previousCents: Cents.nullable(),
  /** Percent change from previous to current; null when previous is 0 or null. */
  changePct: z.number().nullable(),
  start: DayId,
  end: DayId,
  previousStart: DayId,
  previousEnd: DayId,
});

export const MonthlyPointSchema = z.object({
  month: MonthId,
  outCents: Cents,
  revenueCents: Cents,
  financingCents: Cents,
  /** The current month, counted so far. */
  partial: z.boolean(),
});

export const MonthlyBurnSchema = z.object({
  /** Average of (cash out - revenue) over the last 3 full months; zero or negative when not burning. */
  monthlyCents: Cents,
  /** The months averaged, oldest first. */
  months: z.array(MonthId),
});

export const RunwaySchema = z.object({
  /** Null when burn is zero or negative. */
  months: z.number().nullable(),
  runOutDate: DayId.nullable(),
});

export const BreakdownModeSchema = z.enum(["category", "vendor", "account"]);

/** `key` is the category slug, the vendorKey or the account's externalId; `label` is for display. */
export const BreakdownRowSchema = z.object({ key: z.string(), label: z.string(), cents: Cents });

export const RecurrenceCadenceSchema = z.enum(["weekly", "biweekly", "monthly", "annual"]);

/** One entry per paying account or card. Brex entries are cards (kind "card"). */
export const PaidWithEntrySchema = z.object({
  provider: FinanceProviderSchema,
  kind: z.enum(["account", "card"]),
  name: z.string(),
  lastFour: z.string().nullable(),
});

export const RecurringChargeSchema = z.object({
  /** The vendorKey. */
  key: z.string(),
  name: z.string(),
  cadence: RecurrenceCadenceSchema,
  /** Median charge amount, positive. */
  amountCents: Cents,
  /** The amount normalized to one month. */
  monthlyCents: Cents,
  /** True for usage-based vendors whose charges vary by more than the similar-amount range. */
  variable: z.boolean(),
  chargeCount: z.number().int(),
  lastChargeAt: IsoDate,
  nextExpectedAt: IsoDate,
  /** Totals for the last 3 full calendar months, oldest first. */
  trendCents: z.array(Cents).length(3),
  /** `spend` for subscriptions and vendors; `card_payment` for the Brex card payment. */
  classification: z.enum(["spend", "card_payment"]),
  paidWith: z.array(PaidWithEntrySchema),
});

export const UpcomingItemSchema = z.object({
  /** A recurring key (vendorKey), a transaction id for `pending`, or a bill's externalId for `bill`. */
  key: z.string(),
  kind: z.enum(["recurring", "pending", "bill"]),
  name: z.string(),
  /** Each expected date inside the window, oldest first. */
  dates: z.array(DayId).min(1),
  /** Per occurrence, positive. */
  amountCents: Cents,
});

export const UpcomingSchema = z.object({
  items: z.array(UpcomingItemSchema),
  /** Sum of amount x occurrences. */
  totalCents: Cents,
});

export const SubscriptionSchema = z.object({
  key: z.string(),
  name: z.string(),
  monthlyCents: Cents,
  trendCents: z.array(Cents).length(3),
  lastChargeAt: IsoDate,
  /** Set when another subscription shares this vendor's group in the static overlap map. */
  overlapGroup: z.string().nullable(),
  paidWith: z.array(PaidWithEntrySchema),
});

export const SubscriptionsSchema = z.object({
  items: z.array(SubscriptionSchema),
  totalMonthlyCents: Cents,
});

export const BalancePointSchema = z.object({ month: MonthId, balanceCents: Cents });
export const MonthCentsSchema = z.object({ month: MonthId, cents: Cents });

// ---- Procedures ----

export const FinanceSourceSchema = z.object({
  provider: FinanceProviderSchema,
  /** The user's McpServer for this provider; null when none exists yet. */
  serverId: Id.nullable(),
  /** `needs_reconnect`: the vendor refused the login; `error`: the last sync failed. */
  status: z.enum(["not_connected", "ok", "needs_reconnect", "error"]),
  lastSyncedAt: IsoDate.nullable(),
});

export const FinanceOverviewSchema = z.object({
  /** Always both providers. Nothing connected means the empty state; every other field is then empty or zero. */
  sources: z.array(FinanceSourceSchema),
  /** The unarchived Finance agent, if any. */
  agent: z.object({ botId: Id, name: z.string() }).nullable(),
  cash: CashSummarySchema,
  /** False with no cash account (for example Brex only); a zero or negative balance is still shown. */
  hasCashAccounts: z.boolean(),
  burn: MonthlyBurnSchema,
  runway: RunwaySchema,
  spendTotals: z.object({
    week: SpendTotalsSchema,
    month: SpendTotalsSchema,
    quarter: SpendTotalsSchema,
    year: SpendTotalsSchema,
  }),
  /** 12 months, oldest first, the last one partial. */
  monthlySeries: z.array(MonthlyPointSchema),
  /** Last 90 days, largest first. */
  breakdown: z.object({
    category: z.array(BreakdownRowSchema),
    vendor: z.array(BreakdownRowSchema),
  }),
  upcoming: UpcomingSchema,
  subscriptions: SubscriptionsSchema,
  /** The previous calendar month's net Treasury yield; null without a Treasury account. */
  treasuryYieldLastMonth: z.object({ month: MonthId, netCents: Cents }).nullable(),
  /** Oldest successful sync across the connected sources; null means never synced. */
  lastSyncedAt: IsoDate.nullable(),
  /** Transactions left out of every total because they are not in USD (v1 is USD only). */
  excludedNonUsdCount: z.number().int().nonnegative(),
});

/** `redirectUri` is the web app's /mcp/oauth/callback, as for `mcp.oauth.begin`. */
export const FinanceConnectInputSchema = z.object({
  provider: FinanceProviderSchema,
  redirectUri: z.string().url(),
  /** Sign in again although a token is stored (the Reconnect chip). The server also does this itself when the source needs a reconnect. */
  reconnect: z.boolean().optional(),
});

/** Creates the provider's McpServer if the user has none, then starts OAuth on it. */
export const FinanceConnectOutputSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("authorization_required"),
    serverId: Id,
    sessionId: Id,
    authorizationUrl: z.string().url(),
  }),
  z.object({
    status: z.enum(["already_connected", "authorization_not_requested"]),
    serverId: Id,
  }),
]);

const AccountRowSchema = FinanceAccountSchema.extend({
  /** Treasury only: last 3 months' net yield, annualized, in percent. */
  annualYieldPct: z.number().nullable(),
});

export const FinanceAccountsOutputSchema = z.object({
  totalCashCents: Cents,
  cardOwedCents: Cents.nullable(),
  /** Total cash at each month end, reconstructed backwards from today's balances. 12 months. */
  history: z.array(BalancePointSchema),
  cash: z.array(AccountRowSchema),
  cards: z.array(AccountRowSchema),
});

export const FinanceAccountOutputSchema = z.object({
  account: AccountRowSchema,
  history: z.array(BalancePointSchema),
  /** Treasury only, newest first; [] otherwise. */
  treasuryYield: z.array(TreasuryYieldMonthSchema),
  /** Newest 20. */
  transactions: z.array(FinanceTransactionSchema),
});

export const FinanceBurnOutputSchema = z.object({
  monthlyCents: Cents,
  series: z.array(MonthlyPointSchema),
  /** The 3 months the burn averages, with their spend by category, largest first. */
  windowMonths: z.array(MonthId),
  whereItWent: z.array(BreakdownRowSchema),
  byAccount: z.array(z.object({ account: FinanceAccountSchema, cents: Cents })),
});

export const FinanceMonthOutputSchema = z.object({
  month: MonthId,
  partial: z.boolean(),
  outCents: Cents,
  /** Revenue + financing. */
  inCents: Cents,
  netCents: Cents,
  categories: z.array(BreakdownRowSchema),
  /** Internal transfers and card payments left out; newest first, at most 500. */
  transactions: z.array(FinanceTransactionSchema),
});

export const FinanceRunwayOutputSchema = z.object({
  cashCents: Cents,
  monthlyBurnCents: Cents,
  runway: RunwaySchema,
  /** Past total cash, 12 months. */
  history: z.array(BalancePointSchema),
  /** From this month forward, one point a month, until cash reaches zero or 24 months; [] when not burning. */
  projection: z.array(BalancePointSchema),
});

export const FinanceSpendInputSchema = z.object({
  period: SpendPeriodSchema,
  /** A category slug to filter by. */
  category: z.string().min(1).max(200).optional(),
});

export const FinanceSpendOutputSchema = z.object({
  period: SpendPeriodSchema,
  category: z.string().nullable(),
  totalCents: Cents,
  /** Category chips: the categories that have spend in the period, largest first. */
  categories: z.array(BreakdownRowSchema),
  /** Spend only, newest first, at most 500. */
  transactions: z.array(FinanceTransactionSchema),
});

export const FinanceCategoryOutputSchema = z.object({
  slug: z.string(),
  label: z.string(),
  last90Cents: Cents,
  /** Spend per month, 12 months oldest first. */
  trend: z.array(MonthCentsSchema),
  /** Last 90 days; sums to `last90Cents`. */
  vendors: z.array(BreakdownRowSchema),
  /** Newest 8. */
  recent: z.array(FinanceTransactionSchema),
});

export const FinanceRecurringOutputSchema = z.object({
  recurring: RecurringChargeSchema,
  /** Newest 6. */
  pastCharges: z.array(FinanceTransactionSchema),
});

export const FinanceVendorOutputSchema = z.object({
  key: z.string(),
  name: z.string(),
  /** True when the vendor is in the subscriptions list. */
  isSubscription: z.boolean(),
  /** Average over the last 6 months, counting months with no charge as zero. */
  monthlyAvgCents: Cents,
  /** Last full month against 3 months before it; null when either is 0. */
  changePct: z.number().nullable(),
  firstSeenAt: IsoDate,
  paidWith: z.array(PaidWithEntrySchema),
  /** 6 months, oldest first. */
  monthly: z.array(MonthCentsSchema),
  /** Charges in the last 6 months, newest first. */
  charges: z.array(FinanceTransactionSchema),
});

export const FinanceTransactionOutputSchema = z.object({
  transaction: FinanceTransactionSchema,
  vendorName: z.string(),
  /** The account the money moved through; null if it is no longer synced. */
  account: FinanceAccountSchema.nullable(),
  /** The vendor is in the subscriptions list (decides the breadcrumb). */
  vendorIsSubscription: z.boolean(),
});

export const FinanceReceiptUrlOutputSchema = z.object({
  /** A short-lived vendor link, fetched on demand. */
  url: z.string().url(),
  mimeType: z.string().nullable(),
});

export type FinanceAccount = z.infer<typeof FinanceAccountSchema>;
export type FinanceAccountKind = z.infer<typeof FinanceAccountKindSchema>;
export type FinanceTransaction = z.infer<typeof FinanceTransactionSchema>;
export type FinanceTxnStatus = z.infer<typeof FinanceTxnStatusSchema>;
export type FinanceClassification = z.infer<typeof FinanceClassificationSchema>;
export type TreasuryYieldMonth = z.infer<typeof TreasuryYieldMonthSchema>;
export type FinanceBill = z.infer<typeof FinanceBillSchema>;
export type SpendPeriod = z.infer<typeof SpendPeriodSchema>;
export type CashSummary = z.infer<typeof CashSummarySchema>;
export type SpendTotals = z.infer<typeof SpendTotalsSchema>;
export type MonthlyPoint = z.infer<typeof MonthlyPointSchema>;
export type MonthlyBurn = z.infer<typeof MonthlyBurnSchema>;
export type Runway = z.infer<typeof RunwaySchema>;
export type BreakdownMode = z.infer<typeof BreakdownModeSchema>;
export type BreakdownRow = z.infer<typeof BreakdownRowSchema>;
export type RecurrenceCadence = z.infer<typeof RecurrenceCadenceSchema>;
export type PaidWithEntry = z.infer<typeof PaidWithEntrySchema>;
export type RecurringCharge = z.infer<typeof RecurringChargeSchema>;
export type UpcomingItem = z.infer<typeof UpcomingItemSchema>;
export type Upcoming = z.infer<typeof UpcomingSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type Subscriptions = z.infer<typeof SubscriptionsSchema>;
export type BalancePoint = z.infer<typeof BalancePointSchema>;
export type MonthCents = z.infer<typeof MonthCentsSchema>;
export type FinanceSource = z.infer<typeof FinanceSourceSchema>;
export type FinanceOverview = z.infer<typeof FinanceOverviewSchema>;
export type FinanceConnectInput = z.infer<typeof FinanceConnectInputSchema>;
export type FinanceConnectOutput = z.infer<typeof FinanceConnectOutputSchema>;
export type FinanceAccountsOutput = z.infer<typeof FinanceAccountsOutputSchema>;
export type FinanceAccountOutput = z.infer<typeof FinanceAccountOutputSchema>;
export type FinanceBurnOutput = z.infer<typeof FinanceBurnOutputSchema>;
export type FinanceMonthOutput = z.infer<typeof FinanceMonthOutputSchema>;
export type FinanceRunwayOutput = z.infer<typeof FinanceRunwayOutputSchema>;
export type FinanceSpendInput = z.infer<typeof FinanceSpendInputSchema>;
export type FinanceSpendOutput = z.infer<typeof FinanceSpendOutputSchema>;
export type FinanceCategoryOutput = z.infer<typeof FinanceCategoryOutputSchema>;
export type FinanceRecurringOutput = z.infer<typeof FinanceRecurringOutputSchema>;
export type FinanceVendorOutput = z.infer<typeof FinanceVendorOutputSchema>;
export type FinanceTransactionOutput = z.infer<typeof FinanceTransactionOutputSchema>;
export type FinanceReceiptUrlOutput = z.infer<typeof FinanceReceiptUrlOutputSchema>;
