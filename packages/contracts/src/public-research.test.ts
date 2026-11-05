import { describe, expect, it } from "vitest";
import { isPublicResearchEndpoint } from "./public-research.js";

describe("isPublicResearchEndpoint", () => {
  it("matches Exa and Tavily by https host only", () => {
    expect(isPublicResearchEndpoint("https://mcp.exa.ai/mcp")).toBe(true);
    expect(isPublicResearchEndpoint("https://mcp.tavily.com/mcp/?tavilyApiKey=key")).toBe(true);
    expect(isPublicResearchEndpoint("http://mcp.exa.ai/mcp")).toBe(false);
    expect(isPublicResearchEndpoint("https://mcp.exa.ai.evil.test/mcp")).toBe(false);
    expect(isPublicResearchEndpoint("https://mcp.mercury.com/mcp")).toBe(false);
    expect(isPublicResearchEndpoint(null)).toBe(false);
  });
});
