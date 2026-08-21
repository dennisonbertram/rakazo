import { randomUUID } from "node:crypto";
import { refreshAuthorization, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { PrismaClient } from "@rakazo/db";
import { EncryptedSecretStore } from "./secrets.js";

type OAuthMaterial = {
  secret?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  oauth?: {
    tokens: OAuthTokens;
    obtainedAt: number;
    clientInformation?: OAuthClientInformationMixed;
    discoveryState?: OAuthDiscoveryState;
  };
};

export class PendingProvider implements OAuthClientProvider {
  private client?: OAuthClientInformationMixed;
  private tokenSet?: OAuthTokens;
  private verifier?: string;
  private discovery?: OAuthDiscoveryState;
  authorizationUrl?: URL;

  constructor(
    readonly redirectUrl: string,
    readonly stateValue: string,
    private readonly resourceOriginAliases = new Set<string>(),
  ) {}

  get clientMetadata(): OAuthClientMetadata {
    const hostname = new URL(this.redirectUrl).hostname;
    const applicationType = hostname === "localhost" || hostname === "127.0.0.1" ? "native" : "web";
    return {
      redirect_uris: [this.redirectUrl],
      client_name: "Rakazo",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: applicationType,
    } as OAuthClientMetadata;
  }

  state(): string { return this.stateValue; }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.client; }
  saveClientInformation(value: OAuthClientInformationMixed): void { this.client = value; }
  tokens(): OAuthTokens | undefined { return this.tokenSet; }
  saveTokens(value: OAuthTokens): void { this.tokenSet = value; }
  redirectToAuthorization(url: URL): void { this.authorizationUrl = url; }
  saveCodeVerifier(value: string): void { this.verifier = value; }
  codeVerifier(): string { if (!this.verifier) throw new Error("OAuth PKCE verifier is missing"); return this.verifier; }
  saveDiscoveryState(value: OAuthDiscoveryState): void { this.discovery = value; }
  discoveryState(): OAuthDiscoveryState | undefined { return this.discovery; }
  async validateResourceURL(serverUrl: string | URL, resource?: string): Promise<URL | undefined> {
    const server = new URL(serverUrl);
    if (!resource) return server;
    const candidate = new URL(resource);
    if (candidate.href === server.href || candidate.origin === server.origin || this.resourceOriginAliases.has(candidate.origin)) {
      return candidate;
    }
    throw new Error(`Protected resource ${candidate.href} does not match MCP server ${server.href}`);
  }
}

function canRetryOAuthRequestAtResourceOrigin(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return true;
  if (request.method !== "POST" || request.headers.has("authorization")) return false;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  return contentType.includes("application/json");
}

function oauthFetchWithResourceOriginFallback(serverUrl: URL): {
  fetch: typeof fetch;
  resourceOriginAliases: Set<string>;
} {
  const resourceOriginAliases = new Set<string>();
  const fetchWithFallback: typeof fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const request = new Request(input, init);
    const retryRequest = request.clone();
    try {
      return await fetch(request);
    } catch (error) {
      const requestedUrl = new URL(request.url);
      if (
        requestedUrl.origin === serverUrl.origin ||
        !canRetryOAuthRequestAtResourceOrigin(retryRequest)
      ) throw error;

      if (retryRequest.method === "POST") {
        const body = await retryRequest.clone().json().catch(() => undefined) as Record<string, unknown> | undefined;
        if (!body || !Array.isArray(body.redirect_uris) || typeof body.client_name !== "string" || "grant_type" in body) {
          throw error;
        }
      }

      const fallbackUrl = new URL(`${requestedUrl.pathname}${requestedUrl.search}`, serverUrl.origin);
      const response = await fetch(new Request(fallbackUrl, retryRequest));
      if (response.ok && (retryRequest.method === "GET" || retryRequest.method === "HEAD")) {
        resourceOriginAliases.add(requestedUrl.origin);
      }
      return response;
    }
  };
  return { fetch: fetchWithFallback, resourceOriginAliases };
}

type Pending = {
  serverId: string;
  workspaceId: string;
  userId: string;
  endpoint: string;
  provider: PendingProvider;
};

export class McpOAuthBroker {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly prisma: PrismaClient, private readonly secrets: EncryptedSecretStore) {}

  async accessToken(server: { id: string; endpoint: string | null; secretId: string | null }, context: { workspaceId: string; userId: string }): Promise<string | undefined> {
    if (!server.secretId) return undefined;
    const row = await this.prisma.secret.findFirst({ where: { id: server.secretId, workspaceId: context.workspaceId, userId: context.userId } });
    if (!row) return undefined;
    const material = this.read(row.ciphertext);
    const oauth = material.oauth;
    if (!oauth) return undefined;
    const expiresAt = oauth.obtainedAt + (oauth.tokens.expires_in ?? 3600) * 1000;
    if (oauth.tokens.refresh_token && Date.now() > expiresAt - 60_000 && oauth.clientInformation && oauth.discoveryState?.authorizationServerUrl) {
      const tokens = await refreshAuthorization(oauth.discoveryState.authorizationServerUrl, {
        metadata: oauth.discoveryState.authorizationServerMetadata,
        clientInformation: oauth.clientInformation,
        refreshToken: oauth.tokens.refresh_token,
        resource: server.endpoint ? new URL(server.endpoint) : undefined,
      });
      material.oauth = { ...oauth, tokens, obtainedAt: Date.now() };
      await this.persistMaterial(server.id, row.id, material, context);
      return tokens.access_token;
    }
    return oauth.tokens.access_token;
  }

  async begin(input: { serverId: string; workspaceId: string; userId: string; redirectUri: string }): Promise<{ sessionId: string; authorizationUrl: string }> {
    const server = await this.prisma.mcpServer.findFirst({ where: { id: input.serverId, workspaceId: input.workspaceId, userId: input.userId, enabled: true } });
    if (!server?.endpoint) throw new Error("MCP server endpoint is required for OAuth");
    const sessionId = randomUUID();
    const serverUrl = new URL(server.endpoint);
    const oauthFetch = oauthFetchWithResourceOriginFallback(serverUrl);
    const provider = new PendingProvider(input.redirectUri, sessionId, oauthFetch.resourceOriginAliases);
    const transport = new StreamableHTTPClientTransport(serverUrl, {
      authProvider: provider,
      fetch: oauthFetch.fetch,
    });
    const client = new Client({ name: "rakazo-oauth", version: "0.1.0" });
    try {
      await client.connect(transport);
    } catch (error) {
      if (!provider.authorizationUrl) throw error;
    } finally {
      await client.close().catch(() => undefined);
    }
    if (!provider.authorizationUrl) throw new Error("MCP server did not request OAuth authorization");
    this.pending.set(sessionId, { serverId: server.id, workspaceId: input.workspaceId, userId: input.userId, endpoint: server.endpoint, provider });
    return { sessionId, authorizationUrl: provider.authorizationUrl.toString() };
  }

  async complete(input: { sessionId: string; code: string; state: string; workspaceId: string; userId: string }): Promise<void> {
    const pending = this.pending.get(input.sessionId);
    if (!pending || pending.workspaceId !== input.workspaceId || pending.userId !== input.userId || input.state !== input.sessionId) {
      throw new Error("MCP OAuth session is invalid or expired");
    }
    const serverUrl = new URL(pending.endpoint);
    const oauthFetch = oauthFetchWithResourceOriginFallback(serverUrl);
    const transport = new StreamableHTTPClientTransport(serverUrl, {
      authProvider: pending.provider,
      fetch: oauthFetch.fetch,
    });
    await transport.finishAuth(input.code);
    const tokens = pending.provider.tokens();
    if (!tokens) throw new Error("MCP OAuth authorization failed");
    await this.saveOAuth(pending, tokens);
    this.pending.delete(input.sessionId);
  }

  async disconnect(input: { serverId: string; workspaceId: string; userId: string }): Promise<void> {
    const server = await this.prisma.mcpServer.findFirst({ where: { id: input.serverId, workspaceId: input.workspaceId, userId: input.userId } });
    if (!server?.secretId) return;
    const row = await this.prisma.secret.findFirst({ where: { id: server.secretId, workspaceId: input.workspaceId, userId: input.userId } });
    if (!row) return;
    const material = this.read(row.ciphertext);
    delete material.oauth;
    if (material.secret || Object.keys(material.env ?? {}).length || Object.keys(material.headers ?? {}).length) {
      const stored = await this.secrets.put(JSON.stringify(material), { operationId: "mcp.oauth.disconnect", traceId: "mcp.oauth.disconnect", workspaceId: input.workspaceId, userId: input.userId, signal: new AbortController().signal });
      await this.prisma.$transaction([
        this.prisma.secret.create({ data: { id: stored.id, workspaceId: input.workspaceId, userId: input.userId, kind: "mcp", ciphertext: stored.ciphertext } }),
        this.prisma.mcpServer.update({ where: { id: server.id }, data: { secretId: stored.id, revision: { increment: 1 } } }),
        this.prisma.secret.delete({ where: { id: row.id } }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.mcpServer.update({ where: { id: server.id }, data: { secretId: null, revision: { increment: 1 } } }),
        this.prisma.secret.delete({ where: { id: row.id } }),
      ]);
    }
  }

  private async saveOAuth(pending: Pending, tokens: OAuthTokens): Promise<void> {
    const server = await this.prisma.mcpServer.findUnique({ where: { id: pending.serverId } });
    const existing = server?.secretId ? await this.prisma.secret.findUnique({ where: { id: server.secretId } }) : null;
    const material = existing ? this.read(existing.ciphertext) : {};
    material.oauth = {
      tokens,
      obtainedAt: Date.now(),
      clientInformation: pending.provider.clientInformation(),
      discoveryState: pending.provider.discoveryState(),
    };
    await this.persistMaterial(pending.serverId, existing?.id, material, pending);
  }

  private async persistMaterial(serverId: string, existingId: string | undefined, material: OAuthMaterial, context: { workspaceId: string; userId: string }): Promise<void> {
    const stored = await this.secrets.put(JSON.stringify(material), { operationId: "mcp.oauth.persist", traceId: "mcp.oauth.persist", workspaceId: context.workspaceId, userId: context.userId, botId: "mcp", signal: new AbortController().signal });
    await this.prisma.$transaction([
      this.prisma.secret.create({ data: { id: stored.id, workspaceId: context.workspaceId, userId: context.userId, kind: "mcp", ciphertext: stored.ciphertext } }),
      this.prisma.mcpServer.update({ where: { id: serverId }, data: { secretId: stored.id, revision: { increment: 1 } } }),
      ...(existingId ? [this.prisma.secret.delete({ where: { id: existingId } })] : []),
    ]);
  }

  private read(ciphertext: string): OAuthMaterial {
    try {
      const value = JSON.parse(this.secrets.load(ciphertext));
      return value && typeof value === "object" ? value as OAuthMaterial : {};
    } catch {
      return {};
    }
  }
}
