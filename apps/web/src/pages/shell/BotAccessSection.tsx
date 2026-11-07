import { Trans, useLingui } from "@lingui/react/macro";
import type { Bot, CapabilityInstall, Connection, McpServer } from "@rakazo/contracts";
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
  /** The grant is saved but another account of the same app limits access, so it has no effect yet. */
  note?: string;
  /** The server keeps this one as it is: the agent's own, a private connection, an exclusive server, or inherited from the Inbox agent. */
  locked: boolean;
  toggle: (on: boolean) => Promise<unknown>;
  /** "Allow changes", on connections that have an agent: the connection's own switch gates it. */
  write?: {
    on: boolean;
    /** Not editable here: the connection's own agent follows the connection's switch. */
    fixed: boolean;
    enabled: boolean;
    toggle: (next: boolean) => Promise<unknown>;
  };
};

/** Names for the capabilities an owner can grant a Firewall agent from a request-access card. */
function useCapabilityNames() {
  const { t } = useLingui();
  return {
    contacts: t`Contacts`,
    data_room_read: t`Data room`,
    calendar_read: t`Calendar`,
    drive_read: t`Drive`,
  } as Record<string, string>;
}

/** What one agent can reach: the connected accounts and servers, each with the switch the integration page has. */
export function BotAccessSection({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  // Capabilities the owner granted this Firewall agent; each use still asks.
  const [grants, setGrants] = useState(bot.firewallAskCapabilities ?? []);
  const capabilityNames = useCapabilityNames();

  async function revoke(id: string) {
    setBusy(true);
    setError(null);
    try {
      const next = grants.filter((grant) => grant !== id);
      await rpc.bots.update({ botId: bot.id, firewallAskCapabilities: next });
      setGrants(next);
    } catch (err) {
      setError(errorText(err, t`Could not update access`));
    }
    setBusy(false);
  }

  const load = useCallback(async () => {
    const [connections, servers, effective, access, assigned, installs] = await Promise.all([
      rpc.connections.list(),
      rpc.mcp.servers.list(),
      rpc.connections.effectiveAccess(),
      rpc.connections.accessAll(),
      rpc.mcp.assignments.list({ botId: bot.id }),
      // Directly connected sources; the section still shows without them if this fails.
      Promise.resolve()
        .then(() => rpc.capabilities.list())
        .catch((): CapabilityInstall[] => []),
    ]);
    // An email's own agent has exactly the Inbox agent's access, on every account, so it only follows.
    const mailChat = isMailThreadAgentSpawnKey(bot.spawnKey);
    const live = connections.filter(
      (row: Connection) => row.status === "connected" && !row.needsReconnect,
    );
    const accountRows: Row[] = live.map((row) => {
      const own = row.agentBotId === bot.id;
      const private_ = Boolean(row.agentBotId) && !own && access[row.id]?.agentShared === false;
      const effectiveOn = effective[row.id]?.botIds.includes(bot.id) ?? false;
      // The switch shows the saved grant, so it can always be revoked; "all agents" does not reach a firewalled or external agent.
      const restricted = bot.audience === "external" || bot.firewall === true;
      const stored = access[row.id];
      const grantedOn =
        own ||
        (stored
          ? (stored.allAgents && !restricted) || stored.botIds.includes(bot.id)
          : effectiveOn);
      const on = mailChat || private_ ? effectiveOn : grantedOn;
      return {
        key: `connection:${row.id}`,
        name: row.displayName,
        address: row.account,
        on,
        note:
          on && !effectiveOn && !mailChat && !private_
            ? t`Saved, but another account of this app limits access`
            : undefined,
        locked: own || mailChat || private_,
        toggle: (on) => rpc.connections.setAgentAccess({ connectionId: row.id, botId: bot.id, on }),
        write:
          row.agentBotId && !mailChat
            ? {
                on: own
                  ? (row.writesEnabled ?? false)
                  : (access[row.id]?.writeBotIds ?? []).includes(bot.id),
                fixed: own,
                enabled: row.writesEnabled ?? false,
                toggle: (next) =>
                  rpc.connections.setAgentAccess({
                    connectionId: row.id,
                    botId: bot.id,
                    on: true,
                    canWrite: next,
                  }),
              }
            : undefined,
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
    const sourceRows: Row[] = installs
      .filter((source) => source.agentBotId !== undefined)
      .map((source) => {
        const own = source.agentBotId === bot.id;
        const restricted = bot.audience === "external" || bot.firewall === true;
        return {
          key: `source:${source.id}`,
          name: source.name,
          on: (source.usableBotIds ?? []).includes(bot.id),
          // A firewalled or external agent never reaches a source, so its switch cannot be turned on.
          locked: own || restricted,
          toggle: (on) => rpc.capabilities.setAgentAccess({ id: source.id, botId: bot.id, on }),
          write: {
            on: own ? (source.writesEnabled ?? false) : (source.writeBotIds ?? []).includes(bot.id),
            fixed: own,
            enabled: source.writesEnabled ?? false,
            toggle: (next) =>
              rpc.capabilities.setAgentAccess({
                id: source.id,
                botId: bot.id,
                on: true,
                canWrite: next,
              }),
          },
        };
      });
    setRows(
      [...accountRows, ...serverRows, ...sourceRows].sort(
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

  async function toggle(row: Row, on: boolean, change?: (next: boolean) => Promise<unknown>) {
    setBusy(true);
    setError(null);
    let changed = true;
    try {
      await (change ? change(on) : row.toggle(on));
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
  if ((!rows || rows.length === 0) && grants.length === 0) return null;
  const list = rows ?? [];
  const needle = query.trim().toLowerCase();
  const shown =
    list.length > AGENT_LIST_CONTROLS_MIN
      ? list.filter((row) => `${row.name} ${row.address ?? ""}`.toLowerCase().includes(needle))
      : list;
  return (
    <section data-testid="bot-access" className="mt-6">
      <div className="mb-2 text-[13.5px] font-medium text-foreground">
        <Trans>Access</Trans>
      </div>
      {list.length > AGENT_LIST_CONTROLS_MIN ? (
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
        {grants.map((id) => (
          <div key={`grant-${id}`} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm">{capabilityNames[id] ?? id}</span>
            <Switch
              aria-label={t`${bot.name} can ask to use ${capabilityNames[id] ?? id}`}
              checked
              disabled={busy}
              onCheckedChange={() => void revoke(id)}
            />
          </div>
        ))}
        {shown.map((row) => (
          <div key={row.key}>
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{row.name}</span>
                {row.address ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {row.address}
                  </span>
                ) : null}
                {row.note ? (
                  <span className="block text-xs text-muted-foreground">{row.note}</span>
                ) : null}
              </span>
              <Switch
                aria-label={t`${bot.name} can use ${row.name} ${row.address ?? ""}`.trim()}
                checked={row.on}
                disabled={busy || row.locked}
                onCheckedChange={(next) => void toggle(row, next)}
              />
            </div>
            {row.write && row.on ? (
              <div className="flex items-center gap-3 px-3.5 pb-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">
                    <Trans>Allow changes</Trans>
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    <Trans>The agent asks you before each change.</Trans>
                  </span>
                </span>
                <Switch
                  aria-label={t`${bot.name} can make changes in ${row.name} ${row.address ?? ""}`.trim()}
                  checked={row.write.on}
                  disabled={busy || row.write.fixed || !row.write.enabled}
                  onCheckedChange={(next) => void toggle(row, next, row.write?.toggle)}
                />
              </div>
            ) : null}
          </div>
        ))}
        {list.length > 0 && shown.length === 0 ? (
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
