import { mcp, requireMcpAuth } from "@better-auth/mcp";
import { getOAuthProviderState } from "@better-auth/oauth-provider";
import type { PrismaClient } from "@rakazo/db";
import { notifyNewMcpConnection } from "@rakazo/db";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  sessionMiddleware,
} from "better-auth/api";
import { jwt } from "better-auth/plugins";

export const MCP_SCOPES = ["offline_access", "mcp:read", "mcp:write"] as const;
export const MCP_ACCESS_TOKEN_SECONDS = 10 * 60;
export const MCP_REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;
/** The Space a member picks only has to survive until the same page approves the client. */
const PICK_SECONDS = 60;

export interface McpAuthEnv {
  /** Public base URL of the API: the OAuth issuer and the host of the token endpoint. */
  issuer: string;
  /** Canonical MCP resource URL; access tokens are bound to it. */
  resource: string;
  /** Web origin: the member's browser signs in, picks a Space and approves here. */
  webOrigin: string;
}

/** A pick belongs to one session and one client, so a client cannot use another's. */
export const pickKey = (sessionId: string, clientId: string) =>
  `mcp-space-${sessionId}-${clientId}`;

const clientOf = (oauthQuery: unknown) =>
  new URLSearchParams(String(oauthQuery ?? "")).get("client_id") ?? undefined;

/** The client of the signed authorize query this request carries, if it carries one. */
async function requestClient() {
  const state = await getOAuthProviderState();
  return state?.query ? clientOf(state.query) : undefined;
}

export async function pickedSpace(
  prisma: PrismaClient,
  sessionId: string,
  clientId: string | undefined,
  now = new Date(),
) {
  if (!clientId) return undefined;
  const row = await prisma.verification.findFirst({
    where: { identifier: pickKey(sessionId, clientId), expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  return row?.value;
}

async function requireSpaceMember(prisma: PrismaClient, userId: string, spaceId: string) {
  const member = await prisma.spaceMember.findFirst({ where: { userId, spaceId } });
  if (!member) throw new APIError("FORBIDDEN", { message: "No access to this space" });
}

/**
 * The Space a client connects to is chosen on the approval page and stored for the session.
 * Better Auth reads it back as the consent reference, copies it into the access token as
 * `space_id`, and `mcp_connections` records the member's grant for that client and Space.
 */
function mcpSpace(prisma: PrismaClient): BetterAuthPlugin {
  return {
    id: "mcp-space",
    endpoints: {
      mcpSpaces: createAuthEndpoint(
        "/mcp/spaces",
        { method: "GET", use: [sessionMiddleware] },
        async (ctx) => {
          const memberships = await prisma.spaceMember.findMany({
            where: { userId: ctx.context.session.user.id, space: { deletingAt: null } },
            select: { space: { select: { id: true, name: true } } },
            orderBy: [{ space: { isDefault: "desc" } }, { createdAt: "asc" }],
          });
          return ctx.json({ spaces: memberships.map((m) => m.space) });
        },
      ),
      mcpPickSpace: createAuthEndpoint(
        "/mcp/space",
        { method: "POST", use: [sessionMiddleware] },
        async (ctx) => {
          const spaceId = (ctx.body as { spaceId?: unknown } | null)?.spaceId;
          if (typeof spaceId !== "string") throw new APIError("BAD_REQUEST");
          const clientId = clientOf((ctx.body as { oauth_query?: unknown }).oauth_query);
          if (!clientId) throw new APIError("BAD_REQUEST", { message: "Missing client" });
          const { session, user } = ctx.context.session;
          await requireSpaceMember(prisma, user.id, spaceId);
          const identifier = pickKey(session.id, clientId);
          await prisma.verification.deleteMany({ where: { identifier } });
          await prisma.verification.create({
            data: {
              id: crypto.randomUUID(),
              identifier,
              value: spaceId,
              expiresAt: new Date(Date.now() + PICK_SECONDS * 1000),
            },
          });
          return ctx.json({ ok: true });
        },
      ),
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/oauth2/consent" && ctx.body?.accept === true,
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (!session) throw new APIError("UNAUTHORIZED");
            const clientId = clientOf(ctx.body?.oauth_query);
            if (!clientId) throw new APIError("BAD_REQUEST", { message: "Missing client" });
            const spaceId = await pickedSpace(prisma, session.session.id, clientId);
            if (!spaceId) throw new APIError("BAD_REQUEST", { message: "Choose a space" });
            await requireSpaceMember(prisma, session.user.id, spaceId);
            const existing = await prisma.mcpConnection.findFirst({
              where: {
                userId: session.user.id,
                spaceId,
                oauthClientId: clientId,
                kind: "oauth",
                revokedAt: null,
              },
            });
            if (existing) return;
            const client = await prisma.oauthClient.findUnique({
              where: { clientId },
              select: { name: true },
            });
            const created = await prisma.mcpConnection.create({
              data: {
                userId: session.user.id,
                spaceId,
                kind: "oauth",
                oauthClientId: clientId,
                clientName: client?.name ?? null,
                label: client?.name ?? "MCP client",
              },
            });
            // A failed notice must not block the approval.
            await notifyNewMcpConnection(prisma, created).catch(() => undefined);
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === "/oauth2/consent",
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            const clientId = clientOf(ctx.body?.oauth_query);
            if (session && clientId) {
              await prisma.verification.deleteMany({
                where: { identifier: pickKey(session.session.id, clientId) },
              });
            }
          }),
        },
      ],
    },
  };
}

/** The OAuth server for MCP clients: JWT access tokens bound to `resource`, one Space per grant. */
export function mcpPlugins(prisma: PrismaClient, env: McpAuthEnv): BetterAuthPlugin[] {
  const page = new URL("/oauth/consent", env.webOrigin).href;
  return [
    jwt({ jwt: { issuer: env.issuer } }),
    mcp({
      resource: env.resource,
      loginPage: new URL("/sign-in", env.webOrigin).href,
      consentPage: page,
      scopes: [...MCP_SCOPES],
      grantTypes: ["authorization_code", "refresh_token"],
      accessTokenExpiresIn: MCP_ACCESS_TOKEN_SECONDS,
      refreshTokenExpiresIn: MCP_REFRESH_TOKEN_SECONDS,
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: "infer",
      postLogin: {
        page,
        // A fresh authorize request carries no client state yet, so it always shows the page.
        shouldRedirect: async ({ session }) =>
          !(await pickedSpace(prisma, session.id, await requestClient())),
        consentReferenceId: async ({ session }) => {
          const spaceId = await pickedSpace(prisma, session.id, await requestClient());
          if (!spaceId) throw new APIError("BAD_REQUEST", { message: "Choose a space" });
          return spaceId;
        },
      },
      customAccessTokenClaims: ({ referenceId }) => ({ space_id: referenceId }),
    }),
    mcpSpace(prisma),
  ];
}

export { requireMcpAuth };
