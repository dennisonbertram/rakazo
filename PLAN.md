# SendBlue phone surface for Rakazo — bots with a shared phone number, channels from group chats

## Context

Rakazo bots currently live only inside the app (web/desktop/mobile). This feature gives them a
phone presence through SendBlue (an iMessage/SMS API vendor), creating a new product surface:
people talk to their agent by text, and group chats become multi-agent "channels."

The original idea was one SendBlue number per bot. Research killed that shape: SendBlue's API
cannot put two account-owned numbers into one iMessage group (`modify-group` rejects
company-owned lines), AI Agent plan lines ($100/mo each) cannot create groups at all, and
webhooks are account-wide. The product owner then set the final architecture, which fits the
vendor constraints exactly:

**One SendBlue line for the whole deployment. Identity is the sender's phone number.**

## Product decisions (settled with the owner)

1. **The Rakazo line**: the deployment owns one SendBlue number. Env-configured, optional
   vendor per AGENTS.md — feature is structurally absent without credentials.
2. **Identity = personal phone number.** First 1:1 text from an unknown number auto-creates a
   user + workspace + one bot ("their agent"). The bot's first reply doubles as onboarding.
   Every phone identity gets exactly one bot. (Linking a phone identity to an existing app
   account is a follow-up slice; the data model must allow attachment.)
3. **DM**: texting the line 1:1 = talking to your own bot. No approval needed.
4. **Channel** = a normal iMessage group chat that a human added the Rakazo line to. On
   discovery, Rakazo maps `participants[]` → users/bots, DMs each mapped owner for approval
   ("Reply YES to join"), and posts one intro message to the group if some participants are
   unlinked. Only approved owners' bots participate. All bot posts go out through the one line
   with attribution prefixes ("Alice's agent: …"). Bots in a channel also talk to each other
   internally — the iMessage group is the human-facing window; agent-to-agent traffic never
   transits SendBlue.
5. **Bot-to-bot 1:1 DMs** (in scope for v1): mutual owner approval creates a standing
   connection between two users' agents; messages ride the existing internal bot-message
   machinery across workspaces, never iMessage.
6. **Owner text commands**: parsed only in the owner's verified 1:1 conversation; minimal set
   (YES/NO channel approval). Everything else is a normal message to the bot.
7. **Strangers**: one onboarding reply in 1:1 (the auto-created bot's first reply); one intro
   post in groups with unlinked participants. Never message an unlinked number again unless
   spoken to.
8. **Privacy hardening**: channel-participating bots get a strong system-prompt block — never
   share the owner's personal information, memory contents, or 1:1 conversation contents in a
   group.
9. **Approval management UI** (web): link status, channels (approve/leave), agent connections.

## Vendor facts that constrain the design (verified from docs.sendblue.com, 2026-08-28)

- Auth: `sb-api-key-id` + `sb-api-secret-key` headers; base `https://api.sendblue.com`.
- Send 1:1: `POST /api/send-message`; groups: `POST /api/send-group-message` with `group_id`
  (responding to an existing group works on the AI Agent plan; creating groups does not).
  `GET /api/v2/groups/{id}` lists participants. Max 25 participants. Groups API is beta.
- Inbound `receive` webhook: `from_number`, `sendblue_number`, `group_id` ("" = 1:1),
  `participants[]`, `content`, `media_url` (CDN link expires after 30 days), `message_handle`.
  Account-wide endpoint. Verification = static `sb-signing-secret` header (no HMAC) —
  constant-time compare on our side. Retries 3× on 5xx, 45s timeout.
- Our own outbound does NOT come back as `receive` webhooks → internal fan-out to peer bots
  is required and loop control stays fully in-process.
- Limits (AI Agent plan): 1,000 new inbound contacts/day/line; replies unlimited inside a
  contact's 24h window; 200 follow-ups/day/line outside it; hard cap 150 consecutive outbound
  messages without a reply. Number stickiness per contact. Flat $100/mo/line.
- Known ceiling accepted for v1: one line = one account-wide rate budget.

## Implementation plan

Design was produced by a planning pass over the real code and I re-verified the three
load-bearing claims directly (model-key fallback, user bootstrap, job-handler hook point).

### 1. Data model (`packages/db/prisma/schema.prisma` + hand-written SQL migrations)

- **`phone_identities`**: `phoneE164 @unique`, `userId`, `workspaceId`, `botId @unique`
  (one bot per phone identity), `verifiedAt`, `lastInboundAt`, `outboundSinceInbound Int`
  (guard for SendBlue's 150-consecutive-outbound cap). `userId` is a plain column so a phone
  identity can later attach to an existing app account without schema change.
- **`phone_channels`**: `providerGroupId @unique` (SendBlue `group_id`), `name`,
  `introPostedAt`. Deliberately **no** `workspaceId` — a channel spans workspaces; Thread /
  Message / Event are all workspace-scoped (`scoped()`, `packages/db/src/scope.ts:30-41`), so
  channel messages are delivered into each member bot's own Thread instead of one shared one.
- **`phone_channel_members`**: `channelId`, `phoneE164`, `identityId?` (null = unlinked
  participant), `status: invited|approved|declined|left`, `@@unique([channelId, phoneE164])`.
- **`phone_outbound`** (uniform outbox): `idempotencyKey @unique`,
  `kind: dm|group|invite|intro`, `toNumber?`, `providerGroupId?`, `body`,
  `status: pending|sent|failed`, `providerHandle?`, `sourceMessageId?`.
  `ExternalEffect` was evaluated and rejected: it requires a `runId`, and invite/intro sends
  have no run.
- **`agent_connections`** (slice 6): `requesterBotId`, `targetBotId`,
  `status: pending|approved|declined|revoked`, `@@unique([requesterBotId, targetBotId])`.
- Inbound idempotency: no new table — `Message @@unique([threadId, clientNonce])`
  (schema:378) with nonce `phone:{message_handle}`.
- **Auto-provisioning**: extract the body of the Better Auth `user.create.after` hook
  (`packages/auth/src/index.ts:110-164` — org, member, deployment-owner claim,
  MemoryDocument, NotificationPreference) into `packages/db/src/bootstrap-user.ts`
  `bootstrapUserWorkspace(...)`; the hook calls it (behavior-preserving refactor). New
  `packages/db/src/phone.ts` `provisionPhoneIdentity`: `prisma.user.create` (synthetic
  `phone-…@phone.invalid` email, no Account row — cannot log in, by design for now) →
  `bootstrapUserWorkspace` → `createBot` (`packages/db/src/repos.ts:206-300`, reused; makes
  Bot + Thread + Computer) → `phone_identities` row.

### 2. Contracts (`packages/contracts`)

- Add `"phone"` to the Run trigger enum (`domain.ts:551-560`) **and** to
  `SendUserMessageInput.trigger` (`packages/db/src/events.ts:123`) — both places required.
- New MessageBlock kind `phone_channel_message` `{channelId, fromNumber, fromLabel, text,
  hop?}` in `contracts/src/events.ts`.
- New rpc group `phone`: `status`, `channels.list/respond/leave`,
  `connections.list/respond/revoke`, implemented in `apps/api/src/router.ts` under the
  existing `authed` guard.

### 3. Adapter (provider-neutral, per AGENTS.md)

- `MessagingProvider` interface in `packages/adapter-kit/src/interfaces.ts`: `describe()`,
  `sendDirect`, `sendGroup`, `getGroup`. Webhook parsing/verification are exported pure
  functions on the vendor module, not interface methods (HTTP shape, not transport).
- `packages/adapters/src/sendblue.ts`: raw `fetch` (repo convention; skip the auto-generated
  npm SDK), constructor `(config, deps?: {fetch?})` like `PipedreamConnector`. Endpoints:
  `POST /api/send-message`, `POST /api/send-group-message` (existing `group_id` only — never
  creates groups), `GET /api/v2/groups/{id}`. `isSendBlueEnabled(cfg)`: all four env values
  present and not under VITEST. `parseSendBlueInbound(payload)` normalizes
  receive/outbound-status events.
- `packages/adapters/src/sendblue-emulator.ts`: hostname-dispatching fetch that records
  sends, throws on unexpected URLs, builds signed inbound requests (pattern:
  `third-party-connector-emulator.ts:13-31`).
- Wiring in both composition roots (`apps/api/src/app.ts` ~:190 with a `messaging` test
  override; `apps/worker/src/index.ts`), env fields in `apps/api/src/env.ts`, `/health` gets
  `phone: Boolean(messaging)`. `.env.example` block (all blank by default):
  `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET`, `SENDBLUE_SIGNING_SECRET`,
  `SENDBLUE_PHONE_NUMBER`.
- **Enablement additionally requires the deployment model key** (verified:
  `resolveModelKey` → `deploymentKeyFor` → env `PI_DEFAULT_PROVIDER` +
  `OPENROUTER_API_KEY`/`ANTHROPIC_API_KEY`, `packages/adapters/src/deployment-model.ts:7-26`;
  phone-created users have no per-user model credential, so without the env key their runs
  cannot execute).

### 4. Inbound pipeline

- New route `POST /api/v1/phone/webhook` (`apps/api/src/phone-webhook.ts`), mounted only when
  enabled. Hardening copied from `apps/api/src/webhook.ts`: 64KB streaming body cap (export
  its local `readBoundedBody`), uniform 401, constant-time compare of the `sb-signing-secret`
  header via a new exported `timingSafeStringEqual` in `packages/core/src/secrets-guard.ts`
  (`hasValidBearerToken` is not directly reusable — it demands a `Bearer ` prefix).
- Routing in `apps/api/src/phone-inbound.ts`:
  - **1:1**: unknown sender → `provisionPhoneIdentity`; the inbound text becomes the first
    user message, so the bot's first reply is the onboarding. Known sender → minimal owner
    command parse (`packages/core/src/phone-commands.ts`: YES/NO for the most recent pending
    invite or connection, LEAVE) → otherwise `events.sendUserMessage` into **the bot's
    existing Thread** (`trigger: "phone"`, nonce `phone:{handle}`) → `run.continue`. App
    chat and iMessage are literally one conversation. Reset `outboundSinceInbound`.
  - **Group**: upsert channel + members from the webhook's `participants[]`; new linked
    members get status `invited`, an invite DM, and an in-thread note; if unlinked
    participants exist and no intro was posted, enqueue ONE group intro. Deliver the message
    to each **approved** member bot as a `phone_channel_message` block in its own Thread +
    Task + Run `trigger:"phone"` (per-bot fan-out mirroring `thread-target.ts:507-560`).
    Extend the executor's silent-finish allowance (currently `run.trigger === "bot_message"`,
    executor.ts:2371/2647) to phone-channel runs so bots may decline to post.
  - **Bot-to-bot in channels**: our own outbound produces no `receive` webhook, so a bot's
    group post is fanned out internally to peer approved bots as context blocks (no run);
    an @-mention of a peer agent wakes it with a run carrying the existing hop limit
    (`nextBotMessageHop` / `botMessageHopExhausted`, `packages/adapters/src/bot-messages.ts:53-62`).

### 5. Outbound pipeline

- **Automatic mirror, not a send tool** (guaranteed delivery; no prompt compliance needed).
  New background job `phone.deliver {runId}` (registry `packages/adapter-kit/src/background-jobs.ts`,
  handler in `packages/adapters/src/background-job-handlers.ts` — the `run.continue` handler
  at :31-33 is a thin wrapper; after `continueRun`, enqueue `phone.deliver` when phone deps
  exist).
- Handler `packages/adapters/src/phone-delivery.ts`: for each text-bearing bot message of the
  run not yet in `phone_outbound` (`msg:{messageId}`): DM runs → `sendDirect`; channel runs →
  `sendGroup` with attribution prefix `{ownerFirstName}'s agent: `, then internal peer
  fan-out. Also drains pending invite/intro rows. Records handles; `outbound` status
  webhooks update rows by handle.
- Caps guard: skip DM sends at `outboundSinceInbound >= 140` (margin under SendBlue's hard
  150); increment on send, reset on inbound. No 24h-window accounting in v1.

### 6. Prompts

- Optional `phone` dep on the executor (`loadPhoneContext(botId)`); absent = zero queries.
  Content from pure functions in `packages/core/src/phone-prompts.ts`, injected into the
  instruction stack (executor.ts:2326-2352, `groupContext` precedent):
  - DM surface note: owner reaches you via iMessage; same conversation; keep replies concise.
  - **Channel privacy block**: never reveal the owner's personal information, memory,
    scratchpad, or 1:1 contents in a group; posts are publicly attributed; reply only when
    adding value, otherwise finish silently.

### 7. Web UI (progressive disclosure)

- `apps/web/src/pages/PhoneSettingsOverlay.tsx`, lazy-loaded from `Shell.tsx` (same pattern
  as `AccountSettingsOverlay`, Shell.tsx:169-183); entry visible only when `phone.status`
  reports enabled. Sections: link status, Channels (approve/decline/leave), Agent
  connections. Reuse ported beautiful-ui primitives (`BuiCard`, `BuiButton`).
- Desktop = hosts web UI, free. Mobile: skipped in v1 — explicit degrade reason: the same
  management exists via text commands (YES/NO/LEAVE).

### Slices (dependency-ordered, each independently mergeable, red/green TDD)

1. **Phone schema + provisioning core** — 4 tables, `bootstrap-user.ts` extraction +
   auth-hook refactor, `provisionPhoneIdentity`. Pure addition.
2. **Adapter + emulator + wiring** — interface, `sendblue.ts`, emulator, env, both roots,
   `/health`. Env-gated, unused yet.
3. **Inbound DM pipeline** — `"phone"` trigger (both enums), webhook route + 1:1 routing,
   provision-on-unknown, thread reuse, idempotency.
4. **Outbound mirror** — `phone.deliver` job + delivery handler, caps guard, status
   callbacks, end-to-end testkit journey. DM loop fully usable after this slice.
5. **Channels** — discovery, invites + intro, command parser, `phone_channel_message` block
   (+ web renderer case), per-bot fan-out, silent-finish extension, attributed posting,
   internal peer fan-out with hop limit, privacy prompt.
6. **Agent connections** — table, tools `connect_agent` / `respond_agent_connection` /
   `message_agent` (new `messageConnectedAgent` mirroring `messageBot` across workspaces,
   gated on an approved connection; `messageBot` untouched), connection YES/NO commands.
7. **Web UI + phone contracts** — rpc group, schemas, router handlers, overlay page.

Kill switch for every slice: unset any SendBlue env var → feature structurally absent.

### Testing (offline-only; `pin-test-env.ts` enforces it)

- `apps/api/src/phone-webhook.test.ts` — imitates `webhook.test.ts` fakes: uniform 401, 413
  over 64KB, replay idempotency, 1:1 vs group dispatch.
- `packages/core/src/phone-commands.test.ts`, `phone-prompts.test.ts` — pure unit suites.
- `packages/adapters/src/sendblue.test.ts` — `vi.stubGlobal("fetch")` request-shape tests
  (pattern: `supermemory-memory-provider.test.ts:25-42`).
- `packages/adapters/src/phone-delivery.test.ts` — mirror dedupe, caps guard, attribution,
  peer fan-out + hop exhaustion.
- `packages/db` provisioning test (DB-gated) — row completeness + hook refactor parity.
- `packages/testkit/src/phone.test.ts` — end-to-end journeys with `createApp({...,
  messaging: new SendBlueEmulator()})` + ScriptedAgentRuntime: unknown number → provisioned
  → run → outbound DM recorded; group → invites + intro + YES → fan-out → attributed post.
- Cross-provider conformance loop deliberately skipped — one provider; add when a second
  messaging vendor appears.

### Verification (end-to-end)

1. Per slice: `pnpm test`, `pnpm typecheck`, `pnpm lint`; DB-gated suites with
   `VERIFY_DATABASE=1` where touched.
2. After slice 4: run the testkit DM journey and read the emulator's recorded outbound to
   confirm the loop (inbound webhook → provision → run → reply sent).
3. After slice 7: start the web app, open the phone settings overlay with the feature
   enabled/disabled, and exercise approve/leave against seeded data (agent-browser smoke per
   working rules).
4. Live proof (manual, outside CI): a real SendBlue sandbox cannot exercise this (free tier
   has no webhooks/outbound) — a paid line + a tunnel is required; document the manual
   checklist in the PR rather than claiming live verification.

### Risks and accepted ceilings

- Phone-created users cannot log in until account-linking (declared later slice) lands; text
  commands are their whole management surface. Slice-7 UI serves linked users.
- Default decision (flagged, reversible): enabling SendBlue implies consenting to
  phone-driven auto-signup; the Better Auth signup policy/allowlist is not consulted for
  phone provisioning in v1.
- Channel discovery is one message late (SendBlue webhooks fire on first group *message*,
  not on add); that first message is not delivered to any bot.
- SendBlue groups API is beta: no leave API (LEAVE = stop participating, disclosed in the
  confirmation), 25-participant cap, no group typing indicators.
- Webhook auth is a static shared secret (vendor limitation, no HMAC): mitigated by
  constant-time compare + handle idempotency; note it in security docs.
- Rate ceilings not enforced in v1 beyond the 150-consecutive guard (1,000 new
  contacts/day and 200 follow-ups/day are unenforced).
- Every group message wakes all approved bots (N runs per text); silent-finish + privacy
  prompt control noise, not compute. Upgrade path: mention-only waking.
- Inbound media lands as a CDN URL in text (link expires after 30 days); no artifact
  ingestion in v1.
- Vestigial column found during research: `DeploymentSettings.deploymentModelCredentialCipher`
  is never written and never read by the executor — worth a separate cleanup issue, not part
  of this feature.

## Follow-up slices (post-v1, noted 2026-08-29)

- **Hosted-browser `browser_task` tool.** Live testing showed the vision-desktop browsing
  path (E2B computer + `computer_observe`/`computer_act`) works but is heavy: desktop boot
  dominates cold runs and it needs a vision-capable model. A provider-neutral
  `BrowserProvider` contract in adapter-kit with a `browser_task` built-in tool would let
  "go look at this site" tasks run DOM-driven without a desktop. Candidate backends:
  Browser Use Cloud (simple REST: task in, result out; BYOK), with TS-native self-host
  options (Stagehand/Browserbase, Steel) preferred over the Python browser-use library,
  which would mean a sidecar runtime. Does NOT replace the computer — runs still need a
  workspace; this only covers web navigation.
- **Image generation + iMessage media.** `gpt-image-2` behind an `ImageProvider` contract
  as a built-in tool (sibling of `render_plot`), plus outbound media: extend
  `MessagingDirectRequest` with optional `mediaUrl`, pass to SendBlue `send-message`, and
  let the phone mirror attach generated images. Inbound media ingestion (photo → real
  artifact instead of expiring CDN-URL text) pairs with it.
- Mention-only channel waking and phone-account linking were already flagged above and
  remain open.
