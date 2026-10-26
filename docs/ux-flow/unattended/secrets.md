# UX flow critique: Secrets the bot uses without seeing them

Inputs: `docs/ux-paths/unattended/secrets.md`, `docs/ux-walker/unattended/secrets.md`, and the original PRD section 5. Evidence is the walker report and its screenshots; C3, C4 and C5 were never seen in a browser, so judgments on them come from code and e2e specs.

The core of this area already exists and works: the protected card, backend-injected requests, origin pinning and the Credentials list. Most of the value left is small copy and placement fixes plus one rule for unattended runs. Almost none of the PRD's "Must" list needs new screens.

## 1. Friction scorecard (current stories)

| Story | Actual | Ideal | Verdict |
|---|---|---|---|
| C1 Open saved credentials | 4 actions plus long scroll (thread, bot name, Advanced, scroll) | 2 | Worst. Credentials is the last item in collapsed Advanced; the Advanced row is not exposed as a button (keyboard/screen reader risk). |
| C2 Add a bearer token | 6 (matches ideal) | 6 | Fine. Disabled Save gives no reason; Site has no HTTPS hint. |
| C3 Answer a protected card | not walked | 2 (Provide secret, Submit) | Code shows 2 steps. Unverified in browser. |
| C4 Save a login, bot signs in | not walked | 3 | Reuses C3 card. Unverified. |
| C5 Approve an authenticated request | not walked | 1 | Reuses the existing approval card. Unverified. |
| C6 Replace or remove | matches ideal | same | No confirmation after Replace; Remove copy omits routines. |
| C7 Command variable | matches ideal | same | Form does not say the bot can read the value (see F7). |

## 2. Future stories: simplest version

**F1 Scheduled bot calls an authenticated API.** Lives in the existing approval path (Activity approval card), not in routine setup. Rule: in any non-chat run, `secret_request` GET to the saved origin runs; other methods become a pending approval. The user sees nothing new until a write is attempted. Do NOT build a "which credentials may this routine use" picker in routine setup; the bot-level credential already is the grant. Do NOT add a new setting.

**F2 Last used / use count.** Lives in `BotCredentialsSection` (`apps/web/src/pages/shell/bot-credentials.tsx`). Replace the "Updated <date>" text with one muted line: "Used 2 days ago" (omit when never used). Do NOT show use count (cheap to store, no decision depends on it) and do NOT add a column or badge.

**F3 Usage list per secret.** Skip as a screen. Run events already record the tool call. If needed later, a row link "Recent uses" that filters Activity (existing list) by secret name. Do NOT build a new usage table view or `secret_usage_events` UI in v1. Storing the event is optional; the view is not.

**F4 Share a key across bots (space scope).** Highest-cost item. Simplest: no new feature in v1. `AgentSecret` is shell-only and has no UI, so extending it creates a second store with different security (visible to shell). Defer; if demanded, add one "Whole space" option in the existing Type/Name form of `BotCredentialsSection` for owners. Do NOT build per-bot grant toggles.

**F5 Phone management.** Reuse the mobile `SettingsGroup`/`SettingsRow` list in bot settings with swipe to remove and a native alert. Remove-only first (the leaked-key case); Add and Replace stay on web. Do NOT build a mobile add form.

**F6 Expired login tells me.** Reuse the existing "Needs attention" row state plus the bot's single message with a **Replace value** shortcut. No separate notification channel. Dedupe repeats. Do NOT include response bodies.

**F7 Shell-visible label.** One sentence in the existing command-variable helper text: "The bot can read this value." Replace the current "Available to this bot's shell commands as $NAME" rather than adding a line. Order Bearer token first (already the default). Do NOT add a banner or a warning dialog.

**F8 Teach a task needing a password.** Lives in the card from C3, shown by the Teaching feature. Do NOT build a second capture UI. Depends on the Teaching area; keep the card unchanged.

**F9 Where secrets are stored.** Cut. A deployment-level fact that almost nobody changes; put it in docs/settings for the self-host operator, not in every bot's Credentials section.

## PRD items that add needless UI

- "Secrets screen per bot **and space**": one screen is enough. The space screen only exists to serve F4, which is deferred.
- "Should: surface Infisical": cut (F9).
- "created, last used, use count" columns: show last used only.
- "Usage audit events" as a user-facing feature: store if cheap, no screen in v1.
- "Per-bot grants": cut with F4.
- "Unattended `secret_request` GET only": keep, but implement it as the approvals rule, not a secrets-specific setting.

## 3. Redundancy

- **Two stores, one concept.** `BotSecret` (card, hidden) and `AgentSecret` (space shell variables, no UI) both look to a user like "a secret". Do not add a UI for `AgentSecret`. Long term, make command variables the only shell path and migrate `AgentSecret` into them, so users see one list.
- **Unattended rule belongs to Approvals (area 6).** F1 should not define its own "read-only unattended" logic. One rule in the approvals table: unattended + non-GET + secret = ask. Secrets then need no approval UI of their own.
- **F3 vs Activity.** Usage history duplicates run events; link to them.
- **Credentials vs Integrations.** Connected apps (OAuth) and Credentials (tokens) both answer "what can this bot access". Keep separate for now, but the C1 fix should consider surfacing a one-line count in the bot settings summary (see recommendation 1).
- **Card Provide/Submit.** `AskCard` + `SecretRequestDialog` is two steps for one value. Acceptable: the dialog keeps masked entry out of the thread. No change.

## 4. Top 5 recommendations (value / effort)

1. **Make Credentials findable (C1).** Move the Credentials section out of Advanced, or show a "Credentials (2)" row at the top level of bot settings. Fix the Advanced row so it is a real button with `aria-expanded`. Highest value, small effort.
2. **Add the unattended rule (F1) through the approvals table.** In non-chat runs, secret GET at the saved origin runs; any write asks. Required for the PRD's safety goal; no new UI.
3. **Say what the bot can read (F7/C7).** Replace the one helper line for command variables. One sentence, no new element.
4. **Explain the disabled Save (C2).** Inline error under Name/Site ("Use https://" / "Lowercase letters, numbers, hyphens"), and focus the first field when the form opens. Small effort.
5. **Show "Used 2 days ago" on each row (F2)** and the Remove copy "Routines using it will stop working." Cheap, directly answers "is this still used?".

Defer F4, F9 and F3's screen. F5 and F6 are worthwhile after the above.

## Unverified

C3, C4 and C5 were not observed in a browser. Recommendations touching the protected card are based on code and e2e specs only.
