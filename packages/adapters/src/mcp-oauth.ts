import { randomUUID } from "node:crypto";
import type {
  OAuthClientProvider,
  OAuthDiscoveryState,
} from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { PrismaClient } from "@rakazo/db";
import { combineSignals } from "./connector-safety.js";
import {
  assertSafeRemoteUrl,
  createSafeRemoteFetch,
  listRemoteMcpTools,
  type RemoteTransportDependencies,
} from "./remote-mcp.js";
import type { EncryptedSecretStore } from "./secrets.js";

const OAUTH_TIMEOUT_MS = 30_000;

/** Bound every OAuth discovery/registration/token request by the same deadline. */
function withDeadline(fetchImpl: typeof fetch, signal: AbortSignal): typeof fetch {
  return (input, init) => fetchImpl(input, init?.signal ? init : { ...init, signal });
}

/** OAuth material for one MCP install, JSON-serialized into its encrypted Secret row. */
type OAuthMaterial = {
  tokens?: OAuthTokens;
  obtainedAt?: number;
  clientInformation?: OAuthClientInformationMixed;
  discoveryState?: OAuthDiscoveryState;
  redirectUri?: string;
  codeVerifier?: string;
  /** State of an authorization in flight; persisted so the callback can
      complete even if the API restarted between begin and the redirect. */
  pendingState?: string;
};

type InstallRef = { id: string; source: string; secretId: string | null };
type ActorRef = { workspaceId: string; userId: string };

export type McpOAuthStatus = "none" | "pending" | "connected" | "reconnect";

export class McpReauthorizationRequiredError extends Error {
  readonly code = "MCP_REAUTHORIZATION_REQUIRED";
  constructor(readonly installId: string) {
    super("MCP authorization expired. Reconnect this connector in Plugins.");
    this.name = "McpReauthorizationRequiredError";
  }
}

type ProviderOptions = {
  redirectUri?: string;
  state?: string;
  onAuthorization?: (url: URL) => void;
};

/** One SDK OAuth provider backed by the same encrypted material used at runtime. */
export class StoredMcpOAuthProvider implements OAuthClientProvider {
  authorizationUrl?: URL;
  private readonly runtimeState = randomUUID();
  private persistQueue = Promise.resolve();

  constructor(
    readonly installId: string,
    private readonly material: OAuthMaterial,
    private readonly persistMaterial: (material: OAuthMaterial) => Promise<void>,
    private readonly options: ProviderOptions = {},
  ) {
    if (options.redirectUri) this.material.redirectUri = options.redirectUri;
    // An interactive session carries its state so the persisted material lets
    // a different process complete the callback after a restart.
    if (options.state) this.material.pendingState = options.state;
  }

  get redirectUrl(): string | undefined {
    return this.options.redirectUri ?? this.material.redirectUri;
  }

  /** Drop the persisted in-flight session marker once authorization completes. */
  async clearPendingState(): Promise<void> {
    if (!this.material.pendingState) return;
    delete this.material.pendingState;
    await this.persist();
  }

  get clientMetadata(): OAuthClientMetadata {
    const redirectUri = this.redirectUrl;
    if (!redirectUri) throw new McpReauthorizationRequiredError(this.installId);
    const hostname = new URL(redirectUri).hostname;
    const applicationType = hostname === "localhost" || hostname === "127.0.0.1" ? "native" : "web";
    return {
      redirect_uris: [redirectUri],
      client_name: "Rakazo",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      application_type: applicationType,
    } as OAuthClientMetadata;
  }

  state(): string {
    return this.options.state ?? this.runtimeState;
  }
  clientInformation(): OAuthClientInformationMixed | undefined {
    return this.material.clientInformation;
  }
  async saveClientInformation(value: OAuthClientInformationMixed): Promise<void> {
    this.material.clientInformation = value;
    await this.persist();
  }
  tokens(): OAuthTokens | undefined {
    return this.material.tokens;
  }
  async saveTokens(value: OAuthTokens): Promise<void> {
    this.material.tokens = value;
    this.material.obtainedAt = Date.now();
    await this.persist();
  }
  async redirectToAuthorization(url: URL): Promise<void> {
    this.authorizationUrl = url;
    if (this.options.onAuthorization) {
      this.options.onAuthorization(url);
      return;
    }
    // Runtime re-auth needs the user; drop the dead tokens so status reads "reconnect".
    await this.invalidateCredentials("tokens");
    throw new McpReauthorizationRequiredError(this.installId);
  }
  async saveCodeVerifier(value: string): Promise<void> {
    this.material.codeVerifier = value;
    await this.persist();
  }
  codeVerifier(): string {
    const verifier = this.material.codeVerifier;
    if (!verifier) throw new Error("OAuth PKCE verifier is missing");
    return verifier;
  }
  async saveDiscoveryState(value: OAuthDiscoveryState): Promise<void> {
    this.material.discoveryState = value;
    await this.persist();
  }
  discoveryState(): OAuthDiscoveryState | undefined {
    return this.material.discoveryState;
  }
  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (scope === "all") {
      const redirectUri = this.redirectUrl;
      for (const key of Object.keys(this.material)) {
        delete this.material[key as keyof OAuthMaterial];
      }
      if (redirectUri) this.material.redirectUri = redirectUri;
    } else {
      if (scope === "client") delete this.material.clientInformation;
      if (scope === "tokens") {
        delete this.material.tokens;
        delete this.material.obtainedAt;
      }
      if (scope === "verifier") delete this.material.codeVerifier;
      if (scope === "discovery") delete this.material.discoveryState;
    }
    await this.persist();
  }

  private async persist(): Promise<void> {
    const snapshot = structuredClone(this.material);
    const next = this.persistQueue.then(() => this.persistMaterial(snapshot));
    this.persistQueue = next.catch(() => undefined);
    await next;
  }
}

/**
 * OAuth lifecycle for installed MCP connectors (CapabilityInstall rows whose
 * config.auth.type is "oauth"). All state, including in-flight authorizations,
 * lives in the install's encrypted Secret row, so any process can complete a
 * callback regardless of which one began it.
 */
export class McpOAuthBroker {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: EncryptedSecretStore,
    private readonly remote: RemoteTransportDependencies = {},
  ) {}

  async statusFor(install: InstallRef, context: ActorRef): Promise<McpOAuthStatus> {
    const loaded = await this.loadMaterial(install, context);
    if (!loaded.material) return "none";
    if (loaded.material.tokens) return "connected";
    if (loaded.material.pendingState) return "pending";
    return "reconnect";
  }

  /** Runtime provider for tool discovery/calls; undefined until the user authorized once. */
  async providerFor(
    install: InstallRef,
    context: ActorRef,
  ): Promise<OAuthClientProvider | undefined> {
    const loaded = await this.loadMaterial(install, context);
    if (!loaded.material) return undefined;
    return this.createProvider(install, context, loaded.material);
  }

  async begin(input: {
    installId: string;
    workspaceId: string;
    userId: string;
    redirectUri: string;
    signal?: AbortSignal;
  }): Promise<{ authorizationUrl: string }> {
    const context = { workspaceId: input.workspaceId, userId: input.userId };
    const install = await this.findInstall(input.installId, context);
    if (!install) throw new Error("MCP connector is unavailable");
    const auth = (install.config as { auth?: { type?: string } } | null)?.auth;
    if (auth?.type !== "oauth") throw new Error("This MCP connector does not use OAuth");
    const state = randomUUID();
    const loaded = await this.loadMaterial(install, context);
    let authorizationUrl: URL | undefined;
    const provider = this.createProvider(install, context, loaded.material ?? {}, {
      redirectUri: input.redirectUri,
      state,
      onAuthorization: (url) => {
        authorizationUrl = url;
      },
    });
    if (provider.tokens()) await provider.invalidateCredentials("tokens");
    const endpoint = await assertSafeRemoteUrl(install.source, this.remote.resolveHostname);
    const signal = combineSignals(input.signal, AbortSignal.timeout(OAUTH_TIMEOUT_MS));
    const safeFetch = createSafeRemoteFetch(this.remote.fetch, this.remote.resolveHostname);
    const transport = new StreamableHTTPClientTransport(endpoint, {
      authProvider: provider,
      fetch: withDeadline(safeFetch, signal),
    });
    const client = new Client({ name: "rakazo-oauth", version: "0.1.0" });
    try {
      await client.connect(transport, { signal, timeout: OAUTH_TIMEOUT_MS });
    } catch (error) {
      if (!authorizationUrl) throw error;
    } finally {
      await client.close().catch(() => undefined);
      await safeFetch.close().catch(() => undefined);
    }
    if (!authorizationUrl) throw new Error("MCP server did not request OAuth authorization");
    return { authorizationUrl: authorizationUrl.toString() };
  }

  async complete(input: {
    code: string;
    state: string;
    workspaceId: string;
    userId: string;
    signal?: AbortSignal;
  }): Promise<{ installId: string }> {
    const context = { workspaceId: input.workspaceId, userId: input.userId };
    const found = await this.findPending(input.state, context);
    if (!found) throw new Error("MCP OAuth session is invalid or expired");
    const { install, material } = found;
    const provider = this.createProvider(install, context, material, {
      redirectUri: material.redirectUri,
      state: input.state,
    });
    const endpoint = await assertSafeRemoteUrl(install.source, this.remote.resolveHostname);
    const signal = combineSignals(input.signal, AbortSignal.timeout(OAUTH_TIMEOUT_MS));
    const safeFetch = createSafeRemoteFetch(this.remote.fetch, this.remote.resolveHostname);
    try {
      const transport = new StreamableHTTPClientTransport(endpoint, {
        authProvider: provider,
        fetch: withDeadline(safeFetch, signal),
      });
      await transport.finishAuth(input.code);
      if (!provider.tokens()) throw new Error("MCP OAuth authorization failed");
      await provider.clearPendingState();
      // The install-time "server has tools" check was deferred for OAuth
      // connectors; enforce it now that the tokens exist.
      try {
        const tools = await listRemoteMcpTools({
          endpoint: install.source,
          authProvider: provider,
          signal: input.signal,
          fetch: this.remote.fetch,
          resolveHostname: this.remote.resolveHostname,
        });
        if (tools.length === 0) throw new Error("MCP server returned no tools");
      } catch (error) {
        // Keep the stored state consistent with the reported failure; with the
        // tokens left in place the connector would read "connected".
        await provider.invalidateCredentials("tokens");
        throw error;
      }
    } finally {
      await safeFetch.close().catch(() => undefined);
    }
    return { installId: install.id };
  }

  private async findInstall(
    installId: string,
    context: ActorRef,
  ): Promise<(InstallRef & { config: unknown }) | null> {
    return this.prisma.capabilityInstall.findFirst({
      where: {
        id: installId,
        workspaceId: context.workspaceId,
        userId: context.userId,
        kind: "mcp",
      },
      select: { id: true, source: true, secretId: true, config: true },
    });
  }

  private async findPending(
    state: string,
    context: ActorRef,
  ): Promise<{ install: InstallRef; material: OAuthMaterial } | undefined> {
    const installs = await this.prisma.capabilityInstall.findMany({
      where: {
        workspaceId: context.workspaceId,
        userId: context.userId,
        kind: "mcp",
        secretId: { not: null },
      },
      select: { id: true, source: true, secretId: true, config: true },
    });
    for (const install of installs) {
      const auth = (install.config as { auth?: { type?: string } } | null)?.auth;
      if (auth?.type !== "oauth") continue;
      const loaded = await this.loadMaterial(install, context);
      if (loaded.material?.pendingState === state) return { install, material: loaded.material };
    }
    return undefined;
  }

  private async loadMaterial(
    install: InstallRef,
    context: ActorRef,
  ): Promise<{ material?: OAuthMaterial }> {
    if (!install.secretId) return {};
    const row = await this.prisma.secret.findFirst({
      where: { id: install.secretId, workspaceId: context.workspaceId, userId: context.userId },
    });
    if (!row) return {};
    try {
      const value = JSON.parse(this.secrets.load(row.ciphertext));
      return value && typeof value === "object" && !Array.isArray(value)
        ? { material: value as OAuthMaterial }
        : {};
    } catch {
      return {};
    }
  }

  private createProvider(
    install: InstallRef,
    context: ActorRef,
    material: OAuthMaterial,
    options: ProviderOptions = {},
  ): StoredMcpOAuthProvider {
    let currentSecretId = install.secretId ?? undefined;
    return new StoredMcpOAuthProvider(
      install.id,
      material,
      async (snapshot) => {
        currentSecretId = await this.saveMaterial(install.id, currentSecretId, snapshot, context);
      },
      options,
    );
  }

  private async saveMaterial(
    installId: string,
    secretId: string | undefined,
    material: OAuthMaterial,
    context: ActorRef,
  ): Promise<string | undefined> {
    if (Object.keys(material).length === 0) {
      await this.prisma.$transaction([
        this.prisma.capabilityInstall.update({
          where: { id: installId },
          data: { secretId: null },
        }),
        ...(secretId
          ? [
              this.prisma.secret.deleteMany({
                where: {
                  id: secretId,
                  workspaceId: context.workspaceId,
                  userId: context.userId,
                },
              }),
            ]
          : []),
      ]);
      return undefined;
    }
    const stored = await this.secrets.put(JSON.stringify(material), {
      operationId: "capabilities.oauth",
      traceId: "capabilities.oauth",
      workspaceId: context.workspaceId,
      userId: context.userId,
      signal: new AbortController().signal,
    });
    if (secretId) {
      const updated = await this.prisma.secret.updateMany({
        where: { id: secretId, workspaceId: context.workspaceId, userId: context.userId },
        data: { ciphertext: stored.ciphertext },
      });
      // A zero-row update means the install was removed mid-flight; failing
      // loudly beats reporting success for a connector that no longer exists.
      if (updated.count === 0) throw new Error("MCP connector is unavailable");
      return secretId;
    }
    await this.prisma.$transaction([
      this.prisma.secret.create({
        data: {
          id: stored.id,
          workspaceId: context.workspaceId,
          userId: context.userId,
          kind: "connector",
          ciphertext: stored.ciphertext,
        },
      }),
      this.prisma.capabilityInstall.update({
        where: { id: installId },
        data: { secretId: stored.id },
      }),
    ]);
    return stored.id;
  }
}
