import { describe, expect, it } from "vitest";
import {
  FINANCE_MCP_ENDPOINTS,
  financeAgentSpawnKey,
  financeProviderForEndpoint,
  isFinanceAgentSpawnKey,
} from "./finance.js";

describe("financeProviderForEndpoint", () => {
  it("matches the vendor endpoints by https host", () => {
    expect(financeProviderForEndpoint(FINANCE_MCP_ENDPOINTS.mercury)).toBe("mercury");
    expect(financeProviderForEndpoint(FINANCE_MCP_ENDPOINTS.brex)).toBe("brex");
    expect(financeProviderForEndpoint("https://mcp.mercury.com/other")).toBe("mercury");
  });
  it("rejects other hosts, plain http and junk", () => {
    expect(financeProviderForEndpoint("https://mcp.mercury.com.evil.test/mcp")).toBeNull();
    expect(financeProviderForEndpoint("http://mcp.mercury.com/mcp")).toBeNull();
    expect(financeProviderForEndpoint("not a url")).toBeNull();
    expect(financeProviderForEndpoint(null)).toBeNull();
  });
});

describe("finance agent spawn key", () => {
  it("is recognized by prefix", () => {
    expect(financeAgentSpawnKey("u1")).toBe("finance-agent:u1");
    expect(isFinanceAgentSpawnKey("finance-agent:u1")).toBe(true);
    expect(isFinanceAgentSpawnKey("inbox-agent:u1")).toBe(false);
    expect(isFinanceAgentSpawnKey(null)).toBe(false);
  });
});
