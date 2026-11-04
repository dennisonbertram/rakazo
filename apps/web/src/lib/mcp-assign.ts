import { rpc } from "./rpc";

/** Gives one agent a server or takes it away. replace() overwrites the agent's whole list, so start from what it has. */
export async function assignMcpServer(botId: string, serverId: string, on: boolean) {
  const current = await rpc.mcp.assignments.list({ botId });
  const others = current
    .filter((entry) => entry.serverId !== serverId)
    .map(({ serverId: id, allowAllTools, allowedTools }) => ({
      serverId: id,
      allowAllTools,
      allowedTools,
    }));
  const kept = current.find((entry) => entry.serverId === serverId);
  await rpc.mcp.assignments.replace({
    botId,
    assignments: on
      ? [
          ...others,
          kept
            ? { serverId, allowAllTools: kept.allowAllTools, allowedTools: kept.allowedTools }
            : { serverId, allowAllTools: true, allowedTools: [] },
        ]
      : others,
  });
}
