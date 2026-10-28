import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

/**
 * Answers one MCP request over Streamable HTTP in stateless mode: a new server per request,
 * a plain JSON reply, no session id, nothing kept between calls, so any API process can serve it.
 * `ping` and `tools/list` come from the SDK; the caller registers the tools.
 */
export async function serveMcpRequest(
  request: Request,
  options: { name: string; version: string; register: (server: McpServer) => void },
): Promise<Response> {
  const server = new McpServer({ name: options.name, version: options.version });
  options.register(server);
  const transport = new WebStandardStreamableHTTPServerTransport({ enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}

export type { McpServer };
