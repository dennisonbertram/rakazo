import type { JobPublisher } from "@rakazo/adapter-kit";
import { runContinueJob } from "@rakazo/adapter-kit";
import {
  expandSkillReferencesInPrompt,
  formatUntrustedDeliveryPayload,
  newRunExternalTaint,
  newRunUnattended,
  normalizePageText,
} from "@rakazo/core";
import type { NotificationEvents, PrismaClient, ThreadEvents } from "@rakazo/db";
import { claimDueWatchChecks, createNotification, recordWatchCheck } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { routineRunModelPin } from "./model-selection.js";
import { listAgentSkillRecords } from "./skill-tools.js";
import { taughtSkillPromptForRoutine } from "./taught-skill-prompt.js";
import type { ResolveHostname } from "./web-ssrf.js";
import { fetchSafeWebText } from "./web-ssrf.js";

export const WATCH_PROBE_TIMEOUT_MS = 15_000;
export const WATCH_PROBE_MAX_BYTES = 2 * 1024 * 1024;
const TICK_LIMIT = 25;
const TICK_CONCURRENCY = 5;
const ACTIVE_RUN_STATUSES = ["queued", "leased", "running", "waiting_input", "waiting_takeover"];

export type ProbeResult =
  | { ok: true; text: string }
  | { ok: false; kind: "transient" | "access"; message: string };

export type ProbeDeps = {
  fetch?: typeof globalThis.fetch;
  resolveHostname?: ResolveHostname;
  signal?: AbortSignal;
};

/** Messages the SSRF policy raises for an address it refuses; retrying cannot help. */
const POLICY_BLOCKED = /^(URL |Only http)/;

/**
 * Fetches a page through the same SSRF-checked fetcher as web_fetch and returns its normalized
 * text. A refused address or a 401/403/404/410 is an "access" error (the watch pauses at once);
 * anything else (network, timeout, 5xx, 429) is transient. Never calls a model.
 */
export async function probePage(url: string, deps: ProbeDeps = {}): Promise<ProbeResult> {
  try {
    const { body } = await fetchSafeWebText(url, {
      fetch: deps.fetch,
      resolveHostname: deps.resolveHostname,
      signal: deps.signal,
      timeoutMs: WATCH_PROBE_TIMEOUT_MS,
      maxBytes: WATCH_PROBE_MAX_BYTES,
      // ponytail: a page over 2 MB is read to the cap, not rejected; its snapshot is 16 KB anyway.
      truncate: true,
    });
    return { ok: true, text: normalizePageText(body) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /^Request failed: HTTP (\d+)/.exec(message)?.[1];
    const access =
      POLICY_BLOCKED.test(message) ||
      (status !== undefined && [401, 403, 404, 410].includes(Number(status)));
    return { ok: false, kind: access ? "access" : "transient", message };
  }
}

export type WatchProbeDeps = ProbeDeps & {
  prisma: PrismaClient;
  jobs: JobPublisher;
  events?: ThreadEvents;
  notificationEvents?: NotificationEvents;
  now?: () => Date;
};

type Wake = {
  routine: { id: string; spaceId: string; botId: string; userId: string };
  url: string;
  diff: string;
};

/** The prompt of a watch wake: the routine's own instruction, then the change fenced as untrusted data. */
export function watchWakePrompt(instruction: string, url: string, diff: string): string {
  return `${instruction}\n\nThe watched page changed (${url}). Changes since you last saw it:\n\n${formatUntrustedDeliveryPayload(
    "[Page Changes]",
    { diff: diff.split("\n") },
  )}`;
}

/** Queues one unattended, externally tainted run for a routine whose page changed. */
export async function createWatchWakeRun(deps: WatchProbeDeps, wake: Wake) {
  const routine = await deps.prisma.routine.findFirst({
    where: { id: wake.routine.id, spaceId: wake.routine.spaceId, active: true },
  });
  if (!routine) return null;
  const bot = await deps.prisma.bot.findUnique({
    where: { id: routine.botId },
    include: { thread: true },
  });
  if (!bot || bot.archivedAt || !bot.thread) return null;
  const target = routine.threadId
    ? await deps.prisma.thread.findFirst({
        where: {
          id: routine.threadId,
          spaceId: routine.spaceId,
          OR: [
            { botId: bot.id },
            { group: { archivedAt: null, members: { some: { botId: bot.id } } } },
          ],
        },
        select: { id: true },
      })
    : null;
  const threadId = target?.id ?? bot.thread.id;
  const skills = await listAgentSkillRecords(deps.prisma, {
    spaceId: routine.spaceId,
    userId: routine.userId,
    botId: routine.botId,
  });
  const prompt = watchWakePrompt(
    expandSkillReferencesInPrompt(
      (await taughtSkillPromptForRoutine(deps.prisma, routine)) ?? routine.prompt,
      skills,
    ),
    wake.url,
    wake.diff,
  );
  const run = await deps.prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        spaceId: routine.spaceId,
        botId: bot.id,
        threadId,
        userId: routine.userId,
        prompt,
        status: "queued",
      },
    });
    return tx.run.create({
      data: {
        spaceId: routine.spaceId,
        botId: bot.id,
        threadId,
        taskId: task.id,
        userId: routine.userId,
        status: "queued",
        trigger: "routine",
        unattended: newRunUnattended({ trigger: "routine" }),
        externalTaint: newRunExternalTaint({ trigger: "routine", source: { externalTaint: true } }),
        routineId: routine.id,
        ...routineRunModelPin(routine),
      },
    });
  });
  await deps.jobs.enqueue(runContinueJob(run.id));
  await deps.prisma.routine.update({ where: { id: routine.id }, data: { lastRunAt: new Date() } });
  try {
    await deps.events?.append({
      spaceId: routine.spaceId,
      threadId,
      botId: bot.id,
      type: "routine.fired",
      runId: run.id,
      payload: { routineId: routine.id, watch: true },
    });
  } catch {
    // Best effort: the run is already queued.
  }
  return run;
}

const PAUSE_REASON: Record<string, string> = {
  access: "the page could not be checked",
  errors: "the page could not be checked",
  noisy: "the page changes too often",
};

async function notifyPaused(
  deps: WatchProbeDeps,
  claim: { routineId: string; spaceId: string; botId: string; userId: string },
  reason: string,
  now: Date,
) {
  const routine = await deps.prisma.routine.findUnique({
    where: { id: claim.routineId },
    select: { name: true },
  });
  const name = (routine?.name ?? "Watch").slice(0, 40);
  const result = await createNotification(deps.prisma, {
    spaceId: claim.spaceId,
    userId: claim.userId,
    botId: claim.botId,
    routineId: claim.routineId,
    surface: "routines",
    title: `${name} paused: ${PAUSE_REASON[reason] ?? "it needs a look"}`,
    importance: "attention",
    dedupeKey: `watch-paused:${claim.routineId}:${now.toISOString()}`,
    skipRateLimits: true,
    now,
  });
  if (result.status === "created") {
    await deps.notificationEvents
      ?.notify(
        { spaceId: claim.spaceId, userId: claim.userId },
        {
          id: result.notification.id,
          surface: result.notification.surface,
          importance: result.notification.importance,
        },
      )
      .catch(() => undefined);
  }
}

/**
 * One tick of the page-watch probe: claim the due watches, fetch each, record the result, and
 * for each real change queue one run. No model is called here.
 */
export async function runWatchProbeTick(deps: WatchProbeDeps) {
  const now = deps.now?.() ?? new Date();
  const claims = await claimDueWatchChecks(deps.prisma, now, TICK_LIMIT);
  const summary = { checked: 0, woke: 0, paused: 0 };
  let next = 0;
  const worker = async () => {
    while (next < claims.length) {
      const claim = claims[next++] as (typeof claims)[number];
      try {
        const probe = await probePage(claim.watch.url, deps);
        const wakeInFlight =
          (await deps.prisma.run.count({
            where: {
              routineId: claim.routineId,
              spaceId: claim.spaceId,
              status: { in: ACTIVE_RUN_STATUSES as never },
            },
          })) > 0;
        const result = await recordWatchCheck(deps.prisma, {
          routineId: claim.routineId,
          spaceId: claim.spaceId,
          now,
          wakeInFlight,
          ...(probe.ok ? { text: probe.text } : { error: { kind: probe.kind } }),
        });
        summary.checked++;
        if (result.outcome === "wake") {
          const run = await createWatchWakeRun(deps, {
            routine: {
              id: claim.routineId,
              spaceId: claim.spaceId,
              botId: claim.botId,
              userId: claim.userId,
            },
            url: claim.watch.url,
            diff: result.diff,
          });
          if (run) summary.woke++;
        } else if (result.outcome === "noisy" || (result.outcome === "error" && result.paused)) {
          summary.paused++;
          await notifyPaused(
            deps,
            claim,
            result.outcome === "noisy" ? "noisy" : (result.pausedReason ?? "errors"),
            now,
          );
        }
      } catch (error) {
        // The lease on the claim expires in 10 minutes and the watch is checked again.
        getLogger().error("watch.probe check failed", error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(TICK_CONCURRENCY, claims.length) }, worker));
  return summary;
}
