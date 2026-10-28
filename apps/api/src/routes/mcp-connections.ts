import { ORPCError } from "@orpc/server";
import {
  createToken,
  listConnections,
  McpConnectionNotFound,
  McpSpaceForbidden,
  revokeConnection,
  updateConnection,
} from "../mcp-connections.js";
import type { RouteContext } from "./context.js";

/** Turns the two ownership failures into RPC errors; a connection that is not yours does not exist. */
async function owned<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof McpConnectionNotFound) throw new ORPCError("NOT_FOUND");
    if (error instanceof McpSpaceForbidden) throw new ORPCError("FORBIDDEN");
    throw error;
  }
}

export function createMcpConnectionsRoutes({ deps, authed }: RouteContext) {
  return {
    list: authed.mcpConnections.list.handler(({ context }) =>
      listConnections(deps.prisma, context.actor, deps.env.mcpUrl ?? ""),
    ),
    createToken: authed.mcpConnections.createToken.handler(({ context, input }) =>
      owned(() => createToken(deps.prisma, context.actor, input)),
    ),
    update: authed.mcpConnections.update.handler(({ context, input }) =>
      owned(() => updateConnection(deps.prisma, context.actor, input)),
    ),
    revoke: authed.mcpConnections.revoke.handler(({ context, input }) =>
      owned(async () => {
        await revokeConnection(deps.prisma, context.actor, input.id);
        return { ok: true as const };
      }),
    ),
  };
}
