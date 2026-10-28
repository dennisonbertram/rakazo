import { serveMcpRequest } from "@rakazo/adapters";
import { requireMcpAuth } from "@rakazo/auth";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { IsolationError, requireMembership, runAsSystem, runAsTenant } from "@rakazo/db";
import type { Hono } from "hono";
import { hashToken, PAT_PREFIX } from "./mcp-connections.js";

/** The caller may not use MCP right now; the message is safe to show the client. */
export class McpAccessError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403,
  ) {
    super(message);
    this.name = "McpAccessError";
  }
}

export interface McpTokenClaims {
  sub?: unknown;
  azp?: unknown;
  space_id?: unknown;
}

/** Calls are limited to one write of `lastUsedAt` per connection per minute. */
const LAST_USED_INTERVAL_MS = 60_000;

type Connection = NonNullable<Awaited<ReturnType<PrismaClient["mcpConnection"]["findFirst"]>>>;

/**
 * The checks every call passes, whatever the credential: membership decides whether the person
 * is still in the Space, then the call is recorded as the tenant. The connection row was already
 * found by the caller, so it is known not to be revoked. Nothing here is cached, so revoking or
 * leaving takes effect on the next call.
 */
async function admit(prisma: PrismaClient, connection: Connection, now = new Date()) {
  let actor: Actor;
  try {
    actor = await requireMembership(prisma, connection.userId, connection.spaceId);
  } catch (error) {
    if (error instanceof IsolationError) {
      throw new McpAccessError("No access to this space", 403);
    }
    throw error;
  }
  // Conditional, so several API processes write at most once a minute between them.
  await runAsTenant(actor, () =>
    prisma.mcpConnection.updateMany({
      where: {
        id: connection.id,
        OR: [
          { lastUsedAt: null },
          { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_INTERVAL_MS) } },
        ],
      },
      data: { lastUsedAt: now },
    }),
  );
  return {
    actor,
    connectionId: connection.id,
    scopes: connection.readOnly ? ["mcp:read"] : ["mcp:read", "mcp:write"],
  };
}

/** An OAuth access token proves who signed in and what they approved; the connection row says if that still stands. */
export async function resolveMcpCall(
  prisma: PrismaClient,
  claims: McpTokenClaims,
  now = new Date(),
) {
  const { sub, azp, space_id: spaceId } = claims;
  if (typeof sub !== "string" || typeof azp !== "string" || typeof spaceId !== "string") {
    throw new McpAccessError("This token is not bound to a space", 401);
  }
  const connection = await runAsSystem("mcp connection lookup", () =>
    prisma.mcpConnection.findFirst({
      where: { userId: sub, spaceId, oauthClientId: azp, kind: "oauth", revokedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  );
  if (!connection) throw new McpAccessError("This connection was revoked", 401);
  return admit(prisma, connection, now);
}

/** A personal access token is found by its hash and then passes the same checks. */
export async function resolvePatCall(prisma: PrismaClient, token: string, now = new Date()) {
  const connection = await runAsSystem("mcp token lookup", () =>
    prisma.mcpConnection.findFirst({
      where: { tokenHash: hashToken(token), kind: "pat", revokedAt: null },
    }),
  );
  if (!connection) throw new McpAccessError("This token is not valid", 401);
  return admit(prisma, connection, now);
}

/** The bots the member sees in this Space: id, name and a short description when there is one. */
export async function listAgents(prisma: PrismaClient, actor: Actor) {
  const bots = await prisma.bot.findMany({
    where: { spaceId: actor.spaceId, userId: actor.userId, archivedAt: null },
    select: { id: true, name: true, description: true },
    orderBy: [{ pinned: "desc" }, { position: "asc" }, { createdAt: "asc" }],
  });
  return bots.map((bot) => ({
    id: bot.id,
    name: bot.name,
    ...(bot.description ? { description: bot.description } : {}),
  }));
}

/** Runs one MCP request as the member, inside the Space the connection is bound to. */
export function handleMcpRequest(prisma: PrismaClient, actor: Actor, request: Request) {
  return runAsTenant(actor, () =>
    serveMcpRequest(request, {
      name: "praci",
      version: "1",
      register: (server) =>
        server.registerTool(
          "agents_list",
          {
            description: "List the agents (bots) in this space.",
            annotations: { readOnlyHint: true },
          },
          async () => ({
            content: [
              { type: "text", text: JSON.stringify({ agents: await listAgents(prisma, actor) }) },
            ],
          }),
        ),
    }),
  );
}

export interface McpMount {
  prisma: PrismaClient;
  auth: Parameters<typeof requireMcpAuth>[0];
  /** Public base URL of the API (`PUBLIC_MCP_URL`, or the API's own address on localhost). */
  baseUrl: string;
  /** Where this process fetches the token signing keys. */
  jwksUrl: string;
}

const MCP_PATH = "/mcp";

/** POST-only Streamable HTTP endpoint. Register before any tenant scope: it sets its own. */
export function mountMcpServer(app: Hono, mount: McpMount) {
  const resource = `${mount.baseUrl}${MCP_PATH}`;
  const metadata = `${mount.baseUrl}/.well-known/oauth-protected-resource${MCP_PATH}`;
  const denied = (error: McpAccessError) =>
    new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: error.message }, id: null }),
      {
        status: error.status,
        headers: {
          "content-type": "application/json",
          ...(error.status === 401
            ? {
                "www-authenticate": `Bearer error="invalid_token", resource_metadata="${metadata}"`,
              }
            : {}),
        },
      },
    );
  const answer = async (request: Request, resolve: () => ReturnType<typeof resolveMcpCall>) => {
    try {
      const { actor } = await resolve();
      return await handleMcpRequest(mount.prisma, actor, request);
    } catch (error) {
      if (error instanceof McpAccessError) return denied(error);
      throw error;
    }
  };
  const oauth = requireMcpAuth(
    mount.auth,
    (request, claims) => answer(request, () => resolveMcpCall(mount.prisma, claims)),
    {
      resource,
      issuer: mount.baseUrl,
      jwksUrl: mount.jwksUrl,
      requiredScopes: ["mcp:read"],
    },
  );
  // A personal access token is a bearer token too; everything else is an OAuth access token.
  app.post(MCP_PATH, (c) => {
    const token = c.req.header("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
    return token?.startsWith(PAT_PREFIX)
      ? answer(c.req.raw, () => resolvePatCall(mount.prisma, token))
      : oauth(c.req.raw);
  });
  app.all(MCP_PATH, (c) => c.body(null, 405, { allow: "POST" }));
}

const AUTH_PATH = "/api/auth";

/**
 * The two discovery documents. The authorization server document comes from Better Auth, with
 * every endpoint moved to the public API host except `authorization_endpoint`: that page needs
 * the member's session cookie, which belongs to the web origin, so it stays there.
 */
export function mountMcpDiscovery(
  app: Hono,
  discovery: {
    auth: McpMount["auth"] & { handler: (request: Request) => Promise<Response> };
    baseUrl: string;
    /** `BETTER_AUTH_URL`: the web origin that proxies `/api/auth` and holds the session cookie. */
    authUrl: string;
  },
) {
  const publicAuth = `${discovery.baseUrl}${AUTH_PATH}`;
  const internalAuth = `${discovery.authUrl.replace(/\/+$/, "")}${AUTH_PATH}`;
  const open = { "access-control-allow-origin": "*" };
  for (const path of [
    "/.well-known/oauth-protected-resource",
    `/.well-known/oauth-protected-resource${MCP_PATH}`,
  ]) {
    app.get(path, async (c) => {
      const response = await discovery.auth.handler(c.req.raw);
      if (!response.ok) return response;
      // Clients ask for the scopes listed here. Better Auth leaves offline_access out of the
      // resource document, but without it no refresh token is issued and every client would
      // have to sign in again when its 10-minute access token ends.
      const document = (await response.json()) as { scopes_supported?: string[] };
      const scopes = new Set([...(document.scopes_supported ?? []), "offline_access"]);
      return c.json({ ...document, scopes_supported: [...scopes] }, 200, {
        ...open,
        "cache-control": response.headers.get("cache-control") ?? "no-store",
      });
    });
  }
  app.get("/.well-known/oauth-authorization-server", async (c) => {
    const config = (await (
      discovery.auth as unknown as {
        api: { getOAuthServerConfig: () => Promise<Record<string, unknown>> };
      }
    ).api.getOAuthServerConfig()) as Record<string, unknown>;
    const moved = Object.fromEntries(
      Object.entries(config).map(([key, value]) => [
        key,
        key !== "authorization_endpoint" && typeof value === "string"
          ? value.replace(internalAuth, publicAuth)
          : value,
      ]),
    );
    return c.json({ ...moved, issuer: discovery.baseUrl }, 200, open);
  });
}
