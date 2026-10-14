import { randomUUID } from "node:crypto";
import { CRYPTO_CHAINS } from "@rakazo/contracts";
import { usdValueCents } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { Prisma } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { findCryptoServer } from "./blockscout-crypto-call-tool.js";
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
const CHAIN_NAME = new Map<number, string>(CRYPTO_CHAINS.map((c) => [c.id, c.name]));

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

  const release = (error: unknown) => {
    if (opts.signal?.aborted)
      return prisma.$executeRaw`
        UPDATE finance_sync_states SET "syncStartedAt" = NULL, "claimToken" = NULL
        WHERE "mcpServerId" = ${server.id} AND "claimToken" = ${token}`;
    const reason = failureReason(error);
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
    return { ok: false, error: "failed", message: failureReason(error).message };
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
  let lastError: unknown;
  try {
    const callTool = await deps.callToolFor(server, signal);
    // ponytail: wallets one after another, chains in parallel; fine for a handful of wallets inside the deadline.
    for (const wallet of wallets) {
      const read: WalletRead = { id: wallet.id, snapshots: new Map(), failed: [], safe: null };
      await Promise.all(
        CRYPTO_CHAINS.map(async ({ id }) => {
          try {
            read.snapshots.set(id, await fetchChainSnapshot(callTool, id, wallet.address));
          } catch (error) {
            lastError = error;
            read.failed.push(id);
          }
        }),
      );
      signal.throwIfAborted();
      const safeChain = [...read.snapshots].find(([, s]) => s.maybeSafe)?.[0];
      if (safeChain !== undefined && wallet.type !== "exchange")
        read.safe = await fetchSafeDetails(callTool, safeChain, wallet.address);
      reads.push(read);
    }
  } catch (error) {
    return fail(error);
  }
  if (reads.every((r) => r.snapshots.size === 0)) return fail(lastError);

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
        const message = failedChains.length
          ? `Could not read ${failedChains.map((c) => CHAIN_NAME.get(c) ?? c).join(", ")}`
          : null;
        await tx.$executeRaw`
          UPDATE finance_sync_states
          SET "lastSyncedAt" = ${DB_NOW}, "lastErrorAt" = ${message ? DB_NOW : null},
              "lastError" = ${message}, "needsReconnect" = false,
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

/** A short reason for the page: never a vendor payload, key or URL. */
function failureReason(error: unknown): { message: string; reconnect: boolean } {
  const text = error instanceof Error ? error.message : "";
  if (/unauthori[sz]ed|\b40[13]\b|api key|session_id.*no longer/i.test(text))
    return { message: "Blockscout rejected the API key", reconnect: true };
  if (/out of credits|\b402\b/i.test(text))
    return { message: "Blockscout is out of credits", reconnect: false };
  if (error instanceof Error && (error.name === "TimeoutError" || /timed? ?out/i.test(text)))
    return { message: "The request timed out", reconnect: false };
  return { message: "The request failed", reconnect: false };
}
