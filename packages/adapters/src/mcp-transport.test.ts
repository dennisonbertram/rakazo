import { strict as assert } from "node:assert";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StoredMcpOAuthProvider } from "./mcp-oauth.js";
import { McpSession, validateUrl } from "./mcp-transport.js";

afterEach(() => vi.unstubAllGlobals());

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

  it("lets the SDK refresh a rejected token, persist rotation, and retry the MCP request", async () => {
    const resourceHeaders: string[] = [];
    const persisted: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.href === "https://auth.example.test/token") {
        return Response.json({ access_token: "fresh-access", refresh_token: "rotated-refresh", token_type: "bearer", expires_in: 3600 });
      }
      if (url.href === "https://mcp.example.test/mcp") {
        const authorization = request.headers.get("authorization") ?? "";
        resourceHeaders.push(authorization);
        if (authorization === "Bearer stale-access") {
          return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
        }
        const message = JSON.parse(await request.text()) as { id?: number; method?: string };
        if (message.method === "initialize") {
          return Response.json({
            jsonrpc: "2.0",
            id: message.id,
            result: { protocolVersion: "2025-11-25", capabilities: {}, serverInfo: { name: "test", version: "1" } },
          });
        }
        return new Response(null, { status: 202 });
      }
      throw new Error(`Unexpected request: ${request.method} ${url}`);
    }));
    const provider = new StoredMcpOAuthProvider("server-1", {
      oauth: {
        redirectUri: "http://127.0.0.1:5173/mcp/oauth/callback",
        tokens: { access_token: "stale-access", refresh_token: "refresh", token_type: "bearer" },
        clientInformation: { client_id: "client-1" },
        discoveryState: {
          authorizationServerUrl: "https://auth.example.test",
          resourceMetadata: { resource: "https://mcp.example.test/mcp", authorization_servers: ["https://auth.example.test"] },
          authorizationServerMetadata: {
            issuer: "https://auth.example.test",
            authorization_endpoint: "https://auth.example.test/authorize",
            token_endpoint: "https://auth.example.test/token",
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
          },
        },
      },
    }, async (material) => { persisted.push(structuredClone(material)); });
    const session = new McpSession();

    await session.connectRemote({ url: "https://mcp.example.test/mcp", authProvider: provider, fallbackToSse: false });

    expect(resourceHeaders[0]).toBe("Bearer stale-access");
    expect(resourceHeaders.slice(1)).not.toHaveLength(0);
    expect(resourceHeaders.slice(1).every((value) => value === "Bearer fresh-access")).toBe(true);
    expect(provider.tokens()).toMatchObject({ access_token: "fresh-access", refresh_token: "rotated-refresh" });
    expect(persisted).toHaveLength(1);
    await session.close();
  });

  it("invalidates a dead refresh token and surfaces reconnect instead of silently losing tools", async () => {
    const persisted: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (request.url === "https://auth.example.test/token") {
        return Response.json({ error: "invalid_grant", error_description: "refresh token revoked" }, { status: 400 });
      }
      if (request.url === "https://mcp.example.test/mcp") {
        return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
      }
      throw new Error(`Unexpected request: ${request.method} ${request.url}`);
    }));
    const provider = new StoredMcpOAuthProvider("server-1", {
      oauth: {
        redirectUri: "http://127.0.0.1:5173/mcp/oauth/callback",
        tokens: { access_token: "stale-access", refresh_token: "dead-refresh", token_type: "bearer" },
        clientInformation: { client_id: "client-1" },
        discoveryState: {
          authorizationServerUrl: "https://auth.example.test",
          resourceMetadata: { resource: "https://mcp.example.test/mcp", authorization_servers: ["https://auth.example.test"] },
          authorizationServerMetadata: {
            issuer: "https://auth.example.test",
            authorization_endpoint: "https://auth.example.test/authorize",
            token_endpoint: "https://auth.example.test/token",
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
          },
        },
      },
    }, async (material) => { persisted.push(structuredClone(material)); });
    const session = new McpSession();

    await expect(session.connectRemote({ url: "https://mcp.example.test/mcp", authProvider: provider, fallbackToSse: false })).rejects.toThrow("Reconnect this server");

    expect(provider.tokens()).toBeUndefined();
    expect(persisted.length).toBeGreaterThanOrEqual(1);
  });
});
