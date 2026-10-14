import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@rakazo/db";
import { createDb } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ERR_PLAN,
  fakeBlockscout,
  holding,
  OWNER_1,
  OWNER_2,
  SAFE_WALLET,
  TOKEN_DAI,
  TOKEN_USDC,
  WALLET_A,
  WALLET_B,
} from "./blockscout-crypto-fake-tools.js";
import { syncCryptoHoldings } from "./blockscout-crypto-sync.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("crypto sync (PostgreSQL)", () => {
  const suffix = `${process.pid}-${Date.now()}`;
  const organizationId = `cry-org-${suffix}`;
  const spaceId = `cry-space-${suffix}`;
  const userId = `cry-user-${suffix}`;
  const otherUserId = `cry-other-${suffix}`;
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let fake = fakeBlockscout();
  const sync = (opts: { force?: boolean; user?: string; walletIds?: string[] } = {}) =>
    syncCryptoHoldings(
      { prisma, callToolFor: async () => fake.callTool, callGapMs: 0, retryDelayMs: 0 },
      { spaceId, userId: opts.user ?? userId },
      opts,
    );
  const addServer = (owner: string) =>
    prisma.mcpServer.create({
      data: {
        spaceId,
        userId: owner,
        slug: `bs-${randomUUID().slice(0, 6)}`,
        name: "Blockscout",
        transport: "streamable-http",
        endpoint: "https://mcp.blockscout.com/mcp",
      },
    });
  const addWallet = (owner: string, address: string, type = "personal") =>
    prisma.financeWallet.create({ data: { spaceId, userId: owner, address, type } });
  const rows = (owner = userId) =>
    prisma.financeCryptoHolding.findMany({
      where: { spaceId, userId: owner },
      orderBy: [{ chainId: "asc" }, { tokenAddress: "asc" }],
    });

  beforeAll(async () => {
    const db = createDb(databaseUrl as string);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    for (const id of [userId, otherUserId])
      await prisma.user.create({
        data: { id, name: id, email: `${id}@rakazo.test`, emailVerified: false },
      });
    await prisma.organization.create({
      data: { id: organizationId, name: "Crypto Org", slug: organizationId, createdAt: new Date() },
    });
    await prisma.space.create({
      data: { id: spaceId, organizationId, name: "General", isDefault: true },
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.organization.deleteMany({ where: { id: organizationId } });
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await close();
  });

  it("is not_connected without a Blockscout server", async () => {
    expect(await sync()).toMatchObject({ ok: false, error: "not_connected" });
  });

  it("stores priced and unpriced holdings, replaces the snapshot, keeps a failing chain, and throttles", async () => {
    const server = await addServer(userId);
    await addWallet(userId, WALLET_A);
    fake = fakeBlockscout({
      chains: {
        1: {
          [WALLET_A]: {
            coinBalance: "1500000000000000000",
            exchangeRate: "2000",
            tokenPages: [
              [holding(TOKEN_USDC, "2500000")],
              [holding(TOKEN_DAI, "7", { decimals: "18", exchange_rate: null })],
            ],
          },
        },
        8453: { [WALLET_A]: { coinBalance: "1000000000000000000", exchangeRate: "2000" } },
      },
    });
    expect(await sync()).toEqual({ ok: true, outcome: "synced", failedChains: [] });
    let held = await rows();
    expect(held.map((r) => [r.chainId, r.tokenAddress, r.usdValueCents])).toEqual([
      [1, "", 300000n],
      [1, TOKEN_USDC, 250n],
      [1, TOKEN_DAI, null],
      [8453, "", 200000n],
    ]);
    expect(
      (await prisma.financeSyncState.findUniqueOrThrow({ where: { mcpServerId: server.id } }))
        .lastSyncedAt,
    ).not.toBeNull();

    const calls = fake.calls.length;
    expect(await sync()).toMatchObject({ outcome: "skipped" });
    expect(fake.calls).toHaveLength(calls);

    // Ethereum drops USDC and DAI; Base fails and must keep its old row.
    fake = fakeBlockscout({
      failChains: [8453],
      chains: { 1: { [WALLET_A]: { coinBalance: "1000000000000000000", exchangeRate: "2000" } } },
    });
    expect(await sync({ force: true })).toEqual({
      ok: true,
      outcome: "synced",
      failedChains: [8453],
    });
    held = await rows();
    expect(held.map((r) => [r.chainId, r.tokenAddress, r.usdValueCents])).toEqual([
      [1, "", 200000n],
      [8453, "", 200000n],
    ]);
    const state = await prisma.financeSyncState.findUniqueOrThrow({
      where: { mcpServerId: server.id },
    });
    expect(state.lastError).toBe("Base: Blockscout rate limit reached, try again shortly");
  });

  it("shows a chain on a Free plan as needing a paid plan, keeps its rows, and skips it until forced", async () => {
    const owner = `${userId}-plan`;
    await prisma.user.create({
      data: { id: owner, name: owner, email: `${owner}@rakazo.test`, emailVerified: false },
    });
    const server = await addServer(owner);
    await addWallet(owner, WALLET_A);
    const ok = {
      chains: {
        1: { [WALLET_A]: { coinBalance: "1000000000000000000", exchangeRate: "2000" } },
        8453: { [WALLET_A]: { coinBalance: "1000000000000000000", exchangeRate: "2000" } },
      },
    };
    fake = fakeBlockscout(ok);
    await sync({ user: owner });
    expect(await rows(owner)).toHaveLength(2);

    fake = fakeBlockscout({ ...ok, chainErrors: { 8453: ERR_PLAN, 137: ERR_PLAN } });
    expect(await sync({ user: owner, force: true })).toMatchObject({
      ok: true,
      failedChains: [137, 8453].sort((a, b) => a - b),
    });
    expect(
      (await prisma.financeSyncState.findUniqueOrThrow({ where: { mcpServerId: server.id } }))
        .lastError,
    ).toBe("Base and Polygon need a paid Blockscout plan, or your credits ran out");
    expect(await rows(owner)).toHaveLength(2);

    // Not forced: the refused chains are not called again.
    await prisma.$executeRaw`UPDATE finance_sync_states SET "lastSyncedAt" = now() - interval '20 minutes', "lastErrorAt" = now() - interval '20 minutes' WHERE "mcpServerId" = ${server.id}`;
    fake = fakeBlockscout(ok);
    await sync({ user: owner });
    expect(new Set(fake.calls.map((c) => Number(c.args.chain_id)))).toEqual(
      new Set([1, 42161, 10]),
    );
  });

  it("records a Safe's owners and threshold without changing the user's type, and never touches an exchange", async () => {
    const safe = await addWallet(userId, SAFE_WALLET, "contract");
    const exchange = await addWallet(userId, WALLET_B, "exchange");
    fake = fakeBlockscout({
      chains: {
        1: {
          [SAFE_WALLET]: { isContract: true, implementations: [{ name: "SafeL2" }] },
          [WALLET_B]: { isContract: true, implementations: [{ name: "SafeL2" }] },
        },
      },
      safe: { owners: [OWNER_1, OWNER_2], threshold: 2 },
    });
    await sync({ force: true });
    const after = await prisma.financeWallet.findUniqueOrThrow({ where: { id: safe.id } });
    expect([after.type, after.safeOwners, after.safeThreshold]).toEqual([
      "contract",
      [OWNER_1, OWNER_2],
      2,
    ]);
    expect(
      (await prisma.financeWallet.findUniqueOrThrow({ where: { id: exchange.id } })).safeOwners,
    ).toBeNull();
  });

  it("never reads or writes another user's wallets", async () => {
    await addServer(otherUserId);
    const theirs = await addWallet(otherUserId, WALLET_A);
    fake = fakeBlockscout({
      chains: { 1: { [WALLET_A]: { coinBalance: "5", exchangeRate: "1" } } },
    });
    const mine = await rows();
    await sync({ force: true, user: otherUserId, walletIds: [theirs.id] });
    expect(await rows(otherUserId)).toHaveLength(1);
    expect(await rows()).toEqual(mine);
    // Asking for the other user's wallet id as myself syncs nothing.
    const before = fake.calls.length;
    expect(await sync({ force: true, walletIds: [theirs.id] })).toMatchObject({
      outcome: "skipped",
    });
    expect(fake.calls).toHaveLength(before);
  });
});
