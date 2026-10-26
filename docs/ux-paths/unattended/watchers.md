# Watchers (wake only on change) on top of routines

Topic: Unattended bots. Date: 2026-10-25. Branch: feat/unattended-bots.

All file paths are repo-relative. UI labels were checked in the demo stack (synthetic data) on 2026-10-25. Code claims were checked by reading the files named.

## Current state

### What exists today

A routine is a saved prompt that wakes a bot. There is no watcher: nothing checks a source on a schedule and wakes the bot only when the source changed.

**Data model.** `Routine` is at `packages/db/prisma/schema.prisma:912-942`. Fields: `crons String[]`, `timezone`, `active` (default false), `notify` (default true), `webhookEnabled`, `githubEnabled`, `messageProvider`, `modelProvider`/`modelId`/`thinkingLevel`, `lastRunAt`, `nextRunAt`, `threadId`. Indexes: `[active, nextRunAt]`, `[spaceId, botId]`. There is no trigger-kind column, no watch spec, no fingerprint or snapshot, no failure counter and no `routine_watch_state` table. No `WatchSpec`, `watch_*` tool, `watch-probe` or `watch-diff` exists anywhere under `packages/` or `apps/`.

**Timed wake path.**
- `routineWakeupJob(routineId, scheduledFor)` and `routineJobKey` are in `packages/adapter-kit/src/background-jobs.ts:181,217`. The job name is `routine.wakeup`; its replace key is `routine:<id>`, so there is at most one queued wake per routine.
- The handler is `packages/adapters/src/background-job-handlers.ts:154`, which calls `wakeRoutine` at `packages/adapters/src/executor.ts:1200`.
- `wakeRoutine` skips unless the routine is active and `nextRunAt` equals the job's `scheduledFor`. In one transaction it moves `nextRunAt` forward, creates a Task and a Run with `trigger: "routine"`, and appends a `routine.fired` event. It then enqueues the next wake.
- `packages/adapters/src/wakeup.ts` is only the Graphile job host. Its `RECURRING_JOBS` (line 94) holds fixed system ticks (notifications, retention, `company.refresh.tick`, `mail.watch.renew`, `devin.refresh`). Per-routine timing is not in that list.

**Overlap rule.** A plain routine does not check for an active run of itself. Only the GTM agent (`executor.ts:1280-1291`) and the Legal agent (single-flight lock, `executor.ts:1294`) skip a wake when a run is already active or there is no work. A skipped wake returns `"active-run"` or `"no-work"` before any model call (`executor.ts:1342`). This is the one existing "decide before waking the model" precedent.

**Triggers on a routine.**
- Cron schedules. `crons` is a list of 5-field cron strings. The editor offers Every hour, Every day, Weekdays, Every week, Every month on the 1st, Interval, Advanced.
- One-shot (`@once` cron). It can only be created from chat, not from the editor (`apps/api/src/router.ts:4112-4116`).
- Webhook (`webhookEnabled`). Route `POST /api/v1/bots/:botId/webhook`, bearer key (`apps/api/src/webhook.ts:38-100`).
- Git event (`githubEnabled`). Route `POST /api/v1/bots/:botId/github`, signed with `x-hub-signature-256` (`apps/api/src/github-webhook.ts`).
- Messaging (`messageProvider`: Slack, Teams or another provider), through `apps/api/src/messaging-inbound.ts`.

**Webhook behavior that matters for a watcher design.**
- Both webhook routes wake the bot's main chat thread. They post the inbound payload as a user message with `trigger: "webhook"` (`apps/api/src/webhook-inbound.ts:263-330`).
- At most 5 matching active routines are inlined into the prompt (`take: 5` in `webhook.ts` and `github-webhook.ts`).
- The webhook route wakes the bot even when no routine has `webhookEnabled`: with zero routines it posts the raw payload (`webhook-inbound.ts:282`). The GitHub route returns `{ ok: true, ignored: true }` when no routine matches (`github-webhook.ts:218`).
- Payload size cap is 64 KB. Deliveries are de-duplicated with a client nonce built from the idempotency key or GitHub delivery id. The payload is fenced as untrusted data (`formatUntrustedDeliveryPayload`, `webhook-inbound.ts:57`).
- GitHub event prompts carry metadata only, with event-authored text excluded (`github-webhook.ts` `formatGithubEventPrompt`).

**Approval behavior for unattended runs.**
- `unattendedTriggerToolRequiresApproval` (`packages/core/src/action-approval.ts:140-150`) returns false unless `trigger === "webhook"`. For a webhook run, connector tools need approval unless `connectorToolRequiresApproval(...) === false` (line 115), and built-in tools need approval unless they are in `UNATTENDED_SAFE_BUILTIN_TOOLS` (line 59: reads, `web_fetch`, `web_search`, `schedule_list`, and similar).
- A run with `trigger: "routine"` is treated as owner-initiated: `OWNER_INITIATED_TRIGGERS` includes `routine` (`packages/adapters/src/mail-tools.ts:176`). It gets the owner's mail, calendar and Drive tools. It is not read-only.
- A routine run cannot create or update a schedule. `filterBuiltinToolsForRun` removes `schedule_create` and `schedule_update` for trigger `routine` (`packages/adapters/src/schedule-tools.ts:27-34`).

**Quiet runs.** A routine run can finish with no chat message. A routine prompt that says to stay silent makes the bot reply exactly `NO_RESPONSE` (`packages/adapters/src/silent-reply.ts`; guidance text `ROUTINE_SILENT_REPLY_GUIDANCE`, `executor.ts:9270`). The model still runs and costs tokens on every wake; silence is decided after the model reads the source.

**Notifications.** `notify_user` (`packages/adapters/src/notify-user.ts:37-75`) stores a notification. If `Routine.notify` is false, importance is downgraded to `info` so it never toasts or pushes. The web editor has no notify control: Shell sends `notify: true` on create (`apps/web/src/pages/Shell.tsx:5546`) and does not send it on update.

**Bot tools.** `schedule_create`, `schedule_list`, `schedule_cancel`, `schedule_update`, `schedule_runs` (`schedule-tools.ts:17-23`). Repeating schedule inputs are `cron`, or `every` plus `unit` (minutes, hours, days), or one-shot `runAt`/`delayMinutes`/`delaySeconds`. The minimum repeat interval is 1 minute (`resolveScheduleTiming`, `validateRepeatingCron`, line 197). Creating or changing a repeating schedule shows an approval card whose summary reads like "<when>, posts here" with Details (time zone, next run, prompt) (`scheduleApproval`, `schedule-tools.ts:585`). A one-shot reminder does not ask. There are no tools to set a trigger other than a schedule (no webhook, Git or watch tools).

**Run history and routine lifecycle events.** `routines.runs` returns 20 runs per page (`apps/api/src/routine-runs.ts`). Events `routine.created`, `routine.updated` and `routine.fired` are appended to the bot thread (`router.ts` around 4150-4330; `executor.ts:1377-1382`). Mobile has a routine detail screen (`apps/mobile/app/routine.tsx`, `apps/mobile/lib/routine.ts`), read oriented.

**Related but not watchers.**
- `packages/adapters/src/gmail-push.ts` wakes mail sync for connections (`wakeMailConnections`, lines 294-309). It does not wake routines.
- `packages/adapters/src/ticket-wake.ts` creates a Task and a Run with `trigger: "tickets"` when a ticket is assigned. It does not use `Routine`.
- `packages/adapters/src/release-watch.ts` is an offline evaluation helper for a release-monitoring routine prompt (its header says so). It has no poller and no state.
- `packages/adapters/src/web-ssrf.ts` exports `assertSafeWebUrl` (line 50) and `fetchSafeWebText` (line 97). These are reusable for an HTTP probe.
- `devin.refresh` (every 2 minutes) and `company.refresh.tick` are fixed system pollers for one integration each, not user-defined.

### UI today (web)

- There is no route per routine. The panel lives in the right panel of the bot chat, e.g. `/app/<botId>`. A deep link `?routine=<id>` opens a routine (`apps/web/src/pages/Shell.tsx:2520-2537`).
- Open it from the bot header button with accessible name "Computer and routines". Components: `RoutineListHeader`, `RoutineListRow`, `RoutineEditor` in `apps/web/src/pages/RoutineEditor.tsx`; `RoutineRunHistory.tsx`; `RoutineSchedule.tsx`.
- List: heading "Routines", subtitle "Work this bot repeats for you, like a cash check every Monday.", button "Create a routine". Each row shows the name and a summary: "Paused", or "When a webhook fires", "Git event", "Slack message" / "Teams message" / "Message event", and formatted crons joined by " · " (`routineTriggerSummary`, `RoutineEditor.tsx:142`). A running routine shows "Running · Stop". A row does not show last run time, next run time or last result.
- Editor (header "Routine"): switch "Active", button "Test run" (disabled until saved; tooltip "Save the routine first"), "Delete", fields "Name" and "Instruction", picker "Add a skill", a "Advanced" button (Time zone, Model, Thinking), a "When to run" section, button "Choose when it runs", then "Save" (becomes "Saved").
- "Choose when it runs" menu: Every hour, Every day, Weekdays, Every week, Every month on the 1st, Interval, Advanced..., and a submenu "From another app (advanced)" with "Git event" and "Webhook". "Slack message" appears when a provider is connected.
- Webhook card "When a webhook fires": "POST to", "key", "header", "Rotate key", "Remove webhook". Before saving it shows "Available after the routine is saved". After saving the key is hidden: "Saved. Rotate to reveal."
- A schedule row has "How often", "Time of day" and "Remove schedule". Under it: "Next run <time>".
- "Run history" section (collapsed), buttons "Refresh", "Load older runs"; empty text "No runs yet"; error "Could not load run history"; per run "View chat" when a message exists, "Waiting on <bot>" when handed to another bot.
- Screenshots (scratch): `routines-list.png`, `routine-edit.png`, `routine-trigger-menu.png`, `routine-webhook.png`, `routine-history.png` under the scratch folder `ux-shots/watchers/`.

### Real versus missing (summary)

| Capability | Status |
| --- | --- |
| Cron-based routines, pause, delete, test run, run history | Real |
| Webhook and GitHub triggers on a routine | Real (webhook wakes the bot's chat thread) |
| Bot tools to create/list/cancel/update/inspect schedules | Real |
| Silent finish when nothing to report | Real, but model-dependent and costs a model run per wake |
| Poll a URL or a connector and wake only on change | Missing |
| Fingerprint, snapshot, diff, debounce, threshold | Missing |
| Per-source failure counting, backoff, auto-pause with notice | Missing |
| Last checked / last changed in the list | Missing |
| Read-only guarantee for scheduled routine runs | Missing (only `trigger === "webhook"` is restricted) |
| Minimum interval above 1 minute, per-space cap on routines | Missing (no cap found in `router.ts` or `schedule-tools.ts`) |
| Overlap guard for ordinary routines | Missing (only GTM and Legal) |

## Current stories

Common preconditions: demo stack web `http://127.0.0.1:5377`, signed in with the seeded demo founder, bot "Chief" open at `/app/<botId>`. The demo seeds one routine, "Morning briefing" (Weekdays at 8:00 AM, Active).

## WATCHERS-C1: See the routines a bot runs

**Type**: short
**Topic**: Watchers on routines
**Persona**: Founder who set up a daily briefing and wants to confirm it is still on
**Goal**: Find out which routines Chief has and whether each is active
**Preconditions**: At least one routine exists
**Ideal path**: 2 (open the panel, read the list)
**Alternate paths**: Deep link `?routine=<id>`; chat search hit with a routine id (`Shell.tsx:572`); ask Chief "what schedules do you have?" (`schedule_list`)

### Steps
1. Click the header button "Computer and routines" → right panel shows heading "Routines", the subtitle and "Create a routine".
2. Read the row "Morning briefing" → subtitle "Weekdays at 8:00 AM"; the green clock icon means active.

### Variations
- Paused routine: row shows a pause icon and the text "Paused".
- Routine running now: row shows "Running · Stop".

### Edge Cases
- Bot has no routines: only the header and button show; there is no empty-state text.
- Group chat: the list is empty (`activeRoutines` is empty when `inGroup`).
- The row does not show last run, next run or last result. The user must open the routine to see "Next run" or "Run history".

## WATCHERS-C2: Create a scheduled routine

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder who wants a Monday cash summary
**Goal**: Save a routine that runs every Monday at 9:00 AM
**Preconditions**: Bot open, panel showing "Routines"
**Ideal path**: 5 (create, name, instruction, pick schedule, save)
**Alternate paths**: Ask the bot in chat to schedule it (`schedule_create`, shows an approval card); type `/` skill in the instruction

### Steps
1. Click "Create a routine" → editor "Routine" opens with "Active" on and "Save" disabled.
2. Fill "Name" with "Cash check" and "Instruction" with the work to do → "Save" enables.
3. Click "Choose when it runs" and pick "Every week" → a schedule row with "How often" and "Time of day" appears, plus "Next run <time>".
4. Set "Time of day" → "Next run" updates.
5. Click "Save" → button shows "Saved"; the list row shows the new summary; "Test run" becomes enabled.

### Variations
- Pick "Interval" to repeat every N minutes, hours or days.
- Use "Add a skill" to prefix the instruction with an `@skill` mention.
- Open "Advanced" to set Time zone, Model and Thinking for this routine only.

### Edge Cases
- Save with no trigger: the API rejects a routine with no schedule, webhook, Git event or message trigger, message "Add a schedule, webhook, GitHub, or message trigger" (`apps/api/src/router.ts:4216` on update; create is checked by the contract schema, `packages/contracts/src/rpc.ts:870`).
- Empty name: saved as "Routine" (`Shell.tsx` fallback).
- A one-time schedule cannot be armed from the editor unless it was created from chat; the editor shows "Run at" and "Run time must be in the future." for that case.

## WATCHERS-C3: Pause, test and delete a routine

**Type**: short
**Topic**: Watchers on routines
**Persona**: Founder who got a noisy routine
**Goal**: Stop it from running, check what it would do, remove it if needed
**Preconditions**: A saved routine
**Ideal path**: 2 for pause (open, switch off Active); 2 for test run
**Alternate paths**: Ask the bot to cancel it (`schedule_cancel`) or pause it (`schedule_update` with `enabled: false`)

### Steps
1. Click a routine row → editor opens.
2. Turn "Active" off and click "Save" → row summary becomes "Paused"; `nextRunAt` is cleared.
3. Click "Test run" → a run starts now in the bot's chat and posts its result there. The instruction gets a suffix telling the bot this is a test and not to change schedules (`router.ts:4377`).
4. Click "Delete" → routine is removed from the list.

### Variations
- A row showing "Running · Stop" can be stopped from the list.

### Edge Cases
- Test run is disabled for an unsaved routine.
- Test run does not honor "wake only on change"; it always does the work once.
- Test run output goes to the main chat even for a routine that normally posts into a group.

## WATCHERS-C4: Wake a bot from another app with a webhook

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder with a billing tool that can call a URL
**Goal**: Have a routine run when the billing tool posts an event
**Preconditions**: Saved or new routine; a tool that can send an HTTP POST with a bearer header
**Ideal path**: 4 (add Webhook, save, copy URL and key, paste into the other tool)
**Alternate paths**: "Git event" for GitHub (signed with the shared secret); Slack or Teams message trigger

### Steps
1. Open a routine and click "Choose when it runs" → menu.
2. Open "From another app (advanced)" and pick "Webhook" → card "When a webhook fires" shows "POST to", "key" and "header", all "Available after the routine is saved".
3. Click "Save" → URL and the one-time key are revealed; afterwards the key shows "Saved. Rotate to reveal."
4. Send `POST /api/v1/bots/<botId>/webhook` with `Authorization: Bearer <key>` and a JSON body → the bot wakes in its main chat with the payload shown as an inbound event, and the routine instruction is attached.
5. Click "Rotate key" to replace a leaked key → old key returns 401.

### Variations
- Add an `Idempotency-Key` header (or `id` / `event_id` in the body) so a retried delivery does not run twice.

### Edge Cases
- Payload over 64 KB: 413.
- Wrong or missing key: the same 401 for every case, so bot ids cannot be probed.
- Webhook-triggered runs are limited: connector writes and non-listed built-in tools ask for approval.
- Every delivery wakes the model, whether or not anything meaningful changed. The routine cannot filter on content before the model runs.

## WATCHERS-C5: Read what a routine did

**Type**: short
**Topic**: Watchers on routines
**Persona**: Founder checking whether last night's routine did anything
**Goal**: See past runs and open the one that produced a message
**Preconditions**: A routine that has run at least once
**Ideal path**: 3 (open routine, expand Run history, open the run)
**Alternate paths**: Scroll the bot chat for the message; notification surfaces for `notify_user` output; ask the bot `schedule_runs`

### Steps
1. Open the routine from the list → editor opens.
2. Click "Run history" → section expands; empty text is "No runs yet".
3. Pick a run with a "View chat" link → the chat opens at that run's message.
4. Click "Load older runs" for more than 20.

### Variations
- A run that handed work to another bot shows "Waiting on <bot>".

### Edge Cases
- A silent run (final reply `NO_RESPONSE`) has no "View chat" link, so the user cannot tell "checked, nothing new" from "did not run" other than by the run row itself. Rows do not say why a run was quiet.
- Load failure shows "Could not load run history" with "Refresh".

## WATCHERS-C6: Ask a bot to schedule a check from chat

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder who prefers to talk to Chief
**Goal**: Get a daily check set up without opening the editor
**Preconditions**: Owner chat (not a group); a configured model provider. In the demo stack the model may be a mock, so confirm the approval card appears before relying on this story.
**Ideal path**: 3 (ask, review card, approve)
**Alternate paths**: Create it in the editor (WATCHERS-C2)

### Steps
1. Type "Check the competitor pricing page every morning and tell me if it changes" in the composer → Chief calls `schedule_create` with a cron or `every`/`unit`.
2. An approval card appears for a repeating schedule, showing when it runs and "posts here", with Details (time zone, next run, prompt).
3. Approve → routine is created, active, and appears in the "Routines" list; a `routine.created` event shows in the thread.

### Variations
- "Remind me in 20 minutes" creates a one-shot and does not ask for approval.
- "Pause the pricing check" uses `schedule_update` with `enabled: false`; changing the prompt of a repeating routine asks again.

### Edge Cases
- The prompt is checked only for a stop rule through system guidance ("Every routine prompt you write must say when to stop", `executor.ts:8738`); nothing enforces it.
- A routine run cannot create further schedules.
- The check is a plain prompt. Every morning the model runs, fetches and compares from memory; nothing is stored between runs except what the bot writes to memory or notes.

## Future stories

Persona for all: a startup founder using Praci. The designs reuse the routine list, the `RoutineEditor` card pattern ("When a webhook fires" card), `RoutineRunHistory`, the approval card, `notify_user` and silent replies. Each story states the benefit, the ideal path and the main risks.

## WATCHERS-F1: Watch a web page and hear only when it changes

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder watching a competitor's pricing page
**Goal**: Be told when the pricing page changes, and stay unbothered otherwise
**Why the user cares**: They stop re-checking the page by hand and stop reading "no change" messages.
**Preconditions**: A bot; no routine yet
**Ideal path**: 4 (Create a routine, choose "Watch a page", paste URL, Save)
**Alternate paths**: Ask Chief in chat (`watch_create`, approval card); today: a daily routine with a "stay silent if unchanged" prompt (WATCHERS-C6), which costs a model run per check

### Steps
1. Click "Create a routine" → editor opens.
2. Click "Choose when it runs", open "From another app (advanced)" or a new "Watch" entry, pick "Web page" → a card appears with fields URL, optional "Only this part" selector, and "Check every" (default 1 hour, minimum 5 minutes).
3. Write the Instruction ("Tell me what changed in the plans and prices") → Save.
4. The worker fetches the page without a model, stores a fingerprint and a small snapshot, and does nothing else.
5. When the page changes, the bot wakes once with a short before and after, summarizes it in the chat and notifies the founder. If it does not change, no run, no message, no notification.
6. The list row shows "Checked 10 min ago · Changed 3 days ago".

### Variations
- "Ignore" pattern for dates or counters that change every load.
- Numeric threshold ("only when the price is below 50").
- Debounce: wake only after the change has held for N checks.

### Edge Cases and risks
- Noise: pages with rotating ads or timestamps would wake the bot every check. Mitigation: selector, ignore pattern, debounce, and a visible "changed N times today" count with an auto-pause suggestion.
- Safety: the fetch must use `assertSafeWebUrl` / `fetchSafeWebText` (`packages/adapters/src/web-ssrf.ts`). The fetched text is untrusted and must be fenced like webhook payloads (`formatUntrustedDeliveryPayload`).
- Cost: a probe is cheap and model-free; only changes spend model tokens. A per-space cap on watches is needed because there is no routine cap today.
- Page needs login: first version fails clearly ("Needs a sign-in. Use a connected app instead.") instead of guessing.

## WATCHERS-F2: Watch a connected app and wake on a new item

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder who wants to know when a new payment above a limit hits Mercury, or a new investor reply lands
**Goal**: Wake the finance bot only when a read-only query returns something new
**Why the user cares**: They get one clear alert for real events instead of a daily summary full of "nothing new".
**Preconditions**: A connected app with a read tool (for example a list-transactions call)
**Ideal path**: 5 (Create a routine, pick "Connected app", choose the read tool, set filters, Save)
**Alternate paths**: Existing push sources (Gmail push for mail sync, webhooks) where the app supports them; prefer these because they cost nothing between events

### Steps
1. Create a routine, choose "Watch" then "Connected app" → picker lists only tools that need no approval (`connectorToolRequiresApproval(...) === false`, `packages/core/src/action-approval.ts:115`).
2. Choose a read tool and fill its arguments in a form built from its schema → Save.
3. Every interval the worker calls the tool with the saved credentials, compares the result to the last one and stores the new fingerprint.
4. On a new or changed item, the bot wakes with the new items and answers in the chat; the founder gets a notification.

### Variations
- "Only items where amount is over X".
- "First check records the current state silently" so existing items do not all fire at once.

### Edge Cases and risks
- Safety: a write tool must never be pickable. The unattended run keeps the webhook-style rule: reads and `UNATTENDED_SAFE_BUILTIN_TOOLS` only; anything else becomes a pending approval.
- Noise: a list that reorders would look like a change; compare by item id, not by text.
- Provider limits: polling every 5 minutes for many users can hit rate limits. A per-connection cap and backoff are required.
- Connection expired: after N failures the watch pauses and the founder sees "Mercury needs to be reconnected".

## WATCHERS-F3: Let the bot set up a watch from chat

**Type**: short
**Topic**: Watchers on routines
**Persona**: Founder who thinks in sentences
**Goal**: Say "tell me when the Series A term sheet doc is edited" and have it set up
**Why the user cares**: They do not have to learn a settings screen for a one-line request.
**Preconditions**: Owner chat; a document connector
**Ideal path**: 2 (ask, approve the card)
**Alternate paths**: The editor (WATCHERS-F1, F2)

### Steps
1. Type the request → Chief proposes the watch with tools `watch_create` (and `watch_list`, `watch_update`, `watch_cancel`), alongside the existing `schedule_*` tools.
2. An approval card, in the same shape as the schedule card, says what is checked, how often, and "tells you only when it changes" → Approve.
3. The watch appears in the "Routines" list with its type.

### Variations
- "Stop watching the pricing page" cancels it.
- "Check it more often" asks again when the interval drops below the previous one.

### Edge Cases and risks
- Safety: like `schedule_create`, a watch must only be creatable in an owner-started run; a watch-triggered run must not create new watches (same rule as `filterBuiltinToolsForRun`, `schedule-tools.ts:27`). Otherwise injected page text could create more checks.
- Noise: the model might pick a 5-minute interval for everything. The card shows the interval and the default suggestion is hourly.

## WATCHERS-F4: See at a glance what each watch is doing

**Type**: short
**Topic**: Watchers on routines
**Persona**: Founder with six routines and watches across two bots
**Goal**: Tell which ones are healthy, which are quiet, and which are broken
**Why the user cares**: A silent bot should read as "checking, nothing new", not as "broken".
**Preconditions**: At least one watch
**Ideal path**: 1 (open the panel; the row shows it)
**Alternate paths**: Open "Run history" on a routine (WATCHERS-C5)

### Steps
1. Open "Computer and routines" → each row keeps its name and trigger summary and adds a type badge ("Schedule", "Webhook", "Watch") and a second line "Checked 4 min ago · Changed yesterday".
2. A failing watch shows "Can't reach the page. Retrying." and, after repeated failures, "Paused after 5 failed checks" with a button to retry.
3. Open the row → the editor adds a "Checks" section next to "Run history" with last result per check ("Unchanged", "Changed", "Failed").

### Variations
- Show the last diff the bot saw, truncated, so the user can judge whether the wake was warranted.

### Edge Cases and risks
- Noise: a "Checks" log of every no-change check can grow without bound. Keep counts and only the latest few entries, never one row per check.
- The list today has no last-run line (WATCHERS-C1 edge case); fixing that for schedules helps both types.
- Mobile: `apps/mobile/app/routine.tsx` needs the same status line, using the existing native list style.

## WATCHERS-F5: A noisy watch turns itself down

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder whose price-page watch woke the bot six times in one day
**Goal**: Stop the noise without losing real changes
**Why the user cares**: They keep trusting alerts because the system does not flood them.
**Preconditions**: A watch that changed many times
**Ideal path**: 2 (read the suggestion, accept it)
**Alternate paths**: Pause the routine manually (WATCHERS-C3)

### Steps
1. After a watch wakes the bot more than a set number of times in a day, the bot's next message adds one line: "This changed 6 times today. Want me to check daily instead?" with the existing approval-card buttons.
2. Accept → interval becomes daily and a short note is added to the routine history.
3. Decline → the watch stays; the same suggestion is not repeated for a week.

### Variations
- A hard daily wake cap per watch and per space; when reached, further changes are batched into one digest at the next interval.

### Edge Cases and risks
- Silent loss: a cap must never discard changes. Batch them and say "3 more changes were folded in".
- Cost: a per-space monthly cap on watch-triggered runs, with a clear message when it is reached.

## WATCHERS-F6: A watch never does more than look

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder who is afraid a page or email could trick the bot into sending something
**Goal**: Know that a watch-triggered run cannot send mail, post, pay or edit without asking
**Why the user cares**: They can leave watches running overnight without checking on the bot.
**Preconditions**: A watch whose instruction says "and reply to the sender"
**Ideal path**: 1 (the approval appears; the user does nothing until they choose)
**Alternate paths**: Webhook runs already behave this way for connectors and non-listed tools (`action-approval.ts:140`)

### Steps
1. The watched source changes and the bot wakes.
2. The bot reads the change and drafts a reply. When it tries to send, an approval card appears in the chat and a notification says "Chief needs your OK". Nothing is sent.
3. The founder opens the card, sees what would be sent and why, and approves or declines.

### Variations
- The user can allow a specific safe action for a specific watch (for example "save a draft") through the existing approval rules.

### Edge Cases and risks
- Today a `trigger: "routine"` run has full owner tools (`mail-tools.ts:176`); the watch trigger must not copy that. The rule belongs with whatever defines "unattended" for the whole feature, not in the watcher alone.
- The approval can wait a long time. The request needs a reminder and an expiry so it does not sit forever.
- Watched content is untrusted. It should be fenced with the same notice other external text gets (`externalOriginNotice`, `packages/core/src/bot-messages.ts:207`).

## WATCHERS-F7: Wake on a push event instead of polling

**Type**: medium
**Topic**: Watchers on routines
**Persona**: Founder with GitHub releases and Stripe events
**Goal**: React the moment something happens, without polling
**Why the user cares**: They hear sooner and the system does less work.
**Preconditions**: Webhook or Git event trigger set up (WATCHERS-C4)
**Ideal path**: 3 (existing flow plus one filter field)
**Alternate paths**: A polling watch as fallback when the source offers no webhook

### Steps
1. Open a routine with "When a webhook fires" or "Git event".
2. Add a filter: "Only when `action` is `published`" or "Only for `release` events".
3. Save. Deliveries that do not match return `200` with `ignored: true` (as the Git route does when no routine matches, `github-webhook.ts:218`) and never wake the model.

### Variations
- A per-routine sample payload shown after the first delivery so the user can pick the field to filter on.

### Edge Cases and risks
- Today the webhook route always wakes the bot, even when no routine has `webhookEnabled` (`webhook-inbound.ts:282`). Filtering without fixing that would still let unmatched payloads through.
- Only 5 routines are attached per delivery (`take: 5`). Beyond that some routines silently do not run.
- Duplicates: deliveries are de-duplicated by key; a filter must not break that.

## WATCHERS-F8: Mobile and desktop see the same watches

**Type**: short
**Topic**: Watchers on routines
**Persona**: Founder who checks Praci from a phone between meetings
**Goal**: See which watches exist, pause one, and read what a change was
**Why the user cares**: They can stop a noisy watch from anywhere.
**Preconditions**: A watch created on web
**Ideal path**: 3 (open bot, open routine, switch off Active)
**Alternate paths**: Ask the bot to pause it from chat

### Steps
1. On mobile, open the bot and open the routine (`apps/mobile/app/routine.tsx`).
2. Read the same summary line ("Checked ... · Changed ...") and the last change.
3. Pause or resume it.

### Variations
- Creating a watch on mobile is out of scope for the first version; use chat on mobile.

### Edge Cases and risks
- Electron hosts the web UI, so web changes cover it. Mobile needs its own status line and pause control; today it is read oriented.

## PRD corrections

Each item states what the draft says, what the code shows, and the source.

1. **Where routines live in the UI.** The draft says "next to Routines in bot settings". Routines are in the right panel of the bot chat, opened by the header button named "Computer and routines" (`apps/web/src/pages/Shell.tsx:5224-5253`, panel value `computer`), not in settings. A new watch list belongs in that panel. There is no per-routine route; a deep link is `?routine=<id>` (`Shell.tsx:2520`).
2. **Rows already have a trigger summary, not a type badge.** `routineTriggerSummary` already prints "When a webhook fires", "Git event", "Slack message" and cron text (`RoutineEditor.tsx:142-152`). The draft's "one list with type badge" can extend this. The row has no last run or next run line; the draft's "last checked, last changed" needs the list to gain a second line for all types.
3. **`routineWakeupJob` location.** The draft puts it in `executor.ts`. It is defined in `packages/adapter-kit/src/background-jobs.ts:217`, with its handler in `packages/adapters/src/background-job-handlers.ts:154`. `executor.ts` only imports it (line 38) and `wakeRoutine` is at `executor.ts:1200`. The draft's `watchProbeJob → routineWakeupJob` chain must say that `routineWakeupJob` is a scheduled job keyed `routine:<id>` with `availableAt`; it is not an "immediate wake" function, and reusing it for a change wake would replace the queued timed wake because they share one replace key.
4. **`wakeup.ts` role.** `packages/adapters/src/wakeup.ts` holds the Graphile queue publisher, the in-memory test queue and `RECURRING_JOBS` (line 94), which is a short list of fixed system ticks. It does not contain routine wake logic. A `watch.probe` tick would be a new entry there or a per-routine job like `routineWakeupJob`; the draft does not choose.
5. **Gmail push and ticket wake are not routine wake paths.** `gmail-push.ts` wakes mail sync (`wakeMailConnections`, line 294). `ticket-wake.ts` creates its own Task and Run with `trigger: "tickets"`. Neither fires a `Routine`. Only `webhook-inbound.ts`, `github-webhook.ts`, `messaging-inbound.ts` and cron wake reach routines.
6. **`release-watch.ts` is an eval helper.** Its header says it supports the release-watch routine evaluation; it has no polling and no state. It should not be listed as a wake path.
7. **Missing trigger: messaging.** The draft lists crons, `webhookEnabled`, `githubEnabled`. `Routine.messageProvider` is also a trigger (Slack, Teams or other) with UI "Slack message" (`schema.prisma:929`, `RoutineEditor.tsx:147-149`).
8. **Missing trigger: one-shot.** `@once` routines exist and can be created from chat only (`router.ts:4112-4116`; `schedule-tools.ts` exports `ONCE_ROUTINE_CRON`). The draft's `trigger cron|watch` column must coexist with `crons`, `webhookEnabled`, `githubEnabled` and `messageProvider`; a routine can have several triggers at once (`routineTriggerSummary` joins them). A single `trigger` enum would remove that.
9. **Existing "wake only when there is work" precedent.** `wakeRoutine` already returns `"no-work"` and `"active-run"` before any model call for the GTM agent (`executor.ts:1280-1291, 1342`) and single-flights the Legal agent (`executor.ts:1294`). The draft says no generic primitive exists, which is true, but the claim "no model-free pre-check" is not: the pre-check pattern exists for these two agents and should be reused as the model.
10. **Minimum interval.** The draft says "Min interval 5 min". The existing minimum for schedules is 1 minute (`schedule-tools.ts:197`, error "minimum interval is 1 minute"). The 5-minute rule is new and would apply only to watches unless schedules change too. No per-space or per-bot routine count cap exists (none found in `router.ts` or `schedule-tools.ts`), so "per-bot/per-space caps" are new.
11. **Webhook wake is not routine-bound and posts into chat.** The draft treats webhook as a routine trigger. The webhook route wakes the bot even when no routine has `webhookEnabled` (`webhook-inbound.ts:282`), posts the payload as a user message in the main chat thread with `trigger: "webhook"`, and inlines at most 5 routines (`take: 5`). The GitHub route ignores deliveries with no matching routine (`github-webhook.ts:218`). The draft's "No chat output on no-change" does not hold for webhooks and needs a filter before the bot wakes.
12. **`unattendedTriggerToolRequiresApproval` scope.** The draft is right that it covers only `trigger === "webhook"` (`action-approval.ts:140-150`). It misses two facts. First, a `routine` run is owner-initiated (`OWNER_INITIATED_TRIGGERS`, `mail-tools.ts:176`) and gets mail, calendar and Drive tools, so scheduled routines are not read-only today. Second, `unattendedTriggerToolRequiresApproval` returns true for connector tools unless `connectorToolRequiresApproval(...) === false`; a watch run will inherit the same rule only if its trigger name is added. The Goal "Every unattended run is read-only by default" is not true now.
13. **`connector_read` probe and approval.** The draft requires `connectorToolRequiresApproval === false`. The function is `connectorToolRequiresApproval(toolName, readOnly)` at `action-approval.ts:115`. It returns true for a declared write, a mutating name, a compound action name, and any name not matching the read pattern. A tool without a declared `readOnly` and a name like `fetch_balance` is therefore treated as requiring approval, since only `get|list|search|find|read` match (`READ_ONLY_CONNECTOR_PATTERN`). Many real read tools would not be pickable unless the pattern or the declared flag is used.
14. **Secrets and origin pinning.** The draft says "saved secrets via backend injection / secret origin pinning" for the probe. Origin pinning belongs to `secret_request` in the agent tool path (docs/bot-secrets.md). A probe runs without an agent, so it needs its own injection path and the same origin and redirect rules; the draft does not say how the probe reaches a `BotSecret`. Also `webhookSecretId` is a different secret (the bot's inbound key), not a probe credential.
15. **`externalOriginNotice` is for bot messages.** `externalOriginNotice(name?)` is in `packages/core/src/bot-messages.ts:207` and is used for messages from external agents. For watched content the existing pattern is `formatUntrustedDeliveryPayload` (`apps/api/src/webhook-inbound.ts:57`), which fences data and tells the model not to follow it. The draft should name that function, and note it lives in `apps/api`, so a worker in `packages/adapters` cannot import it without moving it.
16. **Silent runs already exist.** The draft's goal of "no chat output on no-change" is partly met: routines can end with `NO_RESPONSE` (`silent-reply.ts`, `executor.ts:9270`). That still costs one model run per check. The new primitive's value is skipping the model, not skipping the message. The draft should say so and measure it.
17. **`notify` is hidden in the web editor.** The model has `notify` (default true), and `notify_user` downgrades to `info` when false (`notify-user.ts:37-51`). The web editor always sends `notify: true` on create and never changes it (`Shell.tsx:5546`). Draft statements about notifications from watches need to decide whether "notify only on change" is this field or a new one.
18. **Run history capped at 20 per page and has no "why".** `routine-runs.ts` returns 20 per page. A no-change check would produce a run row per check if it used `Run`; for a model-free probe it should not create a `Run` at all, or the history will fill. The draft does not say whether a probe check creates a `Run`.
19. **Overlap.** Ordinary routines do not skip when a previous run is still active (only GTM and Legal). A watch that wakes the bot repeatedly while the previous run is still working needs the `"active-run"` rule applied generally. The draft does not mention overlap.
20. **Schedule creation limits.** A routine-triggered run cannot create schedules (`schedule-tools.ts:27-34`). The draft's `watch_create` tool must follow the same rule for watch-triggered runs, and creating a repeating watch should show an approval card like `scheduleApproval` (`schedule-tools.ts:585`). The draft does not mention either.
21. **Mobile.** The draft says "same behavior on web, Electron and mobile". Mobile has a routine detail screen (`apps/mobile/app/routine.tsx`) that is read oriented; its status text comes from `apps/mobile/lib/routine.ts` and lists only "Webhook" and "Git event" as trigger words. A watch would need to be added there.
22. **Design system rule.** The routines UI already has stories (`RoutineEditor.stories.tsx`, `RoutineRunHistory.stories.tsx`, `RoutineSchedule.stories.tsx`). A new watch card should be a story first, per AGENTS.md. The draft lists no component names.
