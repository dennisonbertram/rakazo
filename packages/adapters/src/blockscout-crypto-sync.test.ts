import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import { classifyCryptoError, cryptoFailureMessage } from "./blockscout-crypto-errors.js";
import {
  ERR_KEYLESS,
  ERR_PLAN,
  ERR_REJECTED,
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
import type { FinanceCallTool } from "./finance-sync.js";

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

  it("reads owners printed as a list, and surfaces a plan error instead of returning null", async () => {
    const listed: FinanceCallTool = async (_n, args) => ({
      data: { result: args.function_name === "getOwners" ? `['${OWNER_1}', '${OWNER_2}']` : "2" },
    });
    expect(await fetchSafeDetails(listed, 1, SAFE_WALLET)).toEqual({
      owners: [OWNER_1, OWNER_2],
      threshold: 2,
    });
    const refused: FinanceCallTool = async () => {
      throw new Error(ERR_PLAN);
    };
    await expect(fetchSafeDetails(refused, 1, SAFE_WALLET)).rejects.toThrow("credits exhausted");
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

  const fast = { callGapMs: 0, retryDelayMs: 0 };
  /** Prisma stand-in that records the values written to the sync state. */
  const recording = () => {
    const written: unknown[][] = [];
    const prisma = base({
      $executeRaw: async (_s: TemplateStringsArray, ...values: unknown[]) => {
        written.push(values);
        return 1;
      },
    });
    return { prisma, errors: () => written.flat().filter((v) => typeof v === "string") };
  };

  it("fails and writes nothing when every chain errors", async () => {
    const fake = fakeBlockscout({ failChains: [1, 8453, 42161, 10, 137] });
    const transaction = vi.fn();
    const prisma = base({ $transaction: transaction });
    const result = await syncCryptoHoldings(
      { prisma, callToolFor: async () => fake.callTool, ...fast },
      scope,
    );
    expect(result).toMatchObject({ ok: false, error: "failed" });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("tells the keyless refusal from a rejected key, and stops calling after the first", async () => {
    for (const [text, message] of [
      [ERR_KEYLESS, "Add a Blockscout API key"],
      [ERR_REJECTED, "Blockscout rejected the API key"],
    ] as const) {
      const fake = fakeBlockscout({ allError: text });
      const { prisma, errors } = recording();
      const result = await syncCryptoHoldings(
        { prisma, callToolFor: async () => fake.callTool, ...fast },
        scope,
        { force: true },
      );
      expect(result).toEqual({ ok: false, error: "failed", message });
      expect(errors()).toContain(message);
      // One call fails; the other chains' queued calls never reach the server.
      expect(fake.calls.length).toBe(1);
    }
  });

  it("names every chain that needs a paid plan when all of them do", async () => {
    const fake = fakeBlockscout({
      chainErrors: { 1: ERR_PLAN, 8453: ERR_PLAN, 42161: ERR_PLAN, 10: ERR_PLAN, 137: ERR_PLAN },
    });
    const result = await syncCryptoHoldings(
      { prisma: base(), callToolFor: async () => fake.callTool, ...fast },
      scope,
      { force: true },
    );
    expect(result).toMatchObject({
      message:
        "Ethereum, Base, Arbitrum One, Optimism and Polygon need a paid Blockscout plan, or your credits ran out",
    });
  });

  it("calls one at a time and retries a rate-limited call", async () => {
    const fake = fakeBlockscout({
      maxConcurrent: 1,
      rateLimitFirst: 2,
      chains: { 1: { [WALLET_A]: { coinBalance: "5", exchangeRate: "1" } } },
    });
    const transaction = vi.fn(async () => "synced");
    const result = await syncCryptoHoldings(
      {
        prisma: base({ $transaction: transaction }),
        callToolFor: async () => fake.callTool,
        ...fast,
      },
      scope,
      { force: true },
    );
    expect(result).toMatchObject({ ok: true, failedChains: [] });
    expect(fake.calls.length).toBeGreaterThan(10);
  });
});

describe("classifyCryptoError", () => {
  it.each([
    [ERR_PLAN, "plan"],
    [ERR_KEYLESS, "missing_key"],
    [ERR_REJECTED, "rejected_key"],
    ["Tool failed: 403 Forbidden", "rejected_key"],
    ["Tool failed: 429 Too Many Requests - Details: x", "rate_limit"],
    ["The operation timed out", "timeout"],
    ["boom", "failed"],
  ])("%s", (text, kind) => {
    expect(classifyCryptoError(new Error(text))).toBe(kind);
  });

  it("words each cause for the page without vendor text", () => {
    expect(cryptoFailureMessage("plan", ["Base", "Polygon"])).toBe(
      "Base and Polygon need a paid Blockscout plan, or your credits ran out",
    );
    expect(cryptoFailureMessage("plan", ["Base"])).toBe(
      "Base needs a paid Blockscout plan, or your credits ran out",
    );
    expect(cryptoFailureMessage("rate_limit", ["Optimism"])).toBe(
      "Optimism: Blockscout rate limit reached, try again shortly",
    );
  });
});
