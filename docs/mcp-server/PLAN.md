# Praci as an MCP server

## Summary

Outside AI clients (claude.ai connectors, Claude Code and Desktop, ChatGPT, Grok, Meta Muse) can
connect to one Praci space, read its data, make changes that follow the space's approval rules,
and talk to its agents (bots). Today the repo only has MCP clients (`packages/adapters/src/mcp-*.ts`,
SDK `@modelcontextprotocol/sdk` 1.30.0); nothing serves MCP. This plan adds a server inside the
existing API process, protected by OAuth and by personal access tokens, with no new vendor.

Decisions fixed by the owner: OAuth plus personal access tokens, both revocable in Settings; one
space per connection, re-checked against membership on every call; reads free, writes through the
existing Allow / Ask / Block rules, and a per-connection read-only switch; public reach through
Tailscale Funnel on the owner's Mac (web :5273, API :3200).

## User stories

1. In claude.ai I add Praci as a connector, sign in, choose my "Northwind" space on the approval
   screen, and ask Claude to add a contact. The contact appears in Praci.
2. In Grok I ask "what is our cash runway?" and it calls the read tools and the Finance agent.
3. Meta Muse files a note. My rules say "Ask" for notes, so Praci shows a card; nothing is saved
   until I approve it.
4. In Claude Code I run `claude mcp add --transport http praci <url> --header "Authorization: Bearer <token>"`
   with a read-only token I made in Settings, and ask questions about my investors.
5. I leave the company space; the client's next call fails and the connection shows as ended.

## Findings (verified in this checkout unless marked)

- MCP SDK 1.30.0 is already a dependency (`packages/adapters/package.json`). Its server side includes
  `server/webStandardStreamableHttp.js` and `server/mcp.js` (checked in `node_modules`). The Better
  Auth MCP docs describe the newer v2 package `@modelcontextprotocol/server` (2.4.0 on npm); we do not
  need it (see Open questions).
- Better Auth is pinned at 1.7.7 (`packages/auth/package.json`). Its core has no `mcp` or OIDC-provider
  plugin. The current plugins are separate packages, `@better-auth/oauth-provider` and
  `@better-auth/mcp` (both 1.7.14 on npm, not installed here), and both require
  `better-auth ^1.7.14`. So slice 1 must bump every Better Auth package together to 1.7.14.
- Per the Better Auth docs (ctx7): `mcp()` builds on `oauthProvider()`, serves RFC 9728 protected
  resource metadata, binds tokens to a `resource` (audience), and `requireMcpAuth(auth, handler)`
  verifies the bearer JWT against the JWKS (signature, issuer, audience, expiry). Dynamic Client
  Registration (DCR) is off unless enabled; Client ID Metadata Documents (CIMD) is the newer way.
  `oauthProvider` has `consentPage`, `postLogin` (a page shown between login and consent),
  `consentReferenceId` and `customAccessTokenClaims`, which is how a chosen space is stored with the
  consent and copied into the token.
- MCP spec 2025-11-25 (ctx7): the server must publish protected resource metadata (a
  `WWW-Authenticate: Bearer resource_metadata=...` header on 401 and/or `/.well-known/oauth-protected-resource`),
  clients must use PKCE S256 and the `resource` parameter, servers must reject tokens not issued for them,
  and the authorization server must advertise `code_challenge_methods_supported`.
- Assumption (not verified): claude.ai and ChatGPT connectors still register through DCR, and some
  clients already use CIMD. Enable both, with DCR rate-limited.
- Tool definitions already exist once: `BUILTIN_TOOLS` in `packages/adapters/src/builtin-tools.ts`
  (`name`, `description`, `inputSchema`, `readOnly`), with handlers such as `contactToolFromTool(name,
  {prisma, scope}, args)` in `contact-tools.ts` and `finance-tools.ts`. MCP tools reuse these.
- Approval rules: `resolveActionApprovalDetail` in `packages/core/src/action-approval.ts` takes a tool
  name and the rules (`listApprovalRules`, `packages/db/src/approval-rules.ts`) and returns allow, ask or
  block. It is pure, so it works without a run. The card machinery in `executor.ts` and
  `run-pauses.ts` is tied to a paused run, so an external write cannot use it directly.
- Tenant scope: `requireMembership(prisma, userId, spaceId)` (`packages/db/src/scope.ts`) returns an
  `Actor` and throws if the user is not a member; `runAsTenant(actor, fn)` and `runAsSystem(reason, fn)`
  (`apps/api/src/route-scope.ts`) set the row-level security context. RPC does this per request in
  `apps/api/src/app.ts` using the `x-rakazo-space-id` header.
- Sending to a bot: `sendThreadMessage` in `apps/api/src/thread-target.ts` (used by `threads.send`),
  and `deps.events.follow(threadId, cursor)` streams events including `run.completed` and `run.failed`.
- There is no general audit log table; only per-thread events such as `approval.decided`.
- No public base URL setting exists. `BETTER_AUTH_URL` (`authUrl`) is the Better Auth base URL and
  defaults to `WEB_ORIGIN`; `API_URL` exists too (`apps/api/src/env.ts`).

## Tools in v1

Names match the bot tool names, so existing approval rules ("tool", "connector", "category") apply unchanged.

- Read: `contacts_list`, `finance_overview`, `finance_breakdown`, `finance_transactions`,
  `finance_recurring`, `cap_table_read`, `fundraising_read`, `meetings_list`, `search_data_room`
  (titles and snippets), `scratchpad_list`.
- Write: `contacts_add`, `contacts_save`, `scratchpad_add`, `scratchpad_update`, `scratchpad_complete`.
- Agents: `agents_list` (name, id, description), `agent_send` (bot, text, `wait_seconds` default 60,
  max 120; returns the reply, or `{status: "running", runId}` on timeout), `thread_read` (recent messages
  of a bot thread), `action_status` (state of an action waiting for approval).

Deferred: mail, calendar, Drive, iMessage, anything that moves money or sends to third parties,
`cap_table_update`, Data room writes, MCP resources and prompts, push streaming, a mobile screen
for connections. Mail bodies are left out on purpose: they are the main prompt-injection and
exfiltration source and the least needed first.

## Auth design

**Endpoints** (all on the API, mounted before the tenant scopes): `/mcp` (POST only; Streamable HTTP in
stateless mode, so there is no session store and several API processes work), `/.well-known/oauth-protected-resource`
(plus the path-suffixed alias), `/.well-known/oauth-authorization-server`, and Better Auth's `/api/auth/oauth2/*`
(authorize, token, register, jwks). Authorize needs the user's browser session, so the login and consent
screens are web pages on the web origin; the token, register and jwks endpoints are machine-to-machine.

**One principal for both credential types.** A new table `mcp_connections` is the source of truth:
`id, spaceId, userId, kind (oauth|pat), label, clientName, oauthClientId, tokenHash (pat only, sha256, unique),
tokenPrefix (for display), readOnly, createdAt, lastUsedAt, revokedAt`. Space data table, so it gets a row-level
security policy and an entry in `row-security.postgres.test.ts`. The token lookup runs under `runAsSystem("mcp
token lookup")`; everything after runs under `runAsTenant`.

- OAuth: the consent screen creates the connection row. The access token (short, 10 minutes) carries
  `connection_id` and `space_id` through `customAccessTokenClaims`, with `aud` set to the MCP resource URL.
  Refresh tokens last 30 days. Every call loads the connection by id and rejects when it is revoked, so
  revoking takes effect immediately and not at token expiry.
- PAT: created in Settings, shown once, stored hashed, format `praci_pat_<random>`. Same row, same checks.
- Per call: verify credential, load the connection (not revoked), `requireMembership(userId, spaceId)`
  (removed member means a clear "no access to this space" error), then `runAsTenant(actor)`. The space
  is never taken from request input or the token alone.
- Scopes: `mcp:read` and `mcp:write`. Read-only is the connection's `readOnly` flag, checked at call time
  and editable in Settings; write tools are hidden from `tools/list` and refused when it is on.

**Consent and space binding.** `postLogin` shows a space picker (the user's spaces, plus a read-only
checkbox), stored as the consent `referenceId`; the consent page names the client and the chosen space and
creates the connection. The consent POST is Better Auth's own, which requires the session cookie and the
signed authorize query, and our page is same-origin, so cross-site requests cannot approve (CSRF). Connect
twice to get two spaces.

**Revocation and visibility.** Settings gets a "Connections" section: list (label, client, space, last used,
read-only toggle, Revoke) and "Create token". Revoking an OAuth connection also deletes its refresh tokens.
A new connection triggers a notification so a surprise one is visible.

**Audit and limits.** New table `mcp_call_log (connectionId, spaceId, tool, outcome, durationMs, createdAt)`
without arguments or results, shown as "Recent activity" per connection. Rate limit per connection in Postgres
(fixed window, 120 calls per minute, 20 writes per minute) and per IP for `/oauth2/register`.

## How writes map onto approvals

For a write tool the server calls `resolveActionApprovalDetail({toolName, rules: listApprovalRules(...)})`
with the connection owner's space-wide rules (no bot id; bot overrides do not apply).

- allow: run the same handler the bots use, return the result.
- block: return `BLOCKED_ACTION_MESSAGE`; no change.
- ask: insert a row in a new table `external_actions (id, spaceId, userId, connectionId, tool, args,
  status pending|approved|denied|expired|done|failed, result, createdAt, decidedAt)` and return
  `{status: "pending_approval", actionId}` right away. The user gets a notification and an approval
  card (same look as the AskCard, new component with a story) in Connections and from the notification.
  Approve runs the handler once with an idempotency key `external:<id>`; Deny closes it. Pending rows
  expire after 24 hours. The client polls `action_status`. Tools that always need explicit approval
  (`toolRequiresExplicitApproval`) ask even under Allow, as for bots.

`agent_send` is not an approval itself; the run it starts is a normal bot run with its own cards.
It adds trigger `mcp` (new value in `RunTriggerSchema`, `packages/contracts/src/domain.ts`). In
`packages/core/src/run-mode.ts` it is unattended (already the fail-closed default for unknown triggers)
and externally tainted (add to `EXTERNAL_CONTENT_TRIGGERS`), because the text came from an outside model
that may have read hostile content. Effect: the bot's risky tool calls ask in Praci even if the owner's
rules would allow them for a live chat.

## Reachability with Tailscale Funnel

Funnel exposes one path prefix per mapping on the API port, for example:

    tailscale funnel --bg --set-path /mcp http://127.0.0.1:3200/mcp
    tailscale funnel --bg --set-path /.well-known http://127.0.0.1:3200/.well-known
    tailscale funnel --bg --set-path /api/auth/oauth2 http://127.0.0.1:3200/api/auth/oauth2

(Exact flag syntax and whether Funnel strips the prefix must be checked on the owner's Tailscale
version in slice 1; unverified.) Nothing else, including `/rpc` and the web app, is public.

Issuer and resource URLs must be the public ones: add one setting, `PUBLIC_MCP_URL` (for example
`https://mac.tailnet-name.ts.net`), read in `apps/api/src/env.ts`. It is a deployment URL, not a provider
setting, and no existing variable fits (`BETTER_AUTH_URL` is the browser-facing auth base and must stay
local for cookies). It sets the OAuth issuer, the MCP resource identifier (`<url>/mcp`), and the
metadata links. Unset means `/mcp` is served on localhost only, with PATs and loopback OAuth; local clients
keep using `http://127.0.0.1:3200/mcp`. The consent and login screens stay on the web origin, so the user
approves from a browser that can reach it (the Mac, or a device on the tailnet). Open risk: the authorize
step runs on the public host while the session cookie belongs to the web origin; slice 1 proves the redirect
and continuation work or changes where `authorize` is served.

## Security review

- Prompt injection into the outside model: tool results are structured data only (no mail bodies, no
  web pages). Free text fields (notes, contact names, data room snippets) are returned inside a field
  named `untrusted_text` and the server `instructions` say to treat it as data. Residual risk: stays.
- Injection into Praci through `agent_send`: handled by the tainted unattended run above.
- Exfiltration: scope is one space; read tools return only what the user can already see in the app;
  per-connection rate limit and call log; the read-only switch; no bulk export tool.
- Token theft: PATs hashed and shown once; OAuth access tokens short-lived and audience-bound, refresh
  tokens rotated; revocation checked per call; tokens never logged (extend log redaction); Funnel is
  TLS-only. A stolen token can still do whatever its connection allows until revoked.
- Cross-space leakage: space comes from the connection row, membership re-checked per call, all queries
  run under `runAsTenant`, plus a test that two connections never see each other's data.
- Confused deputy and token passthrough: the server only accepts tokens whose audience is its own
  resource URL and never forwards them; connector credentials (Gmail, Mercury) are not exposed.
- Consent CSRF and phishing: the space picker and consent come from a same-origin page after login;
  show the client name and redirect host; unauthenticated DCR is rate-limited and registered clients
  have no standing access until a user consents.
- Funnel exposure: only the three path prefixes; `/mcp` rejects GET (no SSE) and non-JSON bodies; body
  size limit via existing `mountApiRequestBodyLimits`.

## Phased build

Each slice is its own PR and can be tried with `DEMO_SLOT=<n> pnpm demo:up`.

1. **OAuth server plus empty MCP endpoint.** Bump Better Auth to 1.7.14, add `oauthProvider`, `mcp`,
   `mcp_connections`, the space picker and consent page, `/mcp` with `ping` and `tools/list` returning `agents_list`
   only, `PUBLIC_MCP_URL`. Test: auth unit tests plus a Postgres test for the new table and its row-level security;
   by hand with MCP Inspector (`npx @modelcontextprotocol/inspector`) doing the full OAuth flow, and
   `claude mcp add --transport http praci http://127.0.0.1:<api port>/mcp` then `/mcp` login. Funnel check on the
   owner's Mac with claude.ai happens here and is the gate for the rest.
2. **Tokens and Settings.** PAT create, list, revoke, read-only toggle; Connections section in Settings
   with stories; revoked and removed-member tests. Test: bearer calls with `curl`, then Claude Code with a token.
3. **Read tools.** Generate descriptors from `BUILTIN_TOOLS` through one allowlist file, dispatch to the
   existing handlers, call log, rate limit, `untrusted_text` wrapping. Test: contract test that every
   exposed tool exists in `BUILTIN_TOOLS` and read tools match `readOnly`; two-space isolation test; Inspector.
4. **Writes and approvals.** `external_actions`, rule resolution, approval card and notification,
   `action_status`. Test: unit test for allow/ask/block against the real resolver; Postgres test for
   approve-once and expiry; by hand set `contacts_add` to Ask, call it from Inspector, approve in the UI.
5. **Agents.** `agent_send` (new `mcp` trigger, wait with timeout), `thread_read`. Test: scripted agent
   runtime (offline, `AGENT_RUNTIME=scripted`) for reply and timeout; by hand ask a bot from Claude Code.
6. **Hardening.** Notification on new connection, per-IP register limit, docs page (self-host guide for Funnel),
   mobile list and revoke later. Test: rate-limit tests.

## Mobile and desktop

Electron hosts the web UI, so Settings works there. Mobile has nothing in v1; a list-and-revoke screen
can follow, since all state is server-side.

## Open questions

None blocking. Decisions assumed, change if you disagree: (1) stay on SDK 1.30.0 instead of moving to
`@modelcontextprotocol/server` v2, which would be a second MCP SDK in the repo; (2) approval cards live in
Connections and notifications, not in a bot thread; (3) `agent_send` runs count as unattended and tainted.

## Unverified assumptions

Better Auth 1.7.14 upgrade is compatible with the pinned auth code and the generated Prisma schema; the
`oauthProvider` consent and postLogin hooks accept our custom picker; the 2025-11-25 clients work with the
packages' MCP 2026-07-28 profile; claude.ai, ChatGPT, Grok and Muse registration methods (DCR vs CIMD);
Funnel path mapping syntax; the finance, fundraising, meetings and scratchpad handlers take only
`{prisma, scope}` like the contact handlers; `RunTriggerSchema` is the only place a new trigger must be declared.
