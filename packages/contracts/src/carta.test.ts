import { describe, expect, it } from "vitest";
import {
  CARTA_MCP_ENDPOINT,
  CapTableSnapshotInputSchema,
  cartaAgentSpawnKey,
  isCartaAgentSpawnKey,
  isCartaEndpoint,
} from "./carta.js";

describe("isCartaEndpoint", () => {
  it("matches Carta's https host", () => {
    expect(isCartaEndpoint(CARTA_MCP_ENDPOINT)).toBe(true);
    expect(isCartaEndpoint("https://mcp.app.carta.com/other")).toBe(true);
  });
  it("rejects look-alike hosts, plain http and junk", () => {
    expect(isCartaEndpoint("https://mcp.app.carta.com.evil.test/mcp")).toBe(false);
    expect(isCartaEndpoint("http://mcp.app.carta.com/mcp")).toBe(false);
    expect(isCartaEndpoint("not a url")).toBe(false);
    expect(isCartaEndpoint(null)).toBe(false);
  });
});

describe("carta agent spawn key", () => {
  it("is recognized by prefix", () => {
    expect(isCartaAgentSpawnKey(cartaAgentSpawnKey("u1"))).toBe(true);
    expect(isCartaAgentSpawnKey("finance-agent:u1")).toBe(false);
    expect(isCartaAgentSpawnKey(null)).toBe(false);
  });
});

describe("cap table snapshot 409A", () => {
  const base = {
    companyName: "Example Co",
    asOf: "2026-01-31",
    fullyDilutedShares: 1000,
    shareClasses: [],
    holders: [],
  };
  it("parses an old snapshot with no valuations", () => {
    const old = CapTableSnapshotInputSchema.parse({
      ...base,
      latest409a: { pricePerShareUsd: 1.5, date: "2025-06-01" },
    });
    expect(old.valuations409a).toEqual([]);
    expect(old.latest409a).toEqual({
      pricePerShareUsd: 1.5,
      date: "2025-06-01",
    });
  });
  it("derives latest409a from the newest valuation", () => {
    const next = CapTableSnapshotInputSchema.parse({
      ...base,
      valuations409a: [
        { pricePerShareUsd: 2, date: "2026-01-01", expiresOn: "2027-01-01" },
        { pricePerShareUsd: 1, date: "2025-01-01" },
      ],
    });
    expect(next.latest409a).toEqual({
      pricePerShareUsd: 2,
      date: "2026-01-01",
      expiresOn: "2027-01-01",
    });
    expect(next.valuations409a[1]?.expiresOn).toBeNull();
  });
  it("keeps Carta's expiry from the matching valuation when latest409a lacks one", () => {
    const parsed = CapTableSnapshotInputSchema.parse({
      ...base,
      latest409a: { pricePerShareUsd: 2, date: "2026-01-01" },
      valuations409a: [{ pricePerShareUsd: 2, date: "2026-01-01", expiresOn: "2026-12-01" }],
    });
    expect(parsed.latest409a?.expiresOn).toBe("2026-12-01");
  });
});
