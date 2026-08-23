import type { AdapterContext } from "@rakazo/adapter-kit";
import { describe, expect, it } from "vitest";
import { InstalledConnectorProvider } from "./installed-connectors.js";
import {
  McpOAuthBroker,
  McpReauthorizationRequiredError,
  StoredMcpOAuthProvider,
} from "./mcp-oauth.js";

const ACTOR = { workspaceId: "workspace-1", userId: "user-1" };
const ENDPOINT = "https://mcp.example.test/mcp";
const REDIRECT = "http://127.0.0.1:5173/mcp/oauth/callback";

const resolvePublic = async () => [{ address: "203.0.113.10", family: 4 }];

function fakeSecrets() {
  let counter = 0;
  return {
    put: async (plaintext: string) => {
      counter += 1;
      return { id: `secret-${counter}`, ciphertext: plaintext };
    },
    load: (ciphertext: string) => ciphertext,
  };
}

/** Stateful install + secret rows shared across broker instances, like the real DB. */
function fakeDb(config: Record<string, unknown> = { auth: { type: "oauth" } }) {
  const secretRows = new Map<string, { id: string; ciphertext: string }>();
  const install = {
    id: "install-1",
    kind: "mcp",
    source: ENDPOINT,
    secretId: null as string | null,
    config,
  };
  const prisma = {
    capabilityInstall: {
      findFirst: async () => ({ ...install }),
      findMany: async () => [{ ...install }],
      update: async ({ data }: { data: { secretId?: string | null } }) => {
        if ("secretId" in data) install.secretId = data.secretId ?? null;
        return {};
      },
    },
    secret: {
      findFirst: async ({ where }: { where: { id: string } }) => secretRows.get(where.id) ?? null,
      create: async ({ data }: { data: { id: string; ciphertext: string } }) => {
        secretRows.set(data.id, data);
        return data;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { ciphertext: string };
      }) => {
        const row = secretRows.get(where.id);
        if (row) row.ciphertext = data.ciphertext;
        return { count: row ? 1 : 0 };
      },
      deleteMany: async ({ where }: { where: { id: string } }) => {
        secretRows.delete(where.id);
        return { count: 1 };
      },
    },
    $transaction: async (ops: unknown[] | ((tx: unknown) => Promise<unknown>)) =>
      Array.isArray(ops) ? Promise.all(ops) : [],
  };
  return { prisma, secretRows, install };
}

const AS_METADATA = {
  issuer: "https://auth.example.test",
  authorization_endpoint: "https://auth.example.test/authorize",
  token_endpoint: "https://auth.example.test/token",
  registration_endpoint: "https://auth.example.test/register",
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
};

/** JSON-mode Streamable HTTP MCP endpoint that serves once a bearer token arrives. */
async function mcpEndpoint(
  request: Request,
  accessToken: string,
  tools: unknown[] = [{ name: "ping", inputSchema: { type: "object" } }],
): Promise<Response> {
  if (request.method === "DELETE") return new Response(null, { status: 405 });
  if (request.method === "GET") return new Response(null, { status: 405 });
  if (request.headers.get("authorization") !== `Bearer ${accessToken}`) {
    return new Response(null, {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"`,
      },
    });
  }
  const body = (await request.json()) as {
    id?: number;
    method?: string;
    params?: { protocolVersion?: string };
  };
  if (body.method === "initialize") {
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: {
        protocolVersion: body.params?.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fake", version: "0.0.0" },
      },
    });
  }
  if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (body.method === "tools/list") {
    return Response.json({
      jsonrpc: "2.0",
      id: body.id,
      result: { tools },
    });
  }
  return new Response(null, { status: 202 });
}

describe("StoredMcpOAuthProvider", () => {
  it("persists SDK credentials and invalidates only the requested scope", async () => {
    const persisted: unknown[] = [];
    const provider = new StoredMcpOAuthProvider(
      "install-1",
      {
        redirectUri: REDIRECT,
        tokens: { access_token: "old", refresh_token: "refresh", token_type: "bearer" },
        clientInformation: { client_id: "client-1" },
        discoveryState: { authorizationServerUrl: "https://auth.example.test" },
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
  });

  it("clears stale tokens when runtime re-authorization is required so status flips to reconnect", async () => {
    const persisted: { tokens?: unknown }[] = [];
    const provider = new StoredMcpOAuthProvider(
      "install-1",
      {
        redirectUri: REDIRECT,
        tokens: { access_token: "revoked-server-side", token_type: "bearer" },
        clientInformation: { client_id: "client-1" },
      },
      async (material) => {
        persisted.push(structuredClone(material));
      },
    );

    await expect(
      provider.redirectToAuthorization(new URL("https://auth.example.test/authorize")),
    ).rejects.toThrow(McpReauthorizationRequiredError);

    expect(provider.tokens()).toBeUndefined();
    expect(persisted.at(-1)?.tokens).toBeUndefined();
  });
});

describe("McpOAuthBroker", () => {
  it("reports status from the persisted material", async () => {
    const { prisma, secretRows, install } = fakeDb();
    const broker = new McpOAuthBroker(prisma as never, fakeSecrets() as never, {
      resolveHostname: resolvePublic,
    });

    expect(await broker.statusFor(install, ACTOR)).toBe("none");

    install.secretId = "secret-1";
    secretRows.set("secret-1", {
      id: "secret-1",
      ciphertext: JSON.stringify({ redirectUri: REDIRECT, pendingState: "state-1" }),
    });
    expect(await broker.statusFor(install, ACTOR)).toBe("pending");

    secretRows.set("secret-1", {
      id: "secret-1",
      ciphertext: JSON.stringify({
        redirectUri: REDIRECT,
        tokens: { access_token: "token", token_type: "bearer" },
      }),
    });
    expect(await broker.statusFor(install, ACTOR)).toBe("connected");

    secretRows.set("secret-1", {
      id: "secret-1",
      ciphertext: JSON.stringify({ redirectUri: REDIRECT, clientInformation: { client_id: "c" } }),
    });
    expect(await broker.statusFor(install, ACTOR)).toBe("reconnect");
  });

  it("lets the official SDK drive discovery, registration, PKCE, and the redirect", async () => {
    const requests: string[] = [];
    let registration: Record<string, unknown> | undefined;
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      requests.push(`${request.method} ${url}`);
      if (url.href === ENDPOINT && request.method === "POST") {
        return mcpEndpoint(request, "never-issued");
      }
      if (url.href === "https://mcp.example.test/.well-known/oauth-protected-resource/mcp") {
        return Response.json({
          resource: ENDPOINT,
          authorization_servers: ["https://auth.example.test"],
        });
      }
      if (url.href === "https://auth.example.test/.well-known/oauth-authorization-server") {
        return Response.json(AS_METADATA);
      }
      if (url.href === "https://auth.example.test/register" && request.method === "POST") {
        registration = (await request.json()) as Record<string, unknown>;
        return Response.json(
          {
            client_id: "registered-client-id",
            redirect_uris: [REDIRECT],
            token_endpoint_auth_method: "none",
          },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected request: ${request.method} ${url}`);
    };
    const { prisma, secretRows } = fakeDb();
    const broker = new McpOAuthBroker(prisma as never, fakeSecrets() as never, {
      fetch: fetchImpl as typeof fetch,
      resolveHostname: resolvePublic,
    });

    const started = await broker.begin({
      installId: "install-1",
      workspaceId: ACTOR.workspaceId,
      userId: ACTOR.userId,
      redirectUri: REDIRECT,
    });
    const authorizationUrl = new URL(started.authorizationUrl);

    expect(registration).toMatchObject({ client_name: "Rakazo", application_type: "native" });
    expect(authorizationUrl.origin).toBe("https://auth.example.test");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("registered-client-id");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = authorizationUrl.searchParams.get("state");
    const stored = [...secretRows.values()].map((row) => JSON.parse(row.ciphertext));
    expect(stored.some((value) => value.pendingState === state)).toBe(true);
  });

  it("completes authorization after a restart via persisted pending state and verifies tools", async () => {
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.href === ENDPOINT) return mcpEndpoint(request, "restart-access");
      if (url.href === "https://mcp.example.test/.well-known/oauth-protected-resource/mcp") {
        return Response.json({
          resource: ENDPOINT,
          authorization_servers: ["https://auth.example.test"],
        });
      }
      if (url.href === "https://auth.example.test/.well-known/oauth-authorization-server") {
        return Response.json(AS_METADATA);
      }
      if (url.href === "https://auth.example.test/register" && request.method === "POST") {
        return Response.json(
          {
            client_id: "registered-client-id",
            redirect_uris: [REDIRECT],
            token_endpoint_auth_method: "none",
          },
          { status: 201 },
        );
      }
      if (url.href === "https://auth.example.test/token" && request.method === "POST") {
        return Response.json({
          access_token: "restart-access",
          refresh_token: "restart-refresh",
          token_type: "bearer",
          expires_in: 3600,
        });
      }
      throw new Error(`Unexpected request: ${request.method} ${url}`);
    };
    const { prisma, secretRows, install } = fakeDb();
    const secrets = fakeSecrets();
    const remote = { fetch: fetchImpl as typeof fetch, resolveHostname: resolvePublic };

    const brokerA = new McpOAuthBroker(prisma as never, secrets as never, remote);
    const started = await brokerA.begin({
      installId: "install-1",
      workspaceId: ACTOR.workspaceId,
      userId: ACTOR.userId,
      redirectUri: REDIRECT,
    });
    const state = new URL(started.authorizationUrl).searchParams.get("state") ?? "";

    // Fresh instance: simulates the API restarting before the callback lands.
    const brokerB = new McpOAuthBroker(prisma as never, secrets as never, remote);
    const completed = await brokerB.complete({
      code: "authorization-code",
      state,
      workspaceId: ACTOR.workspaceId,
      userId: ACTOR.userId,
    });

    expect(completed.installId).toBe("install-1");
    expect(install.secretId).not.toBeNull();
    const material = JSON.parse(secretRows.get(install.secretId ?? "")?.ciphertext ?? "{}");
    expect(material.tokens?.access_token).toBe("restart-access");
    expect(material.pendingState).toBeUndefined();
    expect(await brokerB.statusFor(install, ACTOR)).toBe("connected");
  });

  it("drops the tokens when post-authorization tool verification fails", async () => {
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const url = new URL(request.url);
      if (url.href === ENDPOINT) return mcpEndpoint(request, "restart-access", []);
      if (url.href === "https://mcp.example.test/.well-known/oauth-protected-resource/mcp") {
        return Response.json({
          resource: ENDPOINT,
          authorization_servers: ["https://auth.example.test"],
        });
      }
      if (url.href === "https://auth.example.test/.well-known/oauth-authorization-server") {
        return Response.json(AS_METADATA);
      }
      if (url.href === "https://auth.example.test/register" && request.method === "POST") {
        return Response.json(
          {
            client_id: "registered-client-id",
            redirect_uris: [REDIRECT],
            token_endpoint_auth_method: "none",
          },
          { status: 201 },
        );
      }
      if (url.href === "https://auth.example.test/token" && request.method === "POST") {
        return Response.json({
          access_token: "restart-access",
          refresh_token: "restart-refresh",
          token_type: "bearer",
          expires_in: 3600,
        });
      }
      throw new Error(`Unexpected request: ${request.method} ${url}`);
    };
    const { prisma, install } = fakeDb();
    const broker = new McpOAuthBroker(prisma as never, fakeSecrets() as never, {
      fetch: fetchImpl as typeof fetch,
      resolveHostname: resolvePublic,
    });
    const started = await broker.begin({
      installId: "install-1",
      workspaceId: ACTOR.workspaceId,
      userId: ACTOR.userId,
      redirectUri: REDIRECT,
    });
    const state = new URL(started.authorizationUrl).searchParams.get("state") ?? "";

    await expect(
      broker.complete({
        code: "authorization-code",
        state,
        workspaceId: ACTOR.workspaceId,
        userId: ACTOR.userId,
      }),
    ).rejects.toThrow("MCP server returned no tools");
    expect(await broker.statusFor(install, ACTOR)).not.toBe("connected");
  });

  it("rejects begin for connectors that do not use OAuth", async () => {
    const { prisma } = fakeDb({ auth: { type: "bearer" } });
    const broker = new McpOAuthBroker(prisma as never, fakeSecrets() as never, {
      resolveHostname: resolvePublic,
    });
    await expect(
      broker.begin({
        installId: "install-1",
        workspaceId: ACTOR.workspaceId,
        userId: ACTOR.userId,
        redirectUri: REDIRECT,
      }),
    ).rejects.toThrow("does not use OAuth");
  });
});

describe("InstalledConnectorProvider with OAuth connectors", () => {
  const context = {
    workspaceId: ACTOR.workspaceId,
    userId: ACTOR.userId,
    signal: new AbortController().signal,
  } as unknown as AdapterContext;

  it("offers no tools and a clear execute error before the user authorizes", async () => {
    const { prisma } = fakeDb();
    const secrets = fakeSecrets();
    const broker = new McpOAuthBroker(prisma as never, secrets as never, {
      resolveHostname: resolvePublic,
    });
    const provider = new InstalledConnectorProvider(
      prisma as never,
      secrets as never,
      { resolveHostname: resolvePublic },
      broker,
    );

    expect(provider.describe().capabilities.oauth).toBe(true);
    expect(await provider.discoverTools(context)).toEqual([]);

    const events = [];
    for await (const event of provider.execute(
      {
        tool: "ping",
        args: {},
        route: { connectorId: "installed", resourceId: "install-1", toolName: "ping" },
      } as never,
      context,
    )) {
      events.push(event);
    }
    expect(events).toEqual([
      {
        type: "error",
        message: "This MCP connector is not authorized yet. Authorize it in Plugins.",
      },
    ]);
  });
});
