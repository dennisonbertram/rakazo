import type { CryptoHolding } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { parseWalletInput, summarizeCrypto, usdValueCents } from "./crypto.js";

const DEAD = "0x000000000000000000000000000000000000dEaD";

describe("parseWalletInput", () => {
  it("lowercases a 0x address", () => {
    expect(parseWalletInput(` ${DEAD} `)).toEqual({ kind: "address", address: DEAD.toLowerCase() });
  });
  it("detects an ENS name and lowercases it", () => {
    expect(parseWalletInput("Example.ETH")).toEqual({ kind: "ens", name: "example.eth" });
    expect(parseWalletInput("sub.example.xyz")).toEqual({ kind: "ens", name: "sub.example.xyz" });
  });
  it("rejects junk and short or non-hex addresses", () => {
    for (const bad of [
      "",
      "0x123",
      `0x${"g".repeat(40)}`,
      "nodot",
      "has space.eth",
      "a..eth",
      ".eth",
    ]) {
      expect(parseWalletInput(bad)).toBeNull();
    }
  });
});

describe("usdValueCents", () => {
  it("converts with BigInt: 1.5 ETH at $2000", () => {
    expect(usdValueCents("1500000000000000000", 18, "2000")).toBe(300000n);
  });
  it("rounds half up", () => {
    // 0.005 USD = 0.5 cent -> 1
    expect(usdValueCents("5", 3, "1")).toBe(1n);
    // 0.0049 USD -> 0
    expect(usdValueCents("49", 4, "1")).toBe(0n);
  });
  it("keeps precision beyond a double", () => {
    // 123456789012345678901234567890 raw @ 6 decimals, price 1.000001 -> exact integer math
    expect(usdValueCents("123456789012345678901234567890", 6, "1.000001")).toBe(
      12345691246913469124691347n,
    );
  });
  it("handles tiny prices and exponent notation", () => {
    expect(usdValueCents("1000000000000000000000000", 18, "0.00001234")).toBe(1234n);
    expect(usdValueCents("1000000000000000000000000", 18, "1.234e-5")).toBe(1234n);
  });
  it("returns null when unpriced, zero priced or malformed", () => {
    expect(usdValueCents("100", 0, null)).toBeNull();
    expect(usdValueCents("100", 0, "0")).toBeNull();
    expect(usdValueCents("100", 0, "abc")).toBeNull();
    expect(usdValueCents("-1", 0, "1")).toBeNull();
    expect(usdValueCents("1.5", 0, "1")).toBeNull();
  });
});

const holding = (over: Partial<CryptoHolding>): CryptoHolding => ({
  walletId: "w1",
  chainId: 1,
  tokenAddress: null,
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  rawBalance: "1",
  usdPrice: "1",
  usdValueCents: 100,
  syncedAt: "2026-10-16T10:00:00.000Z",
  ...over,
});

describe("summarizeCrypto", () => {
  it("totals priced holdings by chain and wallet, largest first", () => {
    const s = summarizeCrypto([
      holding({ usdValueCents: 500 }),
      holding({ walletId: "w2", chainId: 8453, usdValueCents: 700 }),
      holding({ walletId: "w2", chainId: 1, tokenAddress: DEAD.toLowerCase(), usdValueCents: 300 }),
    ]);
    expect(s.totalCents).toBe(1500);
    expect(s.byChain).toEqual([
      { chainId: 1, cents: 800 },
      { chainId: 8453, cents: 700 },
    ]);
    expect(s.byWallet).toEqual([
      { walletId: "w2", cents: 1000 },
      { walletId: "w1", cents: 500 },
    ]);
    expect(s.unpricedTokenCount).toBe(0);
  });
  it("counts unpriced non-zero tokens but never totals them; zero balances are ignored", () => {
    const s = summarizeCrypto([
      holding({ usdValueCents: 100 }),
      holding({ symbol: "SPAM", usdPrice: null, usdValueCents: null, rawBalance: "5" }),
      holding({ symbol: "DUST", usdPrice: null, usdValueCents: null, rawBalance: "0" }),
    ]);
    expect(s.totalCents).toBe(100);
    expect(s.unpricedTokenCount).toBe(1);
  });
  it("uses the oldest sync time and is empty-safe", () => {
    const s = summarizeCrypto([
      holding({ syncedAt: "2026-10-16T10:00:00.000Z" }),
      holding({ syncedAt: "2026-10-16T09:00:00.000Z" }),
    ]);
    expect(s.lastSyncedAt).toBe("2026-10-16T09:00:00.000Z");
    expect(summarizeCrypto([])).toEqual({
      totalCents: 0,
      byChain: [],
      byWallet: [],
      lastSyncedAt: null,
      unpricedTokenCount: 0,
    });
  });
});
