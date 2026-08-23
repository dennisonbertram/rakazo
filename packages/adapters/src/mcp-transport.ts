import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import {
  StdioClientTransport,
  type StdioServerParameters,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult, ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

export type McpRemoteTransport = "streamable-http" | "sse";

export interface McpUrlPolicy {
  /** Maximum URL length accepted before any network request. */
  maxUrlLength?: number;
  /** Permit plain HTTP only for explicitly local hosts. */
  allowHttpLocalhost?: boolean;
  /** Hosts allowed after redirects (redirects are rejected by default). */
  allowedHosts?: readonly string[];
}

export interface McpHeaderPolicy {
  /** Headers are copied into requests only when named here. */
  allowedHeaders?: readonly string[];
  headers?: Record<string, string>;
}

export interface McpRemoteOptions {
  url: string | URL;
  transport?: McpRemoteTransport;
  urlPolicy?: McpUrlPolicy;
  headerPolicy?: McpHeaderPolicy;
  /** Opt in to the deprecated HTTP+SSE transport. */
  allowLegacySse?: boolean;
  /** Fall back to SSE only after a fresh Streamable HTTP client fails. */
  fallbackToSse?: boolean;
  /** Let the official SDK own token refresh, re-authentication, and request retry. */
  authProvider?: OAuthClientProvider;
}

export interface McpStdioOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** Exact executable allowlist. Stdio is otherwise disabled. */
  allowedCommands: readonly string[];
  maxBufferSize?: number;
}

export interface McpClientOptions {
  name?: string;
  version?: string;
  capabilities?: ConstructorParameters<typeof Client>[1];
}

const DEFAULT_HEADERS = ["accept", "content-type", "authorization", "user-agent"];
const DEFAULT_MAX_URL_LENGTH = 2_048;

function validateUrl(raw: string | URL, policy: McpUrlPolicy = {}): URL {
  const url = new URL(raw.toString());
  const max = policy.maxUrlLength ?? DEFAULT_MAX_URL_LENGTH;
  if (url.toString().length > max) throw new Error(`MCP URL exceeds ${max} characters`);
  if (url.username || url.password || url.hash)
    throw new Error("MCP URL must not contain credentials or a fragment");
  const local =
    url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && (policy.allowHttpLocalhost ?? true) && local)
  ) {
    throw new Error("MCP remote URL must use HTTPS (HTTP is allowed only for localhost)");
  }
  if (policy.allowedHosts && !policy.allowedHosts.includes(url.hostname)) {
    throw new Error(`MCP host is not in the allowlist: ${url.hostname}`);
  }
  return url;
}

export function secureFetch(
  resourceUrl: URL,
  urlPolicy: McpUrlPolicy,
  headerPolicy: McpHeaderPolicy = {},
) {
  const allowed = new Set(
    (headerPolicy.allowedHeaders ?? DEFAULT_HEADERS).map((h) => h.toLowerCase()),
  );
  const configured = Object.entries(headerPolicy.headers ?? {}).filter(([name]) =>
    allowed.has(name.toLowerCase()),
  );
  return async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
    const source = input instanceof Request ? input : new Request(input, init);
    const url = validateUrl(source.url, urlPolicy);
    const headers = new Headers(source.headers);
    const sameOrigin = url.origin === resourceUrl.origin;
    if (sameOrigin) {
      for (const [name, value] of configured) headers.set(name, value);
    } else {
      // Operator-configured credentials belong to the MCP endpoint only; never
      // forward them to third-party OAuth/discovery origins, whichever path
      // they arrived through (requestInit merges included).
      for (const [name] of configured) headers.delete(name);
    }
    for (const [name, value] of new Headers(init?.headers)) {
      if (!allowed.has(name.toLowerCase())) continue;
      if (!sameOrigin && configured.some(([configuredName]) => configuredName.toLowerCase() === name.toLowerCase())) {
        continue;
      }
      headers.set(name, value);
    }
    // Buffer the body: a re-wrapped Request body is a stream without a replayable
    // source, and undici fails the whole request when a server answers 401 early
    // (the OAuth challenge) instead of draining it.
    const body =
      source.method === "GET" || source.method === "HEAD" ? undefined : await source.arrayBuffer();
    const response = await fetch(url, {
      method: source.method,
      headers,
      body,
      redirect: "manual",
      signal: source.signal,
    });
    if (response.status >= 300 && response.status < 400) {
      throw new Error("MCP redirects are not permitted; configure the final HTTPS URL explicitly");
    }
    return response;
  };
}

/**
 * Some providers (Brex) advertise OAuth discovery and registration hosts that
 * are not publicly routable, while mirroring the same well-known documents on
 * the MCP endpoint's own origin. When a request to another origin cannot
 * connect, retry the same path on the endpoint origin before giving up.
 */
export function withEndpointOriginFallback(
  endpointOrigin: string,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  // Credentials must not be replayed to a different origin than the one the
  // SDK addressed, so the retry drops auth/session headers.
  const SENSITIVE_RETRY_HEADERS = new Set(["authorization", "cookie", "proxy-authorization"]);
  const sanitizedInit = (init?: RequestInit): RequestInit | undefined => {
    if (!init?.headers) return init;
    const headers = new Headers(init.headers);
    for (const name of [...headers.keys()]) {
      if (SENSITIVE_RETRY_HEADERS.has(name.toLowerCase())) headers.delete(name);
    }
    return { ...init, headers };
  };
  return async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
    if (input instanceof Request) return fetchImpl(input, init);
    const url = new URL(String(input));
    if (url.origin === endpointOrigin) return fetchImpl(input, init);
    try {
      // Cap the first attempt: an unroutable host otherwise burns the full
      // connect timeout before the fallback gets a chance.
      return await fetchImpl(
        input,
        init?.signal ? init : { ...init, signal: AbortSignal.timeout(4_000) },
      );
    } catch {
      return fetchImpl(new URL(url.pathname + url.search, endpointOrigin), sanitizedInit(init));
    }
  };
}

function stdioParams(options: McpStdioOptions): StdioServerParameters {
  const command = options.command.trim();
  if (!command || !options.allowedCommands.includes(command)) {
    throw new Error("MCP stdio command is not in the configured allowlist");
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(options.env ?? {})) {
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) env[key] = value;
  }
  return {
    command,
    args: options.args ?? [],
    cwd: options.cwd,
    env,
    stderr: "pipe",
    maxBufferSize: options.maxBufferSize,
  };
}

/** A narrow seam around the official SDK, suitable for the agent tool layer. */
export class McpSession {
  client: Client;
  private readonly clientOptions: McpClientOptions;
  private transport?: Transport;
  private connected = false;
  private connecting?: Promise<void>;

  constructor(options: McpClientOptions = {}) {
    this.clientOptions = options;
    this.client = this.newClient();
  }

  private newClient(): Client {
    return new Client(
      { name: this.clientOptions.name ?? "rakazo", version: this.clientOptions.version ?? "0.1.0" },
      this.clientOptions.capabilities,
    );
  }

  async connectRemote(
    options: McpRemoteOptions,
  ): Promise<{ transport: McpRemoteTransport; usedFallback: boolean }> {
    if (this.connected || this.connecting)
      throw new Error("MCP session is already connected or connecting");
    const url = validateUrl(options.url, options.urlPolicy);
    const fetch = withEndpointOriginFallback(
      url.origin,
      secureFetch(url, options.urlPolicy ?? {}, options.headerPolicy),
    );
    let usedFallback = false;
    const connect = async (kind: McpRemoteTransport): Promise<void> => {
      // Credential headers are injected per-origin inside secureFetch; putting
      // them in requestInit would merge them into every SDK request, including
      // OAuth discovery and token calls to other origins.
      const transport =
        kind === "streamable-http"
          ? new StreamableHTTPClientTransport(url, { fetch, authProvider: options.authProvider })
          : new SSEClientTransport(url, {
              fetch,
              authProvider: options.authProvider,
              eventSourceInit: { fetch: fetch as never },
            });
      this.transport = transport;
      await this.client.connect(transport);
      this.connected = true;
    };
    this.connecting = (async () => {
      try {
        await connect(options.transport ?? "streamable-http");
      } catch (error) {
        await this.close();
        if (
          (options.fallbackToSse ?? true) &&
          options.allowLegacySse &&
          (options.transport ?? "streamable-http") === "streamable-http"
        ) {
          usedFallback = true;
          // The SDK's documented fallback uses a fresh Client after a failed
          // Streamable HTTP handshake; a Client cannot be reconnected safely.
          this.client = this.newClient();
          await connect("sse");
          return;
        }
        throw error;
      } finally {
        this.connecting = undefined;
      }
    })();
    await this.connecting;
    return {
      transport: usedFallback ? "sse" : (options.transport ?? "streamable-http"),
      usedFallback,
    };
  }

  async connectStdio(options: McpStdioOptions): Promise<void> {
    if (this.connected || this.connecting)
      throw new Error("MCP session is already connected or connecting");
    const transport = new StdioClientTransport(stdioParams(options));
    this.transport = transport;
    this.connecting = this.client
      .connect(transport)
      .then(() => {
        this.connected = true;
      })
      .finally(() => {
        this.connecting = undefined;
      });
    await this.connecting;
  }

  async listTools(options?: { signal?: AbortSignal }): Promise<ListToolsResult> {
    this.assertConnected();
    return this.client.listTools({}, { signal: options?.signal });
  }

  async callTool(
    name: string,
    args: Record<string, unknown> = {},
    options?: { signal?: AbortSignal },
  ): Promise<CallToolResult> {
    this.assertConnected();
    return (await this.client.callTool({ name, arguments: args }, undefined, {
      signal: options?.signal,
    })) as CallToolResult;
  }

  async close(): Promise<void> {
    this.connecting = undefined;
    this.connected = false;
    await this.client.close().catch(() => undefined);
    this.transport = undefined;
  }

  private assertConnected(): void {
    if (!this.connected) throw new Error("MCP session is not connected");
  }
}

export { validateUrl };
