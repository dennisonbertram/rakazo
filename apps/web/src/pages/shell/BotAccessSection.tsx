import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Connection, McpServer } from "@rakazo/contracts";
import { isInboxAgentSpawnKey, isMailThreadAgentSpawnKey } from "@rakazo/contracts";
import { Switch } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { AGENT_LIST_CONTROLS_MIN } from "../../components/integrations/parts";
import { SearchField } from "../../components/ListControls";
import { toggleAccess } from "../../lib/integrations";
import { assignMcpServer } from "../../lib/mcp-assign";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

type Access = { allAgents: boolean; botIds: string[]; agentShared: boolean };
type Row = {
  key: string;
  name: string;
  address?: string;
  on: boolean;
  /** The server keeps this one on (its own agent), or it is not shared with other agents. */
  locked: boolean;
  toggle: (on: boolean) => Promise<void>;
};

/** What one agent can reach: the connected accounts and servers, each with the switch the integration page has. */
export function BotAccessSection({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [connections, servers, bots, effective, assigned] = await Promise.all([
      rpc.connections.list(),
      rpc.mcp.servers.list(),
      rpc.bots.list(),
      rpc.connections.effectiveAccess(),
      rpc.mcp.assignments.list({ botId: bot.id }),
    ]);
    const owners = new Map(bots.map((entry) => [entry.id, entry]));
    const live = connections.filter(
      (row: Connection) => row.status === "connected" && !row.needsReconnect,
    );
    const access = new Map<string, Access>(
      await Promise.all(
        live.map(
          async (row) =>
            [row.id, await rpc.connections.access({ connectionId: row.id })] as [string, Access],
        ),
      ),
    );
    const allBotIds = bots.filter((entry) => !entry.archivedAt).map((entry) => entry.id);
    const accountRows: Row[] = live.map((row) => {
      const stored = access.get(row.id) ?? { allAgents: true, botIds: [], agentShared: true };
      const ownerKey = row.agentBotId ? owners.get(row.agentBotId)?.spawnKey : null;
      const own = row.agentBotId === bot.id;
      // An email's chat has exactly the Inbox agent's access, so it stays on with it.
      const mailChat = isMailThreadAgentSpawnKey(bot.spawnKey) && isInboxAgentSpawnKey(ownerKey);
      const private_ = Boolean(row.agentBotId) && !own && !stored.agentShared;
      return {
        key: `connection:${row.id}`,
        name: row.displayName,
        address: row.account,
        on: effective[row.id]?.botIds.includes(bot.id) ?? false,
        locked: own || mailChat || private_,
        toggle: async (on) => {
          // Read the stored grant fresh, so a change made elsewhere is not overwritten.
          const current = await rpc.connections.access({ connectionId: row.id });
          const next = toggleAccess(current, allBotIds, bot.id, on);
          await rpc.connections.setAccess({ connectionId: row.id, ...next });
        },
      };
    });
    const serverRows: Row[] = servers
      .filter((server: McpServer) => server.enabled)
      .map((server) => {
        const own = server.agentBotId === bot.id;
        return {
          key: `server:${server.id}`,
          name: server.name,
          on: own || assigned.some((entry) => entry.serverId === server.id),
          locked: own || (server.agentBotId !== null && server.agentExclusive),
          toggle: (on) => assignMcpServer(bot.id, server.id, on),
        };
      });
    setRows(
      [...accountRows, ...serverRows].sort(
        (a, b) => a.name.localeCompare(b.name) || (a.address ?? "").localeCompare(b.address ?? ""),
      ),
    );
  }, [bot.id, bot.spawnKey]);

  useEffect(() => {
    let active = true;
    setRows(null);
    load().then(
      () => active && setFailed(false),
      () => active && setFailed(true),
    );
    return () => {
      active = false;
    };
  }, [load]);

  async function toggle(row: Row, on: boolean) {
    setBusy(true);
    setError(null);
    try {
      await row.toggle(on);
    } catch (err) {
      setError(errorText(err, t`Could not update access`));
    }
    try {
      await load();
    } catch {
      // The switches keep what they showed; the error above, if any, is already visible.
    }
    setBusy(false);
  }

  if (failed) return null;
  if (!rows || rows.length === 0) return null;
  const needle = query.trim().toLowerCase();
  const shown =
    rows.length > AGENT_LIST_CONTROLS_MIN
      ? rows.filter((row) => `${row.name} ${row.address ?? ""}`.toLowerCase().includes(needle))
      : rows;
  return (
    <section data-testid="bot-access" className="mt-6">
      <div className="mb-2 text-[13.5px] font-medium text-foreground">
        <Trans>Access</Trans>
      </div>
      {rows.length > AGENT_LIST_CONTROLS_MIN ? (
        <SearchField
          name="access-search"
          className="mb-2"
          value={query}
          placeholder={t`Search accounts`}
          label={t`Search accounts`}
          onChange={setQuery}
        />
      ) : null}
      <div className="divide-y divide-border rounded-xl border border-border bg-card">
        {shown.map((row) => (
          <div key={row.key} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">{row.name}</span>
              {row.address ? (
                <span className="block truncate text-xs text-muted-foreground">{row.address}</span>
              ) : null}
            </span>
            <Switch
              aria-label={t`${bot.name} can use ${row.name} ${row.address ?? ""}`.trim()}
              checked={row.on}
              disabled={busy || row.locked}
              onCheckedChange={(next) => void toggle(row, next)}
            />
          </div>
        ))}
        {shown.length === 0 ? (
          <div className="px-3.5 py-2.5 text-sm text-muted-foreground">
            <Trans>No matching accounts</Trans>
          </div>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
