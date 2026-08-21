import { afterEach, describe, expect, it, vi } from "vitest";
import { McpOAuthBroker, PendingProvider } from "./mcp-oauth.js";

afterEach(() => vi.unstubAllGlobals());

describe("MCP OAuth", () => {
  it("describes a public client for SDK-managed dynamic registration", () => {
    const local = new PendingProvider("http://127.0.0.1:5173/mcp/oauth/callback", "state-local");
    const remote = new PendingProvider("https://app.example.test/mcp/oauth/callback", "state-remote");

    expect(local.clientMetadata).toMatchObject({
      client_name: "Rakazo",
      application_type: "native",
      token_endpoint_auth_method: "none",
    });
    expect(remote.clientMetadata).toMatchObject({ application_type: "web" });
  });

  it("lets the official Streamable HTTP transport drive discovery, registration, PKCE, and redirect", async () => {
    const requests: string[] = [];
    let registration: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url.toString()}`);

      if (url.href === "https://mcp.example.test/mcp" && method === "GET") return new Response(null, { status: 405 });
      if (url.href === "https://mcp.example.test/mcp" && method === "POST") {
        return new Response(null, {
          status: 401,
          headers: { "WWW-Authenticate": 'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"' },
        });
      }
      if (url.href === "https://mcp.example.test/.well-known/oauth-protected-resource/mcp") {
        return Response.json({ resource: "https://mcp.example.test/mcp", authorization_servers: ["https://auth.example.test"] });
      }
      if (url.href === "https://auth.example.test/.well-known/oauth-authorization-server") {
        return Response.json({
          issuer: "https://auth.example.test",
          authorization_endpoint: "https://auth.example.test/authorize",
          token_endpoint: "https://auth.example.test/token",
          registration_endpoint: "https://auth.example.test/register",
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
        });
      }
      if (url.href === "https://auth.example.test/register" && method === "POST") {
        registration = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          client_id: "registered-client-id",
          redirect_uris: ["http://127.0.0.1:5173/mcp/oauth/callback"],
          token_endpoint_auth_method: "none",
        }, { status: 201 });
      }
      if (url.href === "https://auth.example.test/token" && method === "POST") {
        return Response.json({ access_token: "access-token", refresh_token: "refresh-token", token_type: "bearer", expires_in: 3600 });
      }
      throw new Error(`Unexpected request: ${method} ${url}`);
    }));
    const put = vi.fn().mockResolvedValue({ id: "secret-1", ciphertext: "encrypted" });
    const prisma = {
      mcpServer: {
        findFirst: vi.fn().mockResolvedValue({ id: "server-1", endpoint: "https://mcp.example.test/mcp" }),
        findUnique: vi.fn().mockResolvedValue({ id: "server-1", secretId: null }),
        update: vi.fn().mockResolvedValue({}),
      },
      secret: { findUnique: vi.fn(), create: vi.fn().mockResolvedValue({}) },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const broker = new McpOAuthBroker(prisma as never, { put } as never);

    const started = await broker.begin({
      serverId: "server-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      redirectUri: "http://127.0.0.1:5173/mcp/oauth/callback",
    });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(requests).toContain("POST https://mcp.example.test/mcp");
    expect(registration).toMatchObject({ client_name: "Rakazo", application_type: "native" });
    expect(authorizationUrl.origin).toBe("https://auth.example.test");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("registered-client-id");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("state")).toBe(started.sessionId);

    await broker.complete({
      sessionId: started.sessionId,
      code: "authorization-code",
      state: started.sessionId,
      workspaceId: "workspace-1",
      userId: "user-1",
    });
    expect(requests).toContain("POST https://auth.example.test/token");
    expect(JSON.parse(String(put.mock.calls[0]?.[0])).oauth.tokens).toMatchObject({ access_token: "access-token", refresh_token: "refresh-token" });
  });
});
