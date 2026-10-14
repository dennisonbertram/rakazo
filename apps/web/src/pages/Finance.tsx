import { plural, t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type {
  FinanceOverview,
  FinanceProvider,
  FinanceSource,
  SpendPeriod,
  UpcomingItem,
} from "@rakazo/contracts";
import { Button, Skeleton } from "@rakazo/ui-web";
import { ChevronRight, Plus, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { BurnBars, Sparkline } from "../components/finance/charts";
import {
  AskAgentButton,
  BreakdownRows,
  Chevron,
  ErrorNotice,
  FinanceChromeProvider,
  Kpi,
  PeriodTabs,
  periodNames,
  rowClass,
  Section,
  Th,
  useFinanceQuery,
  useRowNavigate,
} from "../components/finance/ui";
import { connectFinanceProvider } from "../lib/finance-connect";
import { changeText, money, monthFull, paidWithLabel, shortDay } from "../lib/finance-format";
import { financePath, parseFinanceRoute } from "../lib/finance-route";
import { formatRelativeTime } from "../lib/relative-time";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { FinanceAccountPage, FinanceAccountsPage } from "./finance/FinanceAccounts";
import { FinanceBurnPage, FinanceMonthPage, FinanceRunwayPage } from "./finance/FinanceBurn";
import { FinanceNotFound } from "./finance/FinanceNotFound";
import {
  FinanceCategoryPage,
  FinanceRecurringPage,
  FinanceSpendPage,
  FinanceVendorPage,
} from "./finance/FinanceSpend";
import { FinanceReceiptPage, FinanceTransactionPage } from "./finance/FinanceTransaction";

const providerName = (provider: FinanceProvider) => (provider === "brex" ? "Brex" : "Mercury");

/** The Finance area: the dashboard at /app/finance and its detail pages. */
export function FinancePage({ onAskAgent }: { onAskAgent?: () => void }) {
  const location = useLocation();
  const route = parseFinanceRoute(location.pathname, location.search);
  return (
    <FinanceChromeProvider value={{ onAskAgent }}>
      <div className="@container rk-scroll flex-1 overflow-y-auto px-4 pb-6 pt-2 md:px-7 md:pt-5">
        {route.page === "dashboard" ? (
          <Dashboard />
        ) : route.page === "accounts" ? (
          <FinanceAccountsPage />
        ) : route.page === "account" ? (
          <FinanceAccountPage id={route.id} />
        ) : route.page === "burn" ? (
          <FinanceBurnPage />
        ) : route.page === "month" ? (
          <FinanceMonthPage month={route.month} />
        ) : route.page === "runway" ? (
          <FinanceRunwayPage />
        ) : route.page === "spend" ? (
          <FinanceSpendPage period={route.period} category={route.category} />
        ) : route.page === "category" ? (
          <FinanceCategoryPage slug={route.slug} />
        ) : route.page === "recurring" ? (
          <FinanceRecurringPage keyName={route.key} />
        ) : route.page === "vendor" ? (
          <FinanceVendorPage keyName={route.key} />
        ) : route.page === "transaction" ? (
          <FinanceTransactionPage id={route.id} />
        ) : route.page === "receipt" ? (
          <FinanceReceiptPage id={route.id} />
        ) : (
          <FinanceNotFound />
        )}
      </div>
    </FinanceChromeProvider>
  );
}

function Dashboard() {
  const overview = useFinanceQuery(() => rpc.finance.overview(), []);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [connecting, setConnecting] = useState<FinanceProvider | null>(null);
  const [connectError, setConnectError] = useState("");
  const reload = useRef(overview.reload);
  reload.current = overview.reload;

  // Sync reads the vendors (throttled by the server), then the dashboard reads the stored result.
  const sync = () => {
    setSyncing(true);
    setSyncError("");
    rpc.finance
      .refresh()
      .catch((cause) => setSyncError(errorText(cause)))
      .finally(() => {
        setSyncing(false);
        reload.current();
      });
  };

  const connected = overview.data?.sources.some((s) => s.status !== "not_connected") ?? false;
  const synced = useRef(false);
  // Runs once, when the first overview shows a connected source.
  useEffect(() => {
    if (!connected || synced.current) return;
    synced.current = true;
    sync();
  }, [connected]);

  const connect = (provider: FinanceProvider, reconnect = false) => {
    setConnecting(provider);
    setConnectError("");
    connectFinanceProvider(provider, reconnect)
      .then((result) => {
        if (result === "connected" || result === "already_connected") {
          synced.current = true;
          sync();
        }
      })
      .catch((cause) => setConnectError(errorText(cause)))
      .finally(() => setConnecting(null));
  };

  const data = overview.data;
  if (overview.error) return <ErrorNotice message={overview.error} onRetry={overview.retry} />;
  if (!data) return <DashboardSkeleton />;
  if (!connected) {
    return (
      <div className="flex h-full min-h-72 flex-col items-center justify-center gap-4">
        <h1 className="text-lg font-medium">
          <Trans>Finance</Trans>
        </h1>
        <div className="flex gap-2">
          {(["mercury", "brex"] as const).map((provider, i) => (
            <Button
              key={provider}
              variant={i === 0 ? "default" : "outline"}
              disabled={connecting !== null}
              onClick={() => connect(provider)}
            >
              {provider === "mercury" ? (
                <Trans>Connect Mercury</Trans>
              ) : (
                <Trans>Connect Brex</Trans>
              )}
            </Button>
          ))}
        </div>
        {connectError ? (
          <p role="alert" className="text-sm text-destructive">
            {connectError}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <Overview
      data={data}
      syncing={syncing}
      error={syncError || connectError}
      connecting={connecting}
      onRefresh={sync}
      onConnect={connect}
    />
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-20" />
        ))}
      </div>
      <Skeleton className="h-56" />
      <Skeleton className="h-40" />
    </div>
  );
}

function SourceChip({
  source,
  connecting,
  onConnect,
}: {
  source: FinanceSource;
  connecting: boolean;
  onConnect: (provider: FinanceProvider, reconnect?: boolean) => void;
}) {
  const name = providerName(source.provider);
  const chip =
    "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-foreground hover:text-foreground";
  if (source.status === "not_connected") {
    return (
      <button
        type="button"
        className={chip}
        disabled={connecting}
        aria-label={t`Connect ${name}`}
        onClick={() => onConnect(source.provider)}
      >
        <Plus aria-hidden="true" className="size-3" />
        {name}
      </button>
    );
  }
  const dot =
    source.status === "ok"
      ? "bg-success"
      : source.status === "error"
        ? "bg-destructive"
        : "bg-warning";
  const dotEl = <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />;
  return source.status === "needs_reconnect" ? (
    <button
      type="button"
      className={chip}
      disabled={connecting}
      aria-label={t`Reconnect ${name}`}
      onClick={() => onConnect(source.provider, true)}
    >
      {dotEl}
      {name}
    </button>
  ) : (
    <Link to={financePath.accounts()} className={chip}>
      {dotEl}
      {name}
    </Link>
  );
}

function Overview({
  data,
  syncing,
  error,
  connecting,
  onRefresh,
  onConnect,
}: {
  data: FinanceOverview;
  syncing: boolean;
  error: string;
  connecting: FinanceProvider | null;
  onRefresh: () => void;
  onConnect: (provider: FinanceProvider, reconnect?: boolean) => void;
}) {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<SpendPeriod>("month");
  const [by, setBy] = useState<"category" | "vendor">("category");
  const totals = data.spendTotals[period];
  const month = data.spendTotals.month;
  const change = changeText(totals.changePct);
  const monthChange = changeText(month.changePct);
  // Less spend than before is good news.
  const tone = (pct: number | null) => ((pct ?? 0) <= 0 ? "text-success" : "text-destructive");
  const burning = data.burn.monthlyCents > 0;
  const runwayMonths = data.runway.months?.toFixed(1);
  const runOutMonth = data.runway.runOutDate ? monthFull(data.runway.runOutDate.slice(0, 7)) : "";
  const previousSpend = month.previousCents === null ? null : money(month.previousCents);
  const previousPeriod = periodNames()[period].toLowerCase();
  const lastPartial = data.monthlySeries.at(-1)?.partial ?? false;
  const subs = data.subscriptions;
  const monthlyTotal = money(subs.totalMonthlyCents);
  const yieldAmount = data.treasuryYieldLastMonth
    ? money(data.treasuryYieldLastMonth.netCents)
    : "";
  const showSkeleton = syncing && data.lastSyncedAt === null;
  const updated = data.lastSyncedAt ? formatRelativeTime(data.lastSyncedAt) : "";

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-medium">
          <Trans>Finance</Trans>
        </h1>
        <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
          {syncing ? <Trans>Syncing…</Trans> : updated ? <Trans>Updated {updated}</Trans> : null}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t`Refresh`}
            disabled={syncing}
            onClick={onRefresh}
          >
            <RefreshCw aria-hidden="true" className={syncing ? "animate-spin" : undefined} />
          </Button>
        </span>
        {data.excludedNonUsdCount > 0 ? (
          <span className="text-[11px] text-muted-foreground">
            {t`${data.excludedNonUsdCount} non-USD not counted`}
          </span>
        ) : null}
        <div className="flex gap-1">
          {data.sources.map((source) => (
            <SourceChip
              key={source.provider}
              source={source}
              connecting={connecting !== null}
              onConnect={onConnect}
            />
          ))}
        </div>
        <AskAgentButton />
      </div>
      {error ? <ErrorNotice message={error} onRetry={onRefresh} /> : null}
      {showSkeleton ? (
        <DashboardSkeleton />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
            <Kpi
              title={t`Cash`}
              value={money(data.cash.cashCents)}
              sub={t`Checking + Treasury`}
              to={financePath.accounts()}
            />
            <Kpi
              title={t`Monthly burn`}
              value={burning ? money(data.burn.monthlyCents) : "—"}
              sub={t`3-mo avg`}
              to={financePath.burn()}
            />
            <Kpi
              title={t`Runway`}
              value={runwayMonths === undefined ? "—" : t`${runwayMonths} mo`}
              sub={runOutMonth ? t`Until ${runOutMonth}` : undefined}
              to={financePath.runway()}
            />
            <Kpi
              title={t`Spend this month`}
              value={money(month.currentCents)}
              sub={
                previousSpend === null ? undefined : monthChange ? (
                  <>
                    <span className={tone(month.changePct)}>{monthChange}</span>{" "}
                    {t`vs ${previousSpend} last month`}
                  </>
                ) : (
                  t`vs ${previousSpend} last month`
                )
              }
              to={financePath.spend("month")}
            />
          </div>

          <Section className="@container/strip">
            <div className="flex flex-wrap items-center gap-3.5">
              <PeriodTabs value={period} onChange={setPeriod} />
              <Link
                to={financePath.spend(period)}
                className="text-lg font-semibold tabular-nums hover:underline"
              >
                {money(totals.currentCents)}
              </Link>
              <span className="text-[11px] text-muted-foreground">
                {totals.previousCents === null ? null : (
                  <>
                    {change ? <span className={tone(totals.changePct)}>{change} </span> : null}
                    {t`vs previous ${previousPeriod}`}
                  </>
                )}
              </span>
            </div>
          </Section>

          <Section
            title={
              <Link to={financePath.burn()} className="inline-flex items-center hover:underline">
                <Trans>Burn</Trans>
                <ChevronRight aria-hidden="true" className="size-3" />
              </Link>
            }
            action={
              <div className="flex gap-3.5 text-[11px] text-muted-foreground">
                <Legend className="bg-foreground">
                  <Trans>Out</Trans>
                </Legend>
                <Legend className="bg-muted-foreground">
                  <Trans>Revenue</Trans>
                </Legend>
                <Legend className="border border-foreground bg-[repeating-linear-gradient(45deg,var(--foreground)_0_1.5px,var(--card)_1.5px_3.5px)]">
                  <Trans>Financing</Trans>
                </Legend>
              </div>
            }
          >
            <BurnBars
              series={data.monthlySeries}
              label={t`Cash out and cash in by month`}
              onOpenMonth={(m) => navigate(financePath.month(m))}
            />
            {lastPartial ? (
              <div className="text-[11px] text-muted-foreground">
                <Trans>* Month to date</Trans>
              </div>
            ) : null}
          </Section>

          <div className="grid gap-3 @3xl:grid-cols-2">
            <Section
              title={<Trans>Breakdown</Trans>}
              action={
                <div className="flex gap-1">
                  {(["category", "vendor"] as const).map((mode) => (
                    <Button
                      key={mode}
                      size="xs"
                      variant={by === mode ? "default" : "outline"}
                      className="rounded-full"
                      aria-pressed={by === mode}
                      onClick={() => setBy(mode)}
                    >
                      {mode === "category" ? <Trans>Category</Trans> : <Trans>Vendor</Trans>}
                    </Button>
                  ))}
                </div>
              }
            >
              <BreakdownRows
                rows={data.breakdown[by].slice(0, 7)}
                to={(row) =>
                  by === "category" ? financePath.category(row.key) : financePath.vendor(row.key)
                }
              />
              <div className="text-[11px] text-muted-foreground">
                <Trans>Last 90 days</Trans>
              </div>
            </Section>

            <Section
              title={<Trans>Upcoming · 30 days</Trans>}
              action={
                <span className="text-xs font-semibold tabular-nums">
                  ~{money(data.upcoming.totalCents)}
                </span>
              }
            >
              <div className="-mx-2">
                {data.upcoming.items.map((item) => (
                  <UpcomingRow key={`${item.kind}:${item.key}`} item={item} />
                ))}
              </div>
            </Section>
          </div>

          <Section title={<Trans>Subscriptions</Trans>}>
            <SubscriptionsTable subs={subs} />
            <div className="border-t border-border pt-2 text-xs text-muted-foreground">
              {plural(subs.items.length, { one: "# subscription", other: "# subscriptions" })} ·{" "}
              {t`${monthlyTotal}/mo`}
            </div>
          </Section>

          {data.treasuryYieldLastMonth ? (
            <Link
              to={financePath.accounts()}
              className="w-fit rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-foreground"
            >
              <Section title={<Trans>Treasury yield</Trans>} className="hover:ring-foreground/30">
                <div className="text-lg font-semibold tabular-nums">
                  {t`${yieldAmount} last month`}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <Trans>after fees</Trans>
                </div>
              </Section>
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center">
      <i aria-hidden="true" className={`me-1.5 inline-block size-2.5 rounded-xs ${className}`} />
      {children}
    </span>
  );
}

const upcomingTag = (kind: UpcomingItem["kind"]) =>
  kind === "recurring" ? t`recurring` : kind === "pending" ? t`pending` : t`bill`;

function UpcomingRow({ item }: { item: UpcomingItem }) {
  const to =
    item.kind === "recurring"
      ? financePath.recurring(item.key)
      : item.kind === "pending"
        ? financePath.transaction(item.key)
        : null;
  const body = (
    <>
      <span className="text-muted-foreground">
        {item.dates.map((d) => shortDay(d)).join(" · ")}
      </span>
      <span className="min-w-0 truncate">
        {item.name}
        <span className="ms-1.5 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
          {upcomingTag(item.kind)}
        </span>
      </span>
      <span className="text-end tabular-nums">
        {money(item.amountCents)}
        {item.dates.length > 1 ? ` ×${item.dates.length}` : ""}
      </span>
      {to ? (
        <ChevronRight aria-hidden="true" className="size-3.5 text-muted-foreground" />
      ) : (
        <span />
      )}
    </>
  );
  const cls =
    "grid grid-cols-[minmax(5rem,auto)_1fr_auto_0.875rem] items-center gap-2.5 border-t border-border px-2 py-2 first:border-t-0";
  return to ? (
    <Link
      to={to}
      className={`${cls} outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-foreground`}
    >
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function SubscriptionsTable({ subs }: { subs: FinanceOverview["subscriptions"] }) {
  const rowProps = useRowNavigate();
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <Th>
            <Trans>Vendor</Trans>
          </Th>
          <Th right>
            <Trans>Monthly</Trans>
          </Th>
          <Th right className="hidden @md:table-cell">
            <Trans>3 mo</Trans>
          </Th>
          <Th right className="hidden @md:table-cell">
            <Trans>Last charge</Trans>
          </Th>
          <Th />
        </tr>
      </thead>
      <tbody>
        {subs.items.map((sub) => {
          const paidWith = paidWithLabel(sub.paidWith);
          const name = sub.name;
          return (
            <tr key={sub.key} className={rowClass} {...rowProps(financePath.vendor(sub.key))}>
              <td className="font-semibold">
                <Link
                  to={financePath.vendor(sub.key)}
                  aria-label={paidWith ? t`${name}, paid with ${paidWith}` : name}
                  className="outline-none hover:underline focus-visible:underline"
                >
                  {sub.name}
                </Link>
                {sub.overlapGroup ? (
                  <span className="ms-1.5 rounded-full border border-border px-1.5 text-[10px] font-normal text-muted-foreground">
                    <Trans>overlaps</Trans>
                  </span>
                ) : null}
                {paidWith ? (
                  <span
                    role="tooltip"
                    className="pointer-events-none ms-2.5 hidden whitespace-nowrap rounded-full bg-primary px-2.5 py-0.5 align-middle text-[11px] font-normal text-primary-foreground group-focus-within/row:inline-block group-hover/row:inline-block"
                  >
                    {paidWith}
                  </span>
                ) : null}
              </td>
              <td className="text-end tabular-nums">{money(sub.monthlyCents)}</td>
              <td className="hidden w-[90px] @md:table-cell">
                <Sparkline values={sub.trendCents} label={t`Last 3 months`} />
              </td>
              <td className="hidden whitespace-nowrap text-end text-muted-foreground @md:table-cell">
                {shortDay(sub.lastChargeAt)}
              </td>
              <Chevron />
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
