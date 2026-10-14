import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import {
  fakeBlockscout,
  holding,
  OWNER_1,
  OWNER_2,
  SAFE_WALLET,
  TOKEN_DAI,
  TOKEN_SPAM,
  TOKEN_USDC,
  WALLET_A,
} from "./blockscout-crypto-fake-tools.js";
import {
  fetchChainSnapshot,
  fetchSafeDetails,
  resolveEnsName,
} from "./blockscout-crypto-source.js";
import { syncCryptoHoldings } from "./blockscout-crypto-sync.js";

const scope = { spaceId: "space-1", userId: "user-1" };

describe("fetchChainSnapshot", () => {
  it("reads native balance and price, follows the token cursor, and skips junk rows", async () => {
    const fake = fakeBlockscout({
      chains: {
        1: {
          [WALLET_A]: {
            coinBalance: "2000000000000000000",
            exchangeRate: "2500.5",
            tokenPages: [
              [holding(TOKEN_USDC, "1500000"), holding(TOKEN_SPAM, "0")],
              [holding(TOKEN_DAI, "5", { decimals: "18", exchange_rate: null }), { nope: 1 }],
            ],
          },
        },
      },
    });
    const snap = await fetchChainSnapshot(fake.callTool, 1, WALLET_A);
    expect(snap.holdings.map((h) => [h.tokenAddress, h.rawBalance, h.usdPrice])).toEqual([
      ["", "2000000000000000000", "2500.5"],
      [TOKEN_USDC, "1500000", "1.00"],
      [TOKEN_DAI, "5", null],
    ]);
    expect(fake.calls.filter((c) => c.name === "get_tokens_by_address")).toHaveLength(2);
  });

  it("keeps a scientific-notation price and lowercases mixed-case addresses (shapes seen live)", async () => {
    const fake = fakeBlockscout({
      chains: {
        1: {
          [WALLET_A]: {
            isContract: true,
            implementations: [{ name: "AmbireAccount7702" }],
            tokenPages: [
              [
                holding("0xAbCdEf0123456789aBcDeF0123456789AbCdEf01", "100", {
                  exchange_rate: "5.88079E-10",
                }),
              ],
            ],
          },
        },
      },
    });
    const snap = await fetchChainSnapshot(fake.callTool, 1, WALLET_A);
    expect(snap.holdings[0]).toMatchObject({
      tokenAddress: "0xabcdef0123456789abcdef0123456789abcdef01",
      usdPrice: "5.88079E-10",
    });
    expect(snap.maybeSafe).toBe(false);
  });

  it("calls the native coin POL on Polygon and returns nothing for an empty account", async () => {
    const fake = fakeBlockscout({ chains: { 137: { [WALLET_A]: { coinBalance: "7" } } } });
    expect((await fetchChainSnapshot(fake.callTool, 137, WALLET_A)).holdings[0]?.symbol).toBe(
      "POL",
    );
    expect((await fetchChainSnapshot(fake.callTool, 10, WALLET_A)).holdings).toEqual([]);
  });

  it("flags a Safe by implementation name and reads owners and threshold", async () => {
    const fake = fakeBlockscout({
      chains: { 1: { [SAFE_WALLET]: { isContract: true, implementations: [{ name: "SafeL2" }] } } },
      safe: { owners: [OWNER_1.toUpperCase().replace("0X", "0x"), OWNER_2], threshold: 2 },
    });
    expect((await fetchChainSnapshot(fake.callTool, 1, SAFE_WALLET)).maybeSafe).toBe(true);
    expect(await fetchSafeDetails(fake.callTool, 1, SAFE_WALLET)).toEqual({
      owners: [OWNER_1, OWNER_2],
      threshold: 2,
    });
  });

  it("returns null Safe details when the contract does not answer", async () => {
    const fake = fakeBlockscout();
    expect(await fetchSafeDetails(fake.callTool, 1, SAFE_WALLET)).toBeNull();
  });
});

describe("resolveEnsName", () => {
  it("returns a lowercase address, or null when unresolved", async () => {
    const fake = fakeBlockscout({
      ens: { "alice.test": WALLET_A.toUpperCase().replace("0X", "0x"), "no.test": null },
    });
    expect(await resolveEnsName(fake.callTool, "alice.test")).toBe(WALLET_A);
    expect(await resolveEnsName(fake.callTool, "no.test")).toBeNull();
  });
});

describe("syncCryptoHoldings", () => {
  const base = (over: Record<string, unknown> = {}) =>
    ({
      mcpServer: {
        findMany: async () => [{ id: "srv", endpoint: "https://mcp.blockscout.com/mcp" }],
      },
      financeWallet: { findMany: async () => [{ id: "w1", address: WALLET_A, type: "personal" }] },
      $executeRaw: async () => 1,
      $queryRaw: async () => [{}],
      ...over,
    }) as unknown as PrismaClient;

  it("returns not_connected without a Blockscout server and never calls out", async () => {
    const callToolFor = vi.fn();
    const prisma = base({
      mcpServer: { findMany: async () => [{ id: "m", endpoint: "https://mcp.mercury.com/mcp" }] },
    });
    expect(await syncCryptoHoldings({ prisma, callToolFor }, scope)).toMatchObject({
      ok: false,
      error: "not_connected",
    });
    expect(callToolFor).not.toHaveBeenCalled();
  });

  it("skips when throttled", async () => {
    const callToolFor = vi.fn();
    const prisma = base({ $queryRaw: async () => [] });
    expect(await syncCryptoHoldings({ prisma, callToolFor }, scope)).toEqual({
      ok: true,
      outcome: "skipped",
      failedChains: [],
    });
    expect(callToolFor).not.toHaveBeenCalled();
  });

  it("fails and writes nothing when every chain errors", async () => {
    const fake = fakeBlockscout({ failChains: [1, 8453, 42161, 10, 137] });
    const transaction = vi.fn();
    const prisma = base({ $transaction: transaction });
    const result = await syncCryptoHoldings(
      { prisma, callToolFor: async () => fake.callTool },
      scope,
    );
    expect(result).toMatchObject({ ok: false, error: "failed" });
    expect(transaction).not.toHaveBeenCalled();
  });
});
