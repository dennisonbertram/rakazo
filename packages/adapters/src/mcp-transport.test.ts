import { strict as assert } from "node:assert";
import { describe, expect, it } from "vitest";
import { McpSession, validateUrl } from "./mcp-transport.js";

describe("MCP transport seam", () => {
  it("rejects unsafe URLs and oversized URLs before network access", () => {
    expect(() => validateUrl("http://remote.example/mcp")).toThrow("HTTPS");
    expect(() => validateUrl("https://user:pass@example.com/mcp")).toThrow("credentials");
    expect(() => validateUrl(`https://example.com/${"x".repeat(2_100)}`)).toThrow("exceeds");
    expect(validateUrl("http://127.0.0.1:1234/mcp").hostname).toBe("127.0.0.1");
  });

  it("gates stdio by exact command allowlist", async () => {
    const session = new McpSession();
    await expect(session.connectStdio({ command: process.execPath, allowedCommands: ["/definitely-not-node"] })).rejects.toThrow("allowlist");
    await session.close();
    assert.ok(true);
  });

  it("requires a connected session for operations", async () => {
    const session = new McpSession();
    await expect(session.listTools()).rejects.toThrow("not connected");
    await expect(session.callTool("echo")).rejects.toThrow("not connected");
  });
});
