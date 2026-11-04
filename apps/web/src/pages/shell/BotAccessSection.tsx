import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, Connection, McpServer } from "@rakazo/contracts";
import { isMailThreadAgentSpawnKey } from "@rakazo/contracts";
import { Button, Switch } from "@rakazo/ui-web";
import { useCallback, useEffect, useState } from "react";
import { AGENT_LIST_CONTROLS_MIN } from "../../components/integrations/parts";
import { SearchField } from "../../components/ListControls";
import { rpc } from "../../lib/rpc";
import { errorText } from "../../lib/user-error";

type Row = {
  key: string;
  name: string;
  address?: string;
  on: boolean;
  /** The server keeps this one as it is: the agent's own, a private connection, an exclusive server, or inherited from the Inbox agent. */
  locked: boolean;
  toggle: (on: boolean) => Promise<unknown>;
};

/** What one agent can reach: the connected accounts and servers, each with the switch the integration page has. */
export function BotAccessSection({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [connections, servers, effective, access, assigned] = await Promise.all([
      rpc.connections.list(),
      rpc.mcp.servers.list(),
      rpc.connections.effectiveAccess(),
      rpc.connections.accessAll(),
      rpc.mcp.assignments.list({ botId: bot.id }),
    ]);
    // An email's own agent has exactly the Inbox agent's access, on every account, so it only follows.
    const mailChat = isMailThreadAgentSpawnKey(bot.spawnKey);
    const live = connections.filter(
      (row: Connection) => row.status === "connected" && !row.needsReconnect,
    );
    const accountRows: Row[] = live.map((row) => {
      const own = row.agentBotId === bot.id;
      const private_ = Boolean(row.agentBotId) && !own && access[row.id]?.agentShared === false;
      return {
        key: `connection:${row.id}`,
        name: row.displayName,
        address: row.account,
        on: effective[row.id]?.botIds.includes(bot.id) ?? false,
        locked: own || mailChat || private_,
        toggle: (on) => rpc.connections.setAgentAccess({ connectionId: row.id, botId: bot.id, on }),
      };
    });
    const serverRows: Row[] = servers
      .filter((server: McpServer) => server.enabled)
      .map((server) => {
        const own = server.agentBotId === bot.id;
        // Only its agent may use an exclusive server, whatever the saved assignments say.
        const exclusiveOther = server.agentBotId !== null && server.agentExclusive && !own;
        return {
          key: `server:${server.id}`,
          name: server.name,
          on: own || (!exclusiveOther && assigned.some((entry) => entry.serverId === server.id)),
          locked: own || exclusiveOther,
          toggle: (on) =>
            rpc.mcp.servers.setAgentAssignment({ serverId: server.id, botId: bot.id, on }),
        };
      });
    setRows(
      [...accountRows, ...serverRows].sort(
        (a, b) => a.name.localeCompare(b.name) || (a.address ?? "").localeCompare(b.address ?? ""),
      ),
    );
  }, [bot.id, bot.spawnKey]);

  const { audience, firewall } = bot;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a changed audience or firewall changes who can reach what
  const reload = useCallback(() => {
    setLoadFailed(false);
    load().catch(() => setLoadFailed(true));
  }, [load, audience, firewall]);
  useEffect(() => {
    setRows(null);
    reload();
  }, [reload]);

  async function toggle(row: Row, on: boolean) {
    setBusy(true);
    setError(null);
    let changed = true;
    try {
      await row.toggle(on);
    } catch (err) {
      changed = false;
      setError(errorText(err, t`Could not update access`));
    }
    try {
      await load();
    } catch {
      // The change may have landed, but the switches no longer show the server's state.
      if (changed) setError(t`Saved, but the list could not be refreshed`);
    }
    setBusy(false);
  }

  if (loadFailed)
    return (
      <section data-testid="bot-access" className="mt-6">
        <div className="mb-2 text-[13.5px] font-medium text-foreground">
          <Trans>Access</Trans>
        </div>
        <p role="alert" className="text-sm text-destructive">
          <Trans>Could not load access</Trans>
        </p>
        <Button variant="outline" size="sm" className="mt-2" onClick={reload}>
          <Trans>Retry</Trans>
        </Button>
      </section>
    );
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
