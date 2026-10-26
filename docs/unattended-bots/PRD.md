# Bots that work while nobody is watching

Product requirements for six changes to Praci bots: read-only background runs with an approvals table, watches, quiet check-ins with open items, secrets polish, teach-by-demo polish, and bot-built tools with share links.

Status: draft v2, 2026-10-25. This version replaces the first draft. It is based on a code read of this repository, the story catalog and browser walks in `docs/ux-paths/unattended/`, `docs/ux-walker/unattended/` and `docs/ux-flow/unattended/`. Every claim about existing code cites a file. Items marked **New** do not exist today.

## 1. Why

A founder wants to hand a bot a chore and stop thinking about it: watch a competitor's pricing page, keep track of the SAFE that has not come back signed, pull the weekly numbers from Mercury, upload receipts every Friday. Today Praci can schedule a prompt, but three things stop a founder from trusting it:

1. **Background runs are not safe by default.** Only webhook-triggered runs are limited to read-only tools (`packages/core/src/action-approval.ts:140-150`). A scheduled routine can send mail, edit files, run shell commands and drive the browser with no approval (`write_file`, `shell`, `computer_act`, `browser_act` are approval-exempt, `action-approval.ts:3-24`).
2. **Background runs are noisy and expensive.** A routine runs a full model turn on every tick. The prompt a bot writes for "tell me if it changes" posts "no change" every morning (walk WATCHERS-C6). Staying quiet requires the model to answer the magic word `NO_RESPONSE` (`packages/adapters/src/silent-reply.ts`).
3. **The pieces are hard to find and hard to read.** Open work and Credentials hide under Advanced. Taught skills cannot be listed or deleted. Approval cards use three different vocabularies (walk APPROVALS-C3).

The outcome we want: **a founder can leave bots running overnight knowing they will hear about real changes once, and nothing is sent, spent, edited or deleted without a decision.**

## 2. User stories (v1)

Each story is the user's goal and the reason they care. Story IDs refer to `docs/ux-paths/unattended/catalog.md`.

| # | Story | Why the user cares |
|---|---|---|
| U1 (APPROVALS-F3) | Maya leaves three routines on overnight. None of them can send, pay, post, delete, edit files or run commands without asking her. | She can delegate without worrying about a 2 a.m. mistake. |
| U2 (APPROVALS-F1) | Maya opens Settings and sees one table: what bots may do, with Allow / Ask / Block for each kind of action. | She sees the whole safety setting in one place. |
| U3 (APPROVALS-F2) | Maya blocks sending email for the Inbox agent only. | She can give a bot access to her mail without fearing it will send. |
| U4 (WATCHERS-F1, F3) | Maya tells Chief "tell me if the competitor pricing page changes". Chief sets up a watch. She hears from Chief only when the page changes. | She stops checking by hand and stops reading "nothing new". |
| U5 (WATCHERS-F4) | Maya sees, on every routine row, when it last checked or ran and when it runs next. | Silence reads as "working, nothing new", not "broken". |
| U6 (CHECKINS-F1, F3) | Maya turns on a daily check-in for her Legal bot. Most days it says nothing. When the countersigned SAFE is 5 days late, it tells her that one thing first. | The bot keeps track of follow-ups so she does not have to. |
| U7 (CHECKINS-F2, F7) | Each open item shows who it waits on and when it is due. A past-due item reaches her even with check-ins off. | She can tell "stuck on me" from "stuck on them". |
| U8 (SECRETS-F1, F2) | A scheduled bot reads an authenticated API with her saved key while she sleeps; she can see when each credential was last used. | Work gets done with real keys that never reach the model. |
| U9 (TEACHING-F1, F2, F3) | Maya shows the bot a chore once on its desktop (browser, apps, files). The skill reads as plain steps. Her password never appears in it. | She teaches the chore the way she does it, and the skill is safe to keep. |
| U10 (TEACHING-F6) | Maya schedules the taught skill. When it needs to click, type or write in a background run, it asks first. | A taught chore runs alone without doing something she did not approve. |
| U11 (APPS-F1, F2) | Maya asks the Finance bot for a reusable "weekly burn" tool. The bot writes a script, tests it, and she approves it once. Routines and other turns then run that exact script. | The same shape of answer every week, computed the same way, without re-explaining. |
| U12 (APPS-F3, F5) | Maya shares a bot-made dashboard with her advisor by link. The link is view-only, expires in 30 days, and she can stop it. | Her advisor sees the numbers in one click; she keeps control. |

## 3. One model for the user

The research found that six features as written would add six lists, three schedulers and four notification controls. v1 uses one model instead:

- **Routines** are the one list of "things a bot does without being asked". A routine runs on a schedule, on a webhook or Git event (exists), **on a watch (New)**, or as the bot's **check-in (New)**. They all live in the existing Routines panel (`RoutineEditor`, `RoutineListRow`, `RoutineRunHistory`), opened from "Computer and routines" (`apps/web/src/pages/Shell.tsx:5224-5253`). No Watchers page, no Check-ins page.
- **Activity "Needs you"** is the one place for things waiting on the user: approvals, stuck runs, and past-due open items.
- **Approvals** is the one safety setting. Every background run follows it. No feature adds its own safety switch.
- **Artifacts** hold what a bot makes (pages, dashboards). **Skills** hold how a bot does something; a **tool** is an approved skill with a script.

## 4. Requirements

Priority: **Must** ships in v1. **Should** ships in v1 if it fits the phase. **Later** is out of v1.

### 4.1 Read-only background runs and the approvals table (phase 1)

**One definition of unattended, stored on the run (Must).** A trigger name alone cannot decide the mode: a group handoff creates a `follow_up` run with no user action (`packages/adapters/src/group-handoff.ts:164-172`). So the mode is decided once, when the run is created, and stored: `Run.unattended Boolean` (**New**, default `true` so unknown creation paths fail closed). Today there are two partial definitions, `unattendedTriggerToolRequiresApproval` (webhook only) and `isConversationalRun` (`packages/core/src/run-state.ts:77`); both are replaced for approval decisions by the stored flag.

Every place that creates a `Run` sets the flag:

| Run is created by | `unattended` | Reason |
|---|---|---|
| The owner sending a message, reacting, finishing a call, or pressing Test on a skill card (`user`, `reaction`, `call_end`, `skill`) | `false` | The owner started it in a live session. |
| A follow-up the owner sent while a run was active (`follow_up` from the composer) | `false` | Same. |
| Any run started by another run: group handoff (`follow_up`), sub-agent (`spawn`), `resume`, bot-to-bot messages (`bot_message`) | Copied from the source run, or `true` if the source run was unattended or is unknown | A chain of runs cannot become attended without the owner. |
| `routine` (schedule, watch, check-in), `webhook`, `messaging`, `cloud_agent`, `created`, `tickets` | `true` | Nobody is watching, or the input comes from outside. |

The implementer lists every `run.create` call site in the PR and shows which row it uses. A unit test fails if a new `run.create` site does not set the flag (a grep-style test over the source is acceptable).

**Untrusted input stays marked (Must).** Runs whose prompt carries outside content (webhook payloads, watch diffs, inbound messaging) are marked tainted for their whole length: `Run.externalTaint Boolean` (**New**, default `false`), set at creation and copied to every run created from a tainted run (handoff, sub-agent, bot message, resume). Approving a card never clears it. In a tainted run every call asks except a short list of tools that only write inside Praci or to the owner (`EXTERNAL_TAINT_SAFE_TOOLS`, **New**, replacing `EXTERNAL_TAINT_FREE_TOOLS` at `packages/adapters/src/executor.ts:8322`): `ask_user`, `skill_read`, `notify_user`, `scratchpad_list`, non-gated `scratchpad_add`/`update`/`complete`, `create_ui_artifact`, `page_write`, `pins_write`, `attach_file`, `recall_memory`, and (phase 5) `tool_run`. In particular `web_fetch` and `web_search` cannot carry private data out of a tainted run without a card. Fencing the content in the prompt is not enough on its own.

**Existing rows (Must).** Backfill `Run.unattended` from the trigger (false for `user`, `follow_up`, `reaction`, `call_end`, `skill`; true otherwise), because a paused run is requeued on the same row (`packages/db/src/run-pauses.ts:482`).

**What may run unattended (Must).** In an unattended run a tool call runs without asking only if it is (a) a connector tool that `connectorToolRequiresApproval` classifies as read-only, or (b) in `UNATTENDED_SAFE_BUILTIN_TOOLS` (`action-approval.ts:59-85`), after an audit. Everything else, including `write_file`, `shell`, `computer_act`, `browser_act`, `open_path`, `launch_app` and any `secret_request` whose method is not `GET` or `HEAD`, raises a normal approval card. The user chose this ("ask first" for files and shell in background runs).

Audit of the safe list (Must):
- `add_to_data_room` writes and moves to "asks".
- `run_subagent` stays, because a sub-agent inherits the parent's mode.
- Added, so check-ins and watches can do their job: `notify_user`, and `scratchpad_add`, `scratchpad_update` and `scratchpad_complete` for items that are not in a GTM-gated category (`public_post`, `create_account`, `outbound_email`, `packages/adapters/src/scratchpad-tools.ts:16-21`); gated categories keep their approval.
- `create_ui_artifact`, `attach_file`, `page_write` and `pins_write` write only inside Praci and are added.
- `request_takeover` and `request_secret` must not wait silently on a card nobody sees: in an unattended run they end the run with a notification ("Chief needs you to sign in") instead of pausing.
- `skill_create`, `skill_update`, `schedule_create` and `watch_create` follow their existing approval rules.

**Block comes first (Must).** The executor today skips saved rules whenever an ask is mandatory (`executor.ts:3984`) and replays approved effects in a separate branch (`executor.ts:4570`). A Block rule is checked before both: a blocked call never produces a card, and an approved-but-not-yet-run effect that a Block rule now covers is refused at replay. Rules are re-read before each tool call rather than once per attempt (`executor.ts:3144`), so a change takes effect on the next call.

**Approval cards from background runs (Must).**
- No "Always allow this tool" button on cards raised because a run is unattended or tainted (today it shows and writes a space-wide rule: `packages/adapters/src/executor.ts:4351`, `packages/db/src/run-pauses.ts:570-586`).
- Auto Review never runs on unattended runs (`planActionGate`, `action-approval.ts:251`).
- One plain reason line on the card: "Asked because this ran in the background" or "Asked because of your rule for Send email". Only shown for background or rule-caused asks.
- Every allow, ask and block decision is recorded on the run's events (today only Auto Review decisions are stored on `ExternalEffect`).

**Approvals table (Must).** Replace the two switches in Settings > "Privacy and approvals" (`apps/web/src/pages/settings/ApprovalRulesSettings.tsx`) with one table of action types. Each row has one `NativeSelect`: Allow / Ask / Block. The section is renamed "Approvals" and moves above "AI data sharing". Five rows show by default; the rest sit under a "More actions" disclosure. The existing per-tool rule list stays below as the advanced list, with human tool names.

Action types and their mapping live in one table in core (`ACTION_TYPES`, **New**). Mapping is by tool name, connector kind and the existing name patterns; unknown connector writes map to "Connected apps (write)".

| Action type | Default | Shown by default |
|---|---|---|
| Send email | Ask | Yes |
| Spend money | Ask | Yes |
| Connected apps (write) | Allow (asks in background runs) | Yes |
| Calendar changes | Allow (asks in background runs) | Yes |
| Edit files and run commands | Allow (asks in background runs) | Yes |
| Use the computer (browser and desktop) | Allow (asks in background runs) | More |
| Delete data | Allow (asks in background runs) | More |
| Message people outside Praci | Allow (asks in background runs) | More |
| Use saved credentials | Allow (asks in background runs) | More |

Defaults keep today's live-chat behaviour: only email and purchases ask (user decision, 2026-10-25). Background runs ask for every row except reads, whatever the row says.

Rules:
- `block` is a new rule effect. At equal specificity Block beats Ask beats Allow. A blocked call returns a clear message to the model saying the user's setting blocks this action and not to retry or work around it (new text; `DENIED_ACTION_MESSAGE` in `packages/adapters/src/approval-effect.ts:364` is about a person's decision and stays as is).
- Allow is not offered for tools that require explicit approval (`EXPLICIT_APPROVAL_BUILTIN_TOOLS`), and an Allow row never lifts the unattended rule. The UI disables those options with no extra copy.
- **Per-bot override (Must).** `ActionApprovalRule` gains a nullable `botId` (**New**). Existing rows stay space-wide. Bot settings get an "Approvals" section with the same rows; each select has a first option "Same as all bots". A bot rule beats a space rule.
- **One rule per target (Must).** Setting a row replaces any rule with the same space, user, bot and match, whatever its effect, in one transaction (today `set` inserts by effect and leaves the other: `apps/api/src/router.ts:7238`). "Same as all bots" deletes the bot's rule. Uniqueness is enforced with a SQL index on `COALESCE(botId, '')`, as the data-room migration does for nullable keys (`packages/db/prisma/migrations/20261020010000_data_room_external_key/migration.sql`).
- The integration-agent `WritesSwitch` stays as it is. It controls whether the connection may write at all (`connection.writesEnabled`, `apps/api/src/integration-agent.ts:332`), which is an access setting, not an approval preference.

**Should:** one reminder notification 4 hours after a background approval was raised, and expiry after 24 hours using the existing `expired` answer state (`AskCard.tsx:46`). Implementer checks `run-pauses.ts` and the wake-up jobs for an existing expiry job first.

**Should:** cards raised by a background run also link from the chat that started the work (walk APPROVALS-C3 found the card only in the acting bot's chat), and Activity shows "Needs approval" for them.

**Migration (Must).** Rules are kept, except that a target with both an Ask and an Allow rule (possible today, the old unique key included the effect: `schema.prisma:195`) keeps only the Ask rule before the new index is created. Release note: "Scheduled routines now ask before they send, edit files or run commands." Existing routines that relied on silent writes will raise a card on their next run.

**Mobile:** shows and answers the same cards (exists). The table is web and Electron only in v1; mobile shows a read-only summary (Later).

### 4.2 Routines that watch, stay quiet, and check in (phase 2)

**Quiet switch (Must).** Routine editor gains one switch: "Only message me if something needs me" (`Routine.quiet`, **New**, default on for watches and check-ins, off for existing routines). The server adds the silent-reply guidance; users never type `NO_RESPONSE`. A run that ended silently shows "Nothing to report" in Run history and Activity and is not counted under Finished.

**Status line (Must).** Every `RoutineListRow` gets one muted second line: "Last ran 8:00 AM · Next Mon 8:00 AM", or for a watch "Checked 4 min ago · Changed yesterday", or "Paused after 5 failed checks". This fixes the missing last-run information for all routines (walk WATCHERS-C1, C5).

**Source line (Must).** A bot message posted by a routine shows a small source line "From routine: Pricing check". The webhook delivery bubble no longer shows the raw payload wrapper (bug fix shipping separately, branch `fix/walk-bugs`).

**Watch a page (Must).** The "Choose when it runs" menu in `RoutineEditor` gains "Watch a page". It adds one card with two fields: page address and "Check every" (15 minutes, hourly, daily; default hourly). The routine instruction says what to do on a change.
- Stored as `Routine.watch` (Json, **New**): `{ kind: "page", url, intervalMinutes }`, validated by `WatchSpecSchema` in `packages/contracts/src/routines.ts` (**New**). Minimum interval 15 minutes. Max 5 watches per bot and 20 per space.
- **Wake budget (Must).** A watch wakes the model at most 6 times per day; further changes that day fold into the next day's first wake. A watch whose page changed on 8 of its last 10 checks pauses as "Changes too often" with one notification. A space allows at most 50 watch wakes per day. With 20 watches at the 6-per-day cap, the ceiling is 120 wakes, and the space cap holds it at 50.
- A **probe** runs in the worker with no model: fetch the URL through the existing SSRF policy (`packages/adapters/src/web-ssrf.ts`), extract readable text, normalize whitespace, hash it. State lives in `RoutineWatchState` (**New** table: routineId, fingerprint, snapshot up to 16 KB, lastCheckedAt, lastChangedAt, consecutiveErrors, nextCheckAt; scoped by space).
- The first check records a baseline and stays silent. A no-change check creates **no Run**. A change starts an unattended run whose prompt carries a truncated before/after diff fenced as untrusted data, using the same wrapper as webhook payloads (moved to `packages/core` so the worker can use it).
- At most one wake per watch per interval; changes seen while a wake is running fold into the next one.
- Errors back off exponentially; after 5 consecutive failures the watch pauses and the row says so. One notification on pause.
- Scheduling: a new `watchProbeJob` (`packages/adapter-kit/src/background-jobs.ts`), keyed `watch:<routineId>`, separate from `routineWakeupJob` so it never replaces a queued timed wake.
- The probe tick runs from the `watch.probe` cron in `apps/worker` (Graphile mode) and from the job reconciler every 30 seconds in the single-process mode (`WAKEUP_DRIVER=memory`, used by the demo). Each mode has one scheduler; the claim uses SKIP LOCKED and a lease, so a stray second tick is safe.

**Watch a connected app (Should).** Same card, second option: a connected app and one read-only tool with fixed arguments, chosen in chat by the bot (no argument form in the UI). The tool must pass `connectorToolRequiresApproval(...) === false` with its declared `readOnly`. On every check the probe re-resolves the bot's connection and tool through the same path the executor uses, including the `beforeDispatch` authorization callback (`executor.ts:6934`, `composio-connector.ts:830`); a revoked grant, a removed account or a tool whose declared effect changed pauses the watch. It fingerprints the JSON result. This is how "tell me if runway drops below 9 months" works: the watch wakes on a balance change and the quiet routine decides whether to speak.

**Set up from chat (Must).** New tool `watch_create` (url, intervalMinutes, name, instruction). It uses the existing repeating-schedule approval card with a summary like "Checks example.com/pricing hourly, tells you only when it changes". `schedule_list`, `schedule_update` and `schedule_cancel` cover list, edit and delete. A routine-triggered run cannot create watches (same rule as schedules, `schedule-tools.ts:27-34`). The bot's guidance says to use a watch for "tell me if X changes".

**Check-in (Must).** Bot settings, next to Notifications: "Check in" `NativeSelect` Off / Daily / Every 4 hours. Choosing a value creates or updates one managed routine (`Routine.managedKind = "check_in"`, **New**) with a built-in instruction: review open items and events since the last check-in, say nothing unless something needs the user, and lead with the one thing that does. Daily runs at 9:00 in the user's time zone. Fixed limit: at most one check-in message per bot per day. The managed routine shows in the Routines list with the trigger text "Daily check-in" and cannot be edited there except Active.

**Open items (Must).**
- `ScratchpadItem` gains `dueAt`, `waitingOn` and `resolvedReason` (**New**). `dueAt` is separate from `scheduledFor`, which is a GTM post time (`schema.prisma:957`). New index `(spaceId, botId, status, dueAt)`.
- `scratchpad_add` and `scratchpad_update` accept the new fields; `scratchpad_complete` accepts a reason. The bot sets them; the user edits by chat. GTM approval gates (`scratchpad-tools.ts:16-21`) are unchanged.
- Open work moves out of Advanced to the main bot panel. Rows show one muted line "Waiting on Acme legal · due Fri". A "Done" disclosure lists finished items with Reopen; Complete shows an undo toast.
- **Past-due (Must):** the job reconciler sends one grouped attention notification per bot per day for items past `dueAt`, even with check-ins off.

**Should:** "Waiting on you" group in Activity for open items across bots (needs a space-wide scratchpad list API, scoped by space and user).

**Later:** command probes, CSS selectors, ignore patterns, thresholds, debounce, webhook payload filters, auto-resolve on events, hand-off to another bot, quiet-hours settings.

**Mobile:** routine rows show the status line and Active switch (`RoutineDetail`). The check-in select is available in mobile bot settings. No watch creation on mobile (chat covers it).

### 4.3 Secrets (phase 3)

Most of this exists: `request_secret` card, `secret_request` with origin pinning and echo redaction, and browser login fill (`fill_secret`, `packages/adapters/src/browser-tools.ts:14-19`; `resolveLoginFill`, `packages/adapters/src/bot-secrets.ts:589`). v1 work:

- **Findable (Must):** Credentials moves out of Advanced in the bot panel (`apps/web/src/pages/shell/bot-credentials.tsx`, mounted at `bot-panel.tsx:860`). Save explains why it is disabled (missing site or value). Site field shows "https://" as the placeholder.
- **Last used (Must):** `BotSecret` gains `lastUsedAt` (**New**), updated on every successful `secret_request` and login fill. Rows show one muted line "Used 2 days ago" or "Not used yet". No use counter in v1.
- **Command variables (Must):** the helper text says plainly "The bot can read this value." (`bot-credentials.tsx:425`, `AskCard.tsx:203-212`).
- **Unattended use (Must, delivered by 4.1):** `GET`/`HEAD` requests to the saved origin run; other methods ask. `request_secret` ends an unattended run with a notification instead of pausing.
- **Should:** an expired or rejected credential (401/403 from the saved origin) marks the row "Needs attention" with Replace, and sends one notification.
- **Should (mobile):** a credentials list with Remove.
- **Later:** space-level shared secrets, a usage audit screen, Infisical setup UI.

### 4.4 Teach by demonstration (phase 4)

Recording already covers the whole sandbox display (`Shell.tsx:6263-6282`), but it keeps only coordinates, keys and window titles (`packages/adapters/src/teaching-session.ts:169-196`), hides Terminal and Files while recording (`Shell.tsx:6250`), and stores typed passwords as plain text (`packages/core/src/teach-playbook.ts:68-72`).

- **Redaction (Must, P1):** a value typed into a password field or marked Protected never appears in the stored recording, the snapshots, the playbook or the model prompt. PR #854 fixed the "How to check" leak; phase 4 extends it to password-field detection.
- **Replaying a protected step (Must):** at Stop, each protected step offers "Save as login" on the review card: the user enters the site, and the typed value is held only in the recording session until then, never stored in the recording. Saving creates a `BotSecret` login through the existing path, and the step becomes "Fill saved login <name> into <field>", which runs through `fill_secret` (`resolveLoginFill`, `bot-secrets.ts:589`). If the user does not save it, the step stays "Ask the user to sign in", and an unattended run that reaches it ends with a notification. If the saved login is later removed, the run stops at that step with the same notification.
- **Whole desktop with meaning (Must):** stop hiding the dock, Terminal and Files while recording. Record app and window switches, files written and commands run, as well as clicks and keys. At Stop, one model call turns the events into plain steps ("Click Export in the CRM toolbar"); if it fails, coordinates show as today.
- **Shorter review card (Must):** `SkillDraftCard` shows Name, Steps and Save by default; When to use, Inputs, What to return, Approval boundaries and Failure handling move under "More". Save is visible without scrolling. The card fills the thread width like other wide cards (bug fix on `fix/walk-bugs`).
- **Cancel and a reachable Stop (Must):** `TeachRecordingChrome` gains Cancel (keeps nothing). With the computer window closed, the composer's disabled strip shows Stop and Cancel.
- **Taught skills in Skills (Must):** Settings > Skills (`BotSkillsSection`) shows a "Taught" group: name and last run, Delete in the row menu. Opening a row opens the card.
- **Schedule by reference (Must):** "Add to routine" opens the routine form with the skill selected, and the routine stores a reference to the taught skill (`Routine.taughtSkillId`, **New**) instead of pasting text. The routine form's skill picker lists taught skills. Safety comes from 4.1: in a background run, computer, shell and file actions ask.
- **Should:** Test shows "Worked" or "Stopped at step N: …" on the card. A failed scheduled run names the step in its failure notification.
- **Later:** versions and re-teach from a step, success counts, copy to another bot, host desktop computers.
- **Mobile:** view taught skills and their steps (exists as text); no teaching on mobile.

### 4.5 Bot-built tools and share links (phase 5)

The user asked for apps that are safe and that agents can run as tools for repeated work. v1 delivers that as **tools** (approved scripts) plus **share links** for artifacts. A per-app data store, editable public apps and server-side app hosting are out of v1.

**Tools (Must).** A tool is a pure function the bot wrote and the owner approved: JSON in, JSON out, no side effects. The bot gathers data with its normal read tools, then calls the tool to do the same computation the same way every time (weekly burn from Mercury transactions, a hiring-pipeline summary, a reconciliation).
- A tool is an `AgentSkill` with one self-contained JavaScript source and an input schema (**New** fields: `toolSource` text up to 64 KB, `toolInputSchema` JSON Schema, `toolSourceHash`). `skill_create` and `skill_update` accept them.
- **Where it runs.** Not in the bot's computer: that holds browser profiles, other bots' folders on Team Computers and command variables (`packages/core/src/node/desktop-runtime.ts:25`, `executor.ts:3252`, `executor.ts:5072`). Tools run in a QuickJS WebAssembly interpreter inside the worker (`quickjs-emscripten`, **New** dependency, version pinned in the lockfile). The interpreter gets no file system, network, timers, environment, `import` or `require`; only the parsed input object and a `return` value. Limits: 2 seconds CPU, 32 MB memory, 256 KB output. The stored source is the only code that runs, so there is nothing else to pin.
- `tool_run(name, input)` (**New** built-in) validates `input` against the schema, recomputes the hash of the stored source and refuses if it differs from the approved hash, runs it, and returns the JSON result or the error.
- A bot test-runs a draft with `tool_run` on sample input before proposing it (drafts run only in attended runs). The draft appears in the existing Drafts group in `BotSkillsSection` with the sample input and output. The owner presses the existing Approve, which records `toolSourceHash`. Any change goes through `skill_update`, which already asks.
- Because a tool has no side effects and no outside access, `tool_run` of an approved tool is added to the unattended safe list. Its output enters the model's context like any other tool result.
- `task_catalog` lists approved tools with their input schemas. Tools are scoped like skills (space and user). "Copy to another bot" and tools that call connectors are Later.

**Share an artifact by link (Must).**
- The Artifacts toolbar gains "Share". It opens the existing `CopyLinkDialog`: view-only, expires in 30 days, the link is shown once, and "Stop sharing" sits in the same dialog with a confirm.
- Storage follows the investor portal (`packages/db/src/investor-portal.ts`): `ArtifactShare` (**New**: id, spaceId, artifactId (the exact version), tokenHash, createdBy, expiresAt, revokedAt, lastOpenedAt).
- A public page in the web app loads the shared version from a public API endpoint. The token travels in the URL fragment (`/s#<token>`), as the investor portal does (`apps/web/src/pages/portal/PortalOpen.tsx:9`), so it is never sent in a request line or a referrer; the page's HTML response also sends `Referrer-Policy: no-referrer`. Supported formats in v1, each with its existing renderer:
  - HTML: inside a sandboxed iframe (`sandbox="allow-scripts"` without `allow-same-origin`) with the CSP of `SandboxedHtmlViewer.tsx` (`default-src 'none'`).
  - UI artifact dashboards (`UI_ARTIFACT_MIME_TYPE`): `UiArtifactView`, as in `ArtifactPreview.tsx:33`.
  - Images and PDF: shown as in the preview.
  - Any other type: the Share button is not offered.
- Every response on the public endpoint, including 404s, sends `Cache-Control: private, no-store` (as `apps/api/src/investor-portal.ts:47` does), `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and no cookies. The page sends `X-Frame-Options: DENY`. The public endpoint never reads the session cookie and looks up only the artifact named by the token's row, so it cannot reach another space's data.
- The link stays on the version that was shared. A new version reaches viewers only when the owner presses "Update link". "Restore this version" sits next to the version select.
- Deleting an artifact revokes its links (one clause in the delete dialog).
- Sharing is a human action in the UI. The bot has no share tool.
- Rate limit on the public endpoint; unknown, expired and revoked tokens return the same 404.
- **Mobile:** artifacts preview exists; Share is Later on mobile.

**Later:** per-app data stores, edit links, passwords, view counts, viewer actions that wake a bot.

## 5. Cross-cutting

- **Design system.** All UI reuses components in `docs/design-system/components.md` (`Table`, `NativeSelect`, `Switch`, `Badge`, `CopyLinkDialog`, `AlertDialog`, routine components). Any new or changed component gets a story; run `pnpm design-system` after adding, moving or removing component files.
- **Copy.** Every new visible string is listed in its PR with why it is needed (AGENTS.md). New strings go through the translation catalogs.
- **Multi-tenant.** All new state is in Postgres, scoped by space and user, authorized on every read and write. Watch probes use the shared job queue, not process memory.
- **Export and deletion.** Watch state, open-item fields, tool scripts and share links are included in `apps/api/src/account-export.ts`; scratchpad items are added (missing today). Share tokens are exported as metadata only. Everything cascades from Space and Bot.
- **Tests.** Offline and deterministic: unit tests for `runIsUnattended`, the action-type map and block resolution; probe tests against a local HTTP fixture; share-route tests for headers, expiry and revocation; secret-visibility conformance extended to tools and recordings.
- **Docs.** Update `docs/bot-secrets.md`, `docs/agent-pages/`, `docs/computer-runtime.md` and add the unattended rule to the "Current decisions" section of `VISION.md`.

## 6. Delivery

Each phase is one PR to the fork, merged after local checks, a hand test on `pnpm demo:up`, and an Astra review of the phase.

| Phase | Scope | Depends on |
|---|---|---|
| 1 | 4.1 Read-only background runs and the approvals table | — |
| 2 | 4.2 Quiet switch, status line, watches, check-ins, open items | 1 |
| 3 | 4.3 Secrets | 1 |
| 4 | 4.4 Teach by demonstration | 1 |
| 5 | 4.5 Tools and share links | 1 |

Phases 3, 4 and 5 touch different files and can be built in parallel after phase 1.

## 7. Risks

- **Routines that send today will start asking.** Mitigation: release note, and the card says why it asked. No silent opt-out.
- **Watch load.** Mitigation: 15-minute minimum, per-bot and per-space caps, backoff, no Run on no-change.
- **Tool scripts.** An approved tool runs unattended. Mitigation: it runs in a WebAssembly interpreter with no file system, network or environment; one stored source, hash-checked at run time; re-approval on any change; limits on CPU, memory and output.
- **Prompt injection from watched pages and webhooks.** Mitigation: those runs are tainted for their whole length, so reads cannot be sent out without a card.
- **Public links.** Mitigation: static only, sandboxed opaque origin, strict headers, 30-day expiry, revocation, rate limit.
- **Recordings hold personal data.** Mitigation: redaction at capture, deleted with the skill.
- **CI is off on the fork.** Mitigation: Astra review per phase plus hand tests; security-sensitive diffs (approvals, secrets, share route, tools) get the review before merge.

## 8. Decisions taken

- Background runs ask before editing files and running commands (user, 2026-10-25).
- Teaching keeps the whole desktop, not only the browser (user, 2026-10-25).
- Bot-built apps must be safe and runnable by agents as tools (user, 2026-10-25); v1 meets this with approved pure-function tools in a WebAssembly sandbox, plus view-only share links for artifacts.
- The run's mode (attended or unattended) is stored on the run at creation, not derived from the trigger name (Astra review of draft v2).
- Watches and check-ins are routines, not separate objects (this document).
- Sharing is a human action; bots get no share tool (this document).
