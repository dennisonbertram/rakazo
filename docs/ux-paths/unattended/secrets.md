# Secrets the bot uses without seeing them

Feature area 5 of the unattended-bots PRD. Everything under "Current state" was read in code on branch `feat/unattended-bots`. The Credentials section of bot settings was also opened in the demo stack. The protected card in a thread could not be triggered in the demo (the demo model does not emit `request_secret` on request), so the card is verified from code and from `apps/web/e2e/secret-card.spec.ts`, not by hand.

## Current state

### Two separate stores

| Store | Scope | Who can use it | Where it is managed |
|---|---|---|---|
| `BotSecret` (`packages/db/prisma/schema.prisma:1773`, table `bot_secrets`) | user + space + bot, unique on `(userId, spaceId, botId, name)` | that bot only | bot settings, **Advanced** > **Credentials** (web, Electron) |
| `AgentSecret` (`packages/db/prisma/schema.prisma:1852`, table `agent_secrets`) | space, unique on `(spaceId, name)`, name must match `^[A-Z_][A-Z0-9_]{0,63}$` (`packages/contracts/src/agent-secret-name.ts:3`) | every bot's shell in the space, as environment variables (`packages/adapters/src/agent-environment.ts`, loaded at `packages/adapters/src/executor.ts:1776`) | RPC `agentSecrets.list/put/remove` (`apps/api/src/routes/agent-secrets.ts`), space owner only (`apps/api/src/agent-secrets.ts`). No web, mobile or desktop screen uses it (grep of `apps/web`, `apps/mobile`, `apps/desktop` finds nothing). |

`docs/bot-secrets.md` describes only `BotSecret`. `AgentSecret` is the "space variable" that the doc mentions in passing under Command variables.

### Bot tools (all in `packages/adapters/src/executor.ts`)

- `request_secret` (`:6236`): opens a protected card. Destination is `{name, origin, auth}`; `auth.type` is `bearer`, `header`, `basic`, `login` or `command` (`packages/contracts/src/bot-secrets.ts:25-40`). A `connectionId` argument keeps an older one-use connector-code flow.
- `secret_request` (`:6220`): the backend decrypts and injects the value into an HTTPS call. Implementation `requestWithBotSecret` (`packages/adapters/src/bot-secrets.ts:489`): origin must equal the saved origin exactly, no redirects, 30 s deadline, 1 MB response, at most 20,000 characters returned, no response headers, echo redaction of the value and common encodings. Methods: GET, POST, PUT, PATCH, DELETE, HEAD (`packages/contracts/src/bot-secrets.ts` `SecretHttpRequest`). Login and command credentials are refused by this tool.
- `list_secrets` (`:6214`): names, origins and auth config only.
- `forget_secret` (`:6215`): deletes by name.
- `browser_act` step `fill_secret` (`packages/adapters/src/browser-tools.ts:14-19, 81-89, 122-129`): types a saved website login (`username` or `password` field) into a page, only if the page is still on the saved HTTPS origin. Resolution is `resolveLoginFill` (`packages/adapters/src/bot-secrets.ts:589`). It is wired in `executor.ts:5632`. This already exists; it is not new work.
- Shell: a `command` credential is exported to that bot's shell as `$UPPER_SNAKE_NAME`. This is explicitly not hidden from the bot (`docs/bot-secrets.md`, "The bot's shell reads this value").

### Where the user sees it

- **Protected card in the thread** (`apps/web/src/components/AskCard.tsx`): header "Credentials requested: <name>" with a key icon (`:194`), the destination line (`data-testid="secret-ask-destination"`; for a command variable "Command variable · $NAME"), button **Provide secret** (shows "Saving…" while submitting). The button opens `SecretRequestDialog` (`apps/web/src/components/SecretRequestDialog.tsx`): title "Provide secret", tabs "Single line" / "Multi line" (not for logins), a "Username" field for logins, a masked value field, button **Submit**. After saving the card reads "Saved". Failures show only "Could not submit this answer" so a secret is never echoed (`AskCard.tsx:171-178`).
- **Mobile** (`apps/mobile/app/thread.tsx:4151-4203`): same card with button **Save**; destination label from `apps/mobile/lib/secret-destination.ts`. No credentials list on mobile.
- **Bot settings, Credentials** (`apps/web/src/pages/shell/bot-credentials.tsx`, mounted at `apps/web/src/pages/shell/bot-panel.tsx:860` inside **Advanced**): opened in the demo. Heading "Credentials", line "Values are encrypted and never shown again.", empty state "No credentials saved for this bot.", button **Add credential**. The form has Name, Site, Type (Bearer token, Custom header, Basic auth, Website login, Command variable), Header name, Username, Value, **Save credential**, **Cancel**. Each saved row shows name, origin, type and "Updated <date>", with **Replace value** (then **Save new value**) and **Remove** (confirm "Remove <name>? This bot will no longer be able to use it."). Covered by `apps/web/e2e/bot-credentials.spec.ts` and `apps/web/e2e/command-credentials.spec.ts`. Route: the bot's thread, `/app/<botId>`; settings open from the bot name in the thread header.
- **No** space-level secrets screen, no per-secret usage data.

### Safety rules that exist today

- Approval: `secret_request` and `forget_secret` are in `APPROVAL_REQUIRED_BUILTIN_TOOLS` (`packages/core/src/action-approval.ts:29-48`), so each call asks unless a saved rule allows it. They are not in the explicit-approval set (`:50-56`), so "always allow" and Auto Review can apply to them. `request_secret` and `browser_act` (including `fill_secret`) are approval-exempt (`:3-27`). `list_secrets` is in `UNATTENDED_SAFE_BUILTIN_TOOLS` (`:59-85`).
- Unattended: `unattendedTriggerToolRequiresApproval` (`packages/core/src/action-approval.ts:140-150`) returns false for every trigger except `webhook`. Routine, skill, follow-up and the other triggers (`packages/contracts/src/runs.ts:4-19`) get only the default rule above. For a webhook run, `secret_request` is not in the safe list, so it always becomes an approval card.
- Encryption goes through the `SecretStore` (`prepareBotSecret`, `packages/adapters/src/bot-secrets.ts:369`). The default is local AES-256-GCM; `SECRET_STORE=infisical` moves values to Infisical (`docs/infisical-secrets.md`, `packages/adapters/src/infisical-secret-store.ts`). Infisical is selected by environment only and migrated with a CLI (`apps/api/src/cli/secrets-infisical.ts`); nothing in the UI shows it. `docs/bot-secrets.md` says Postgres `bot_secrets` with `ENCRYPTION_KEY`, which is true only for the default store.
- Limits: 100 credentials per bot, 16,384 characters per value. Reserved shell variable names are refused.

### Missing today

- `BotSecret` has no `lastUsedAt`, `useCount` or created-by fields beyond `createdAt`/`updatedAt` (`schema.prisma:1773-1792`); the Credentials list shows only "Updated <date>".
- No `secret_usage_events` table or audit view. Tool calls appear in run events, but the use of a secret is not queryable per secret.
- No space-wide secret with per-bot grants for `secret_request`. `AgentSecret` is shell-only and has no UI.
- No restriction that `secret_request` be read-only in unattended runs.
- No Credentials screen on mobile.
- No rotation reminder, expiry or "last verified" state.

## Current stories

All use the demo stack (web http://127.0.0.1:5377). Story C3 and C4 need a bot that asks for a credential; the demo model does not do this on request, so walk them in the web e2e spec or with a real model.

### SECRETS-C1: Open a bot's saved credentials
- Type: short. Topic: Credentials list. Persona: founder who wants to see what a bot holds.
- Goal: confirm what is stored, without seeing values.
- Preconditions: signed in; at least one bot (for example Chief).
- Ideal path: open the bot thread (`/app/<botId>`); click the bot name in the thread header; scroll to the footer row **Advanced**; expand it; read the **Credentials** section.
- Steps: 1. Click the bot name button. 2. Click **Advanced**. 3. See "Credentials", "Values are encrypted and never shown again." and either rows or "No credentials saved for this bot."
- Edge cases: load failure shows "Could not load credentials."; a row that cannot be decrypted shows "These saved settings can't be read. Remove it and add it again."
- Verified in demo: the empty state and **Add credential** button.

### SECRETS-C2: Add a bearer token yourself
- Type: short. Persona: founder with an API key for a internal tool.
- Goal: give a bot access to one API without pasting the key into chat.
- Steps: 1. In Credentials click **Add credential**. 2. Name: lowercase, for example `github`. 3. Site: `https://api.example.test`. 4. Type: **Bearer token**. 5. Value: paste the key. 6. Click **Save credential**.
- Result: row shows name, site, "Bearer token", "Updated <date>". The value field is cleared and never shown again.
- Edge cases: invalid name (hint "Lowercase letters, numbers, hyphens and underscores, starting with a letter."); non-HTTPS site refused; 101st credential refused ("Credential limit reached"); "Could not save the credential".

### SECRETS-C3: Answer a protected card in a thread
- Type: short. Persona: founder asked by a bot for an API key.
- Preconditions: the bot calls `request_secret` with `{name, origin, auth}`.
- Path: the card shows "Credentials requested: <name>" and the site; click **Provide secret**; type the value in the masked field; click **Submit**; the card turns to "Saved". The bot then calls `secret_request`; a second approval card may appear (see C5).
- Variations: **Multi line** tab for a PEM key; for a website login the dialog adds "Username"; for a command variable the destination reads "Command variable · $NAME".
- Edge cases: closing the dialog clears the typed value; a failure shows only "Could not submit this answer"; a stale card shows "No longer active".
- Covered by `apps/web/e2e/secret-card.spec.ts`. On mobile the same card has a **Save** button (`apps/mobile/app/thread.tsx`).

### SECRETS-C4: Save a website login and let the bot sign in
- Type: long. Persona: founder who wants the bot to use a vendor portal.
- Path: the bot calls `request_secret` with `auth: {type: "login"}` and the sign-in origin; user fills Username and Password on the card; the bot runs `browser_snapshot`, then `browser_act` with `fill_secret` on the username and password refs, then clicks Sign in. The page is checked to still be on the saved origin before each fill.
- Alternate: 2FA, CAPTCHA or passkey -> bot calls `request_takeover` and the user signs in on the shared screen.
- Edge cases: origin must be HTTPS (private HTTP override does not apply to logins); redirect to another site makes the fill fail; no approval card for the fill because `browser_act` is exempt.

### SECRETS-C5: Approve or allow an authenticated request
- Type: short. Persona: founder watching a bot call an API.
- Path: the bot calls `secret_request`; an approval card appears (default rule is ask); the user approves once or chooses the quiet "always" action to save a rule. The response comes back redacted, with no headers.
- Edge cases: URL on another origin returns "This credential cannot be sent to that destination."; redirect rejected; timeout at 30 s; response cut at 20,000 characters.

### SECRETS-C6: Replace or remove a credential
- Type: short. Persona: founder who rotated a key.
- Path: Credentials > row > **Replace value** > paste new value > **Save new value**. Or **Remove** > confirm "Remove <name>? This bot will no longer be able to use it." > **Remove**.
- Edge cases: changing the site or type requires removing first ("Remove the existing credential before changing its destination"); a request already in flight may finish.

### SECRETS-C7: Give a bot a command variable
- Type: short. Persona: founder whose bot runs a CLI that needs a token.
- Path: Add credential > Type **Command variable** > Name `netbird-setup-key` > Value > **Save credential**. The form shows "Available to this bot's shell commands as $NETBIRD_SETUP_KEY". The bot's next shell command sees it.
- Edge cases: reserved names (for example `PATH`, `LD_*`, `GIT_CONFIG_*`) refused with a reason; output redacted in plain, base64 and URL-encoded forms, but the bot's own code can still read it.
- Covered by `apps/web/e2e/command-credentials.spec.ts`.

## Future stories

Persona for all: a startup founder using Praci. Each reuses the Credentials section, the protected card or the approval card unless stated.

### SECRETS-F1: A scheduled bot calls an authenticated API while I sleep
- Goal: a routine checks a vendor API each morning using a saved bearer token.
- Why the user cares: the bot can do the job with the real key without me being there and without the key ever reaching the model.
- Ideal path: in a normal chat I save the token via the card (C3). When I create the routine, the setup shows which saved credentials the routine may use. At run time `secret_request` GET to the saved origin runs without a card. Any POST/PUT/PATCH/DELETE becomes a pending approval in Activity, not a silent write.
- What could go wrong: today only `webhook` runs are gated; a routine can call `secret_request` with any method once the default ask has been turned into "always allow". Noise: one card per run if no rule is saved. Safety: a write through a stolen-trigger path. Cost: none beyond the call.

### SECRETS-F2: Know when a secret was last used
- Goal: see "Last used 2 days ago, 14 uses" on each row.
- Why the user cares: I can tell which credentials are dead weight and which a bot is hammering, and remove the right one.
- Ideal path: Credentials rows add one muted line next to "Updated <date>": last used and use count. Counts come from `BotSecret.lastUsedAt`/`useCount` updated on each `secret_request`, `fill_secret` and shell export.
- What could go wrong: write on every call adds load (batch or throttle); counting shell exports is imprecise because the shell may not use the variable. Show "never used" plainly.

### SECRETS-F3: See what a bot did with a credential
- Goal: answer "which routine called my payment API last night?".
- Why the user cares: I can audit unattended activity without reading every run.
- Ideal path: a secret row opens a short usage list (time, run or routine, host, method, status code) with no URL query strings or bodies. Rows link to the run in Activity.
- What could go wrong: URLs can carry data, so store origin, path and method only; retention and export/deletion must cascade with the bot. Noise: collapse repeats by run.

### SECRETS-F4: Share one key across my bots
- Goal: save a Stripe read-only key once and let Finance helper and Chief use it.
- Why the user cares: I do not paste the same key into four bots, and rotating it is one action.
- Ideal path: the card or Credentials adds "Save for the whole space" and per-bot grants as toggles listed in the same section. Only the space owner can create it. `AgentSecret` is the existing space-level store but is shell-only and has no UI, so this needs a decision on whether to extend it or add scope to `BotSecret`.
- What could go wrong: widening access silently; each grant must be explicit and revocable. A bot that can use a key for HTTP can also be steered by prompt injection to call it, so grants should default to read methods only.

### SECRETS-F5: See and manage secrets on my phone
- Goal: remove a leaked key from the phone.
- Why the user cares: when a key is exposed I can cut off bots immediately, not when I am back at a desk.
- Ideal path: a mobile Credentials list (native list, swipe to remove, confirm alert) reached from the bot's settings, same data as web, no values.
- What could go wrong: mobile currently has no bot settings shell; this must follow the native-first rules and not copy the web form. Add and replace stay on the card in the thread.

### SECRETS-F6: A login that expires tells me
- Goal: when `fill_secret` fails because the password changed or 2FA appeared, I get one quiet notice, not a stream of failed runs.
- Why the user cares: unattended bots stop failing silently and I fix the one thing that broke.
- Ideal path: after a failed fill or a 401/403 from `secret_request`, the row shows "Needs attention" and the bot posts a single message with a **Replace value** shortcut. Repeat failures do not repeat the message.
- What could go wrong: false positives on transient 401s; notification noise; do not include the response body in the notice.

### SECRETS-F7: Know which values a shell command can read
- Goal: before I add a command variable, see plainly that the bot's shell can read it.
- Why the user cares: I do not store a high-value key where the bot's code can print it.
- Ideal path: the existing command-variable form line "Available to this bot's shell commands as $NAME" gains one clear label that this value is visible to the shell, and the type picker orders **Bearer token** and other backend-injected types first. Space variables (`AgentSecret`) that every bot's shell can read get the same label wherever they are shown.
- What could go wrong: extra copy is itself noise; keep it to one line on the form, not a persistent banner.

### SECRETS-F8: Teach a bot a task that needs a password
- Goal: while teaching a skill, the password I type is saved as a login, not recorded.
- Why the user cares: the taught skill can sign in later without my password living in the recording or the playbook.
- Ideal path: when teach mode sees a password field, it offers **Save as login** (opens the same card) and replaces the recorded text with a reference to the saved login name. The skill's run uses `fill_secret`.
- What could go wrong: recordings that already captured keystrokes; the origin must be HTTPS and match; taught skills run unattended so the saved login is usable without a person present. Depends on the Teaching feature area.

### SECRETS-F9: See where secrets are stored
- Goal: confirm whether my deployment stores credentials locally or in Infisical.
- Why the user cares: a self-hoster can check that the setting they chose is in effect without reading environment variables.
- Ideal path: one line in the Credentials section of an owner's view, "Stored in Infisical" or "Stored encrypted in this database", shown only when it is not the default.
- What could go wrong: exposing deployment details to non-owners; not worth a screen of its own.

## PRD corrections

The original draft is `/tmp` scratch; section 5 and current-state item 5 are the claims below.

1. "Unseen secrets - Exists strong ... adapters bot-secrets.ts, run-secret.ts, secrets.ts, core/secrets-guard.ts ... api routes/agent-secrets.ts". Two of these paths do not mean what the list implies.
   - `packages/core/src/secrets-guard.ts` only resolves deployment startup secrets (`BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, dev placeholders), `packages/core/src/secrets-guard.ts:1-60`. It has nothing to do with bot credentials.
   - `apps/api/src/routes/agent-secrets.ts:1-16` serves `AgentSecret` (space-wide shell environment variables), not `BotSecret`. The bot-credentials RPC is `botSecrets` (`packages/contracts/src/rpc.ts:1836-1843`), registered in `apps/api/src/router.ts`. The PRD does not mention that two stores exist.
   - `packages/adapters/src/run-secret.ts` handles secrets for approval/OTP runs (`run-secret:<runId>`), and it also calls `prepareBotSecret`; it is not the injection path. `requestWithBotSecret` and `resolveLoginFill` are in `bot-secrets.ts:489` and `:589`.
2. "secrets screen per bot and space (name, origin, auth type, created, last used, use count; replace, forget)". A per-bot screen already exists: **Advanced** > **Credentials** in bot settings (`apps/web/src/pages/shell/bot-credentials.tsx`, mounted at `bot-panel.tsx:860`) with name, origin, type, "Updated <date>", **Replace value** and **Remove**. The Must item is therefore only: add created/last used/use count, add a space level screen, add mobile. The metadata schema `BotSecretMetadata` has `createdAt` and `updatedAt` already (`packages/contracts/src/bot-secrets.ts:310-316`), so "created" needs no field. The label is "Remove", not "forget"; `forget_secret` is the bot tool.
3. "browser credential fill by backend, value never returned (page-browser-login-fill.test.ts exists, coverage unverified)". The feature exists and is shipped: step `fill_secret` in `packages/adapters/src/browser-tools.ts:14-19, 122-129`, resolver `resolveLoginFill` at `bot-secrets.ts:589`, executor wiring at `executor.ts:5632`, documented in `docs/bot-secrets.md` "Saved website logins". Nothing is to be built in `browser-tools.ts`. `page-browser-login-fill.test.ts` (in `packages/adapters/src/`) is a 2-test file for the page-browser script (`infra/sandboxes/computer/rakazo-page-browser`); the resolver is tested elsewhere (`packages/adapters/src/bot-secrets.test.ts`, `browser-tools.test.ts`).
4. "label command variables as visible to shell". Partly done: the form already says "Available to this bot's shell commands as $NAME" (`bot-credentials.tsx:425`), the card shows "Command variable · $NAME" (`AskCard.tsx:203-212`), and the docs state it (`docs/bot-secrets.md`). What is missing is an explicit "visible to the shell" label. The AGENTS.md copy rule applies: quote and justify any new words in the PR.
5. "Data: BotSecret lastUsedAt, useCount; secret_usage_events; extend contracts/bot-secrets.ts". Accurate that these are missing (`schema.prisma:1773-1792`). Missing from the PRD: the unique key `(userId, spaceId, botId, name)` means a per-user, per-bot row, so "space-level secrets with per-bot grants" cannot extend `BotSecret` without changing that key. `AgentSecret` (`schema.prisma:1852`) is the existing space-level table, with a different name rule (UPPER_SNAKE) and shell-only use.
6. "unattended secret_request GET only (assumption)". Not true today and not enforced anywhere. `unattendedTriggerToolRequiresApproval` returns false for every trigger but `webhook` (`packages/core/src/action-approval.ts:140-150`), and `secret_request` accepts GET, POST, PUT, PATCH, DELETE and HEAD (`packages/contracts/src/bot-secrets.ts`, `SecretHttpRequest`). The PRD also omits that `secret_request` and `forget_secret` already ask by default (`action-approval.ts:29-48`); an "always allow" rule makes them silent, and they are not in the explicit-approval set (`:50-56`). The approvals feature (area 6) and this one must agree on one rule: either `secret_request` non-GET is explicit-approval in every non-chat run, or it follows the generic unattended gate. Also, `request_secret` is approval-exempt (`:19`) and in an unattended run it pauses on a card nobody sees; the PRD does not say what should happen (hold, fail, or notify).
7. "keep origin match, no redirects, echo redaction, 30s/1MB". All true and in code (`bot-secrets.ts:489-580`); also true and missing from the PRD: 20,000 character return cap, no response headers, 100 credentials per bot, 16,384 character value limit, HTTPS-only for logins, reserved command variable names.
8. "surface Infisical". Infisical support exists as a deployment setting (`SECRET_STORE=infisical`, `docs/infisical-secrets.md`, `packages/adapters/src/secret-store-factory.ts`) and covers `BotSecret` values through `secretStore.put` (`bot-secrets.ts:369-410`). `docs/bot-secrets.md` still says values live in Postgres under `ENCRYPTION_KEY`; that sentence is true only for the default store. "Surface" is ambiguous: no UI exists, and a user-facing setting is a deployment decision, not a per-user one. See SECRETS-F9.
9. "Current state ... command variables (visible to shell)" and "AES-256-GCM BotSecret": correct, but "mobile" is absent. Mobile has the thread card only and no credentials list (`docs/bot-secrets.md`, "Managing saved credentials"). The PRD goal "same behavior on web, Electron and mobile" is not met for listing, replacing or removing; web/Electron share one UI.
10. Missing constraint: a credential is user-scoped (`userId` is in the unique key) and "Only the run's user can submit a reusable credential" (`docs/bot-secrets.md`). A routine owned by one user cannot use a secret saved by another space member. Any space-level design needs an owner rule.
11. Missing constraint: AGENTS.md requires multi-tenant, shared-store state. Usage counters must be written to Postgres, not memory, and be scoped by space and user on every query; export and deletion must cascade (`account-export` is named in the PRD cross-cutting section, but `BotSecret` is not exported on purpose; state that decision).

## Key files

- `docs/bot-secrets.md`, `docs/infisical-secrets.md`
- `packages/contracts/src/bot-secrets.ts`, `packages/contracts/src/agent-secret-name.ts`, `packages/contracts/src/rpc.ts`
- `packages/adapters/src/bot-secrets.ts`, `packages/adapters/src/run-secret.ts`, `packages/adapters/src/browser-tools.ts`, `packages/adapters/src/agent-environment.ts`, `packages/adapters/src/executor.ts`
- `packages/core/src/action-approval.ts`
- `apps/api/src/routes/agent-secrets.ts`, `apps/api/src/agent-secrets.ts`
- `apps/web/src/components/AskCard.tsx`, `apps/web/src/components/SecretRequestDialog.tsx`, `apps/web/src/pages/shell/bot-credentials.tsx`, `apps/web/src/pages/shell/bot-panel.tsx`
- `apps/mobile/app/thread.tsx`, `apps/mobile/lib/secret-destination.ts`
- `packages/db/prisma/schema.prisma`
