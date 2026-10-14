import { CRYPTO_READ_TOOLS, isCryptoEndpoint } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { unwrapToolResult } from "./finance-call-tool.js";
import type { FinanceCallTool } from "./finance-sync.js";
import type { McpConnector } from "./mcp-connector.js";

type Deps = Pick<PrismaClient, "mcpServer">;
const UNLOCK = "__unlock_blockchain_analysis__";

/** The user's enabled Blockscout server (oldest first), or null. */
export async function findCryptoServer(
  prisma: Deps,
  scope: { spaceId: string; userId: string },
): Promise<{ id: string; endpoint: string } | null> {
  const rows = await prisma.mcpServer.findMany({
    where: { spaceId: scope.spaceId, userId: scope.userId, enabled: true },
    select: { id: true, endpoint: true },
    orderBy: { createdAt: "asc" },
  });
  const row = rows.find((r) => isCryptoEndpoint(r.endpoint));
  return row?.endpoint ? { id: row.id, endpoint: row.endpoint } : null;
}

/**
 * Read-tool caller over the user's Blockscout MCP server (key header, secrets and transport come
 * from `McpConnector`). Only CRYPTO_READ_TOOLS can be called. Blockscout asks for a `session_id`
 * from its free unlock tool; the caller fetches one only when a call is refused for lacking it.
 */
export function createCryptoCallToolFor(
  prisma: Deps,
  mcp: Pick<McpConnector, "callServerTool">,
): (server: { id: string; endpoint: string }, signal: AbortSignal) => Promise<FinanceCallTool> {
  return async (server, signal) => {
    const row = await prisma.mcpServer.findUnique({ where: { id: server.id } });
    if (!row?.enabled || !isCryptoEndpoint(row.endpoint))
      throw new Error("Crypto server is not available");
    const context = {
      operationId: `crypto:${row.id}`,
      traceId: `crypto:${row.id}`,
      spaceId: row.spaceId,
      userId: row.userId,
      signal,
    };
    const allowed: readonly string[] = CRYPTO_READ_TOOLS;
    const raw = (name: string, args: Record<string, unknown>) =>
      mcp.callServerTool(row, context, name, args);
    let sessionId: string | undefined;
    return async (name, args) => {
      if (!allowed.includes(name)) throw new Error(`Crypto may not call ${name}`);
      const withSession = () => (sessionId ? { ...args, session_id: sessionId } : args);
      try {
        return unwrapToolResult(await raw(name, withSession()));
      } catch (error) {
        if (sessionId || !/session_id/.test(error instanceof Error ? error.message : ""))
          throw error;
      }
      const unlocked = unwrapToolResult(await raw(UNLOCK, {})) as {
        data?: { session_id?: unknown };
      };
      const id = unlocked?.data?.session_id;
      if (typeof id !== "string") throw new Error("Blockscout session unavailable");
      sessionId = id;
      return unwrapToolResult(await raw(name, withSession()));
    };
  };
}
