## Area: Approvals table and read-only unattended runs (APPROVALS-nnn)

Generated: 2026-10-25. Code read at `e32e12000` on branch `feat/unattended-bots`.
Persona for every story: Maya, a first-time founder at Northwind Robotics (mock demo data). She uses Praci bots, wants them to work while she is away, and does not want one to send, post or spend without her knowing.
What was walked: login, Settings, "Privacy and approvals" in the demo stack (web 127.0.0.1:5377). Everything about approval cards, webhook runs and Auto Review is read from code only; no run was triggered.

## Current state

### Where rules live
- One screen manages approval rules: user menu (the "MC Maya Chen (Mock)" button at the bottom of the sidebar) > "Settings" > "Privacy and approvals". There is no URL for it; the page stays at `/app/<botId>` while the Settings dialog is open. Code: `apps/web/src/pages/SettingsOverlay.tsx:169` (section label), `:346` (renders `PrivacySettingsPanels`), `apps/web/src/pages/AccountSettingsOverlay.tsx:360-367`.
- The panel is `ApprovalRulesSettings` (`apps/web/src/components/ApprovalRulesSettings.tsx`), heading "Action confirmations". It has exactly two switches, "Ask before sending external email" and "Ask before purchases" (both on by default in the demo), and below them a plain list of any other saved rules with a "Remove" button each. There is no table, no per-bot control, no Block option, no "Add rule" button.
- Wording in the list (`describeRule`, `ApprovalRulesSettings.tsx:9-26`): "Ask before <x>", "Ask before <x> connector", "Allow <x> without asking", "Allow <x> connector without asking", "Ask before <x> actions", "Allow <x> actions without asking".
- The only way to create a tool-level "Allow" rule is the "Always allow this tool" button on an approval card (see below). Nothing in Settings creates one.

### Data and resolution
- Table `action_approval_rules` (`packages/db/prisma/schema.prisma:184-198`): `spaceId`, `createdByUserId`, `effect`, `matchKind`, `matchValue`, `createdAt`; unique on (space, user, effect, kind, value). No `botId`.
- Contract `ActionApprovalRuleSchema` is in `packages/contracts/src/domain.ts:813-819`: `effect` is `always_allow | require_approval`; `matchKind` is `tool | connector | category`. RPC `approvalRules.list/set/remove` (`packages/contracts/src/rpc.ts:1242`, handlers `apps/api/src/router.ts:7221-7275`) and `autoReview.get/set` (`rpc.ts:1255`, `router.ts:7277`).
- `packages/core/src/action-approval.ts` has only a narrow `Pick` of that type (`:97-100`). Categories understood: `email` and `purchase` only (`categoryMatches`, `:156-175`).
- `resolveActionApprovalDetail` (`:213`) returns `ask` or `allow` with a source (`require_approval`, `always_allow`, `default`). Specificity is tool 3 > connector 2 > category 1; at equal specificity `require_approval` beats `always_allow`. There is no `block`.
- Rules are loaded per run for the run's owner and space (`packages/adapters/src/executor.ts:3145-3153`).

### What asks, and what never asks
- `toolRequiresApproval` (`action-approval.ts:116`): tools in `APPROVAL_EXEMPT_TOOLS` (`:3-25`) never ask. That set includes `write_file`, `shell`, `computer_act`, `browser_act`, `browser_navigate`, `open_path`, `launch_app`, `run_subagent`, `spawn_bot`, `schedule_cancel`. Built-ins that always ask are `APPROVAL_REQUIRED_BUILTIN_TOOLS` (`:27-47`: mail, calendar, Drive writes, `contacts_save`, `secret_request`, cloud agent tools, delete/archive bot). Connector tools ask unless the name looks read-only (`connectorToolRequiresApproval`, `:107`; a declared `readOnly === false` or any mutating or compound word forces a card).
- Explicit-only tools (`EXPLICIT_APPROVAL_BUILTIN_TOOLS`, `:52`: `create_space`, `imessage_send`, `company_fact_upsert`, `company_import_start`) cannot be auto-reviewed or permanently allowed.
- The executor adds more mandatory cases that ignore saved rules and Auto Review: meeting-tainted and external-tainted runs, Carta/investor/mail agent `mail_send`, integration-agent writes, owner-agent peer writes (`executor.ts:3987-4003`). So "explicit-approval tools can never be Allow" is already true for those.

### Unattended runs today
- `RUN_TRIGGERS` are in `packages/contracts/src/runs.ts:4-19`: user, routine, resume, follow_up, reaction, call_end, spawn, skill, bot_message, webhook, messaging, cloud_agent, created, tickets.
- `unattendedTriggerToolRequiresApproval` (`action-approval.ts:140-150`) returns false for every trigger except the string `"webhook"`. For `webhook` it asks for any built-in tool not in `UNATTENDED_SAFE_BUILTIN_TOOLS` (`:59-85`) and for any connector tool that `connectorToolRequiresApproval` flags. The executor calls it at `executor.ts:3921`; a true result is "mandatory", so saved rules and Auto Review are skipped and the call always shows a card (`:3987-4003`).
- Webhook triggers come from the inbound webhook (`apps/api/src/webhook-inbound.ts:309`) and from the GitHub event path (`apps/api/src/github-webhook.ts`, source `github` also becomes trigger `webhook`). Cron routines run with trigger `routine` (`executor.ts:1335`) and are NOT restricted. Ticket work (`tickets`, `packages/adapters/src/ticket-wake.ts:43`), `messaging`, `bot_message`, `reaction`, `created` are not restricted either.
- Because `write_file` and `shell` are not in the safe list, they already ask in a webhook run. The product decision "ask before write_file and shell in background runs" is already enforced for webhook runs only.
- The safe list includes `add_to_data_room`, `run_subagent` and `request_takeover` (`:59-85`). `add_to_data_room` writes. `run_subagent` is listed as safe, but whether the sub-run inherits the parent trigger was not traced.
- "Unattended" is defined in two places that disagree. `isConversationalRun` (`packages/core/src/run-state.ts:16,77`) treats `routine, webhook, created, tickets` as non-conversational. `unattendedTriggerToolRequiresApproval` treats only `webhook` as unattended. `isBackgroundRunTrigger` (`run-state.ts:23-29`) is only `tickets`.

### Approval cards
- Built by `buildApprovalAskBlock` (`packages/adapters/src/approval-ask.ts`). Buttons: "Allow once", "Always allow this tool", "Deny" (`:120-140`). A payment card uses "Send <amount>". `create_space` uses "Create space" and "Cancel". Rendered by `apps/web/src/components/AskCard.tsx` (`approvalActionLabel`, `:73-90`); answered states "Approved", "Always allowed", "Denied", "Expired", "Replaced by a newer request" (`:44-52`).
- "Always allow this tool" is hidden for tainted calls, company tools, full mail sends, integration writes and iMessage (`executor.ts:4351-4353`, `approval-ask.ts:131-137`). It is NOT hidden when the card is shown only because the run is a webhook run. Pressing it writes a space-wide `always_allow` tool rule (`packages/db/src/run-pauses.ts:570-586`). That rule does not lift the webhook restriction (mandatory ask wins), but it does silently loosen later live-chat runs for every bot in the space.
- Deny resolves the call with `DENIED_ACTION_MESSAGE` (`packages/adapters/src/approval-effect.ts:364`); the model is told not to retry.
- A paused run notifies "<bot> needs approval" (`executor.ts` `pauseForAsk`, around `:4275`). The Activity list labels the run "Needs approval" (`apps/web/src/pages/ActivityList.tsx:568-577`, `RunActivityRow.needsApproval` in `contracts/src/runs.ts`). Open it from the sidebar "Activity" button. There is no reminder and no expiry job for a held approval card in the code read (an `expired` answer state exists in `AskCard.tsx:46` and is not traced further).
- The card does not say which rule applied. `approvalResolved.matchingRules` is passed to the judge (`executor.ts:4054`), not to the card; only `reviewReason` reaches the card.

### Auto Review
- Server side: `ActionAutoReviewPreference` per space and user, `planActionGate` (`action-approval.ts:251-268`) lets the judge run only when the call is consequential, the preference is on, a checker is configured and no rule matched (source `default`). Judge result `pass` allows, `ask` asks, `error` asks for consequential tools (`applyJudgeDecision`, `:271`). The judge never denies. Implementation: `packages/adapters/src/auto-review.ts`.
- It runs in any non-mandatory case, which includes cron `routine` runs and every other non-webhook trigger. It is not limited to attended runs.
- There is NO toggle for it in the web app. `autoReview.get/set` exist in the API, but the only web references are Storybook mocks (`apps/web/src/pages/AccountSettingsOverlay.stories.tsx:26`, `SettingsOverlay.stories.tsx`). No mobile reference either. Settings today shows no "Auto Review" text.

### Not present today
Block effect, per-bot rules, an Action-type table, the 14 action types, a mapping table, unattended handling for `routine` and the other triggers, approval reminders/expiry, "which rule applied" on the card, an Auto Review switch.

## Current stories

### APPROVALS-C1: Find where approvals are managed
- Type: short. Topic: Settings. Persona: Maya.
- Goal: see what the bots will ask her about before sending mail or spending.
- Preconditions: signed in to the demo stack, any bot open.
- Ideal path: open the user menu, choose "Settings", choose "Privacy and approvals", read "Action confirmations".
- Alternate paths: "Close user settings" (X) at the top right; on a phone the section picker replaces the left nav.
- Steps:
  1. Click the "MC Maya Chen (Mock)" button at the bottom of the sidebar.
  2. Click the menu item "Settings".
  3. Click "Privacy and approvals" in the Settings nav.
  4. Read the heading "Action confirmations" and the two switches.
- Variations: "General" opens first; Maya may not realise approvals are under "Privacy".
- Edge cases: the rules fail to load, which shows "Could not load approval rules" in red; the switches show skeletons while loading.
- Walked: yes (steps 1-4 observed; both switches on).

### APPROVALS-C2: Turn off the purchase confirmation
- Type: short. Topic: Settings toggles. Persona: Maya.
- Goal: stop being asked about purchases from a trusted payments bot.
- Preconditions: C1 reached; "Ask before purchases" on.
- Ideal path: switch "Ask before purchases" off, close Settings.
- Steps:
  1. In "Action confirmations" click the switch "Ask before purchases".
  2. Watch it turn off (the rule is deleted via `approvalRules.remove`).
  3. Click it again to restore (`approvalRules.set`, effect `require_approval`, category `purchase`).
- Variations: same for "Ask before sending external email".
- Edge cases: while one save is running both switches are disabled; a failure shows "Could not save rule" or "Could not remove rule".
- Note: turning the switch off only removes the rule. Connector writes with a payments name still ask through the built-in classification, so the switch does not mean "never ask". This is not explained on screen.

### APPROVALS-C3: Approve a bot's action once
- Type: medium. Topic: approval card. Persona: Maya.
- Goal: let one email go out.
- Preconditions: a bot calls `mail_send` or a connector write in a live chat.
- Ideal path: read the card, press "Allow once", the run continues, the card shows "Approved".
- Steps:
  1. Open the bot's chat; the run is paused with a card and a notification "<bot> needs approval".
  2. Read the summary and the Details disclosure.
  3. Press "Allow once".
- Alternate paths: reach it from the sidebar "Activity" button, where the row says "Needs approval".
- Edge cases: another card replaces this one ("Replaced by a newer request"); the run expired ("Expired").
- Walked: no. The demo bots did not hold an approval card; the card and Activity label are read from code and stories.

### APPROVALS-C4: Deny an action
- Type: short. Topic: approval card. Persona: Maya.
- Goal: stop the bot from sending.
- Ideal path: press "Deny"; the card shows "Denied" in red; the bot tells Maya it was not submitted and does not retry in this run (`DENIED_ACTION_MESSAGE`).
- Edge cases: the bot rephrases and asks again; the repeat is refused automatically in the same run, but a new message starts a new run that can ask again.
- Walked: no (code).

### APPROVALS-C5: Always allow a tool, then undo it in Settings
- Type: medium. Topic: saved rule. Persona: Maya.
- Goal: stop approving the same harmless action.
- Ideal path: press "Always allow this tool" on a card, later find the rule in Settings and "Remove" it.
- Steps:
  1. On a card press "Always allow this tool"; the card shows "Always allowed".
  2. Open Settings > "Privacy and approvals".
  3. Find the row "Allow <tool> without asking" under the switches; press "Remove".
- Edge cases: the rule is per user and space, not per bot; it applies to every bot she owns. The row names the raw tool id (for example `mail_draft`), not a human label. Tools that are never allowed (explicit or tainted) do not offer this button.
- Walked: Settings half only if a rule exists; the demo had none, so the list was empty.

### APPROVALS-C6: A webhook-triggered routine cannot act without her
- Type: long. Topic: unattended webhook run. Persona: Maya.
- Goal: let a bot react to an outside event (a webhook or Git event) but not change anything unasked.
- Preconditions: a routine with "When a webhook fires" or "Git event" enabled (set in the routine editor, `apps/web/src/pages/RoutineEditor.tsx:145-146`).
- Ideal path: the event arrives; the bot reads (web search, files, memory, read-only connector tools); when it tries to send mail, write a file, run a command or call a write tool, the run pauses and Maya gets "<bot> needs approval".
- Steps:
  1. Event hits the routine's webhook URL; a run starts with trigger `webhook`.
  2. The bot reads freely.
  3. The first write or shell call pauses the run with an approval card.
  4. Maya presses "Allow once" or "Deny" from the notification or the Activity list.
- Edge cases: "Always allow this tool" still appears on this card and creates a space-wide rule (see Current state). A rule cannot make a webhook run act without asking. A cron routine does NOT behave this way (see future stories).
- Walked: no (code, and unit tests `packages/core/src/action-approval.test.ts:103-142`).

## Future stories

### APPROVALS-F1: See and edit every action type in one table
- Type: medium. Persona: Maya, a founder with three bots.
- Goal: see in one place what each kind of action does (Allow, Ask, Block) and change it.
- Why the user cares: she can see the whole safety setting at a glance instead of finding out when a bot sends something.
- Ideal path: Settings > "Privacy and approvals" shows a table, one row per action type (Edit files, Run commands, Read the web, Drive the browser, Connected apps (read), Connected apps (write), Send email, Calendar changes, Spend money, Post publicly, Delete data, Message other bots, Schedule routines, Use saved secrets), a segmented control per row (Allow, Ask, Block), defaults filled in. The two existing switches become the "Send email" and "Spend money" rows. The existing list of tool rules sits behind a "Advanced" disclosure.
- Reuse: `ApprovalRulesSettings`, `Switch`, `Label`, `Skeleton` from `@rakazo/ui-web`; a segmented control component must exist in Storybook before use.
- What could go wrong: noise (14 rows is a lot; show a short default list and reveal the rest); safety (a row set to Allow must not override tools that always need explicit approval; those rows show Ask, locked); cost (none).

### APPROVALS-F2: Block an action for one bot
- Type: medium. Persona: Maya.
- Goal: make a research bot unable to send email at all.
- Why the user cares: she can trust a bot with access to her mail without worrying it will send.
- Ideal path: open the bot's settings, open the same table with the bot's overrides, set "Send email" to Block. Space defaults show greyed behind overrides. Later the bot tries `mail_send`, the call is refused, the transcript shows a short "Blocked by your setting" line, and the bot is told it is not allowed.
- Reuse: the table from F1 filtered by bot; the denied path of `DENIED_ACTION_MESSAGE`.
- What could go wrong: safety (a Block must win over any Allow at equal specificity and over "Always allow this tool"); the bot may retry in new runs, so repeated blocks must not spam; a bot-level Allow must not exceed a space-level Block unless Maya chose it knowingly.

### APPROVALS-F3: Background runs of any kind are read-only
- Type: long. Persona: Maya, with a nightly "check the pipeline" routine.
- Goal: schedule routines that look and report without changing anything.
- Why the user cares: she can leave routines running overnight knowing nothing gets sent or changed without her.
- Ideal path: a cron routine, a ticket run, a message from another bot and a webhook all start unattended. Reads proceed. The first write pauses the run with a card, a push notification, and a line in the Activity list. Maya answers in the morning.
- Reuse: existing approval card, `pauseForAsk`, Activity "Needs approval".
- What could go wrong: noise (a routine that always sends a weekly email now stops every week; show a one-time migration list of affected routines and a per-routine opt-in); safety (the run must fail closed if the trigger is unknown; `run_subagent` must inherit the parent's mode); cost (a paused run holds no compute, but a lease is held until it expires).

### APPROVALS-F4: Hear about an approval that is waiting
- Type: medium. Persona: Maya, away from her desk.
- Goal: not lose an action that waits for her.
- Why the user cares: a missed approval silently stalls work, and an old one should not fire a day later.
- Ideal path: push notification "<bot> needs approval" at once; a reminder after 4 hours; after 24 hours the card shows "Expired" and the bot is told. Quiet hours hold reminders.
- Reuse: `notifyRun`, existing "Expired" answer state in `AskCard.tsx`, Activity list.
- What could go wrong: noise (reminders per card; cap one digest per bot); safety (an expired card must not run late when she presses Allow); cost (none).

### APPROVALS-F5: Know why a card appeared
- Type: short. Persona: Maya.
- Goal: understand why she is being asked.
- Why the user cares: she can tell a rule she set from a default or a background-run restriction and fix the cause instead of just clicking Allow.
- Ideal path: the card shows one short line, for example "Background run: writing needs your approval" or "Your rule: ask before Send email". A link opens the row in the table.
- Reuse: `buildApprovalAskBlock` detail area; `matchingRules` already computed in `executor.ts`.
- What could go wrong: noise (do not add a line to every card; show it only when a rule or background mode applied); safety (do not expose other users' rule text).

### APPROVALS-F6: Auto Review as an opt-in switch for attended work
- Type: medium. Persona: Maya, tired of approving routine connector writes.
- Goal: let a second check approve obviously safe actions while she is in the chat.
- Why the user cares: fewer cards in live chat without losing the card for anything unusual.
- Ideal path: one switch near the table, "Auto Review", off by default, only shown when a checker model is available (`checkerAvailable`). It only turns Ask into Allow for non-explicit tools in live chat. In background runs it is never used. The card for a tool it passed shows "Auto Review allowed this" with the reason.
- Reuse: `autoReview.get/set` RPC (exists, unused by the UI), `Switch`.
- What could go wrong: safety (judge errors must ask; explicit and tainted calls must skip it; background runs must skip it, which is not true today for cron routines); cost (a model call per consequential tool call, so show it only with a model configured).

### APPROVALS-F7: Allow an action for one routine only
- Type: medium. Persona: Maya, with one routine that posts a weekly update.
- Goal: let one routine post, keep everything else read-only.
- Why the user cares: she gets the useful automation without loosening every background run.
- Ideal path: in the routine editor she sees "Can act without asking" off by default with the list of tools that stopped it last time; she turns on one tool for that routine. A tool that needs explicit approval stays off and greyed.
- Reuse: `RoutineEditor`, `RoutineRunHistory` (can show "Paused: needs approval" on a run).
- What could go wrong: safety (a routine edit by another bot or injected content must not widen the allowance; the allowance should be set only by the owner); noise (one list, not one row per call).

### APPROVALS-F8: Review what a background run tried to do
- Type: short. Persona: Maya, the next morning.
- Goal: see what her overnight routines did and what was stopped.
- Why the user cares: she can trust the quiet by checking one list.
- Ideal path: Activity list shows runs that paused ("Needs approval") first; opening one shows the card and the read-only steps before it; Deny closes it with a clear line. The run's event log records every decision (allow, ask, block, and which rule).
- Reuse: `ActivityList`, `RoutineRunHistory`.
- What could go wrong: noise (do not list successful quiet runs); safety (log arguments with secrets redacted, as the card already does).

## PRD corrections

1. "Approvals — Partial ... auto-review.ts" (PRD line 21): `auto-review.ts` is in `packages/adapters/src/auto-review.ts`, not in core. The pure gate logic (`planActionGate`, `applyJudgeDecision`) is in `packages/core/src/action-approval.ts:251-285`.
2. "ActionApprovalRule (space+user; always_allow|require_approval; matchKind tool/connector/category) in core/action-approval.ts" (line 21): the schema is `packages/contracts/src/domain.ts:813-819` and the table is `packages/db/prisma/schema.prisma:184-198`. Core only has a `Pick` of it (`action-approval.ts:97-100`).
3. Data section "resolveActionApprovalDetail returns allow|ask|block" (line 62): it currently returns `ask | allow` only (`action-approval.ts:204-209`, `:213`). Adding `block` also changes `planActionGate`, `applyJudgeDecision`, the effect-replay code and the executor branches that read `gateDecision`.
4. "unattendedTriggerToolRequiresApproval limits only trigger==='webhook'" (line 21) is correct (`action-approval.ts:146`), and `ActionTypeRuleSchema` / `ACTION_TYPES` do not exist yet. "Executor derives attended from RunTriggerSchema (contracts/runs.ts)": the trigger list is `RUN_TRIGGERS` in `packages/contracts/src/runs.ts:4-19`. A second, different definition already exists in `packages/core/src/run-state.ts:16,77` (`isConversationalRun`: routine, webhook, created, tickets). The PRD says "one definition of unattended"; it must say which of the two to keep and fix the other. `messaging`, `bot_message`, `reaction`, `cloud_agent`, `spawn`, `skill`, `call_end`, `resume`, `follow_up` are not classified anywhere yet, and `resume` and `follow_up` continue a live conversation, so they must not be made unattended without checking.
5. "Open: write_file/shell unattended (USER DECIDED: ask first)" (line 64): for webhook runs this already holds, because neither tool is in `UNATTENDED_SAFE_BUILTIN_TOOLS`. It is false for cron `routine` runs and every other trigger, and `write_file`/`shell` are in `APPROVAL_EXEMPT_TOOLS` (`action-approval.ts:3-25`) so they never ask in live chat. The change is generalising the trigger check, not a new mapping.
6. "Explicit-approval tools can never be Allow" (line 59) is already enforced for `EXPLICIT_APPROVAL_BUILTIN_TOOLS` and the tainted and integration cases (`executor.ts:3987-4003`). The PRD should say what happens to the "Always allow this tool" button on a webhook-only card: it is still shown (`executor.ts:4351`) and writes a space-wide rule (`run-pauses.ts:570-586`). This is a missing constraint: unattended and tainted cards should set `noAlwaysAllow`.
7. "auto-review only turns Ask→Allow for non-explicit tools in attended runs" (line 60): Auto Review already turns a default Ask into Allow when the judge passes the call (`planActionGate`, `action-approval.ts:251-268`, `applyJudgeDecision`, `:271`). It is skipped for mandatory-ask cases, which include webhook runs, so the "non-explicit" part exists. The "attended only" part does not: cron `routine` and other non-webhook runs can use it today. The PRD also assumes a UI; there is none (the `autoReview.get/set` RPC at `rpc.ts:1255` is unused by web and mobile), so the switch (F6) is new work.
8. "UX: table in bot settings, defaults filled, greyed space default behind bot overrides" (line 61): today the only approvals UI is the account-level Settings > "Privacy and approvals" panel, with two switches and a rule list (`ApprovalRulesSettings.tsx`). There is no bot settings screen reading rules. Say which screen the table lives on; recommend keeping the account-level table and adding a per-bot override view.
9. "v1 action types ... one mapping table in core" (line 59): most of the 14 types have no counterpart today. The existing categories are only `email` and `purchase` (`categoryMatches`, `action-approval.ts:156-175`). "Post publicly", "Delete data", "Calendar changes" and "Message other bots" exist only as tool names (`calendar_*`, `delete_bot`, `destination.write`, `spawn_bot`), not as categories. "Use saved secrets" maps to `secret_request`, which is already in `APPROVAL_REQUIRED_BUILTIN_TOOLS` and cannot be set to Allow without changing the secrets design. Several connector tools can only be classified by name pattern (`connectorToolRequiresApproval`), so a new type must say how an unknown connector write is classified (recommend: "Connected apps (write)", fail closed).
10. Missing: `DENIED_ACTION_MESSAGE` lives in `packages/adapters/src/approval-effect.ts:364` and tells the model not to retry. A Block needs different text (a rule, not a person's choice) so the model does not say "you denied it".
11. Missing: rules are keyed by (space, `createdByUserId`) and loaded for the run's owner (`executor.ts:3145-3153`). Adding `botId` changes the unique index (`schema.prisma:195`), the RPC input/output, the `run-pauses.ts` upsert and `account-export.ts`/deletion cascades. A migration must treat existing rows as space-wide.
12. Missing: reminder at 4 h and expiry at 24 h (line 60). An `expired` answer state exists in `AskCard.tsx:46`, but no job that creates it was found in this read; check `packages/db/src/run-pauses.ts` and the wakeup jobs before specifying it as new.
13. "Risks: tightening unattended runs may break scheduled routines that send/post" (line 73): confirmed. Today only webhook runs are restricted, so every cron routine that sends mail passes the ordinary rules (email asks by default via `mail_send` in `APPROVAL_REQUIRED_BUILTIN_TOOLS`, but `write_file`, `shell`, `computer_act` and `browser_act` run freely). The migration report should list routines by what they would now stop on.
14. `UNATTENDED_SAFE_BUILTIN_TOOLS` includes `add_to_data_room` (`action-approval.ts:77`), which writes, and `run_subagent` and `request_takeover`. The PRD says "only read-only connector tools and UNATTENDED_SAFE_BUILTIN_TOOLS run" but does not audit this list. Decide whether `add_to_data_room` stays; for `run_subagent` the PRD's own open question (inherit read-only, recommend yes) needs the executor to pass the parent mode to the child run.
15. "Notifications via notify-user.ts, notification-outbox.ts" (cross-cutting): the approval notification today is `notifyRun(...)` with kind `help` in `executor.ts` `pauseForAsk`, titled "<bot> needs approval". Reuse that path.
16. "Security: record every decision in run events" (line 63): decisions are recorded on the `ExternalEffect` row for Auto Review (`reviewDecision`, `reviewReason`, `reviewModel`, `executor.ts` around `:4170`); there is no event for rule-based allow/ask/block. Name which store the new record goes in.
