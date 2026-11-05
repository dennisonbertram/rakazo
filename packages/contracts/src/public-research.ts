/**
 * MCP servers that only search and read the public web. An integration agent whose every server is
 * on this list holds no private data of its own. A small explicit list, never decided by a model.
 */
export const PUBLIC_RESEARCH_HOSTS: readonly string[] = ["mcp.exa.ai", "mcp.tavily.com"];

/** Whether an MCP endpoint is a public research server, matched by https host. */
export function isPublicResearchEndpoint(endpoint: string | null | undefined): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && PUBLIC_RESEARCH_HOSTS.includes(url.host);
  } catch {
    return false;
  }
}
