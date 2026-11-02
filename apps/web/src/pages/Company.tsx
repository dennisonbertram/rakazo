import { t } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import type { CompanyEntityRecord, CompanyFact } from "@rakazo/contracts";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@rakazo/ui-web";
import { Building2, Ellipsis } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AskBotButton } from "../components/AskBotButton";
import { useFinanceQuery } from "../components/finance/ui";
import { PickFilter, SearchField } from "../components/ListControls";
import { PageEmptyState } from "../components/PageEmptyState";
import { PageHeader } from "../components/PageHeader";
import { downloadArtifactBytes } from "../lib/artifact-open";
import { companyDate, companyDateEnd } from "../lib/company-format";
import { money } from "../lib/finance-format";
import { maskCurrencyWhenHidden, useHideAmounts } from "../lib/hide-amounts-preference";
import { todayIso } from "../lib/legal-format";
import { useListParams } from "../lib/list-params";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";
import { CompanyCalendar } from "./CompanyCalendar";
import { CompanyFactDetail } from "./CompanyFactDetail";
import { CompanyHistory } from "./CompanyHistory";
import { CompanyPrivacy } from "./CompanyPrivacy";
import { CompanyRefresh } from "./CompanyRefresh";
import { CompanyReview } from "./CompanyReview";
import type { CompanyRow, CompanySort } from "./company-list";
import { COMPANY_SORTS, companyRows, companySources, DEFAULT_COMPANY_SORT } from "./company-list";

export function CompanyPage({ onAskAgent }: { onAskAgent?: () => void } = {}) {
  useHideAmounts();
  const page = useFinanceQuery(() => rpc.company.page(), []);
  const review = useFinanceQuery(() => rpc.company.review(), []);
  const finance = useFinanceQuery(() => rpc.finance.overview(), []);
  const carta = useFinanceQuery(() => rpc.investors.capTable(), []);
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "overview";
  const [fact, setFact] = useState<CompanyFact | null>(null);
  const [factEditing, setFactEditing] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [refreshOpen, setRefreshOpen] = useState(false);
  const [calendarRevision, setCalendarRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  async function exportMap() {
    setExporting(true);
    setExportError("");
    try {
      const data = await rpc.company.export();
      downloadArtifactBytes(
        "company-map.json",
        "application/json",
        new TextEncoder().encode(JSON.stringify(data, null, 2)),
      );
    } catch (cause) {
      setExportError(errorText(cause));
    } finally {
      setExporting(false);
    }
  }
  const data = page.data;
  const running =
    data?.latestRun &&
    ["running", "planned", "awaiting_consent", "cancelling"].includes(data.latestRun.status);
  const reload = page.reload;
  const reloadReview = review.reload;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      reload();
      reloadReview();
    }, 4000);
    return () => clearInterval(timer);
  }, [running, reload, reloadReview]);
  const refreshCompany = () => {
    setCalendarRevision((revision) => revision + 1);
    reload();
    review.reload();
  };
  const people = data?.entities.filter((row) => row.kind === "person") ?? [];
  const organisations = data?.entities.filter((row) => row.kind === "organisation") ?? [];
  const profile = data?.entities.find((row) => row.kind === "company");
  // Unconfirmed low-confidence people are not in the page data, but they are in Review.
  const reviewed = (review.data?.items ?? []).flatMap((item) =>
    item.kind === "fact" && item.fact.kind === "entity" ? [item.fact.record] : [],
  );
  const names = new Map(
    [...(data?.entities ?? []), ...reviewed]
      .filter((row) => row.id !== profile?.id)
      .map((row) => [row.id, row.displayName]),
  );
  const nameOf = (id: string) => names.get(id);
  const roles = (id: string) =>
    data?.edges.filter((row) => row.fromId === id && row.relation === "works_at") ?? [];
  const past = (row: CompanyEntityRecord) =>
    roles(row.id).length > 0 &&
    roles(row.id).every((edge) => edge.endsOn && companyDateEnd(edge.endsOn) < todayIso());
  const showEntity = (record: CompanyEntityRecord) => setFact({ kind: "entity", record });
  // Search, source filter and sort live in the URL: ?q=, source, sort, dir.
  const list = useListParams(COMPANY_SORTS, DEFAULT_COMPANY_SORT);
  const filters = { q: list.param("q"), source: list.param("source") };
  const visible = (entities: CompanyEntityRecord[]) =>
    companyRows(
      entities.map(
        (entity): CompanyRow => ({
          entity,
          role:
            roles(entity.id)
              .filter((edge) => !edge.endsOn || companyDateEnd(edge.endsOn) >= todayIso())
              .map((edge) => edge.role)
              .filter(Boolean)
              .join(", ") || null,
          since: roles(entity.id)[0]?.startsOn?.date ?? null,
        }),
      ),
      filters,
      list.sort,
    ).map((row) => row.entity);
  const sortHead = (field: CompanySort) => ({
    sortDirection: list.sort.field === field ? list.sort.dir : null,
    onSort: () => list.toggleSort(field),
  });
  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <SearchField
        name="company-search"
        value={filters.q ?? ""}
        onChange={(value) => list.setParam("q", value)}
        placeholder={t`Search`}
        label={t`Search`}
        className="w-56"
      />
      <PickFilter
        label={t`Source`}
        value={filters.source}
        options={companySources(data?.entities ?? []).map((kind) => [
          kind,
          kind.replaceAll("_", " "),
        ])}
        onChange={(value) => list.setParam("source", value)}
      />
    </div>
  );
  const filtered = Boolean(filters.q || filters.source);
  const noMatches = (entities: CompanyEntityRecord[]) =>
    filtered &&
    visible(entities).length === 0 && (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          <Trans>No matches</Trans>
        </p>
        <Button variant="outline" size="sm" onClick={() => list.clear("q", "source")}>
          <Trans>Clear filters</Trans>
        </Button>
      </div>
    );
  const empty = (entities: CompanyEntityRecord[], message: ReactNode) =>
    !filtered && entities.length === 0 ? (
      <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>
    ) : null;
  const rows = (entities: CompanyEntityRecord[]) =>
    visible(entities).length === 0 ? null : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead {...sortHead("name")}>
              <Trans>Name</Trans>
            </TableHead>
            <TableHead {...sortHead("role")}>
              <Trans>Role</Trans>
            </TableHead>
            <TableHead {...sortHead("since")}>
              <Trans>Since</Trans>
            </TableHead>
            <TableHead>
              <Trans>Sources</Trans>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible(entities).map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Button variant="link" className="h-auto p-0" onClick={() => showEntity(row)}>
                  {maskCurrencyWhenHidden(row.displayName)}
                </Button>
                {row.status !== "confirmed" && (
                  <span className="block text-xs text-muted-foreground">
                    <Trans>Not confirmed</Trans>
                  </span>
                )}
              </TableCell>
              <TableCell>
                {roles(row.id)
                  .filter((edge) => !edge.endsOn || companyDateEnd(edge.endsOn) >= todayIso())
                  .map((edge) => (
                    <Button
                      key={edge.id}
                      variant="link"
                      onClick={() => setFact({ kind: "edge", record: edge })}
                    >
                      {maskCurrencyWhenHidden(edge.role ?? "—")}
                    </Button>
                  ))}
              </TableCell>
              <TableCell>{companyDate(roles(row.id)[0]?.startsOn)}</TableCell>
              <TableCell>{row.readOnly ? "—" : row.evidence.length}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  return (
    <div className="rk-scroll flex-1 overflow-y-auto px-4 py-5 md:px-7">
      <PageHeader
        className="mb-6"
        title={<Trans>Company</Trans>}
        meta={<Trans>Reconstructed</Trans>}
        actions={
          <>
            {onAskAgent && <AskBotButton botName={t`Company agent`} onClick={onAskAgent} />}
            <Link
              to="/app/company/import"
              className="inline-flex items-center text-sm underline underline-offset-4 pointer-coarse:min-h-11 pointer-coarse:px-2"
            >
              <Trans>Import</Trans>
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon" aria-label={t`Company actions`} />}
              >
                <Ellipsis className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={exporting} onClick={() => void exportMap()}>
                  <Trans>Export JSON</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPrivacy(true)}>
                  <Trans>Privacy</Trans>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setRefreshOpen((open) => !open)}>
                  <Trans>Refresh sources</Trans>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      {exportError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {exportError}
        </p>
      )}
      {privacy && <CompanyPrivacy onClose={() => setPrivacy(false)} onChanged={refreshCompany} />}
      {refreshOpen && (
        <div className="mb-6">
          <CompanyRefresh onChanged={refreshCompany} />
        </div>
      )}
      <Tabs value={view} onValueChange={(next) => setParams({ view: String(next) })}>
        <TabsList>
          <TabsTrigger value="overview">
            <Trans>Overview</Trans>
          </TabsTrigger>
          <TabsTrigger value="people">
            <Trans>People</Trans>
          </TabsTrigger>
          <TabsTrigger value="organisations">
            <Trans>Organisations</Trans>
          </TabsTrigger>
          <TabsTrigger value="history">
            <Trans>History</Trans>
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <Trans>Calendar</Trans>
          </TabsTrigger>
          <TabsTrigger value="review">
            <Trans>Review</Trans>
            {review.data ? ` (${review.data.items.length})` : ""}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {page.error && (
        <p role="alert" className="mt-6 text-destructive">
          {page.error}
          <Button variant="link" onClick={reload}>
            <Trans>Retry</Trans>
          </Button>
        </p>
      )}
      {!data && !page.error && <Skeleton className="mt-6 h-64 w-full" />}
      {data && (
        <div className="mt-6 space-y-8">
          {view === "history" && <CompanyHistory data={data} onOpen={setFact} />}
          {view === "review" && (
            <>
              {review.error && (
                <p role="alert" className="text-sm text-destructive">
                  {review.error}{" "}
                  <Button variant="link" onClick={review.reload}>
                    <Trans>Retry</Trans>
                  </Button>
                </p>
              )}
              {!review.data && !review.error && <Skeleton className="h-32 w-full" />}
              {review.data && (
                <CompanyReview
                  nameOf={nameOf}
                  items={review.data.items}
                  onOpen={(next, editing = false) => {
                    setFactEditing(editing);
                    setFact(next);
                  }}
                  onChanged={refreshCompany}
                />
              )}
            </>
          )}
          {view === "calendar" && (
            <CompanyCalendar onOpen={setFact} refreshRevision={calendarRevision} />
          )}
          {data.latestRun &&
            (running ||
              ["paused", "budget_reached", "partial", "failed"].includes(
                data.latestRun.status,
              )) && (
              <p role="status" className="text-sm text-muted-foreground">
                <Link
                  to={`/app/company/import?runId=${data.latestRun.id}`}
                  className="hover:underline"
                >
                  {running ? (
                    <Trans>Import in progress</Trans>
                  ) : ["paused", "budget_reached"].includes(data.latestRun.status) ? (
                    <Trans>Import paused</Trans>
                  ) : data.latestRun.status === "failed" ? (
                    <Trans>Import failed</Trans>
                  ) : (
                    <Trans>Partial import</Trans>
                  )}
                </Link>
              </p>
            )}
          {view === "overview" && data.entities.length === 0 && data.events.length === 0 && (
            <PageEmptyState
              icon={<Building2 className="size-8" strokeWidth={1.6} aria-hidden="true" />}
              title={<Trans>No company facts yet</Trans>}
              description={<Trans>Import from your mail and files to fill this page.</Trans>}
            >
              {!running && (
                <Button render={<Link to="/app/company/import" />}>
                  <Trans>Import</Trans>
                </Button>
              )}
            </PageEmptyState>
          )}
          {view === "overview" && (data.entities.length > 0 || data.events.length > 0) && (
            <>
              {profile && (
                <section className="space-y-3">
                  <Button
                    variant="link"
                    className="h-auto p-0 text-2xl font-semibold"
                    onClick={() => showEntity(profile)}
                  >
                    {maskCurrencyWhenHidden(profile.displayName)}
                  </Button>
                  <p className="text-muted-foreground">
                    {maskCurrencyWhenHidden(String(profile.attrs.description ?? ""))}
                  </p>
                  {Boolean(profile.attrs.whatWeDo) && (
                    <div className="pt-3">
                      <h2 className="mb-2 font-medium">
                        <Trans>What we do</Trans>
                      </h2>
                      <button
                        type="button"
                        className="text-start"
                        onClick={() => showEntity(profile)}
                      >
                        {maskCurrencyWhenHidden(String(profile.attrs.whatWeDo))}
                      </button>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {profile.evidence.length} <Trans>Sources</Trans>
                      </p>
                    </div>
                  )}
                </section>
              )}
              <div className="grid grid-cols-2 gap-6 border-y py-5 md:grid-cols-4">
                <div>
                  <span className="text-xs text-muted-foreground">
                    <Trans>People</Trans>
                  </span>
                  <p className="text-2xl">{people.length}</p>
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">
                    <Trans>Organisations</Trans>
                  </span>
                  <p className="text-2xl">{organisations.length}</p>
                </div>
                {finance.data?.hasCashAccounts && (
                  <Link to="/app/finance">
                    <span className="text-xs text-muted-foreground">
                      <Trans>Cash</Trans>
                    </span>
                    <p className="text-2xl">{money(finance.data.cash.cashCents)}</p>
                  </Link>
                )}
                {carta.data?.snapshot?.amountRaisedUsd != null && (
                  <Link to="/app/cap-table">
                    <span className="text-xs text-muted-foreground">
                      <Trans>Raised</Trans>
                    </span>
                    <p className="text-2xl">{money(carta.data.snapshot.amountRaisedUsd * 100)}</p>
                  </Link>
                )}
              </div>
              <section>
                <h2 className="mb-3 font-medium">
                  <Trans>Next dates</Trans>
                </h2>
                {data.events
                  .filter((event) => event.occursOn && companyDateEnd(event.occursOn) >= todayIso())
                  .slice(0, 5)
                  .map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      className="flex w-full justify-between border-b py-3 text-start"
                      onClick={() => setFact({ kind: "event", record: event })}
                    >
                      <span>{maskCurrencyWhenHidden(event.title)}</span>
                      <span className="text-muted-foreground">{companyDate(event.occursOn)}</span>
                    </button>
                  ))}
              </section>
              <section>
                <h2 className="mb-3 font-medium">
                  <Trans>Latest events</Trans>
                </h2>
                {data.events
                  .filter((event) => event.occursOn && companyDateEnd(event.occursOn) <= todayIso())
                  .slice(-5)
                  .reverse()
                  .map((event) => (
                    <button
                      type="button"
                      key={event.id}
                      className="flex w-full justify-between border-b py-3 text-start"
                      onClick={() => setFact({ kind: "event", record: event })}
                    >
                      <span>{maskCurrencyWhenHidden(event.title)}</span>
                      <span className="text-muted-foreground">{companyDate(event.occursOn)}</span>
                    </button>
                  ))}
              </section>
            </>
          )}
          {view === "people" && (
            <>
              {toolbar}
              {noMatches(people)}
              {empty(people, <Trans>No people yet</Trans>)}
              {rows(people.filter((row) => !past(row)))}
              {visible(people.filter(past)).length > 0 && (
                <details>
                  <summary className="cursor-pointer font-medium">
                    <Trans>Past members</Trans>
                  </summary>
                  {rows(people.filter(past))}
                </details>
              )}
            </>
          )}
          {view === "organisations" && toolbar}
          {view === "organisations" && noMatches(organisations)}
          {view === "organisations" && empty(organisations, <Trans>No organisations yet</Trans>)}
          {view === "organisations" &&
            [...new Set(visible(organisations).map((row) => String(row.attrs.type ?? "other")))]
              .sort()
              .map((group) => (
                <section key={group}>
                  <h2 className="mb-3 font-medium capitalize">{group.replaceAll("_", " ")}</h2>
                  {visible(organisations)
                    .filter((row) => (row.attrs.type ?? "other") === group)
                    .map((row) => (
                      <div key={row.id} className="border-b py-3">
                        <Button
                          variant="link"
                          className="h-auto p-0"
                          onClick={() => showEntity(row)}
                        >
                          {maskCurrencyWhenHidden(row.displayName)}
                        </Button>
                        {data.edges
                          .filter((edge) => edge.fromId === row.id || edge.toId === row.id)
                          .map((edge) => (
                            <Button
                              key={edge.id}
                              variant="ghost"
                              onClick={() => setFact({ kind: "edge", record: edge })}
                            >
                              {edge.relation.replaceAll("_", " ")} · {companyDate(edge.startsOn)} —{" "}
                              {companyDate(edge.endsOn)}
                            </Button>
                          ))}
                      </div>
                    ))}
                </section>
              ))}
        </div>
      )}
      {fact && (
        <CompanyFactDetail
          key={`${fact.kind}:${fact.record.id}`}
          initialEditing={factEditing}
          fact={
            fact.kind === "entity"
              ? {
                  ...fact,
                  record: {
                    ...fact.record,
                    edges:
                      data?.edges.filter(
                        (edge) => edge.fromId === fact.record.id || edge.toId === fact.record.id,
                      ) ?? [],
                  },
                }
              : fact
          }
          onClose={() => {
            setFact(null);
            setFactEditing(false);
          }}
          onChanged={() => {
            setFact(null);
            setFactEditing(false);
            refreshCompany();
          }}
        />
      )}
    </div>
  );
}
