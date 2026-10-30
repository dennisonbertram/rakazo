import type { BotPage, BotPageSummary, PageAuthor, PageChart } from "@rakazo/contracts";
import {
  BOT_PAGE_MAX_CHARS,
  BOT_PAGE_MAX_CHARTS,
  BOT_PAGE_MAX_PAGES,
  BOT_PAGE_TITLE_MAX,
  BotPageTitleSchema,
  PageChartInputSchema,
} from "@rakazo/contracts";
import { gtmPageContentError, splitPage } from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { isUniqueViolation } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import type { PlotSpec } from "./plot-tool.js";
import { renderPlotSpecToSvg } from "./plot-tool.js";

export interface PageDeps {
  prisma: PrismaClient;
  events: Pick<ThreadEvents, "append">;
}

export interface PageSaveInput {
  spaceId: string;
  botId: string;
  /** The bot's owner; the caller has already checked the bot belongs to this space and user. */
  userId: string;
  /** Without a pageId, the bot's first page; if it has none, baseRevision 0 creates it. */
  pageId?: string;
  content: string;
  /** 0 creates the page. */
  baseRevision: number;
  updatedBy: PageAuthor;
  gtmPage?: boolean;
  sourceRunId?: string;
}

export type PageSaveResult =
  | { ok: true; page: BotPage }
  | { ok: false; reason: "conflict"; page: BotPage | null };

/** The content is not a valid page. The message is written for the model or user to act on. */
export class PageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageValidationError";
  }
}

/** The title is taken by another page of the bot. Maps to a conflict. */
export class PageConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageConflictError";
  }
}

const FIRST_PAGE_ORDER = [{ createdAt: "asc" }, { id: "asc" }] as const;

async function newDocument(): Promise<Document> {
  // jsdom loads lazily so page-free runs never pay for it.
  const { JSDOM } = await import("jsdom");
  return new JSDOM("").window.document;
}

/** The one place chart rows and spec become an SVG; live chart sources will hook in here. */
function renderChart(chart: PageChart, document: Document): string {
  return renderPlotSpecToSvg(chart.spec as PlotSpec, chart.data, document);
}

/** Render one chart for display. A chart that fails to render yields a small error SVG. */
export async function renderPageChartSvg(chart: PageChart): Promise<string> {
  try {
    return renderChart(chart, await newDocument());
  } catch {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="40"><text x="8" y="24" font-family="system-ui, sans-serif" font-size="13" fill="currentColor">Chart could not be rendered</text></svg>';
  }
}

/** Throws PageValidationError unless every chart fence parses and renders with the PlotSpec rules. */
async function validatePageContent(content: string, gtmPage = false): Promise<void> {
  if (content.length > BOT_PAGE_MAX_CHARS) {
    throw new PageValidationError(
      `The page is ${content.length} characters; the limit is ${BOT_PAGE_MAX_CHARS}.`,
    );
  }
  const gtmError = gtmPageContentError(content, gtmPage);
  if (gtmError) throw new PageValidationError(gtmError);
  const charts: PageChart[] = [];
  for (const segment of splitPage(content)) {
    if (segment.kind === "invalid_chart") {
      throw new PageValidationError(`Invalid chart block: ${segment.error}`);
    }
    if (segment.kind === "chart") {
      const checked = PageChartInputSchema.safeParse(segment.chart);
      if (!checked.success) {
        throw new PageValidationError(`Invalid chart block: ${checked.error.issues[0]?.message}`);
      }
      charts.push(segment.chart);
    }
  }
  if (charts.length > BOT_PAGE_MAX_CHARTS) {
    throw new PageValidationError(
      `The page has ${charts.length} charts; the limit is ${BOT_PAGE_MAX_CHARTS}.`,
    );
  }
  if (charts.length === 0) return;
  const document = await newDocument();
  for (const chart of charts) {
    try {
      renderChart(chart, document);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new PageValidationError(`Chart "${chart.name}" is invalid: ${message}`);
    }
  }
}

type PageRow = {
  id: string;
  botId: string;
  title: string;
  content: string;
  revision: number;
  updatedBy: string;
  updatedAt: Date;
};

function toBotPage(row: PageRow): BotPage {
  return {
    id: row.id,
    botId: row.botId,
    title: row.title,
    content: row.content,
    revision: row.revision,
    updatedBy: row.updatedBy === "user" ? "user" : "bot",
    updatedAt: row.updatedAt.toISOString(),
  };
}

type PageScope = { spaceId: string; botId: string; pageId?: string };

/** One page of the bot: the named one, or the first (oldest) when no pageId is given. */
export async function getBotPage(prisma: PrismaClient, scope: PageScope): Promise<BotPage | null> {
  const row = await prisma.botPage.findFirst({
    where: {
      botId: scope.botId,
      spaceId: scope.spaceId,
      ...(scope.pageId ? { id: scope.pageId } : {}),
    },
    orderBy: [...FIRST_PAGE_ORDER],
  });
  return row ? toBotPage(row) : null;
}

export async function listBotPages(
  prisma: PrismaClient,
  scope: { spaceId: string; botId: string },
): Promise<BotPageSummary[]> {
  const rows = await prisma.botPage.findMany({
    where: { botId: scope.botId, spaceId: scope.spaceId },
    orderBy: [...FIRST_PAGE_ORDER],
  });
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    revision: row.revision,
    updatedAt: row.updatedAt.toISOString(),
  }));
}

/** The bot's page with this title (case-insensitive), or null. */
async function findPageByTitle(
  prisma: PrismaClient,
  scope: { spaceId: string; botId: string },
  title: string,
): Promise<BotPageSummary | null> {
  const wanted = title.trim().toLowerCase();
  return (
    (await listBotPages(prisma, scope)).find((page) => page.title.toLowerCase() === wanted) ?? null
  );
}

function cleanTitle(title: string): string {
  const parsed = BotPageTitleSchema.safeParse(title);
  if (!parsed.success) {
    throw new PageValidationError(`A page title must be 1 to ${BOT_PAGE_TITLE_MAX} characters.`);
  }
  return parsed.data;
}

const duplicateTitle = (title: string) =>
  new PageConflictError(`A page named ${title} already exists`);

/** Create an empty page. Throws PageValidationError at the page cap, PageConflictError on a duplicate title. */
export async function createBotPage(
  deps: PageDeps,
  input: { spaceId: string; botId: string; userId: string; title: string; sourceRunId?: string },
): Promise<BotPage> {
  const title = cleanTitle(input.title);
  const { prisma } = deps;
  const scope = { spaceId: input.spaceId, botId: input.botId };
  let created: PageRow;
  try {
    created = await prisma.$transaction(async (tx) => {
      const existing = await tx.botPage.findMany({ where: scope, select: { title: true } });
      if (existing.length >= BOT_PAGE_MAX_PAGES) {
        throw new PageValidationError(`This bot already has ${BOT_PAGE_MAX_PAGES} pages`);
      }
      // Titles are matched case-insensitively (tools address pages by title), so they must differ that way too.
      if (existing.some((page) => page.title.toLowerCase() === title.toLowerCase())) {
        throw duplicateTitle(title);
      }
      const page = await tx.botPage.create({
        data: {
          ...scope,
          userId: input.userId,
          title,
          content: "",
          revision: 1,
          updatedBy: "user",
        },
      });
      await tx.botPageRevision.create({
        data: { pageId: page.id, revision: 1, content: "", updatedBy: "user" },
      });
      return page;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateTitle(title);
    throw error;
  }
  await announce(deps, input, created, "user", input.sourceRunId);
  return toBotPage(created);
}

export async function renameBotPage(
  prisma: PrismaClient,
  input: { spaceId: string; botId: string; pageId: string; title: string },
): Promise<BotPageSummary | null> {
  const title = cleanTitle(input.title);
  const taken = await findPageByTitle(prisma, input, title);
  if (taken && taken.id !== input.pageId) throw duplicateTitle(title);
  try {
    const claimed = await prisma.botPage.updateMany({
      where: { id: input.pageId, botId: input.botId, spaceId: input.spaceId },
      data: { title },
    });
    if (claimed.count === 0) return null;
  } catch (error) {
    if (isUniqueViolation(error)) throw duplicateTitle(title);
    throw error;
  }
  const page = await getBotPage(prisma, { ...input });
  return page
    ? { id: page.id, title: page.title, revision: page.revision, updatedAt: page.updatedAt }
    : null;
}

/** Delete a page; its revisions go with it (cascade). False when the bot has no such page. */
export async function removeBotPage(
  prisma: PrismaClient,
  input: { spaceId: string; botId: string; pageId: string },
): Promise<boolean> {
  const removed = await prisma.botPage.deleteMany({
    where: { id: input.pageId, botId: input.botId, spaceId: input.spaceId },
  });
  return removed.count > 0;
}

/** Tell the bot's thread a page changed. The saved page is the source of truth; a missed event only delays a refresh. */
async function announce(
  deps: PageDeps,
  input: { spaceId: string; botId: string },
  page: { id: string; revision: number },
  updatedBy: PageAuthor,
  runId?: string,
): Promise<void> {
  const thread = await deps.prisma.thread.findFirst({
    where: { botId: input.botId, spaceId: input.spaceId },
    select: { id: true },
  });
  if (!thread) return;
  await deps.events
    .append({
      spaceId: input.spaceId,
      threadId: thread.id,
      botId: input.botId,
      type: "page.updated",
      runId,
      payload: { pageId: page.id, revision: page.revision, updatedBy },
    })
    .catch((error) => {
      getLogger().warn("page.updated append failed", {
        error: error instanceof Error ? error.message : String(error),
        botId: input.botId,
      });
    });
}

/**
 * Validate and save a bot's page, then announce it on the bot's thread. A stale baseRevision
 * writes nothing and returns the current page. Shared by the pages RPC and the page tools.
 */
export async function saveBotPage(deps: PageDeps, input: PageSaveInput): Promise<PageSaveResult> {
  await validatePageContent(input.content, input.gtmPage ?? false);
  const { prisma } = deps;
  const scope = { spaceId: input.spaceId, botId: input.botId };
  let saved: PageRow | null;
  try {
    saved = await prisma.$transaction(async (tx) => {
      const current = await tx.botPage.findFirst({
        where: { ...scope, ...(input.pageId ? { id: input.pageId } : {}) },
        orderBy: [...FIRST_PAGE_ORDER],
      });
      // A named page that is gone cannot be created by a save.
      if (!current && input.pageId) return null;
      if ((current?.revision ?? 0) !== input.baseRevision) return null;
      const revision = input.baseRevision + 1;
      let page: PageRow & { id: string };
      if (current) {
        // The revision in the where clause makes a concurrent save lose instead of overwrite.
        const claimed = await tx.botPage.updateMany({
          where: { id: current.id, revision: current.revision },
          data: { content: input.content, revision, updatedBy: input.updatedBy },
        });
        if (claimed.count === 0) return null;
        page = {
          ...current,
          content: input.content,
          revision,
          updatedBy: input.updatedBy,
          updatedAt: new Date(),
        };
      } else {
        const bot = await tx.bot.findFirst({ where: { id: input.botId }, select: { name: true } });
        page = await tx.botPage.create({
          data: {
            ...scope,
            userId: input.userId,
            title: bot?.name.trim().slice(0, BOT_PAGE_TITLE_MAX).trim() || "Page",
            content: input.content,
            revision,
            updatedBy: input.updatedBy,
          },
        });
      }
      await tx.botPageRevision.create({
        data: {
          pageId: page.id,
          revision,
          content: input.content,
          updatedBy: input.updatedBy,
          sourceRunId: input.sourceRunId,
        },
      });
      return page;
    });
  } catch (error) {
    // Two creates raced on the same first-page title.
    if (!isUniqueViolation(error)) throw error;
    saved = null;
  }
  if (!saved) {
    return {
      ok: false,
      reason: "conflict",
      page: await getBotPage(prisma, { ...scope, pageId: input.pageId }),
    };
  }
  await announce(deps, input, saved, input.updatedBy, input.sourceRunId);
  return { ok: true, page: toBotPage(saved) };
}

export interface PageToolScope {
  spaceId: string;
  botId: string;
  userId: string;
  runId: string;
  gtmPage?: boolean;
}

const NO_SUCH_PAGE = (title: string) =>
  `There is no page titled "${title}". Call page_list to see the pages, or page_create to add one.`;

/** Run a page_* built-in tool. Scope comes from the run's bot, never from model input. */
export async function pageToolFromTool(
  name: "page_list" | "page_create" | "page_read" | "page_write" | "page_edit",
  deps: PageDeps,
  scope: PageToolScope,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (name === "page_list") {
    return { pages: await listBotPages(deps.prisma, scope) };
  }
  if (name === "page_create") {
    try {
      const page = await createBotPage(deps, {
        spaceId: scope.spaceId,
        botId: scope.botId,
        userId: scope.userId,
        title: String(args.title ?? ""),
        sourceRunId: scope.runId,
      });
      return { ok: true, title: page.title, revision: page.revision };
    } catch (error) {
      if (error instanceof PageValidationError || error instanceof PageConflictError) {
        return { error: error.message };
      }
      throw error;
    }
  }
  let pageId: string | undefined;
  const wantedTitle = typeof args.page === "string" ? args.page.trim() : "";
  if (wantedTitle) {
    const found = await findPageByTitle(deps.prisma, scope, wantedTitle);
    if (!found) return { error: NO_SUCH_PAGE(wantedTitle) };
    pageId = found.id;
  }
  const current = await getBotPage(deps.prisma, { ...scope, pageId });
  if (name === "page_read") {
    return {
      content: current?.content ?? "",
      revision: current?.revision ?? 0,
      ...(current ? { title: current.title } : {}),
    };
  }
  const baseRevision = Number(args.baseRevision);
  if (!Number.isInteger(baseRevision) || baseRevision < 0) {
    return { error: "baseRevision must be the revision from page_read (0 for a new page)." };
  }
  let content: string;
  if (name === "page_write") {
    content = String(args.content ?? "");
  } else {
    const oldString = String(args.old_string ?? "");
    const text = current?.content ?? "";
    const occurrences = oldString ? text.split(oldString).length - 1 : 0;
    if (occurrences !== 1) {
      return {
        error: `old_string must appear exactly once in the page; it appears ${occurrences} times. Call page_read and copy the exact text.`,
      };
    }
    content = text.replace(oldString, () => String(args.new_string ?? ""));
  }
  try {
    const result = await saveBotPage(deps, {
      ...scope,
      pageId,
      content,
      baseRevision,
      updatedBy: "bot",
      sourceRunId: scope.runId,
    });
    if (result.ok) return { ok: true, revision: result.page.revision };
    return {
      error:
        "The page changed since you read it. Nothing was saved; reapply your change to the current content.",
      content: result.page?.content ?? "",
      revision: result.page?.revision ?? 0,
    };
  } catch (error) {
    if (error instanceof PageValidationError) return { error: error.message };
    throw error;
  }
}
