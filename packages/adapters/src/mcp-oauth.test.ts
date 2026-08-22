import { afterEach, describe, expect, it, vi } from "vitest";
import {
  McpOAuthBroker,
  McpReauthorizationRequiredError,
  StoredMcpOAuthProvider,
} from "./mcp-oauth.js";

afterEach(() => vi.unstubAllGlobals());

describe("MCP OAuth", () => {
  it("persists SDK credentials and invalidates only the requested scope", async () => {
    const persisted: unknown[] = [];
    const provider = new StoredMcpOAuthProvider(
      "server-1",
      {
        oauth: {
          redirectUri: "http://127.0.0.1:5173/mcp/oauth/callback",
          tokens: { access_token: "old", refresh_token: "refresh", token_type: "bearer" },
          clientInformation: { client_id: "client-1" },
          discoveryState: { authorizationServerUrl: "https://auth.example.test" },
        },
      },
      async (material) => {
        persisted.push(structuredClone(material));
      },
    );

    await provider.saveTokens({
      access_token: "new",
      refresh_token: "rotated",
      token_type: "bearer",
    });
    await provider.invalidateCredentials("tokens");

    expect(provider.tokens()).toBeUndefined();
    expect(provider.clientInformation()).toEqual({ client_id: "client-1" });
    expect(provider.discoveryState()).toMatchObject({
      authorizationServerUrl: "https://auth.example.test",
    });
    expect(persisted).toHaveLength(2);
    await expect(
      provider.redirectToAuthorization(new URL("https://auth.example.test/authorize")),
    ).rejects.toThrow(McpReauthorizationRequiredError);
  });

  it("clears stale tokens when runtime re-authorization is required so status flips to reconnect", async () => {
    const persisted: { oauth?: { tokens?: unknown } }[] = [];
    const provider = new StoredMcpOAuthProvider(
      "server-1",
      {
        oauth: {
          redirectUri: "http://127.0.0.1:5173/mcp/oauth/callback",
          tokens: { access_token: "revoked-server-side", token_type: "bearer" },
          clientInformation: { client_id: "client-1" },
        },
      },
      async (material) => {
        persisted.push(structuredClone(material));
      },
    );

    await expect(
      provider.redirectToAuthorization(new URL("https://auth.example.test/authorize")),
    ).rejects.toThrow(McpReauthorizationRequiredError);

    expect(provider.tokens()).toBeUndefined();
    expect(persisted.at(-1)?.oauth?.tokens).toBeUndefined();
  });

  it("lets the official Streamable HTTP transport drive discovery, registration, PKCE, redirect, and token exchange", async () => {
    const requests: string[] = [];
    let registration: Record<string, unknown> | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        requests.push(`${request.method} ${url.toString()}`);

        if (url.href === "https://mcp.example.test/mcp" && request.method === "POST") {
          return new Response(null, {
            status: 401,
            headers: {
              "WWW-Authenticate":
                'Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"',
            },
          });
        }
        if (url.href === "https://mcp.example.test/.well-known/oauth-protected-resource/mcp") {
          return Response.json({
            resource: "https://mcp.example.test/mcp",
            authorization_servers: ["https://auth.example.test"],
          });
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
        if (url.href === "https://auth.example.test/register" && request.method === "POST") {
          registration = (await request.json()) as Record<string, unknown>;
          return Response.json(
            {
              client_id: "registered-client-id",
              redirect_uris: ["http://127.0.0.1:5173/mcp/oauth/callback"],
              token_endpoint_auth_method: "none",
            },
            { status: 201 },
          );
        }
        if (url.href === "https://auth.example.test/token" && request.method === "POST") {
          return Response.json({
            access_token: "access-token",
            refresh_token: "refresh-token",
            token_type: "bearer",
            expires_in: 3600,
          });
        }
        throw new Error(`Unexpected request: ${request.method} ${url}`);
      }),
    );
    let secretCounter = 0;
    const storedPayloads: string[] = [];
    const put = vi.fn(async (plaintext: string) => {
      storedPayloads.push(plaintext);
      secretCounter += 1;
      return { id: `secret-${secretCounter}`, ciphertext: `encrypted-${secretCounter}` };
    });
    const prisma = {
      mcpServer: {
        findFirst: vi.fn().mockResolvedValue({
          id: "server-1",
          endpoint: "https://mcp.example.test/mcp",
          secretId: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      secret: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
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
    expect(
      storedPayloads
        .map((value) => JSON.parse(value))
        .some((value) => value.oauth?.tokens?.access_token === "access-token"),
    ).toBe(true);
    expect(prisma.mcpServer.update).toHaveBeenCalledWith({
      where: { id: "server-1" },
      data: { revision: { increment: 1 } },
    });
  });

  it("retries unreachable OAuth discovery and DCR hosts on the MCP endpoint origin", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url);
        requests.push(`${request.method} ${url.toString()}`);

        if (url.href === "https://mcp.example.test/mcp" && request.method === "POST") {
          return new Response(null, {
            status: 401,
            headers: {
              "WWW-Authenticate":
                'Bearer resource_metadata="https://private-auth.example.test/.well-known/oauth-protected-resource/mcp"',
            },
          });
        }
        if (url.origin === "https://private-auth.example.test") throw new TypeError("fetch failed");
        if (url.href === "https://mcp.example.test/.well-known/oauth-protected-resource/mcp") {
          // Like Brex: the advertised canonical resource is the private alias.
          return Response.json({
            resource: "https://private-auth.example.test",
            authorization_servers: ["https://private-auth.example.test"],
          });
        }
        if (url.href === "https://mcp.example.test/.well-known/oauth-authorization-server") {
          return Response.json({
            issuer: "https://private-auth.example.test",
            authorization_endpoint: "https://login.example.test/authorize",
            token_endpoint: "https://login.example.test/token",
            registration_endpoint: "https://private-auth.example.test/register",
            response_types_supported: ["code"],
            grant_types_supported: ["authorization_code", "refresh_token"],
            code_challenge_methods_supported: ["S256"],
          });
        }
        if (url.href === "https://mcp.example.test/register" && request.method === "POST") {
          return Response.json(
            {
              client_id: "fallback-client",
              redirect_uris: ["http://127.0.0.1:5173/mcp/oauth/callback"],
              token_endpoint_auth_method: "none",
            },
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${request.method} ${url}`);
      }),
    );
    let secretCounter = 0;
    const put = vi.fn(async () => {
      secretCounter += 1;
      return { id: `secret-${secretCounter}`, ciphertext: `encrypted-${secretCounter}` };
    });
    const prisma = {
      mcpServer: {
        findFirst: vi.fn().mockResolvedValue({
          id: "server-1",
          endpoint: "https://mcp.example.test/mcp",
          secretId: null,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      secret: {
        findFirst: vi.fn(),
        create: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn().mockResolvedValue([]),
    };
    const broker = new McpOAuthBroker(prisma as never, { put } as never);

    const started = await broker.begin({
      serverId: "server-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      redirectUri: "http://127.0.0.1:5173/mcp/oauth/callback",
    });

    expect(requests).toContain(
      "GET https://mcp.example.test/.well-known/oauth-protected-resource/mcp",
    );
    expect(requests).toContain("POST https://mcp.example.test/register");
    expect(new URL(started.authorizationUrl).origin).toBe("https://login.example.test");
    expect(new URL(started.authorizationUrl).searchParams.get("client_id")).toBe("fallback-client");
    expect(new URL(started.authorizationUrl).searchParams.get("resource")).toBe(
      "https://private-auth.example.test/",
    );
  });
});
