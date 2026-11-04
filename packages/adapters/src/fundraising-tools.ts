import type { ProspectImportRow } from "@rakazo/contracts";
import {
  FundraiseRoundSaveInputSchema,
  isInvestorsAgentSpawnKey,
  PROSPECT_IMPORT_MAX,
  ProspectImportRowSchema,
} from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import {
  FundraiseRoundOpenError,
  getFundraisingOverview,
  IsolationError,
  importProspects,
  saveRound,
} from "@rakazo/db";
import { mailToolsAllowed } from "./mail-tools.js";

/** The Investors agent's read of the Fundraising page, and its one write: starting or editing the round. */
export const FUNDRAISING_TOOL_NAMES = new Set([
  "fundraising_read",
  "fundraising_round_save",
  "fundraising_prospects_save",
]);

/** Only the Investors agent, on a run its owner started. */
export function fundraisingToolsAllowed(
  options: Parameters<typeof mailToolsAllowed>[0] & { botSpawnKey: string | null | undefined },
): boolean {
  return isInvestorsAgentSpawnKey(options.botSpawnKey) && mailToolsAllowed(options);
}

const dollars = (cents: number | null | undefined) => (cents == null ? null : cents / 100);

type FundraisingToolDeps = {
  prisma: Pick<
    PrismaClient,
    "$transaction" | "$executeRaw" | "contact" | "fundraiseRound" | "safe"
  >;
  /** The agent running the tool, from the run, for "added by". */
  botId?: string;
  /** From the run (the bot owner), never from model input. */
  scope: { spaceId: string; userId: string };
};

/** Whole US dollars from the model become the cents the Fundraising page stores. */
const toCents = (usd: unknown) =>
  typeof usd === "number" && Number.isFinite(usd) && usd > 0 ? Math.round(usd * 100) : null;

/**
 * Starts the round or edits the open one through the same `saveRound` the Fundraising page uses.
 * The card has already been approved by the time this runs. Mercury stays the only SAFE record.
 */
async function saveRoundFromTool(
  deps: FundraisingToolDeps,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const parsed = FundraiseRoundSaveInputSchema.safeParse({
    id: typeof args.id === "string" && args.id ? args.id : undefined,
    name: args.name,
    targetCents: toCents(args.targetUsd),
    capCents: toCents(args.postMoneyCapUsd),
  });
  if (!parsed.success) {
    return { error: "Pass name, targetUsd and postMoneyCapUsd as whole US dollars above zero." };
  }
  try {
    const round = await saveRound(deps.prisma, deps.scope, parsed.data);
    return {
      ok: true,
      round: {
        id: round.id,
        name: round.name,
        status: "open",
        targetUsd: dollars(round.targetCents),
        postMoneyCapUsd: dollars(round.capCents),
      },
    };
  } catch (error) {
    if (error instanceof FundraiseRoundOpenError) {
      return {
        error:
          "A round is already open. Call fundraising_read for its id and pass it as id to change it, or ask the user to close it on the Fundraising page first.",
      };
    }
    if (error instanceof IsolationError) {
      return { error: "That round was not found, or it is closed and cannot be edited." };
    }
    return { error: "Fundraising tool failed" };
  }
}

/**
 * Adds or updates up to PROSPECT_IMPORT_MAX prospects through the db import, which dedupes and keeps
 * what the owner edited. A row is data: it is parsed against a fixed schema that names no kind, id or round.
 */
async function saveProspectsFromTool(
  deps: FundraisingToolDeps,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const raw = Array.isArray(args.rows) ? args.rows : [];
  if (raw.length === 0) return { error: "Pass rows: a list of prospects." };
  if (raw.length > PROSPECT_IMPORT_MAX) {
    return {
      error: `At most ${PROSPECT_IMPORT_MAX} rows per call; you passed ${raw.length}. Split the list and call again.`,
    };
  }
  const invalid: { row: number; name: string; reason: string }[] = [];
  const valid: { row: number; value: ProspectImportRow }[] = [];
  raw.forEach((item, index) => {
    const r = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const label = String(r.name ?? r.firm ?? "").slice(0, 200);
    const cents = r.amountUsd == null ? null : toCents(r.amountUsd);
    if (r.amountUsd != null && cents == null) {
      invalid.push({
        row: index + 1,
        name: label,
        reason: "amountUsd must be US dollars above zero.",
      });
      return;
    }
    const parsed = ProspectImportRowSchema.safeParse({
      name: r.name,
      firm: r.firm,
      email: r.email,
      stage: r.stage,
      checkSizeCents: cents,
      nextStep: r.nextStep,
      notes: r.notes,
    });
    if (parsed.success) valid.push({ row: index + 1, value: parsed.data });
    else
      invalid.push({
        row: index + 1,
        name: label,
        reason: parsed.error.issues[0]?.message ?? "Invalid row.",
      });
  });
  try {
    const result = await importProspects(
      deps.prisma,
      deps.scope,
      valid.map((v) => v.value),
      { overwrite: args.overwrite === true, botId: deps.botId },
    );
    const original = (list: { row: number; name: string; reason: string }[]) =>
      list.map((item) => ({ ...item, row: valid[item.row - 1]?.row ?? item.row }));
    return {
      added: result.added,
      updated: result.updated,
      skipped: original(result.skipped),
      failed: [...invalid, ...original(result.failed)].sort((a, b) => a.row - b.row),
    };
  } catch {
    return { error: "Fundraising tool failed" };
  }
}

export async function fundraisingToolFromTool(
  name: string,
  deps: FundraisingToolDeps,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  if (name === "fundraising_prospects_save") return saveProspectsFromTool(deps, args);
  if (name === "fundraising_round_save") return saveRoundFromTool(deps, args);
  if (name !== "fundraising_read") return { error: `Unknown fundraising tool ${name}` };
  try {
    const { round, pendingCents, signedCents, fundedCents, prospects, safes } =
      await getFundraisingOverview(deps.prisma, deps.scope);
    const open = round && !round.closedAt ? round : null;
    return {
      round: round && {
        id: round.id,
        name: round.name,
        status: open ? "open" : "closed",
        targetUsd: dollars(round.targetCents),
        postMoneyCapUsd: dollars(round.capCents),
        closedAt: round.closedAt,
      },
      // Check size of the open round's Committed prospects; zero with no open round.
      pendingUsd: dollars(pendingCents),
      // SAFE money of the shown round: signed (not yet paid) and funded (paid).
      signedUsd: dollars(signedCents),
      fundedUsd: dollars(fundedCents),
      safes: safes.map((s) => ({
        investor: s.investorName,
        source: s.source,
        status: s.status,
        amountUsd: dollars(s.amountCents),
        postMoneyCapUsd: dollars(s.capCents),
        sentAt: s.sentAt,
        paidAt: s.paidAt,
        inShownRound: Boolean(round) && s.roundId === round?.id,
      })),
      prospects: prospects.map((p) => ({
        name: p.name,
        email: p.email,
        organization: p.organization,
        stage: p.stage,
        checkSizeUsd: dollars(p.checkSizeCents),
        nextStep: p.nextStep,
        countsInPending: Boolean(open) && p.stage === "committed" && p.roundId === open?.id,
      })),
    };
  } catch {
    return { error: "Fundraising tool failed" };
  }
}
