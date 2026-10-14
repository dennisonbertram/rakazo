import { randomUUID } from "node:crypto";
import { CRYPTO_CHAINS } from "@rakazo/contracts";
import { usdValueCents } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { Prisma } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { findCryptoServer } from "./blockscout-crypto-call-tool.js";
import type { CryptoFailureKind } from "./blockscout-crypto-errors.js";
import {
  classifyCryptoError,
  cryptoFailureMessage,
  isKeyFailure,
  mostActionable,
} from "./blockscout-crypto-errors.js";
import type { ChainSnapshot, SafeDetails } from "./blockscout-crypto-source.js";
import { fetchChainSnapshot, fetchSafeDetails } from "./blockscout-crypto-source.js";
import type { FinanceCallTool } from "./finance-sync.js";

export interface CryptoSyncDeps {
  prisma: PrismaClient;
  callToolFor(
    server: { id: string; endpoint: string },
    signal: AbortSignal,
  ): Promise<FinanceCallTool>;
  now?: () => Date;
  /** Minimum gap between Blockscout calls (default 250 ms keeps a 5 requests/second plan under its limit). */
  callGapMs?: number;
  /** First wait before retrying a rate-limited call; doubles per retry (default 1000 ms). */
  retryDelayMs?: number;
}

export interface CryptoSyncOptions {
  /** Only these wallets (the add-wallet flow). */
  walletIds?: string[];
  /** Skip the 15-minute throttle. The in-flight claim still applies. */
  force?: boolean;
  signal?: AbortSignal;
}

export type CryptoSyncResult =
  | { ok: true; outcome: "synced" | "skipped"; failedChains: number[] }
  | { ok: false; error: "not_connected" | "failed"; message: string };

const DB_NOW = Prisma.sql`timezone('utc', now())`;
/** Shorter than the 2-minute stale claim. */
const DEADLINE_MS = 100_000;
/** A chain Blockscout refused with 402 (not on the user's plan) is not called again for this long, unless forced. */
const UNAVAILABLE_MS = 6 * 3_600_000;
const MAX_RATE_LIMIT_RETRIES = 2;
// ponytail: remembered in this process only; a restart costs one failed call per such chain. Persist if that ever matters.
const unavailable = new Map<string, number>();

/**
 * Replaces every tracked wallet's holdings with Blockscout's current balances on each chain. The
 * throttle and claim use `finance_sync_states` keyed by the Blockscout McpServer id, like Mercury
 * and Brex. A chain that fails keeps its previous rows and is listed in `failedChains`; the sync
 * fails only when no chain could be read. Without a Blockscout server it returns `not_connected`
 * (the hosted endpoint rejects keyless calls, and calls go through the user's server).
 */
export async function syncCryptoHoldings(
  deps: CryptoSyncDeps,
  scope: { spaceId: string; userId: string },
  opts: CryptoSyncOptions = {},
): Promise<CryptoSyncResult> {
  const { prisma } = deps;
  const { spaceId, userId } = scope;
  const server = await findCryptoServer(prisma, scope);
  if (!server) return { ok: false, error: "not_connected", message: "Blockscout is not connected" };
  const wallets = await prisma.financeWallet.findMany({
    where: { spaceId, userId, ...(opts.walletIds ? { id: { in: opts.walletIds } } : {}) },
    select: { id: true, address: true, type: true },
  });
  if (wallets.length === 0) return { ok: true, outcome: "skipped", failedChains: [] };

  const token = randomUUID();
  const force = opts.force === true;
  await prisma.$executeRaw`
    INSERT INTO finance_sync_states ("mcpServerId", "spaceId", "userId")
    SELECT id, "spaceId", "userId" FROM mcp_servers
    WHERE id = ${server.id} AND "spaceId" = ${spaceId} AND "userId" = ${userId} AND enabled
    ON CONFLICT DO NOTHING`;
  const claimed = await prisma.$queryRaw<unknown[]>`
    UPDATE finance_sync_states
    SET "syncStartedAt" = ${DB_NOW}, "claimToken" = ${token}
    WHERE "mcpServerId" = ${server.id} AND "spaceId" = ${spaceId} AND "userId" = ${userId}
      AND (${force}
        OR (("lastSyncedAt" IS NULL OR "lastSyncedAt" < ${DB_NOW} - interval '15 minutes')
          AND ("lastErrorAt" IS NULL OR "lastErrorAt" < ${DB_NOW} - interval '1 minute')))
      AND ("syncStartedAt" IS NULL OR "syncStartedAt" < ${DB_NOW} - interval '2 minutes')
    RETURNING "mcpServerId"`;
  if (claimed.length === 0) return { ok: true, outcome: "skipped", failedChains: [] };

  const release = (
    error: unknown,
    reason: { message: string; reconnect: boolean } = failureOf(error),
  ) => {
    if (opts.signal?.aborted)
      return prisma.$executeRaw`
        UPDATE finance_sync_states SET "syncStartedAt" = NULL, "claimToken" = NULL
        WHERE "mcpServerId" = ${server.id} AND "claimToken" = ${token}`;
    getLogger().warn("crypto sync failed", { serverId: server.id, reason: reason.message });
    return prisma.$executeRaw`
      UPDATE finance_sync_states
      SET "lastErrorAt" = ${DB_NOW}, "lastError" = ${reason.message},
          "needsReconnect" = ${reason.reconnect}, "syncStartedAt" = NULL, "claimToken" = NULL
      WHERE "mcpServerId" = ${server.id} AND "claimToken" = ${token}`;
  };
  const fail = async (error: unknown): Promise<CryptoSyncResult> => {
    await release(error);
    if (opts.signal?.aborted) return { ok: true, outcome: "skipped", failedChains: [] };
    return { ok: false, error: "failed", message: failureOf(error).message };
  };

  const signal = AbortSignal.any([
    ...(opts.signal ? [opts.signal] : []),
    AbortSignal.timeout(DEADLINE_MS),
  ]);
  type WalletRead = {
    id: string;
    snapshots: Map<number, ChainSnapshot>;
    failed: number[];
    safe: SafeDetails | null;
  };
  const reads: WalletRead[] = [];
  const problems: Array<{ chainId: number; kind: CryptoFailureKind }> = [];
  const nowMs = () => (deps.now ?? (() => new Date()))().getTime();
  try {
    const callTool = pace(await deps.callToolFor(server, signal), deps);
    for (const wallet of wallets) {
      const read: WalletRead = { id: wallet.id, snapshots: new Map(), failed: [], safe: null };
      // Chains are started together, but `pace` runs the calls one at a time.
      await Promise.all(
        CRYPTO_CHAINS.map(async ({ id }) => {
          const key = `${server.id}:${id}`;
          if (!force && (unavailable.get(key) ?? 0) > nowMs()) {
            read.failed.push(id);
            problems.push({ chainId: id, kind: "plan" });
            return;
          }
          try {
            read.snapshots.set(id, await fetchChainSnapshot(callTool, id, wallet.address));
            unavailable.delete(key);
          } catch (error) {
            const kind = classifyCryptoError(error);
            if (kind === "plan") unavailable.set(key, nowMs() + UNAVAILABLE_MS);
            read.failed.push(id);
            problems.push({ chainId: id, kind });
          }
        }),
      );
      signal.throwIfAborted();
      const safeChain = [...read.snapshots].find(([, s]) => s.maybeSafe)?.[0];
      if (safeChain !== undefined && wallet.type !== "exchange") {
        try {
          read.safe = await fetchSafeDetails(callTool, safeChain, wallet.address);
        } catch (error) {
          problems.push({ chainId: safeChain, kind: classifyCryptoError(error) });
        }
      }
      reads.push(read);
    }
  } catch (error) {
    return fail(error);
  }
  const problem = describeProblems(problems);
  if (reads.every((r) => r.snapshots.size === 0)) {
    const message = problem?.message ?? cryptoFailureMessage("failed");
    await release(null, problem ?? failureOf(null));
    return { ok: false, error: "failed", message };
  }

  const failedChains = [...new Set(reads.flatMap((r) => r.failed))].sort((a, b) => a - b);
  const syncedAt = (deps.now ?? (() => new Date()))();
  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        const owned = await tx.$queryRaw<unknown[]>`
          SELECT 1 FROM finance_sync_states
          WHERE "mcpServerId" = ${server.id} AND "claimToken" = ${token}
          FOR UPDATE`;
        if (owned.length === 0) return "skipped" as const;
        // A wallet removed while Blockscout was read is simply not written.
        const live = new Set(
          (
            await tx.financeWallet.findMany({
              where: { spaceId, userId, id: { in: reads.map((r) => r.id) } },
              select: { id: true },
            })
          ).map((w) => w.id),
        );
        for (const read of reads) {
          if (!live.has(read.id)) continue;
          for (const [chainId, snapshot] of read.snapshots) {
            await tx.financeCryptoHolding.deleteMany({
              where: { spaceId, userId, walletId: read.id, chainId },
            });
            await tx.financeCryptoHolding.createMany({
              data: snapshot.holdings.map((h) => ({
                spaceId,
                userId,
                walletId: read.id,
                chainId,
                ...h,
                usdValueCents: usdValueCents(h.rawBalance, h.decimals, h.usdPrice),
                syncedAt,
              })),
            });
          }
          // Safe details only fill in; the user's chosen type is never changed here.
          if (read.safe)
            await tx.financeWallet.updateMany({
              where: { id: read.id, spaceId, userId },
              data: { safeOwners: read.safe.owners, safeThreshold: read.safe.threshold },
            });
        }
        const message = problem?.message ?? null;
        await tx.$executeRaw`
          UPDATE finance_sync_states
          SET "lastSyncedAt" = ${DB_NOW}, "lastErrorAt" = ${message ? DB_NOW : null},
              "lastError" = ${message}, "needsReconnect" = ${problem?.reconnect ?? false},
              "syncStartedAt" = NULL, "claimToken" = NULL
          WHERE "mcpServerId" = ${server.id} AND "claimToken" = ${token}`;
        return "synced" as const;
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
    return { ok: true, outcome, failedChains };
  } catch (error) {
    return fail(error);
  }
}

/** The one message for the page: the most actionable reason, naming the chains that failed for it. */
function describeProblems(
  problems: Array<{ chainId: number; kind: CryptoFailureKind }>,
): { message: string; reconnect: boolean } | null {
  if (problems.length === 0) return null;
  const kind = mostActionable(problems.map((p) => p.kind));
  const failed = new Set(problems.filter((p) => p.kind === kind).map((p) => p.chainId));
  const chains = CRYPTO_CHAINS.filter((c) => failed.has(c.id)).map((c) => c.name);
  return { message: cryptoFailureMessage(kind, chains), reconnect: isKeyFailure(kind) };
}

/** A message for an error that is not tied to one chain. */
function failureOf(error: unknown): { message: string; reconnect: boolean } {
  const kind = classifyCryptoError(error);
  return { message: cryptoFailureMessage(kind), reconnect: isKeyFailure(kind) };
}

/**
 * Wraps the tool caller so calls run one at a time at least `callGapMs` apart (Blockscout's Free plan
 * allows 5 requests/second), retries a rate-limited call with a doubling wait, and stops calling for
 * the rest of the run once the key is missing or rejected, since every further call would fail alike.
 */
function pace(raw: FinanceCallTool, deps: CryptoSyncDeps): FinanceCallTool {
  const gap = deps.callGapMs ?? 250;
  const retryDelay = deps.retryDelayMs ?? 1000;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let tail: Promise<unknown> = Promise.resolve();
  let lastStart = 0;
  let keyError: unknown;
  return (name, args) => {
    const run = tail.then(async () => {
      for (let attempt = 0; ; attempt++) {
        if (keyError) throw keyError;
        const wait = lastStart + gap - Date.now();
        if (wait > 0) await sleep(wait);
        lastStart = Date.now();
        try {
          return await raw(name, args);
        } catch (error) {
          const kind = classifyCryptoError(error);
          if (isKeyFailure(kind)) keyError = error;
          if (kind !== "rate_limit" || attempt >= MAX_RATE_LIMIT_RETRIES) throw error;
          await sleep(retryDelay * 2 ** attempt);
        }
      }
    });
    tail = run.catch(() => undefined);
    return run;
  };
}
