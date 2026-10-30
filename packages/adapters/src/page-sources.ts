import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type {
  BotPage,
  McpSourceCall,
  PageChart,
  PageData,
  PageLiveBlock,
  PageMetricBlock,
  PageSource,
  PageSourceKind,
  PageSourceSchedule,
  PageTableBlock,
  PraciSourceCall,
} from "@rakazo/contracts";
import {
  disabledBuiltinToolSet,
  isGtmAgentSpawnKey,
  McpSourceCallSchema,
  PAGE_SOURCE_VALUE_MAX_BYTES,
  PAGE_SOURCES_MAX_PER_PAGE,
  PageSourceNameSchema,
  PageSourceSchedule as PageSourceScheduleSchema,
} from "@rakazo/contracts";
import { splitPage } from "@rakazo/core";
import type { NotificationEvents, PrismaClient, ThreadEvents } from "@rakazo/db";
import { isUniqueViolation } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { builtinAgentTools } from "./builtin-tools.js";
import { capTableToolsAllowed, contactToolFromTool, contactToolsAllowed } from "./contact-tools.js";
import {
  FINANCE_TOOL_NAMES,
  financeToolFromTool,
  financeToolsAllowed,
  hasFinanceSource,
} from "./finance-tools.js";
import { unwrapToolResult } from "./finance-call-tool.js";
import { fundraisingToolFromTool, fundraisingToolsAllowed } from "./fundraising-tools.js";
import type { McpConnector } from "./mcp-connector.js";
import { checkMcpReadSource, mcpSourceContext } from "./mcp-read-source.js";
import {
  pageSourceApprovalBlock,
  pageSourceCallHash,
  postPageSourceApproval,
} from "./page-source-approval.js";
import type { PageDeps, PageToolScope } from "./pages.js";
import { announcePageData, findPageByTitle, getBotPage, renderPageChartSvg } from "./pages.js";
import { formatPinValue, jsonPointerGet } from "./pin-values.js";
import { PRACI_SOURCE_TOOLS } from "./praci-source-tools.js";
import { listBoardTickets } from "./ticket-tools.js";

export { PRACI_SOURCE_TOOLS };

const REFRESH_TIMEOUT_MS = 15_000;
/** "Refresh now" skips a source refreshed within this long, so repeated clicks do nothing extra. */
const REFRESH_DEBOUNCE_MS = 60_000;
const PREVIEW_CHARS = 4_000;
const HISTORY_POINTS = 500;
const CHART_MAX_ROWS = 5_000;

/** A source that fails this many times in a row is paused. */
export const PAGE_SOURCE_PAUSE_AFTER = 5;
/** Active and pending sources per space, checked when a source is created. */
export const PAGE_SOURCES_MAX_PER_SPACE = 100;
const BACKOFF_CAP_MS = 6 * 3_600_000;
const JITTER = 0.05;

export const SCHEDULE_MS: Record<PageSourceSchedule, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "1d": 86_400_000,
  "1w": 7 * 86_400_000,
};

export interface PageSourceDeps extends PageDeps {
  events: PageDeps["events"] & Partial<Pick<ThreadEvents, "notify">>;
  /** From the deployment; board_tickets is only a source where the ticket board is on. */
  ticketBoardEnabled?: boolean;
  /** Needed for mcp sources: lists a server's tools and calls the approved one. */
  mcp?: Pick<McpConnector, "listServerTools"> & Partial<Pick<McpConnector, "callServerTool">>;
  /** Lets the "needs approval" notification reach open clients at once. */
  notificationEvents?: NotificationEvents;
  /** Test seam. */
  timeoutMs?: number;
  now?: () => Date;
  /** Test seam for the schedule jitter; 0 to 1. */
  random?: () => number;
}

/** The next normal run: the schedule's interval plus up to 5% jitter so sources do not fire together. */
export function nextScheduledRefresh(
  now: Date,
  schedule: string,
  random: () => number = Math.random,
): Date {
  const interval = SCHEDULE_MS[schedule as PageSourceSchedule];
  return new Date(now.getTime() + interval * (1 + JITTER * random()));
}

/** After the nth failure in a row: double each time up to 6 hours, never sooner than the normal interval. */
function backoffRefresh(now: Date, schedule: string, failures: number): Date {
  const interval = SCHEDULE_MS[schedule as PageSourceSchedule];
  return new Date(
    now.getTime() + Math.max(interval, Math.min(interval * 2 ** failures, BACKOFF_CAP_MS)),
  );
}

/** A source could not run. The message is short and written for the owner or the model. */
export class PageSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageSourceError";
  }
}

type SourceRow = {
  id: string;
  spaceId: string;
  userId: string;
  botId: string;
  pageId: string;
  name: string;
  kind: string;
  call: unknown;
  schedule: string;
  status: string;
  failures: number;
  lastRefreshAt: Date | null;
  lastError: string | null;
};

export function toPageSource(row: SourceRow, serverName?: string): PageSource {
  return {
    id: row.id,
    pageId: row.pageId,
    name: row.name,
    kind: row.kind as PageSourceKind,
    call: row.call as PageSource["call"],
    ...(serverName ? { serverName } : {}),
    schedule: row.schedule as PageSourceSchedule,
    status: row.status as PageSource["status"],
    lastRefreshAt: row.lastRefreshAt?.toISOString() ?? null,
    lastError: row.lastError,
  };
}

type SourceBot = {
  id: string;
  spaceId: string;
  userId: string;
  spawnKey: string | null;
  audience: string;
  archivedAt: Date | null;
  disabledBuiltinTools: string[];
};

const isPraciTool = (tool: string): tool is (typeof PRACI_SOURCE_TOOLS)[number] =>
  (PRACI_SOURCE_TOOLS as readonly string[]).includes(tool);

/**
 * Null when this bot may use the tool as a page source; otherwise why not. A source runs like an
 * owner-started routine of the bot: the same agent gates a run applies, never wider.
 */
export async function praciSourceRefusal(
  deps: Pick<PageSourceDeps, "prisma" | "ticketBoardEnabled">,
  bot: SourceBot,
  tool: string,
): Promise<string | null> {
  if (!isPraciTool(tool)) {
    return `"${tool}" cannot be a page source. Use one of: ${PRACI_SOURCE_TOOLS.join(", ")}.`;
  }
  // Read at call time, so a tool that later stops being read-only stops working as a source.
  if (builtinAgentTools.find((candidate) => candidate.name === tool)?.readOnly !== true) {
    return `${tool} is not a read-only tool.`;
  }
  const botRefusal = sourceBotRefusal(bot);
  if (botRefusal) return botRefusal;
  if (disabledBuiltinToolSet(bot.disabledBuiltinTools).has(tool)) {
    return `${tool} is switched off for this bot.`;
  }
  const gate = {
    hasProvider: true,
    groupId: null,
    runUserId: bot.userId,
    botUserId: bot.userId,
    messagingChannelRun: false,
    trigger: "routine",
    botSpawnKey: bot.spawnKey,
  };
  const scope = { spaceId: bot.spaceId, userId: bot.userId };
  const unavailable = `This bot does not have ${tool}.`;
  if (FINANCE_TOOL_NAMES.has(tool)) {
    if (!financeToolsAllowed(gate)) return unavailable;
    return (await hasFinanceSource(deps.prisma, scope)) ? null : "No finance source is connected.";
  }
  if (tool === "cap_table_read") return capTableToolsAllowed(gate) ? null : unavailable;
  if (tool === "fundraising_read") return fundraisingToolsAllowed(gate) ? null : unavailable;
  if (tool === "contacts_list") return contactToolsAllowed(gate) ? null : unavailable;
  if (tool === "board_tickets") return deps.ticketBoardEnabled ? null : unavailable;
  return unavailable;
}

/**
 * Run an allowlisted read tool for a source. Scope comes from the bot, never from `args`.
 * Throws PageSourceError when the bot may not use the tool or the tool reports an error.
 */
export async function runPraciSourceTool(
  deps: Pick<PageSourceDeps, "prisma" | "ticketBoardEnabled">,
  input: { spaceId: string; userId: string; bot: SourceBot },
  tool: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { bot } = input;
  if (bot.spaceId !== input.spaceId || bot.userId !== input.userId) {
    throw new PageSourceError("This bot does not belong to this page's owner.");
  }
  const refusal = await praciSourceRefusal(deps, bot, tool);
  if (refusal) throw new PageSourceError(refusal);
  const scope = { spaceId: bot.spaceId, userId: bot.userId };
  const { prisma } = deps;
  let result: Record<string, unknown>;
  if (FINANCE_TOOL_NAMES.has(tool)) {
    result = await financeToolFromTool(tool, { prisma, scope }, args);
  } else if (tool === "cap_table_read" || tool === "contacts_list") {
    result = await contactToolFromTool(tool, { prisma, scope, botId: bot.id }, args);
  } else if (tool === "fundraising_read") {
    result = await fundraisingToolFromTool(tool, { prisma, scope });
  } else {
    result = (await listBoardTickets(
      { prisma, ticketBoardEnabled: deps.ticketBoardEnabled },
      {
        spaceId: scope.spaceId,
        status: args.status !== undefined ? String(args.status) : undefined,
        assigneeBotId: args.ownerBotId !== undefined ? String(args.ownerBotId) : undefined,
        cursor: args.cursor !== undefined ? String(args.cursor) : undefined,
      },
    )) as Record<string, unknown>;
  }
  if (typeof result.error === "string") throw new PageSourceError(result.error.slice(0, 200));
  return result;
}

const botColumns = {
  id: true,
  spaceId: true,
  userId: true,
  spawnKey: true,
  audience: true,
  archivedAt: true,
  disabledBuiltinTools: true,
} as const;

/** Why this bot may not keep any saved source, or null. */
function sourceBotRefusal(bot: SourceBot): string | null {
  if (bot.archivedAt) return "This bot is archived.";
  if (bot.audience === "external" || isGtmAgentSpawnKey(bot.spawnKey)) {
    return "This bot cannot save page sources.";
  }
  return null;
}

/**
 * Run an approved mcp source's one read-only tool call. Three things must hold, each read from the
 * database or the server now: the owner approved this exact call (status active and the stored
 * hash matches the call's hash), the shared read-only rule passes, and both still hold right
 * before the call. Anything else records an error and calls nothing.
 */
async function runMcpSource(
  deps: PageSourceDeps,
  source: Pick<SourceRow, "id" | "spaceId" | "userId" | "botId">,
  bot: SourceBot,
): Promise<unknown> {
  const callServerTool = deps.mcp?.callServerTool?.bind(deps.mcp);
  if (!callServerTool) throw new PageSourceError("MCP is not available.");
  const refusal = sourceBotRefusal(bot);
  if (refusal) throw new PageSourceError(refusal);
  const scope = { spaceId: source.spaceId, botId: source.botId, userId: source.userId };
  const approvedCall = async () => {
    const row = await deps.prisma.pageSource.findFirst({
      where: { id: source.id, spaceId: source.spaceId, userId: source.userId, kind: "mcp" },
      select: { status: true, call: true, approvedCallHash: true },
    });
    const call = McpSourceCallSchema.safeParse(row?.call);
    if (!row || !call.success) throw new PageSourceError("The source is not available.");
    if (row.status !== "active") throw new PageSourceError(`The source is ${row.status}.`);
    if (row.approvedCallHash !== pageSourceCallHash("mcp", call.data)) {
      throw new PageSourceError("The owner has not approved this request.");
    }
    return call.data;
  };
  const check = async (call: { serverId: string; tool: string }) => {
    try {
      return await checkMcpReadSource(deps, scope, call, "page-source");
    } catch (error) {
      throw new PageSourceError(
        (error instanceof Error ? error.message : String(error)).slice(0, 200),
      );
    }
  };
  const call = await approvedCall();
  const server = await check(call);
  const context = mcpSourceContext(scope, "page-source");
  const result: CallToolResult = await callServerTool(server, context, call.tool, call.args, {
    // The session setup awaits; look at the approval and the tool's status again right before the call.
    beforeCall: async () => {
      const again = await approvedCall();
      if (pageSourceCallHash("mcp", again) !== pageSourceCallHash("mcp", call)) {
        throw new PageSourceError("The request changed.");
      }
      await check(again);
    },
  });
  try {
    return unwrapToolResult(result);
  } catch (error) {
    throw new PageSourceError(
      error instanceof Error ? error.message.slice(0, 200) : "Tool failed.",
    );
  }
}

export type RefreshOutcome =
  | { ok: true; value: unknown }
  /** `paused` is set only for the call that paused the source (its fifth failure in a row). */
  | { ok: false; error: string; paused?: true };

/** Never resolves later than `ms`; the timer is always cleared. */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new PageSourceError(`The source took longer than ${Math.round(ms / 1000)} seconds.`),
        ),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rerun one source now. Success stores a snapshot and clears the error; failure keeps the
 * snapshots, records a short error and counts the failure. Announces page.data either way.
 * Only active sources run.
 */
export async function refreshPageSource(
  deps: PageSourceDeps,
  source: SourceRow,
): Promise<RefreshOutcome> {
  if (source.status !== "active") return { ok: false, error: `The source is ${source.status}.` };
  const now = deps.now?.() ?? new Date();
  let outcome: RefreshOutcome;
  try {
    const bot = await deps.prisma.bot.findFirst({
      where: { id: source.botId, spaceId: source.spaceId, userId: source.userId },
      select: botColumns,
    });
    if (!bot) throw new PageSourceError("The bot is gone.");
    const value =
      source.kind === "mcp"
        ? await withTimeout(runMcpSource(deps, source, bot), deps.timeoutMs ?? REFRESH_TIMEOUT_MS)
        : await withTimeout(
            runPraciSourceTool(
              deps,
              { spaceId: source.spaceId, userId: source.userId, bot },
              (source.call as PraciSourceCall).tool,
              (source.call as PraciSourceCall).args ?? {},
            ),
            deps.timeoutMs ?? REFRESH_TIMEOUT_MS,
          );
    const json = JSON.stringify(value);
    const bytes = Buffer.byteLength(json ?? "");
    if (json === undefined) throw new PageSourceError("The tool returned nothing.");
    if (bytes > PAGE_SOURCE_VALUE_MAX_BYTES) {
      throw new PageSourceError("The result is larger than 1 MB. Narrow the tool's arguments.");
    }
    const stored = JSON.parse(json) as object;
    outcome = { ok: true, value: stored };
    await deps.prisma.$transaction(async (tx) => {
      await tx.pageSourceSnapshot.create({
        data: {
          spaceId: source.spaceId,
          sourceId: source.id,
          fetchedAt: now,
          value: stored,
          bytes,
        },
      });
      await tx.pageSource.updateMany({
        where: { id: source.id, spaceId: source.spaceId },
        data: {
          lastRefreshAt: now,
          lastError: null,
          failures: 0,
          leaseUntil: null,
          nextRefreshAt: nextScheduledRefresh(now, source.schedule, deps.random),
        },
      });
    });
  } catch (error) {
    const message =
      error instanceof PageSourceError ? error.message : "The source could not be refreshed.";
    if (!(error instanceof PageSourceError)) {
      getLogger().warn("page source refresh failed", {
        sourceId: source.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const failures = source.failures + 1;
    const pause = failures >= PAGE_SOURCE_PAUSE_AFTER;
    // Only an active source is touched, so the call that pauses it is the only one that reports it.
    const updated = await deps.prisma.pageSource.updateMany({
      where: { id: source.id, spaceId: source.spaceId, status: "active" },
      data: {
        lastError: message,
        failures,
        leaseUntil: null,
        nextRefreshAt: backoffRefresh(now, source.schedule, failures),
        ...(pause ? { status: "paused" } : {}),
      },
    });
    outcome = {
      ok: false,
      error: message,
      ...(pause && updated.count === 1 ? { paused: true } : {}),
    };
  }
  await announcePageData(deps, source);
  return outcome;
}

/** Rerun the page's active sources, skipping any refreshed in the last minute (state is in the database). */
export async function refreshPageSources(
  deps: PageSourceDeps,
  scope: { spaceId: string; botId: string; pageId: string },
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const rows = await deps.prisma.pageSource.findMany({
    where: { ...scope, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  const due = rows.filter(
    (row) =>
      !row.lastRefreshAt || now.getTime() - row.lastRefreshAt.getTime() >= REFRESH_DEBOUNCE_MS,
  );
  for (const row of due) await refreshPageSource(deps, row);
}

export async function listPageSources(
  prisma: PrismaClient,
  scope: { spaceId: string; botId: string; pageId: string },
): Promise<PageSource[]> {
  const rows = await prisma.pageSource.findMany({
    where: scope,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const serverIds = rows.flatMap((row) => {
    const id = row.kind === "mcp" ? (row.call as { serverId?: unknown }).serverId : undefined;
    return typeof id === "string" ? [id] : [];
  });
  const servers = serverIds.length
    ? await prisma.mcpServer.findMany({
        where: { id: { in: serverIds }, spaceId: scope.spaceId },
        select: { id: true, name: true },
      })
    : [];
  const names = new Map(servers.map((server) => [server.id, server.name]));
  return rows.map((row) =>
    toPageSource(row, names.get((row.call as { serverId?: string }).serverId ?? "")),
  );
}

/** Delete a source of this bot's page (its snapshots go with it). False when it is not this bot's. */
export async function removePageSource(
  deps: PageDeps,
  scope: { spaceId: string; botId: string },
  where: { id?: string; pageId?: string; name?: string },
): Promise<boolean> {
  const rows = await deps.prisma.pageSource.findMany({
    where: {
      ...scope,
      ...(where.id ? { id: where.id } : {}),
      ...(where.pageId ? { pageId: where.pageId } : {}),
    },
  });
  const wanted = where.name?.toLowerCase();
  const row = rows.find(
    (candidate) => wanted === undefined || candidate.name.toLowerCase() === wanted,
  );
  if (!row) return false;
  const removed = await deps.prisma.pageSource.deleteMany({ where: { id: row.id, ...scope } });
  if (removed.count === 0) return false;
  await announcePageData(deps, row);
  return true;
}

/** Owner changes to one source of this bot. Null when it is not this bot's. */
export async function updatePageSourceByOwner(
  deps: PageSourceDeps,
  scope: { spaceId: string; botId: string },
  sourceId: string,
  change: { schedule: PageSourceSchedule } | { action: "pause" | "resume" },
): Promise<PageSource | null> {
  const where = { id: sourceId, ...scope };
  const row = await deps.prisma.pageSource.findFirst({ where });
  if (!row) return null;
  const now = deps.now?.() ?? new Date();
  let data: Record<string, unknown> | null = null;
  if ("schedule" in change) {
    data = {
      schedule: change.schedule,
      ...(row.status === "active"
        ? { nextRefreshAt: nextScheduledRefresh(now, change.schedule, deps.random) }
        : {}),
    };
  } else if (change.action === "pause" && row.status === "active") {
    data = { status: "paused" };
  } else if (change.action === "resume" && row.status === "paused") {
    data = { status: "active", failures: 0, nextRefreshAt: now };
  }
  if (!data) return toPageSource(row);
  const saved = await deps.prisma.pageSource.update({ where: { id: row.id }, data });
  await announcePageData(deps, row);
  return toPageSource(saved);
}

// ---- Resolving live blocks ----

type SnapshotRow = { value: unknown; fetchedAt: Date };

function rowsAt(value: unknown, path: string): unknown[] | null {
  try {
    const found = jsonPointerGet(value, path);
    return Array.isArray(found) ? found : null;
  } catch {
    return null;
  }
}

function metricText(value: unknown, block: PageMetricBlock): string | null {
  try {
    return formatPinValue(jsonPointerGet(value, block.path), block.format);
  } catch {
    return null;
  }
}

function tableRows(value: unknown, block: PageTableBlock): unknown[] | null {
  const rows = rowsAt(value, block.path);
  if (!rows) return null;
  const objects = rows
    .slice(0, block.limit)
    .map((row) =>
      row !== null && typeof row === "object" && !Array.isArray(row)
        ? (row as Record<string, unknown>)
        : { value: row },
    );
  const keys = block.columns?.map((column) => column.key) ?? Object.keys(objects[0] ?? {});
  return objects.map((row) => Object.fromEntries(keys.map((key) => [key, row[key] ?? null])));
}

function historyRows(snapshots: SnapshotRow[], path: string): { at: string; value: number }[] {
  const points: { at: string; value: number }[] = [];
  for (const snapshot of snapshots) {
    try {
      const raw = jsonPointerGet(snapshot.value, path);
      const number = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof number === "number" && Number.isFinite(number)) {
        points.push({ at: snapshot.fetchedAt.toISOString(), value: number });
      }
    } catch {
      // A snapshot without the path adds no point.
    }
  }
  return points;
}

type LiveRequest =
  | { kind: "metric"; block: PageMetricBlock }
  | { kind: "table"; block: PageTableBlock }
  | { kind: "chart"; chart: PageChart };

const liveRequests = (content: string): LiveRequest[] =>
  splitPage(content).flatMap((segment): LiveRequest[] => {
    if (segment.kind === "metric") return [{ kind: "metric", block: segment.block }];
    if (segment.kind === "table") return [{ kind: "table", block: segment.block }];
    if (segment.kind === "chart" && segment.chart.source !== undefined) {
      return [{ kind: "chart", chart: segment.chart }];
    }
    return [];
  });

const sourceNameOf = (request: LiveRequest) =>
  request.kind === "chart" ? (request.chart.source ?? "") : request.block.source;

/**
 * Live data for a page: one block per metric, table and sourced chart, in document order.
 * Reads stored snapshots only; it never runs a source.
 */
export async function resolvePageData(
  deps: Pick<PageDeps, "prisma">,
  scope: { spaceId: string },
  page: Pick<BotPage, "id" | "botId" | "content" | "revision">,
): Promise<PageData> {
  const requests = liveRequests(page.content);
  const sources = requests.length
    ? await deps.prisma.pageSource.findMany({
        where: { pageId: page.id, botId: page.botId, spaceId: scope.spaceId },
      })
    : [];
  const byName = new Map(sources.map((source) => [source.name.toLowerCase(), source]));
  const snapshotCache = new Map<string, Promise<SnapshotRow[]>>();
  // Newest first; history charts take up to 500, everything else uses the first.
  const snapshotsOf = (sourceId: string, take: number) => {
    const key = `${sourceId}:${take}`;
    let cached = snapshotCache.get(key);
    if (!cached) {
      cached = deps.prisma.pageSourceSnapshot.findMany({
        where: { sourceId, spaceId: scope.spaceId },
        orderBy: { fetchedAt: "desc" },
        take,
        select: { value: true, fetchedAt: true },
      });
      snapshotCache.set(key, cached);
    }
    return cached;
  };

  const blocks: PageLiveBlock[] = [];
  for (const request of requests) {
    const source = byName.get(sourceNameOf(request).toLowerCase());
    if (!source) {
      blocks.push({ status: "missing", fetchedAt: null });
      continue;
    }
    const history = request.kind === "chart" && request.chart.over === "history";
    const snapshots = await snapshotsOf(source.id, history ? HISTORY_POINTS : 1);
    const latest = snapshots[0];
    const error = source.lastError ?? undefined;
    const base: PageLiveBlock["status"] =
      source.status !== "active"
        ? (source.status as PageLiveBlock["status"])
        : !latest
          ? error
            ? "failed"
            : "empty"
          : error
            ? "failed"
            : "ok";
    if (!latest) {
      blocks.push({ status: base, fetchedAt: null, ...(error ? { error } : {}) });
      continue;
    }
    let shown: { text?: string; rows?: unknown[] } | null = null;
    if (request.kind === "metric") {
      const text = metricText(latest.value, request.block);
      shown = text === null ? null : { text };
    } else if (request.kind === "table") {
      const rows = tableRows(latest.value, request.block);
      shown = rows ? { rows } : null;
    } else if (history) {
      const rows = historyRows([...snapshots].reverse(), request.chart.path ?? "");
      shown = rows.length ? { rows } : null;
    } else {
      const rows = rowsAt(latest.value, request.chart.path ?? "");
      shown = rows ? { rows: rows.slice(0, CHART_MAX_ROWS) } : null;
    }
    blocks.push({
      status: shown ? base : base === "ok" ? "empty" : base,
      fetchedAt: latest.fetchedAt.toISOString(),
      ...(error ? { error } : {}),
      ...(shown ?? {}),
    });
  }
  return { pageId: page.id, revision: page.revision, blocks };
}

/**
 * Server-rendered SVG for each chart fence in document order. A sourced chart plots its resolved
 * rows; without any, it falls back to its own `data`.
 */
export async function pageChartSvgs(
  deps: Pick<PageDeps, "prisma">,
  scope: { spaceId: string },
  page: Pick<BotPage, "id" | "botId" | "content" | "revision">,
): Promise<string[]> {
  const live = (await resolvePageData(deps, scope, page)).blocks;
  let next = 0;
  const svgs: Promise<string>[] = [];
  for (const segment of splitPage(page.content)) {
    if (segment.kind === "metric" || segment.kind === "table") {
      next++;
    } else if (segment.kind === "chart") {
      const block = segment.chart.source !== undefined ? live[next++] : undefined;
      svgs.push(renderPageChartSvg(segment.chart, block?.rows?.length ? block.rows : undefined));
    }
  }
  return Promise.all(svgs);
}

// ---- Bot tools ----

const NO_PAGE = "This bot has no page yet. Call page_create to add one.";

/** Run a page_source_* built-in tool. Scope comes from the run's bot, never from model input. */
export async function pageSourceToolFromTool(
  name: "page_source_list" | "page_source_set" | "page_source_remove",
  deps: PageSourceDeps,
  scope: PageToolScope,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const { prisma } = deps;
  const wantedTitle = typeof args.page === "string" ? args.page.trim() : "";
  let pageId: string | undefined;
  if (wantedTitle) {
    const found = await findPageByTitle(prisma, scope, wantedTitle);
    if (!found) return { error: `There is no page titled "${wantedTitle}". Call page_list.` };
    pageId = found.id;
  }
  const page = await getBotPage(prisma, { spaceId: scope.spaceId, botId: scope.botId, pageId });
  if (!page) return { error: NO_PAGE };
  const pageScope = { spaceId: scope.spaceId, botId: scope.botId, pageId: page.id };
  if (name === "page_source_list") {
    return { page: page.title, sources: await listPageSources(prisma, pageScope) };
  }
  const sourceName = PageSourceNameSchema.safeParse(args.name);
  if (!sourceName.success) {
    return { error: `Source name: ${sourceName.error.issues[0]?.message}` };
  }
  if (name === "page_source_remove") {
    const removed = await removePageSource(deps, pageScope, {
      pageId: page.id,
      name: sourceName.data,
    });
    return removed ? { ok: true } : { error: `There is no source named "${sourceName.data}".` };
  }

  // page_source_set
  if (args.kind !== undefined && args.kind !== "praci" && args.kind !== "mcp") {
    return { error: 'kind must be "praci" or "mcp".' };
  }
  const kind: "praci" | "mcp" = args.kind === "mcp" ? "mcp" : "praci";
  const tool = String(args.tool ?? "");
  if (
    args.args !== undefined &&
    (typeof args.args !== "object" || args.args === null || Array.isArray(args.args))
  ) {
    return { error: "args must be an object." };
  }
  const schedule = PageSourceScheduleSchema.safeParse(args.schedule ?? "1h");
  if (!schedule.success) return { error: "schedule must be one of 15m, 1h, 6h, 1d, 1w." };
  const bot = await prisma.bot.findFirst({
    where: { id: scope.botId, spaceId: scope.spaceId, userId: scope.userId },
    select: { ...botColumns, name: true },
  });
  if (!bot) return { error: "This bot is not available." };
  let call: PraciSourceCall | McpSourceCall;
  let serverName: string | undefined;
  if (kind === "mcp") {
    const refusal = sourceBotRefusal(bot);
    if (refusal) return { error: refusal };
    const wanted = String(args.server ?? "")
      .trim()
      .toLowerCase();
    const assigned = await prisma.botMcpServer.findMany({
      where: {
        botId: scope.botId,
        spaceId: scope.spaceId,
        userId: scope.userId,
        server: { enabled: true, spaceId: scope.spaceId, userId: scope.userId },
      },
      select: { server: { select: { id: true, name: true, slug: true } } },
    });
    const server = assigned
      .map((row) => row.server)
      .find(
        (candidate) =>
          wanted !== "" &&
          [candidate.id, candidate.slug, candidate.name].some(
            (value) => value.toLowerCase() === wanted,
          ),
      );
    if (!server) return { error: "server must be the name of an MCP server assigned to this bot." };
    try {
      await checkMcpReadSource(
        deps,
        { spaceId: scope.spaceId, botId: scope.botId, userId: scope.userId },
        { serverId: server.id, tool },
        "page-source",
      );
    } catch (error) {
      return { error: (error instanceof Error ? error.message : String(error)).slice(0, 200) };
    }
    call = { serverId: server.id, tool, args: (args.args as Record<string, unknown>) ?? {} };
    serverName = server.name;
  } else {
    const refusal = await praciSourceRefusal(deps, bot, tool);
    if (refusal) return { error: refusal };
    call = { tool, args: (args.args as Record<string, unknown>) ?? {} };
  }
  const now = deps.now?.() ?? new Date();
  const callHash = kind === "mcp" ? pageSourceCallHash(kind, call as McpSourceCall) : null;
  const common = {
    kind,
    call: JSON.parse(JSON.stringify(call)),
    schedule: schedule.data,
    status: kind === "mcp" ? "pending" : "active",
    approvedCallHash: null as string | null,
    failures: 0,
    lastError: null,
    leaseUntil: null,
    nextRefreshAt: kind === "mcp" ? null : nextScheduledRefresh(now, schedule.data, deps.random),
  };
  let saved: SourceRow;
  // An mcp source whose call is new or changed needs a card; the same call only changes its schedule.
  let needsCard = false;
  try {
    saved = await prisma.$transaction(async (tx) => {
      const existing = await tx.pageSource.findMany({ where: pageScope });
      const same = existing.find((row) => row.name.toLowerCase() === sourceName.data.toLowerCase());
      if (!same && existing.length >= PAGE_SOURCES_MAX_PER_PAGE) {
        throw new PageSourceError(`This page already has ${PAGE_SOURCES_MAX_PER_PAGE} sources.`);
      }
      if (!same) {
        const inSpace = await tx.pageSource.count({
          where: { spaceId: scope.spaceId, status: { in: ["active", "pending"] } },
        });
        if (inSpace >= PAGE_SOURCES_MAX_PER_SPACE) {
          throw new PageSourceError(
            `This space already has ${PAGE_SOURCES_MAX_PER_SPACE} active sources. Remove one first.`,
          );
        }
        needsCard = kind === "mcp";
        return tx.pageSource.create({
          data: { ...pageScope, userId: scope.userId, name: sourceName.data, ...common },
        });
      }
      const sameCall =
        kind === "mcp" &&
        same.kind === "mcp" &&
        pageSourceCallHash("mcp", same.call as McpSourceCall) === callHash;
      if (sameCall) {
        // Approval is for the call, not the schedule: keep the status. A paused approved source
        // resumes; a denied one stays denied until the call changes.
        const approved = same.approvedCallHash === callHash;
        const resume = same.status === "paused" && approved;
        return tx.pageSource.update({
          where: { id: same.id },
          data: {
            name: sourceName.data,
            schedule: schedule.data,
            ...(resume
              ? {
                  status: "active",
                  failures: 0,
                  lastError: null,
                  leaseUntil: null,
                  nextRefreshAt: now,
                }
              : same.status === "active"
                ? { nextRefreshAt: nextScheduledRefresh(now, schedule.data, deps.random) }
                : {}),
          },
        });
      }
      // A different call means different data: the old snapshots no longer describe the source.
      await tx.pageSourceSnapshot.deleteMany({
        where: { sourceId: same.id, spaceId: scope.spaceId },
      });
      needsCard = kind === "mcp";
      return tx.pageSource.update({
        where: { id: same.id },
        data: { name: sourceName.data, ...common },
      });
    });
  } catch (error) {
    if (error instanceof PageSourceError) return { error: error.message };
    if (isUniqueViolation(error))
      return { error: "A source with that name was just created. Try again." };
    throw error;
  }
  if (kind === "mcp") {
    if (needsCard) {
      const run = await prisma.run.findFirst({
        where: { id: scope.runId, spaceId: scope.spaceId, botId: scope.botId },
        select: { id: true, spaceId: true, userId: true, botId: true, threadId: true },
      });
      if (!run) return { error: "Could not ask the owner. Try again." };
      await postPageSourceApproval(
        deps,
        run,
        bot.name,
        pageSourceApprovalBlock({
          sourceId: saved.id,
          callHash: callHash as string,
          serverName: serverName as string,
          schedule: schedule.data,
          pageTitle: page.title,
          call: call as McpSourceCall,
        }),
      );
      await announcePageData(deps, saved);
    }
    const fresh = await prisma.pageSource.findFirst({
      where: { id: saved.id, spaceId: scope.spaceId },
    });
    const row = fresh ?? saved;
    if (row.status === "pending") {
      return {
        source: toPageSource(row, serverName),
        status: "pending",
        note: "Waiting for the owner's approval",
      };
    }
    if (row.status === "denied") {
      return {
        source: toPageSource(row, serverName),
        status: "denied",
        note: "The owner declined this request. Change the request to ask again.",
      };
    }
    // Approved earlier and unchanged: run it once now like any source.
    const outcome = await refreshPageSource(deps, row);
    const after = await prisma.pageSource.findFirst({
      where: { id: saved.id, spaceId: scope.spaceId },
    });
    return {
      source: toPageSource(after ?? row, serverName),
      preview: outcome.ok
        ? JSON.stringify(outcome.value).slice(0, PREVIEW_CHARS)
        : `Error: ${outcome.error}`,
    };
  }
  const outcome = await refreshPageSource(deps, saved);
  const fresh = await prisma.pageSource.findFirst({
    where: { id: saved.id, spaceId: scope.spaceId },
  });
  const preview = outcome.ok
    ? JSON.stringify(outcome.value).slice(0, PREVIEW_CHARS)
    : `Error: ${outcome.error}`;
  return { source: toPageSource(fresh ?? saved), preview };
}
