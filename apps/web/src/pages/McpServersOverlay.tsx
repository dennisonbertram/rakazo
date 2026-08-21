import type { Bot, McpServer } from "@rakazo/contracts";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

type Transport = "streamable_http" | "sse" | "stdio";

export function McpServersOverlay({ onClose }: { onClose: () => void }) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [transport, setTransport] = useState<Transport>("streamable_http");
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [secret, setSecret] = useState("");
  const [headerName, setHeaderName] = useState("Authorization");
  const [headerValue, setHeaderValue] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [oauthPending, setOauthPending] = useState<string | null>(null);

  async function refresh() {
    const [nextServers, nextBots] = await Promise.all([rpc.mcp.servers.list(), rpc.bots.list()]);
    setServers(nextServers);
    setBots(nextBots.filter((bot) => !bot.archivedAt));
  }

  useEffect(() => { void refresh().catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load MCP servers")); }, []);

  function toggleBot(id: string) {
    setSelectedBotIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function addServer() {
    setError(null);
    if (!name.trim()) { setError("Add a server name."); return; }
    if (transport !== "stdio" && !endpoint.trim()) { setError("Add an HTTPS server URL."); return; }
    if (transport === "stdio" && !command.trim()) { setError("Add a stdio command."); return; }
    setSaving(true);
    try {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || `mcp-${Date.now()}`;
      const headers = headerValue.trim() ? { [headerName.trim() || "Authorization"]: headerValue.trim() } : {};
      const created = transport === "stdio"
        ? await rpc.mcp.servers.create({ slug, name: name.trim(), transport, command: command.trim(), args: args.split(/\s+/).filter(Boolean), env: {}, secret: secret || undefined, enabled: true })
        : await rpc.mcp.servers.create({ slug, name: name.trim(), transport, endpoint: endpoint.trim(), headers, secret: secret || undefined, enabled: true });
      await Promise.all(selectedBotIds.map((botId) => rpc.mcp.assignments.replace({ botId, assignments: [{ serverId: created.id, allowAllTools: true, allowedTools: [] }] })));
      setServers((current) => [...current, created]);
      setName(""); setEndpoint(""); setSecret(""); setHeaderValue(""); setCommand(""); setArgs(""); setSelectedBotIds([]);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not add MCP server"); }
    finally { setSaving(false); }
  }

  async function connectOAuth(server: McpServer) {
    setError(null);
    setOauthPending(server.id);
    try {
      const started = await rpc.mcp.oauth.begin({ serverId: server.id, redirectUri: `${window.location.origin}/mcp/oauth/callback` });
      window.location.assign(started.authorizationUrl);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not start OAuth"); setOauthPending(null); }
  }

  async function disconnectOAuth(server: McpServer) {
    setError(null);
    try { setOauthPending(server.id); await rpc.mcp.oauth.disconnect({ serverId: server.id }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not disconnect OAuth"); }
    finally { setOauthPending(null); }
  }

  return <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-6">
    <section className="flex max-h-full w-[1080px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#2A2A31] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)]" aria-label="MCP servers">
      <header className="flex items-start justify-between border-b border-[#27272C] px-8 py-6">
        <div><h1 className="text-2xl font-medium text-[#F1F1F2]">MCP servers</h1><p className="mt-1 text-[13.5px] text-[#85858B]">Connect remote or local tool servers and choose which agents can use them.</p></div>
        <button type="button" aria-label="Close MCP servers" onClick={onClose} className="text-xl text-[#85858A]">✕</button>
      </header>
      <div className="rk-scroll grid min-h-0 grid-cols-1 gap-6 overflow-y-auto p-8 lg:grid-cols-[1fr_1.08fr]">
        <div className="rounded-2xl border border-[#292930] bg-[#101012] p-5">
          <h2 className="text-[15px] font-medium text-[#ECECEE]">Add a server</h2>
          <p className="mb-5 mt-1 text-xs text-[#77777F]">OAuth will be available for providers that support browser authorization. Static headers work today.</p>
          <label className="mb-1.5 block text-xs text-[#B9B9C0]" htmlFor="mcp-name">Server name</label>
          <input id="mcp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mobbin" className="mb-4 w-full rounded-xl border border-[#303038] bg-[#0B0B0D] px-3 py-2.5 text-sm text-white outline-none" />
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-[#303038] bg-[#0B0B0D] p-1">
            {([['streamable_http', 'HTTP'], ['sse', 'SSE'], ['stdio', 'STDIO']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setTransport(value)} className={`rounded-lg px-2 py-2 text-xs ${transport === value ? "bg-[#30356A] text-[#E2E4FF]" : "text-[#85858B]"}`}>{label}</button>)}
          </div>
          {transport === "stdio" ? <><label className="mb-1.5 block text-xs text-[#B9B9C0]" htmlFor="mcp-command">Command</label><input id="mcp-command" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="/opt/mcp-server" className="mb-4 w-full rounded-xl border border-[#303038] bg-[#0B0B0D] px-3 py-2.5 text-sm text-white outline-none" /><label className="mb-1.5 block text-xs text-[#B9B9C0]" htmlFor="mcp-args">Arguments</label><input id="mcp-args" value={args} onChange={(e) => setArgs(e.target.value)} placeholder="--stdio" className="mb-4 w-full rounded-xl border border-[#303038] bg-[#0B0B0D] px-3 py-2.5 text-sm text-white outline-none" /></> : <><label className="mb-1.5 block text-xs text-[#B9B9C0]" htmlFor="mcp-endpoint">Server URL</label><input id="mcp-endpoint" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://api.mobbin.com/mcp" className="mb-4 w-full rounded-xl border border-[#303038] bg-[#0B0B0D] px-3 py-2.5 text-sm text-white outline-none" /></>}
          <label className="mb-1.5 block text-xs text-[#B9B9C0]" htmlFor="mcp-secret">Access token (optional)</label><input id="mcp-secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Stored encrypted" className="mb-3 w-full rounded-xl border border-[#303038] bg-[#0B0B0D] px-3 py-2.5 text-sm text-white outline-none" />
          {transport !== "stdio" ? <div className="grid grid-cols-[.7fr_1fr] gap-2"><input aria-label="Header name" value={headerName} onChange={(e) => setHeaderName(e.target.value)} className="rounded-xl border border-[#303038] bg-[#0B0B0D] px-3 py-2.5 text-xs text-white outline-none" /><input aria-label="Header value" type="password" value={headerValue} onChange={(e) => setHeaderValue(e.target.value)} placeholder="Optional header value" className="rounded-xl border border-[#303038] bg-[#0B0B0D] px-3 py-2.5 text-xs text-white outline-none" /></div> : null}
          {error ? <p className="mt-4 text-xs text-[#F07178]">{error}</p> : null}
          <button type="button" disabled={saving} onClick={() => void addServer()} className="mt-5 w-full rounded-xl bg-[#7785FF] px-4 py-3 text-sm font-semibold text-[#090A12] disabled:opacity-50">{saving ? "Adding…" : "Add server"}</button>
        </div>
        <div className="space-y-5">
          <div><h2 className="text-[15px] font-medium text-[#ECECEE]">Agent access</h2><p className="mt-1 text-xs text-[#77777F]">Select agents before adding the server.</p><div className="mt-3 space-y-2">{bots.map((bot) => <label key={bot.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#292930] bg-[#101012] px-3 py-3"><input type="checkbox" checked={selectedBotIds.includes(bot.id)} onChange={() => toggleBot(bot.id)} className="accent-[#7785FF]" /><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#30356A] text-xs text-[#E2E4FF]">{bot.name.slice(0, 1).toUpperCase()}</span><span><span className="block text-sm text-[#E4E4E7]">{bot.name}</span><span className="block text-xs text-[#77777F]">{bot.title}</span></span></label>)}</div></div>
          <div><h2 className="text-[15px] font-medium text-[#ECECEE]">Configured servers</h2>{error ? <p className="mt-2 rounded-xl border border-[#6A2C37] bg-[#2A151A] p-3 text-xs text-[#F3A2AA]">{error}</p> : null}<div className="mt-3 space-y-2">{servers.length === 0 ? <p className="rounded-xl border border-dashed border-[#34343B] p-5 text-sm text-[#77777F]">No MCP servers yet.</p> : servers.map((server) => <div key={server.id} className="rounded-xl border border-[#292930] bg-[#101012] p-4"><div className="flex items-center justify-between"><span className="font-medium text-[#ECECEE]">{server.name}</span><span className="rounded-full bg-[#202536] px-2 py-1 text-[10px] uppercase text-[#AEB7FF]">{server.transport.replace("_", " ")}</span></div><p className="mt-1 text-xs text-[#77777F]">{server.endpoint ?? server.command ?? server.slug}</p><p className="mt-2 text-[11px] text-[#6E778A]">{server.hasSecret ? "Encrypted credential saved" : "No credential saved"}</p>{server.transport !== "stdio" ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={oauthPending === server.id} onClick={() => void connectOAuth(server)} className="rounded-lg bg-[#7785FF] px-3 py-2 text-xs font-semibold text-[#090A12] disabled:opacity-50">{oauthPending === server.id ? "Connecting…" : "Connect OAuth"}</button>{server.hasSecret ? <button type="button" disabled={oauthPending === server.id} onClick={() => void disconnectOAuth(server)} className="rounded-lg border border-[#34343B] px-3 py-2 text-xs text-[#B9B9C0]">Disconnect</button> : null}</div> : null}</div>)}</div></div>
        </div>
      </div>
    </section>
  </div>;
}
