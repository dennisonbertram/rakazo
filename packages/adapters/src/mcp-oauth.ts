import { randomUUID } from "node:crypto";
import { auth, discoverAuthorizationServerMetadata, extractWWWAuthenticateParams, refreshAuthorization, type OAuthClientProvider, type OAuthDiscoveryState } from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { PrismaClient } from "@rakazo/db";
import { EncryptedSecretStore } from "./secrets.js";

type OAuthMaterial = {
  secret?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  env?: Record<string, string>;
  headers?: Record<string, string>;
  oauth?: { tokens: OAuthTokens; obtainedAt: number; clientInformation?: OAuthClientInformationMixed; discoveryState?: OAuthDiscoveryState };
};

export class PendingProvider implements OAuthClientProvider {
  private client?: OAuthClientInformationMixed;
  private tokenSet?: OAuthTokens;
  private verifier?: string;
  private discovery?: OAuthDiscoveryState;
  authorizationUrl?: URL;
  constructor(readonly redirectUrl: string, readonly stateValue: string, private readonly registeredClient?: OAuthClientInformationMixed) { this.client = registeredClient; }
  get clientMetadata(): OAuthClientMetadata {
    const localCallback = new URL(this.redirectUrl).hostname === "localhost" || new URL(this.redirectUrl).hostname === "127.0.0.1";
    // application_type is an OpenID Connect DCR extension. The MCP SDK accepts
    // RFC 7591 metadata, but preserves additional registration fields on the
    // wire; this lets OIDC providers apply the correct redirect-URI policy.
    return {
      redirect_uris: [this.redirectUrl],
      client_name: "Rakazo",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: this.registeredClient?.client_secret ? "client_secret_post" : "none",
      application_type: localCallback ? "native" : "web",
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
}

type Pending = { serverId: string; workspaceId: string; userId: string; endpoint: string; provider: PendingProvider };

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
    const existingSecret = server.secretId ? await this.prisma.secret.findFirst({ where: { id: server.secretId, workspaceId: input.workspaceId, userId: input.userId } }) : null;
    const existingMaterial = existingSecret ? this.read(existingSecret.ciphertext) : {};
    const registeredClient = existingMaterial.oauthClientId ? { client_id: existingMaterial.oauthClientId, client_secret: existingMaterial.oauthClientSecret } : undefined;
    if (this.isBrexServer(server.endpoint) && !registeredClient) {
      throw new Error("Brex does not offer self-service OAuth registration. Rakazo needs a Brex-issued partner client before Connect OAuth can open Brex sign-in. You can use a Brex API key instead, or ask us to configure the Rakazo Brex integration.");
    }
    const provider = new PendingProvider(input.redirectUri, sessionId, registeredClient);
    const challenge = await this.oauthChallenge(server.endpoint);
    if (this.isBrexServer(server.endpoint)) {
      // Brex advertises its authorization endpoint in the MCP challenge, but its
      // protected-resource metadata host is not publicly reachable. Seed the
      // standards-based SDK flow with the documented issuer so it can construct
      // the authorization request without attempting dynamic registration.
      const authorizationServerUrl = "https://accounts-api.brex.com/oauth2/default";
      const authorizationServerMetadata = await discoverAuthorizationServerMetadata(authorizationServerUrl);
      if (!authorizationServerMetadata) throw new Error("Could not load Brex OAuth metadata");
      provider.saveDiscoveryState({
        authorizationServerUrl,
        authorizationServerMetadata,
        resourceMetadata: { resource: server.endpoint, authorization_servers: [authorizationServerUrl] },
      });
    }
    const result = await auth(provider, { serverUrl: server.endpoint, resourceMetadataUrl: challenge.resourceMetadataUrl, scope: challenge.scope });
    if (result !== "REDIRECT" || !provider.authorizationUrl) throw new Error("MCP server did not start OAuth authorization");
    this.pending.set(sessionId, { serverId: server.id, workspaceId: input.workspaceId, userId: input.userId, endpoint: server.endpoint, provider });
    return { sessionId, authorizationUrl: provider.authorizationUrl.toString() };
  }

  async complete(input: { sessionId: string; code: string; state: string; workspaceId: string; userId: string }): Promise<void> {
    const pending = this.pending.get(input.sessionId);
    if (!pending || pending.workspaceId !== input.workspaceId || pending.userId !== input.userId || input.state !== input.sessionId) throw new Error("MCP OAuth session is invalid or expired");
    const result = await auth(pending.provider, { serverUrl: pending.endpoint, authorizationCode: input.code });
    if (result !== "AUTHORIZED" || !pending.provider.tokens()) throw new Error("MCP OAuth authorization failed");
    await this.saveOAuth(pending, pending.provider.tokens()!);
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
      await this.prisma.$transaction([this.prisma.mcpServer.update({ where: { id: server.id }, data: { secretId: null, revision: { increment: 1 } } }), this.prisma.secret.delete({ where: { id: row.id } })]);
    }
  }

  private async saveOAuth(pending: Pending, tokens: OAuthTokens): Promise<void> {
    const server = await this.prisma.mcpServer.findUnique({ where: { id: pending.serverId } });
    const existing = server?.secretId ? await this.prisma.secret.findUnique({ where: { id: server.secretId } }) : null;
    const material = existing ? this.read(existing.ciphertext) : {};
    material.oauth = { tokens, obtainedAt: Date.now(), clientInformation: pending.provider.clientInformation(), discoveryState: pending.provider.discoveryState() };
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

  private read(ciphertext: string): OAuthMaterial { try { const value = JSON.parse(this.secrets.load(ciphertext)); return value && typeof value === "object" ? value as OAuthMaterial : {}; } catch { return {}; } }

  private isBrexServer(endpoint: string): boolean {
    try { return new URL(endpoint).hostname === "api.brex.com"; } catch { return false; }
  }

  private async oauthChallenge(endpoint: string): Promise<{ resourceMetadataUrl?: URL; scope?: string }> {
    try {
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      return response.status === 401 ? extractWWWAuthenticateParams(response) : {};
    } catch {
      // auth() will attempt the standard well-known discovery fallbacks.
      return {};
    }
  }
}
