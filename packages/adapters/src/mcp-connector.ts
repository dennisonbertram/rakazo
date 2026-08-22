import type { AdapterContext, ConnectorCall, ConnectorEvent, ConnectorProvider, ConnectorTool } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { McpSession } from "./mcp-transport.js";
import { EncryptedSecretStore } from "./secrets.js";
import type { McpOAuthBroker } from "./mcp-oauth.js";

type SessionEntry = { session: McpSession; serverId: string; revision: number };

/** Runtime MCP connector. Authorization is re-checked against the bot assignment on every call. */
export class McpConnector implements ConnectorProvider {
  private readonly sessions = new Map<string, SessionEntry>();
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: EncryptedSecretStore,
    private readonly options: { stdioEnabled?: boolean; allowedCommands?: string[] } = {},
    private readonly oauth?: McpOAuthBroker,
  ) {}

  describe() {
    return { id: "mcp", contractVersion: "1", adapterVersion: "0.1.0", capabilities: { discover: true, oauth: true, secretsBrokered: true } };
  }

  async discoverTools(context: AdapterContext): Promise<ConnectorTool[]> {
    if (!context.botId) return [];
    const assignments = await this.prisma.botMcpServer.findMany({
      where: { botId: context.botId, workspaceId: context.workspaceId, userId: context.userId, server: { enabled: true } },
      include: { server: true },
    });
    const tools: ConnectorTool[] = [];
    for (const assignment of assignments) {
      try {
        const session = await this.sessionFor(assignment.server, context);
        const listed = await session.listTools({ signal: context.signal });
        for (const tool of listed.tools ?? []) {
          if (!assignment.allowAllTools && !(assignment.allowedTools as unknown[]).includes(tool.name)) continue;
          tools.push({
            name: `mcp__${assignment.server.slug}__${tool.name}`,
            description: tool.description ?? tool.name,
            inputSchema: (tool.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
            route: { kind: "mcp", serverId: assignment.serverId, remoteName: tool.name },
          });
        }
      } catch (error) {
        // A single unavailable server must not hide tools from other connectors.
        console.error(`mcp discovery failed for server ${assignment.server.slug}:`, error instanceof Error ? error.message : error);
        await this.evict(assignment.server.id);
      }
    }
    return tools;
  }

  async *execute(call: ConnectorCall, context: AdapterContext): AsyncIterable<ConnectorEvent> {
    if (call.route?.kind !== "mcp") { yield { type: "error", message: `MCP route required for ${call.tool}` }; return; }
    if (!context.botId) { yield { type: "error", message: "MCP tools require a bot context" }; return; }
    const assignment = await this.prisma.botMcpServer.findFirst({
      where: { botId: context.botId, serverId: call.route.serverId, workspaceId: context.workspaceId, userId: context.userId, server: { enabled: true } },
      include: { server: true },
    });
    if (!assignment || (!assignment.allowAllTools && !(assignment.allowedTools as unknown[]).includes(call.route.remoteName))) {
      yield { type: "error", message: "MCP tool is not assigned to this bot" }; return;
    }
    try {
      const result = await (await this.sessionFor(assignment.server, context)).callTool(call.route.remoteName, call.args, { signal: context.signal });
      yield { type: "result", data: result };
    } catch (error) {
      // A thrown call means the transport or auth broke; drop the session so the next call reconnects.
      await this.evict(assignment.server.id);
      yield { type: "error", message: error instanceof Error ? error.message : String(error) };
    }
  }

  async close(): Promise<void> { await Promise.all([...this.sessions.values()].map(({ session }) => session.close())); this.sessions.clear(); }

  private async evict(serverId: string): Promise<void> {
    const entry = this.sessions.get(String(serverId));
    if (!entry) return;
    this.sessions.delete(String(serverId));
    await entry.session.close();
  }

  private async sessionFor(server: any, context: AdapterContext): Promise<McpSession> {
    const sessionKey = String(server.id);
    const existing = this.sessions.get(sessionKey);
    if (existing && existing.revision === server.revision) return existing.session;
    if (existing) {
      await existing.session.close();
      this.sessions.delete(sessionKey);
    }
    const session = new McpSession({ name: `rakazo-${server.slug}` });
    const secret = server.secretId ? await this.prisma.secret.findFirst({ where: { id: server.secretId, workspaceId: context.workspaceId, userId: context.userId } }) : null;
    const material = secret ? JSON.parse(this.secrets.load(secret.ciphertext)) as { secret?: string; env?: Record<string, string>; headers?: Record<string, string> } : {};
    const args = Array.isArray(server.args) ? server.args.map(String) : [];
    const env = { ...(material.env ?? {}) };
    if (server.transport === "stdio") {
      if (!this.options.stdioEnabled) throw new Error("MCP stdio is disabled");
      await session.connectStdio({ command: String(server.command ?? ""), args, env, allowedCommands: this.options.allowedCommands ?? [] });
    } else {
      if (!server.endpoint) throw new Error("MCP endpoint is required");
      const authProvider = this.oauth ? await this.oauth.providerFor(server, context) : undefined;
      const staticToken = material.secret ? (material.secret.startsWith("Bearer ") ? material.secret : `Bearer ${material.secret}`) : undefined;
      const headers = { ...(material.headers ?? {}), ...(staticToken ? { Authorization: staticToken } : {}) };
      await session.connectRemote({ url: server.endpoint, transport: server.transport === "sse" ? "sse" : "streamable-http", allowLegacySse: server.transport === "sse", headerPolicy: { headers }, fallbackToSse: false, authProvider });
    }
    this.sessions.set(sessionKey, { session, serverId: server.id, revision: server.revision });
    return session;
  }
}
