# Unattended bots: UX story catalog and recommended model

Consolidates the six feature story files in this folder, the walker reports in `docs/ux-walker/unattended/` and the flow critiques in `docs/ux-flow/unattended/`. Walks were done on 2026-10-25 on the demo stack (synthetic data, mock model, shared with other walkers). "PRD" means the original draft; `original.md:N` is the line in that draft.

Evidence limits that apply throughout:
- Several stories could not be walked because the demo model never calls the needed tool (`request_secret`, `secret_request`, `create_ui_artifact`, `notify_user`), or because another walker's pending approval blocked the shared Chief thread. These are marked "not walked" and rest on code reading only.
- Future stories (F) are proposals. None has been built or seen in a browser.
- "Must" below means must-have for v1 as judged from the flow critiques and the PRD's own Must lists. It is a recommendation for the PRD owner, not a decision.

## 1. User benefit of each feature (one sentence each)

1. Watchers: the user hears from a bot only when a page or connected app actually changed, and does not pay for or read "nothing new" messages.
2. Quiet check-ins and open items: the bot keeps track of the user's follow-ups and speaks at most once a day, and only when something needs the user.
3. Bot-built apps and tools: the user gets a dashboard they can send to an advisor by link, and a repeatable tool a bot runs the same way every week.
4. Teach by demo: the user shows a bot a chore once on its desktop and the bot can repeat it later, with the steps written in plain words and the password kept out of the skill.
5. Secrets the bot uses without seeing them: the bot can use the user's real keys and logins in unattended runs while the key never reaches the model.
6. Approvals table and read-only background runs: the user can leave bots running overnight knowing nothing is sent, spent, edited or deleted without a decision, and can see the whole safety setting in one table.

## 2. Recommended model (one coherent model for the user)

The evidence supports one model. All three flow critiques that touch scheduling (watchers, check-ins, apps) independently arrive at it, and the approvals and secrets critiques say the safety rule must be one rule, not one per feature.

**One list: Routines.** A routine is "do this, when this happens, and speak only if it matters". Its trigger is one of: schedule, webhook or Git event (exists), watch a page or connected app (new), or a daily check-in (new, created by a bot setting). There is no Watchers panel, no Check-ins list and no Apps page.
- Where: the existing "Computer and routines" panel (`RoutineEditor`, `RoutineListRow`, `RoutineRunHistory`). The "Choose when it runs" menu gains a "Watch" entry beside "On a schedule" and "From another app (advanced)".
- Kind is shown by the existing trigger summary text ("Every hour", "When a webhook fires", "Daily check-in"), not by a new badge. The watchers critique argues against a badge; the check-ins critique suggests a type label. Resolve in favour of the trigger text because `routineTriggerSummary` already does this (`RoutineEditor.tsx:142-152`) and a routine can have several triggers at once.
- Every row gets one muted status line: "Checked 4 min ago, changed yesterday" or "Last ran 8:00 AM, next Mon 8:00 AM". This fixes the missing last-run information that C1 and C5 found for plain routines too.
- A check-in is a setting in bot settings next to Notifications (Off / Daily / Every 4 hours) that creates or removes one managed routine. One scheduler, one run history.
- Quiet is one switch on the routine editor, "Only message me if something needs me", on by default for watches and check-ins. It replaces the hidden `NO_RESPONSE` word. A quiet run shows "Nothing to report" in run history and Activity and is not counted in "Finished".
- Each message a routine posts carries a small source line ("From routine: Pricing check") so the user knows why they are seeing it.

**One attention place: Activity.** Open items waiting on the user, approvals waiting, stuck runs and past-due items all appear in the existing "Needs you" group, with "Needs approval" wording. One notification path (grouped, at most one per bot per day for check-in items; fixed quiet hours 22:00-08:00 local, no settings in v1). No new Home page, no new sidebar entry. Approval cards also appear (or link) in the chat where the user typed, not only in the bot that performs the action.

**One thing a bot makes: an Artifact. One reusable tool: a skill with a script.**
- Artifacts keep holding bot-made pages and dashboards. Add a Share button to the Artifacts toolbar using `CopyLinkDialog` (view only, 30 days, link shown once, Stop sharing). Sharing is a human click; the bot gets no share tool.
- A reusable tool is a skill with one optional script and named inputs. It uses the existing skill Drafts list and Approve button, with two plain lines on the draft ("Reads: ...", "Writes: ..."). A tool run is a routine that says "run this skill".
- Pages and pins stay as they are. Do not add a BotApp object, an app data store or an Apps screen.
- Taught skills appear as a "Taught" group in Settings > Skills and in the routine's "Add a skill" picker. The routine stores a reference, not pasted text. The two backends (`rpc.skills.*` and `rpc.agentSkills.*`) stay separate.

**One safety table, one rule for background runs.**
- The Approvals table (Allow / Ask / Block, 5 rows by default, the rest under "More actions") replaces the two existing switches and sits above "AI data sharing". The per-tool rule list stays as an advanced list with human tool names. Per-bot override is a "Same as all bots" option in the same selects.
- "Unattended" is defined once: the run trigger is not a live chat turn, and unknown triggers fail closed. In an unattended run only read-only connector tools and the safe built-in list run; everything else, including `write_file`, `shell`, browser and computer actions and non-GET `secret_request`, becomes a normal approval card. Watches, check-ins, tool runs and taught skills inherit this and have no safety settings of their own.
- Remove "Always allow this tool" from cards raised by background runs, and skip Auto Review for them.
- Secrets add no approval UI of their own. The bot-level credential is the grant; the unattended rule covers writes.
- The routine "Approval boundaries" text on drafted skills is a model prompt, not a setting. Hide it until it is enforced.

Conflicts between critiques that the PRD owner should settle:
- Check-ins critique keeps `dueAt`, `waitingOn`, `resolvedReason` and drops `source` and `nextReviewAt`; PRD asks for all five (`original.md:32`). Auto-resolve on an event (CHECKINS-F6) needs `source`. Recommendation: defer auto-resolve and drop `source` with it.
- Secrets critique shows "Used 2 days ago" only and no use count; PRD asks for `useCount` (`original.md:55`). Store the count (cheap), show only last used.
- Watchers critique cuts the `command` probe and the selector, ignore, threshold and debounce options; PRD lists them (`original.md:24-25`). See also correction W-8 about connector read tools.

## 3. Feature tables

Result key: Pass, Pass with findings, Partial, Not walked (no browser evidence). "Steps" are actual versus ideal from the walker.

### 3.1 Watchers (wake only on change) on routines

Current stories (walker: 6 of 6 reach their goal):

| Story | Result | What the walk found |
|---|---|---|
| WATCHERS-C1 See the routines a bot runs | Pass (2/2) | Rows show no last run, next run or last result. Header button is icon-only at narrow widths. |
| WATCHERS-C2 Create a scheduled routine | Pass (6/5) | "Next run" appears only after Save. Save is below the fold at 577px. Schedule button stays large after one schedule is added. |
| WATCHERS-C3 Pause, test, delete | Pass | Pausing needs a Save click. Test reply looks like any bot message. Test run does not exercise "stay silent". |
| WATCHERS-C4 Wake a bot with a webhook | Pass (8/4), one P1 | Save does not reveal the key; the user must find "Rotate key". No copy button, no rotate confirmation. Deliveries are missing from Run history. Each delivery adds a long raw payload bubble to the chat. |
| WATCHERS-C5 Read what a routine did | Pass (4/3) | Run history stays "Running" until Refresh. Rows give no result summary. |
| WATCHERS-C6 Ask a bot to schedule a check | Pass (3/3) | The generated prompt posts "no change" every morning and compares against run history that holds no content. Card says "Allow once" for a recurring schedule. Buttons can fall below the composer when Details is open. |

Future stories:

| Story | Why the user cares | v1 |
|---|---|---|
| WATCHERS-F1 Watch a web page, hear only on change | They stop re-checking the page by hand and stop reading "no change" messages. | Must |
| WATCHERS-F2 Watch a connected app, wake on a new item | One clear alert for real events instead of a daily summary full of "nothing new". | Should (PRD Must; needs connector read-only classification, see W-8) |
| WATCHERS-F3 Set up a watch from chat | No settings screen to learn for a one-line request. | Must (also fixes C6) |
| WATCHERS-F4 See at a glance what each watch is doing | A silent bot reads as "checking, nothing new", not as "broken". | Must (status line on all routine rows) |
| WATCHERS-F5 A noisy watch turns itself down | They keep trusting alerts because the system does not flood them. | Fold into a fixed rule (one wake per watch per interval, changes batched); no suggestion UI |
| WATCHERS-F6 A watch never does more than look | They can leave watches running overnight. | Must, delivered by the shared unattended rule (section 3.6 F3) |
| WATCHERS-F7 Wake on a push event instead of polling | They hear sooner and the system does less work. | Cut the filter field; fix the existing bug that a webhook with no matching routine still wakes the bot |
| WATCHERS-F8 Mobile and desktop see the same watches | They can stop a noisy watch from anywhere. | Should (read, pause; no create or edit on mobile) |

Prerequisite fix before watchers copy the pattern: the webhook setup flow (C4).

### 3.2 Quiet check-ins and open items

Current stories:

| Story | Result | What the walk found |
|---|---|---|
| CHECKINS-C1 Add a to-do to open work | Pass (5/3) | Open work is hidden in Advanced. Row title wraps in the 384px panel. |
| CHECKINS-C2 Park and reopen | Pass | Emphasis flips between "Park" and "Open"; "Open" is both a status and a button label. |
| CHECKINS-C3 Complete an item | Pass | No undo, no done view, Remove sits next to Complete with no confirmation. |
| CHECKINS-C4 Silent routine run | Pass with caveats (7/4) | Quiet needs the typed word `NO_RESPONSE`. A silent run looks the same as one that spoke, in history and Activity. |
| CHECKINS-C5 Notification only when new | Not walked | Per-bot Notifications switch shows "Off in Settings" with no reason. |
| CHECKINS-C6 Stuck-work reminder | Partly walked | "Needs you" works. The 4 hour and 24 hour timers were not observable. |
| CHECKINS-C7 Bot reads open work in a routine run | Not walked | The prompt block is invisible in the UI. |

Future stories:

| Story | Why the user cares | v1 |
|---|---|---|
| CHECKINS-F1 Turn on a quiet check-in for one bot | She stops being the scheduler for her own follow-ups. | Must (one select creating a managed routine) |
| CHECKINS-F2 Record who an item waits on | She can tell "stuck on me" from "stuck on them" without reading each note. | Must (`dueAt` and `waitingOn`, set by the bot) |
| CHECKINS-F3 Check-in leads with the one thing she needs to decide | She acts in thirty seconds instead of scanning a status report. | Must (prompt behaviour, no UI) |
| CHECKINS-F4 Daily message budget and quiet hours | She keeps the check-ins because they never wake her. | Must as a fixed rule, no settings |
| CHECKINS-F5 See every open item across all bots | Nothing slips because it was parked in a bot she forgot. | Should (new group in Activity, needs a space-wide list API) |
| CHECKINS-F6 Close an item automatically when its event happens | The list stays accurate without ticking boxes. | Defer auto-resolve; do build the Done view with Reopen and an undo toast now |
| CHECKINS-F7 A late deadline reaches me with check-ins off | A missed deadline is the one thing she wants an interruption for. | Must |
| CHECKINS-F8 Hand an item to another bot | The item is owned by the bot that can do it. | Defer (chat covers it) |
| CHECKINS-F9 Set up a check-in during onboarding | Value from day one without configuring anything. | Defer |

### 3.3 Bot-built apps and tools (shareable by link, runnable by agents)

Current stories (walker: 6 of 8 pass, 1 partial, 1 not walkable):

| Story | Result | What the walk found |
|---|---|---|
| APPS-C1 Open a bot-made HTML dashboard | Pass (3/2) | No Share, Copy link or Run control anywhere on an artifact. White page on a dark app. |
| APPS-C2 Compare versions, delete | Pass | Row says v2 while v1 is shown; no restore. Delete text is clear. |
| APPS-C3 Ask a bot for a dashboard | Fail (not walkable) | Demo model did not call `create_ui_artifact`; request buried in other walkers' webhook runs. |
| APPS-C4 Ongoing summary on the bot Page | Partial (could not reach) | No bot had a Page, and nothing tells a first-time user a bot can have one. |
| APPS-C5 Numbers strip and list | Pass, model run not instant | Refresh is an unlabeled icon, took about 40 s, and has no last-updated time. List add was not confirmed. |
| APPS-C6 Give bots a tool via custom connection | Pass with differences | Dialog shows only Server URL; Advanced is jargon. The only "give a bot a tool" entry assumes someone else runs a server. |
| APPS-C7 Approve a skill the bot wrote | Pass (empty state only) | Approve and Discard not seen. Skills have no inputs, no test, no run history. |
| APPS-C8 Send an investor an outside link | Pass with one difference | Landing page is a bare "Open" with no sender. Revoke has no confirmation. Dialog does not say "shown once". |

Future stories:

| Story | Why the user cares | v1 |
|---|---|---|
| APPS-F1 Ask for a reusable tool, not just a page | The same shape of answer every week without re-explaining it. | Must (skill with a script) |
| APPS-F2 A saved tool runs on a schedule and stays quiet | She hears from the bot when something changed, not every week. | Must (uses the shared quiet routine rule) |
| APPS-F3 Share a dashboard with an advisor by link, view only | Dana sees live numbers in one click and Maya keeps control of who sees what and for how long. | Must (static, 30 days, show once, Stop sharing) |
| APPS-F4 An outside person fills in a form and the bot reacts | She stops chasing people by email. | Cut (needs public write API, store, abuse handling) |
| APPS-F5 Update an app safely, with a way back | A bot's edit cannot break the page Dana relies on. | Must (link stays on shared version; "Update link"; "Restore this version") |
| APPS-F6 A tool breaks and tells Maya once | Her Monday routine does not silently produce empty or wrong numbers. | Should (reuse failed-run notification and routine pause) |
| APPS-F7 One bot uses a tool another bot saved | She builds each thing once. | Should ("Copy to another bot" creating a draft) |
| APPS-F8 Check what a tool can do before it runs unattended | She trusts it enough to leave it alone. | Must as the two-line "Reads / Writes" on the draft; enforcement is the shared unattended rule |
| APPS-F9 Retire an app and every link to it | Nothing she thought was gone keeps running or stays readable. | Must when F3 ships (one clause in the delete dialog) |

### 3.4 Teach by demo

Current stories:

| Story | Result | What the walk found |
|---|---|---|
| TEACHING-C1 Start recording | Pass (5/3) | Entry is only inside the computer window. No recording indicator. Dock hidden during recording. |
| TEACHING-C2 Demonstrate, protected input | Pass with findings | No sign that anything was recorded. Typed password on screen is stored in plain text (code-verified). |
| TEACHING-C3 Stop, review, save | Pass with findings, one P1 | "How to check" copied the Protected input text in the demo (P1, needs a real-desktop check). Steps are coordinates. 8 text fields; Save below the fold. |
| TEACHING-C4 Test | Not confirmed | A run starts but the card shows no result. |
| TEACHING-C5 Run by name | Not walked | Blocked by another walker's pending approval. |
| TEACHING-C6 Add to routine | Pass with findings, one P1 | Pastes the playbook as text; the routine picker does not know taught skills; nothing says it will click and type unattended with no approval step (P1). |
| TEACHING-C7 Recover an interrupted recording | Pass with findings | With the window closed there is no Stop control, only a small red line and a disabled composer. |

Future stories:

| Story | Why the user cares | v1 |
|---|---|---|
| TEACHING-F1 Teach a chore spanning browser, desktop app and files | She teaches the whole chore as she does it, not only the browser part. | Must (user addition; backend adds window, command and file events; stop hiding the dock) |
| TEACHING-F2 Review steps in words with small pictures | He can check the skill in 30 seconds and fix a wrong step by reading. | Must (and cut the card to Name, Steps, Save plus a "More" disclosure) |
| TEACHING-F3 A password is offered as a saved secret | She never retypes the password and it never appears in the skill text. | Must as redaction (P1 safety fix); the "Save as secret" offer follows |
| TEACHING-F4 "Try it now" with live view and stops at risky steps | She sees the bot get it right, or sees where it goes wrong, before it runs alone. | Should (show "Worked" or "Stopped at step N" on the card) |
| TEACHING-F5 Find, rename, copy, delete taught skills in one list | He can tidy and trust skills without scrolling old threads. | Must (Taught group in Settings > Skills; delete only) |
| TEACHING-F6 A taught skill runs on a schedule and tells her only when it matters | She gets the finished file or one clear problem, and nothing is sent or deleted behind her back. | Must (routine stores a reference; approvals gate applies) |
| TEACHING-F7 Teach once more and keep the earlier version | She can fix the skill in minutes and roll back. | Defer |
| TEACHING-F8 When the skill breaks, say which step and ask | He sees "Stopped at step 4: the Export button is not on the screen". | Should (one line, reuse run card and notification) |
| TEACHING-F9 Cancel a recording and keep nothing | She can demonstrate freely because a mistake leaves nothing behind. | Must (also the fix for C7) |

### 3.5 Secrets the bot uses without seeing them

Current stories (walker: C1, C2, C6, C7 passed; C3, C4, C5 not walked):

| Story | Result | What the walk found |
|---|---|---|
| SECRETS-C1 Open saved credentials | Pass with friction (4 actions plus scroll, ideal 2) | Credentials is the last item inside collapsed Advanced. The Advanced row does not appear as a button in the accessibility snapshot. |
| SECRETS-C2 Add a bearer token | Pass (6/6) | Save is disabled with no reason; Site has no HTTPS hint; nothing says the token only goes to that site. |
| SECRETS-C3 Answer a protected card | Not walked | Code and e2e only (`apps/web/e2e/secret-card.spec.ts`). |
| SECRETS-C4 Save a website login, bot signs in | Not walked | Same. |
| SECRETS-C5 Approve an authenticated request | Not walked | Same. |
| SECRETS-C6 Replace or remove | Pass | No confirmation after Replace on the same day. Remove copy does not mention routines. |
| SECRETS-C7 Command variable | Pass | Helper says "available to", not "visible to"; a founder can read it as safe injection. |

Future stories:

| Story | Why the user cares | v1 |
|---|---|---|
| SECRETS-F1 A scheduled bot calls an authenticated API while I sleep | The job gets done with the real key without me there and without the key reaching the model. | Must (GET to the saved origin runs; other methods ask; via the shared unattended rule) |
| SECRETS-F2 Know when a secret was last used | I can tell which credentials are dead weight and remove the right one. | Must (one muted "Used 2 days ago" line) |
| SECRETS-F3 See what a bot did with a credential | I can audit unattended activity without reading every run. | Defer the screen; storing the event is optional |
| SECRETS-F4 Share one key across my bots | I do not paste the same key into four bots, and rotating is one action. | Defer (changes the unique key; second store has different security) |
| SECRETS-F5 Manage secrets on my phone | When a key is exposed I can cut off bots immediately. | Should (remove only) |
| SECRETS-F6 A login that expires tells me | Unattended bots stop failing silently. | Should (reuse the "Needs attention" row and one message with Replace value) |
| SECRETS-F7 Know which values a shell command can read | I do not store a high-value key where the bot's code can print it. | Must (one sentence: "The bot can read this value.") |
| SECRETS-F8 Teach a bot a task that needs a password | The taught skill signs in later without my password living in the recording. | Must together with TEACHING-F3 |
| SECRETS-F9 See where secrets are stored | A self-hoster can check the setting is in effect. | Cut (deployment fact) |

Also must-have though not an F story: make Credentials findable (C1) and explain the disabled Save (C2).

### 3.6 Approvals table and read-only unattended runs

Current stories:

| Story | Result | What the walk found |
|---|---|---|
| APPROVALS-C1 Find where approvals are managed | Pass (4/4) | Section is named "Action confirmations" under "Privacy and approvals", below "AI data sharing" and below the fold at 577px. |
| APPROVALS-C2 Turn off the purchase confirmation | Pass with findings | Nothing says "off" does not mean "never ask". Only two switches exist (email, purchases). |
| APPROVALS-C3 Approve a bot's action once | Partial | The card appeared in another bot's chat (Inbox agent), not where the user typed. The card is a mail composer, not "Allow once / Always / Deny". The consent card uses "Allow / Not now". |
| APPROVALS-C4 Deny an action | Partial | "Discard" walked; "Deny" card not seen. Different words for one decision. |
| APPROVALS-C5 Always allow a tool, then undo | Not walked | The mail card has no "Always allow this tool". |
| APPROVALS-C6 A webhook routine cannot act without her | Not walked | Only the trigger menu was inspected. Nothing in the routine editor says what a background run may do. |

Future stories:

| Story | Why the user cares | v1 |
|---|---|---|
| APPROVALS-F1 See and edit every action type in one table | She can see the whole safety setting at a glance instead of finding out when a bot sends something. | Must (5 rows visible, rest under "More actions") |
| APPROVALS-F2 Block an action for one bot | She can trust a bot with access to her mail without worrying it will send. | Must ("Same as all bots" select option) |
| APPROVALS-F3 Background runs of any kind are read-only | She can leave routines running overnight knowing nothing is sent or changed without her. | Must (one definition of unattended, fail closed) |
| APPROVALS-F4 Hear about an approval that is waiting | A missed approval silently stalls work, and an old one should not fire a day later. | Should (one reminder at 4 h, expiry at 24 h) |
| APPROVALS-F5 Know why a card appeared | She can tell a rule from a default from a background restriction. | Should (one line, only for background or rule-caused cards) |
| APPROVALS-F6 Auto Review as an opt-in switch for attended work | Fewer cards in live chat. | Defer the switch; skip Auto Review in unattended runs in code |
| APPROVALS-F7 Allow an action for one routine only | Useful automation without loosening every background run. | Defer |
| APPROVALS-F8 Review what a background run tried to do | She can trust the quiet by checking one list. | Should (fix "Needs approval" wording in Activity; record decisions in run events) |

### 3.7 Must-have for v1, summary

- Approvals: F1, F2, F3. These are the dependency for everything else, matching PRD phase 1 (`original.md:69`).
- Watchers: webhook setup fix, F1, F3, F4, F6.
- Check-ins: F1, F2, F3, F4 (fixed), F7, plus the Done view with undo and moving Open work out of Advanced.
- Secrets: findable Credentials, F1, F2, F7, and F8 with TEACHING-F3.
- Teaching: F1, F2, F3 (redaction), F5, F6, F9.
- Apps: F1, F2, F3, F5, F8, F9.

## 4. Redundancy across features

| Overlap | Evidence | Recommendation |
|---|---|---|
| Watchers vs routines vs check-ins vs open items vs notifications | A check-in is a routine that may say nothing; a watch is a routine that wakes only on change; both reuse the editor, list and run history. `Routine.notify` is hidden in the web editor, the bot "Notifications" switch is separate, and `notify_user` and stuck-work reminders are separate paths. | One Routines list; check-in is a managed routine; one quiet switch; one attention path in Activity; no fourth notification control. Explain the disabled Notifications switch with a one-line reason. |
| Open items vs Activity vs stuck-work | All answer "what is waiting on me". | Items join "Needs you". Share one notification path and grouped copy with the stuck-work reminder. |
| Apps vs Pages vs artifacts vs pins vs skills | Walker: four places hold "things a bot made" and none links to another. Pages are Markdown, pins are numbers, neither accepts HTML. | App = Artifact. Tool = skill with a script. Keep Pages and pins. No Apps page, no `BotApp` object, no promote-to-Page. |
| Custom connection vs bot-made tool | Both give a bot a repeatable call. | Keep custom connection for existing remote services and hide its jargon; do not extend it for bot-built tools. |
| Taught skills vs agent skills | Two backends, one list. | One Settings > Skills list with a "Taught" group and one picker in the routine form. |
| Approvals table vs existing rules UI | Two switches, a per-tool rule list and `WritesSwitch` on integration agents all set approval behaviour. | Table replaces the two switches; rule list stays as advanced with human names; `WritesSwitch` reads the table row. |
| Approval card vocabularies | Allow / Not now, Send / Discard, Allow once / Deny. | Allow and Deny everywhere. "Send" only where it is the action itself. |
| Approval boundaries text vs table | Text is a prompt, nothing enforces it. | The table is the one source; hide the field. |
| Two definitions of unattended | `isConversationalRun` (`packages/core/src/run-state.ts:16,77`) and `unattendedTriggerToolRequiresApproval` (`packages/core/src/action-approval.ts:140-150`). | Merge into one function. |
| Two secret stores | `BotSecret` (card, hidden) and `AgentSecret` (space shell variables, no UI). | No UI for `AgentSecret`; long term, command variables become the only shell path. |
| Outside links | Investor portal and artifact share links both mean "link shown once, revoke later". | Reuse `CopyLinkDialog` and the hash-only token model; fix the portal's missing sender line and Revoke confirmation first. |
| Test buttons | Skill card "Test" vs routine "Test run". | Keep both only if they share one run path. |

## 5. PRD corrections (deduplicated)

`original.md:N` is the PRD draft line. Code references are in this repository. Each item was raised in at least one story file; items raised in several are merged.

### 5.1 Cross-cutting and phasing

- C-1. "One definition of unattended" (`original.md:66`, `:59`). Two definitions exist and the PRD must pick one: `RUN_TRIGGERS` in `packages/contracts/src/runs.ts:4-19` plus `isConversationalRun` in `packages/core/src/run-state.ts:16,77` (routine, webhook, created, tickets). `messaging`, `bot_message`, `reaction`, `cloud_agent`, `spawn`, `skill`, `call_end` are unclassified; `resume` and `follow_up` continue a live chat and must not become unattended without checking.
- C-2. "Every unattended run is read-only by default" (`original.md:8`) is not true today. `unattendedTriggerToolRequiresApproval` covers only `trigger === "webhook"` (`packages/core/src/action-approval.ts:140-150`). A cron `routine` run is owner-initiated (`OWNER_INITIATED_TRIGGERS`, `packages/adapters/src/mail-tools.ts:176`) and gets mail, calendar and Drive tools.
- C-3. `write_file`, `shell`, `computer_act` and `browser_act` are in `APPROVAL_EXEMPT_TOOLS` (`packages/core/src/action-approval.ts:3-24`), so they never ask in live chat. "Ask before write_file and shell" (`original.md:78`, `:64`) is already true for webhook runs only. The change is to generalise the trigger check, not to add a mapping. It first changes taught skills run from routines.
- C-4. `UNATTENDED_SAFE_BUILTIN_TOOLS` (`action-approval.ts:59-85`) includes `add_to_data_room` (writes), `run_subagent` and `request_takeover`. The PRD says only read-only tools run (`original.md:59`) but does not audit the list. `create_ui_artifact`, `attach_file`, `page_write` and `pins_write` are in neither the exempt nor the required list, so they run free in scheduled runs.
- C-5. The "Always allow this tool" button is still shown on webhook-only cards (`packages/adapters/src/executor.ts:4351`) and writes a space-wide rule (`packages/db/src/run-pauses.ts:570-586`). Unattended and tainted cards should set `noAlwaysAllow` (missing from `original.md:59-60`).
- C-6. Phasing (`original.md:69-70`) is incomplete. Check-ins and watchers depend on phase 1 or they run with full tools. Apps last conflicts with the user addition at `original.md:77`: a saved read-only "reliable call" is a dependency of watchers' `connector_read` probe and of unattended approvals. Pins already implement the read-only check (`packages/adapters/src/pins.ts`).
- C-7. "Same behavior on web, Electron and mobile" (`original.md:10`) does not hold: there is no scratchpad UI under `apps/mobile`; teaching is web and Electron only (mobile shows the draft as text, `apps/mobile/lib/api.ts:1118`); there is no mobile credentials list; mobile routine detail lists only "Webhook" and "Git event" (`apps/mobile/lib/routine.ts`). State per feature what mobile does. Mobile already previews artifacts including HTML (`apps/mobile/app/artifacts.tsx`), so `original.md:12` ("editing apps or skills on mobile") should say viewing is in scope.
- C-8. Notifications (`original.md:66`): "quiet hours" reads as reuse but does not exist (no field in `NotificationPreference`, `packages/db/prisma/schema.prisma:1433`; no time gate in `notification-outbox.ts`). Existing limits are a 24 hour dedupe and 5/hour, 20/day, 2 attention/hour per bot (`packages/db/src/notifications.ts:13-19`); run finish, failure, help and takeover bypass them (`run-notification.ts`).
- C-9. Account export and deletion (`original.md:66`): scratchpad items are not in `apps/api/src/account-export.ts`; `BotSecret` is not exported on purpose (state the decision). Deletion already cascades from Space and Bot. Usage counters must be in Postgres and scoped by space and user.
- C-10. Design system (`original.md:79`): new UI should be a story first. Routine components already have stories (`RoutineEditor.stories.tsx`, `RoutineRunHistory.stories.tsx`, `RoutineSchedule.stories.tsx`). The PRD names no components. The flow critiques use `Table`, `NativeSelect`, `Switch`, `Badge`, `CopyLinkDialog`; no new component is needed.
- C-11. `routineWakeupJob` is defined in `packages/adapter-kit/src/background-jobs.ts:217` with handler `packages/adapters/src/background-job-handlers.ts:154`, not in `executor.ts` (`original.md:16`, `:27`). It is a scheduled job keyed `routine:<id>`; reusing it for a change wake would replace the queued timed wake. `packages/adapters/src/wakeup.ts` holds only the publisher and `RECURRING_JOBS` (`:94`). Same mix-up for `checkInJob` (`original.md:35`).

### 5.2 Watchers (`original.md:16`, `:23-29`)

- W-1. UI location (`original.md:26`): routines are in the right panel opened by "Computer and routines" (`apps/web/src/pages/Shell.tsx:5224-5253`), not in bot settings. Deep link is `?routine=<id>` (`Shell.tsx:2520`).
- W-2. "One list with type badge" (`original.md:26`): rows have a trigger summary, `routineTriggerSummary` (`apps/web/src/pages/shell/RoutineEditor.tsx:142-152`), and no last-run or next-run line.
- W-3. Wake paths (`original.md:16`): `gmail-push.ts` wakes mail sync (`:294`), `ticket-wake.ts` creates its own Task and Run with `trigger: "tickets"`; neither fires a `Routine`. `release-watch.ts` is an eval helper with no polling or state. Only `webhook-inbound.ts`, `github-webhook.ts`, `messaging-inbound.ts` and cron reach routines.
- W-4. Missing triggers (`original.md:16`, `:27`): `Routine.messageProvider` (`schema.prisma:929`) and `@once` routines (`apps/api/src/router.ts:4112-4116`). A routine can have several triggers, so a single `trigger cron|watch` enum would remove that.
- W-5. Webhook (`original.md:26`): the route wakes the bot even when no routine has `webhookEnabled` (`apps/api/src/webhook-inbound.ts:282`), posts the payload as a user message in the main chat, and inlines at most 5 routines. The Git route ignores unmatched deliveries (`github-webhook.ts:218`). "No chat output on no-change" needs a filter before the bot wakes.
- W-6. "No model-free pre-check exists" (`original.md:16`): `wakeRoutine` already returns `"no-work"` and `"active-run"` before any model call for the GTM and Legal agents (`packages/adapters/src/executor.ts:1280-1294`). Reuse that pattern. Ordinary routines do not skip when a run is active; the rule must apply to watches generally.
- W-7. Minimum interval (`original.md:24`): schedules allow 1 minute (`schedule-tools.ts:197`); 5 minutes is new and applies to watches only unless schedules change. No per-bot or per-space routine caps exist.
- W-8. `connector_read` (`original.md:24`, `:28`): `connectorToolRequiresApproval(toolName, readOnly)` (`action-approval.ts:115`) returns true for anything not matching `get|list|search|find|read` unless `readOnly` is declared, so a tool such as `fetch_balance` would not be pickable. Decide on the pattern or the declared flag.
- W-9. Secrets for probes (`original.md:24`, `:28`): origin pinning belongs to `secret_request` in the agent path; a probe has no agent, so it needs its own injection path with the same origin and redirect rules. `webhookSecretId` is a different secret.
- W-10. Untrusted content (`original.md:28`): `externalOriginNotice` (`packages/core/src/bot-messages.ts:207`) is for bot messages. The existing pattern for fenced external data is `formatUntrustedDeliveryPayload` (`apps/api/src/webhook-inbound.ts:57`), which lives in `apps/api` and cannot be imported by a worker in `packages/adapters` without moving it.
- W-11. Silent runs already exist (`original.md:7`, `:26`): `NO_RESPONSE` (`packages/adapters/src/silent-reply.ts`, `executor.ts:9270`). The value of a watch is skipping the model run, not skipping the message; say so and measure it.
- W-12. Run rows (`original.md:27`): a model-free probe should not create a `Run`, or history (20 per page, `apps/api/src/routine-runs.ts`) fills with no-change checks. Decide this explicitly.
- W-13. Tool creation (`original.md:25`): a routine-triggered run cannot create schedules (`schedule-tools.ts:27-34`), and repeating schedules show `scheduleApproval` (`schedule-tools.ts:585`). `watch_create` must follow both rules. Existing `schedule_list`, `schedule_update`, `schedule_cancel` already cover list, update and cancel.
- W-14. `Routine.notify` is hidden: the web editor always sends `notify: true` (`Shell.tsx:5546`); `notify_user` demotes to `info` when false (`packages/adapters/src/notify-user.ts:37-51`). Decide whether "notify only on change" is this field or a new one.

### 5.3 Check-ins and open items (`original.md:17`, `:31-37`)

- K-1. `ScratchpadItem` also has `target`, `approvedAt`, `approvedBy` and backs the GTM approval flow (`schema.prisma:944-967`; gated categories `public_post`, `create_account`, `outbound_email` in `scratchpad-tools.ts:16-21`; proof stamps server-only `:152-185`). New fields must not weaken those gates. "Parked" means "set aside" in Open work and "needs founder approval" on GTM.
- K-2. `dueAt` must be separate from `scheduledFor` (`schema.prisma:957`, `domain.ts:568`), which holds a GTM post time and would flag scheduled posts overdue (`original.md:32`).
- K-3. Tool names (`original.md:35`): the tools are `scratchpad_list`, `scratchpad_add`, `scratchpad_update`, `scratchpad_complete`, `scratchpad_remove` (`packages/adapters/src/builtin-tools.ts:1742-1815`). There is no `resolve`. To run unattended they must be added to the lists at `packages/contracts/src/builtin-tools.ts:99,179` and `action-approval.ts:72`.
- K-4. Index (`original.md:35`): must lead with `spaceId`: `(spaceId, botId, status, nextReviewAt)`; existing indexes at `schema.prisma:964-965`.
- K-5. Silent turn (`original.md:33`): silence applies only when `runAllowsSilentEmpty(trigger)` (`executor.ts:9272`). `RUN_TRIGGERS` has no check-in value (`contracts/src/runs.ts:4-18`); a new trigger needs adding there, to that function and to `runReplyGuidance` (`executor.ts:9277`). Do not use a "background" trigger: `isBackgroundRunTrigger` (`packages/core/src/run-state.ts:27`) hides runs from sidebar and transcript.
- K-6. "No quiet check-in" (`original.md:17`) overstates the gap: a routine plus `NO_RESPONSE` already works, and scratchpad context is already injected into routine runs. Missing: a first-class setting, a due concept and a budget. The PRD should say whether existing routine-based check-ins migrate.
- K-7. `stuck-work.ts` (`original.md:17`) is about runs in `queued`, `waiting_input`, `waiting_takeover` (4 h reminder, 24 h cancel; `packages/core/src/stuck-work.ts:4,9,14`; `packages/adapters/src/stuck-work.ts:55`), never scratchpad. Past-due notification is a new job that can share the reconciler loop (`job-reconciler.ts:147`).
- K-8. "Home view" (`original.md:34`): there is no Home page (`apps/web/src/App.tsx:237`). The only UI is Open work in bot settings > Advanced (`apps/web/src/pages/shell/bot-panel.tsx:686`), showing title, notes and status, hiding done items. `scratchpad.list` requires `botId` (`packages/contracts/src/rpc.ts:896`), so a space-wide list needs a new API.
- K-9. "Only bot's own items" (`original.md:36`) is enforced by `botId` scoping and `repos.getBot` (`router.ts:4440`); hand-off to a peer bot breaks it by design and needs its own authorization rule.
- K-10. Context loading: skipped for messaging, voice and company agents (`executor.ts:2133-2139`), capped at 40 items and 4 KB (`scratchpad-context.ts:6-7`). "Events since last check-in" needs its own loader and byte cap.
- K-11. Phase 2 check-ins depend on generalising the unattended rule (C-2).

### 5.4 Apps and tools (`original.md:18`, `:38-43`, `:77`)

- A-1. `create_ui_artifact` (`original.md:18`): `ui-artifact-tool.ts:1-17` holds only guidance and a file name helper. Tool definition is `builtin-tools.ts:1543`, handler `executor.ts:5032`, limits `packages/ui-artifact/src/vocabulary.ts:4-30,145`. The artifact is a snapshot and each call posts a card to the thread (`executor.ts:5053`), which matters when a scheduled run updates it.
- A-2. Free-form HTML artifacts already exist via `attach_file` on `.html` (`builtin-tools.ts:300`; `apps/web/src/components/ArtifactPreview.tsx:33`), in `sandbox="allow-scripts"` without `allow-same-origin` (`SandboxedHtmlViewer.tsx:220`). The viewer CSP is `default-src 'none'` (`:4-5`), so an HTML app cannot call a data API; a data host needs a new narrow `connect-src` (`original.md:39`).
- A-3. Artifact as container (`original.md:18`, `:39`): version families are keyed by space, user, bot, group and a case-insensitive name (`packages/db/src/artifact-versions.ts:6-30`), so renaming makes a new family and there is no stable app id. `Artifact` has no data field and one file per row (`schema.prisma:1357-1392`); a per-app JSON store needs new storage. Delete removes all versions (`Artifacts.tsx:430-432`).
- A-4. Investor portal precedent (`original.md:18`, `:39`): reusable for hash-only tokens and revocation (`packages/db/src/investor-portal.ts:22-23,38`) but it serves only updates and Data room files as downloads (`apps/api/src/investor-portal.ts:90-143`), runs on the product's own web app (`App.tsx:75-80`), and records only sent and last-opened (`Investors.tsx:444-448`). "Separate origin" and `/a/:token` (`original.md:39`, `:41`) are new work, and "view audit" has no per-view log to reuse.
- A-5. "Promote to Page / pin" (`original.md:40`): a Page is one Markdown document per bot (`schema.prisma:1205-1210`) and pins are up to six numbers plus a list (`docs/agent-pages/pins.md`); neither accepts an app. `packages/adapters/src/pins.ts` is missing from the PRD file list.
- A-6. "Viewer edits emit thread event (opt-in wake)" (`original.md:39`): the event half has a precedent (`page.updated`, `packages/adapters/src/pages.ts:197`); no code wakes a bot on a page or pin event.
- A-7. Non-goal conflict (`original.md:12` vs `:77`): no server-side hosting but tools must be runnable. The PRD must say where the code runs. Bots can already write and run scripts with no ask (`write_file`, `shell` exempt), with no input schema, version, test or registry; the workspace is checkpointed latest-only (`docs/computer-runtime.md:90`) and team bots share one OS user (`:17,34`).
- A-8. Existing tool mechanisms the PRD ignores (`original.md:77`): installed connector operations with a `readOnly` flag (`packages/adapters/src/installed-connectors.ts:77-95`, `domain.ts:830`, `capabilities.install` at `router.ts:4767`), `add_mcp_server` with an owner card (`builtin-tools.ts:616`; stdio gated by `MCP_STDIO_ENABLED`, `apps/api/src/env.ts:249-250`), prose-only `skill_create` (`builtin-tools.ts:1987`), and `task_catalog` (`builtin-tools.ts:1735`) where any new tool kind must be listed.
- A-9. `app_share` "always asks, never unattended" (`original.md:42`) is not enforced: it must be an explicit approval-required entry (see C-4). There is no outside-share approval card; the closest is the held bot-to-bot share (`packages/adapters/src/bot-share.ts`). The flow critique removes the bot share tool altogether.
- A-10. Authorization (`original.md:39`): artifacts are visible only to the signed-in owner (`apps/api/src/artifacts.ts`, `getOwnedArtifact`, `getSpaceArtifactById`). A share route is a new, separately authorized path; it cannot reuse `artifacts.getById`.
- A-11. Limits (`original.md:39`): attachments 10 MiB (`packages/contracts/src/attachments.ts:1`), UI artifact 60,000 characters and 200 blocks, Page 200,000 characters and 20 charts (`packages/contracts/src/pages.ts`). Data store limits are TBD. "Show data before first share" (`original.md:43`) has nothing to show without a store; for artifacts it is the rendered preview.

### 5.5 Teach by demo (`original.md:19`, `:45-50`, `:76`)

- T-1. Status "Exists v1" (`original.md:19`) hides gaps: no saved-skill list, delete, run history or enforcement. Say "Partial".
- T-2. Full desktop (`original.md:76`): recording already runs on the whole sandbox display (`apps/web/src/pages/Shell.tsx:6263-6282`; `docs/computer-runtime.md:11-13`). Missing is meaning: only coordinates, keys, scrolls and window titles are kept (`packages/adapters/src/teaching-session.ts:169-196`, `packages/core/src/teach-playbook.ts:1-12`); no screenshots, no shell or file or app events, Terminal and Files hidden during recording (`Shell.tsx:6250`), host `desktop` computers refused (`apps/api/src/taught-skills.ts:139-141`). Reword to "record desktop events with names and pictures, and include shell and file steps".
- T-3. UI entry (`original.md:48`): "composer + menu > Teach a task" does not exist. The entry is the "Teach a task" button in the computer chrome bar (`Shell.tsx:6208-6215`). "Bot settings > Skills" lists agent skills only (`BotSkillsSection.tsx`; `rpc.skills.*` vs `rpc.agentSkills.*`). Recording bar has "Stop teaching" and "Protected input" (`TeachRecordingChrome.tsx`); there is no Cancel and no "Mark as sensitive".
- T-4. The review step and "Try it now" (`original.md:46`) already exist as the Draft skill card (`SkillDraftCard.tsx:75-135`) and Test (`:145`). New work is readable steps, pictures, redaction warnings, live view, step progress and approval pausing.
- T-5. Redaction (`original.md:46`): only Protected input is redacted (`teach-playbook.ts:14-19`); a typed password is stored in plain text (`:68-72`); no "offer as secret" exists. This is a safety defect (also walker P1 on C3).
- T-6. Data model (`original.md:49`): none of version, `lastRunAt`, counts or `TaughtSkillVersion` exists. `Run` has no skill link (`schema.prisma:769`), so counts cannot be derived; choose `taughtSkillId` on the run or a new table. `expiresAt` is the 10-minute recording window (`taught-skills.ts:360`); status `drafting` is never written (`domain.ts:586`).
- T-7. `expandSkillReferencesInPrompt` (`original.md:19`) is for agent skills (`router.ts:192`, `executor.ts:7037`). Taught skills use `promptInvokesSkill` and `formatSkillRunPrompt` (`teach-playbook.ts:213,222`), wired at `executor.ts:7043-7054`, plus `taughtSkillsLine` (`:7014-7025`).
- T-8. `approvalBoundaries only add asks` (`original.md:50`) cannot hold: the field is prompt text and nothing reads it at tool time (`teach-playbook.ts:222-240`).
- T-9. Routines do not link to skills (`original.md:46-47`): "Add to routine" pastes the playbook as text (`SkillDraftCard.tsx:150-152`). Add a reference field or later edits will not reach the schedule. `inputs` is a copy of the goal text (`teach-playbook.ts:190`); named parameters need a design.
- T-10. Constraints missing: starting to teach cancels the bot's active runs (`taught-skills.ts:110-132,357`), including scheduled ones; browser tools are blocked during teaching (`executor.ts:5602`), so page-level step naming needs a new capture path; the raw recording is returned to the browser inside `TaughtSkill.recording` (`domain.ts:628-642`) with no retention limit.
- T-11. Missing files in the PRD list: `packages/core/src/teach-recording.ts`, `apps/web/src/components/teach/*`, `packages/adapters/src/computer-control.ts`, `router.ts:3627-3690`, `packages/adapter-kit/src/background-jobs.ts:195,248`. Copying skills between bots is correctly a "Should" (skills are bot-scoped, `schema.prisma:988-1011`). The demo seeds two taught skills (`packages/testkit/src/cli/demo/data.ts:2422`) that no UI shows.

### 5.6 Secrets (`original.md:20`, `:52-56`)

- S-1. File list (`original.md:20`): `packages/core/src/secrets-guard.ts:1-60` resolves deployment startup secrets only; `apps/api/src/routes/agent-secrets.ts:1-16` serves `AgentSecret` (space shell variables), not `BotSecret` (RPC `botSecrets`, `rpc.ts:1836-1843`); `run-secret.ts` handles approval and OTP runs, not injection (`requestWithBotSecret` and `resolveLoginFill` are in `bot-secrets.ts:489,589`). The PRD does not mention that two stores exist.
- S-2. Secrets screen (`original.md:53`): a per-bot screen exists (Advanced > Credentials, `apps/web/src/pages/shell/bot-credentials.tsx`, mounted at `bot-panel.tsx:860`). `createdAt` already exists in `BotSecretMetadata` (`packages/contracts/src/bot-secrets.ts:310-316`). The button is "Remove", not "forget".
- S-3. Browser fill (`original.md:53`): shipped. `fill_secret` is in `packages/adapters/src/browser-tools.ts:14-19,122-129`, `resolveLoginFill` at `bot-secrets.ts:589`, wired at `executor.ts:5632`. Nothing to build in `browser-tools.ts`. `page-browser-login-fill.test.ts` covers the page script; the resolver is tested in `bot-secrets.test.ts` and `browser-tools.test.ts`.
- S-4. Command variable label (`original.md:53`): already stated at `bot-credentials.tsx:425`, `AskCard.tsx:203-212` and in `docs/bot-secrets.md`; only the explicit "the bot can read this value" is missing. Any new words need the PR copy justification from AGENTS.md.
- S-5. Space-level secrets with per-bot grants (`original.md:54`, `:55`): `BotSecret` is unique on `(userId, spaceId, botId, name)` (`schema.prisma:1773-1792`), so it cannot be extended without changing the key. `AgentSecret` (`schema.prisma:1852`) is the space table, with UPPER_SNAKE names and shell-only use. Credentials are user-scoped ("Only the run's user can submit a reusable credential"), so a routine owned by one member cannot use another's secret.
- S-6. "Unattended `secret_request` GET only (assumption)" (`original.md:56`) is not enforced. `secret_request` accepts GET, POST, PUT, PATCH, DELETE and HEAD (`SecretHttpRequest` in `contracts/src/bot-secrets.ts`). `secret_request` and `forget_secret` already ask by default (`action-approval.ts:29-48`); an "always allow" rule makes them silent. `request_secret` is approval-exempt (`:19`) and in an unattended run pauses on a card nobody sees: the PRD must say hold, fail or notify.
- S-7. Existing limits omitted from the PRD (`original.md:56`): 20,000 character return cap, no response headers, 100 credentials per bot, 16,384 character value, HTTPS-only logins, reserved command variable names (`bot-secrets.ts:489-580`).
- S-8. Infisical (`original.md:54`): `SECRET_STORE=infisical` already exists (`docs/infisical-secrets.md`, `packages/adapters/src/secret-store-factory.ts`, `bot-secrets.ts:369-410`). `docs/bot-secrets.md` still says values live in Postgres under `ENCRYPTION_KEY`, true only for the default store. "Surface" is a deployment decision.

### 5.7 Approvals (`original.md:21`, `:58-64`)

- P-1. File references (`original.md:21`): `auto-review.ts` is in `packages/adapters/src/`; gate logic (`planActionGate`, `applyJudgeDecision`) is in `packages/core/src/action-approval.ts:251-285`. The rule schema is `packages/contracts/src/domain.ts:813-819` and the table `schema.prisma:184-198`; core has only a `Pick` (`action-approval.ts:97-100`).
- P-2. `resolveActionApprovalDetail` returns only `ask | allow` (`action-approval.ts:204-213`). Adding `block` also changes `planActionGate`, `applyJudgeDecision`, effect replay and the executor branches reading `gateDecision`. `ActionTypeRuleSchema` and `ACTION_TYPES` do not exist (`original.md:62`).
- P-3. Explicit-approval tools "can never be Allow" (`original.md:59`) is already enforced for `EXPLICIT_APPROVAL_BUILTIN_TOOLS`, tainted and integration cases (`executor.ts:3987-4003`).
- P-4. Auto Review (`original.md:60`): it already turns Ask into Allow when the judge passes (`action-approval.ts:251-271`) and is skipped for mandatory-ask cases including webhook runs. It is not limited to attended runs: cron `routine` and other non-webhook runs can use it. There is no UI; `autoReview.get/set` (`rpc.ts:1255`) is unused by web and mobile, so a switch is new work.
- P-5. Table location (`original.md:61`): the only approvals UI is account-level Settings > "Privacy and approvals" (`ApprovalRulesSettings.tsx`) with two switches and a rule list; no bot settings screen reads rules. Keep the account-level table and add a per-bot override.
- P-6. Action types (`original.md:59`): existing categories are only `email` and `purchase` (`categoryMatches`, `action-approval.ts:156-175`). "Post publicly", "Delete data", "Calendar changes", "Message other bots" exist only as tool names (`calendar_*`, `delete_bot`, `destination.write`, `spawn_bot`). "Use saved secrets" maps to `secret_request`, already approval-required. Unknown connector writes classify by name pattern (`connectorToolRequiresApproval`); classify as "Connected apps (write)" and fail closed.
- P-7. Block (`original.md:59`, `:62`): `DENIED_ACTION_MESSAGE` (`packages/adapters/src/approval-effect.ts:364`) tells the model not to retry as a person's choice; a rule block needs different text.
- P-8. Per-bot rules (`original.md:62`): rules are keyed by space and `createdByUserId` and loaded for the run's owner (`executor.ts:3145-3153`). Adding `botId` changes the unique index (`schema.prisma:195`), the RPC, the `run-pauses.ts` upsert and export/deletion; existing rows must be treated as space-wide.
- P-9. Reminder and expiry (`original.md:60`): the `expired` answer state exists in `AskCard.tsx:46` but no job creating it was found; check `packages/db/src/run-pauses.ts` and the wakeup jobs before calling it new. The approval notification today is `notifyRun` with kind `help` in `pauseForAsk` ("<bot> needs approval"); reuse it (`original.md:66`).
- P-10. Run events (`original.md:63`): decisions are recorded on `ExternalEffect` for Auto Review (`reviewDecision`, `reviewReason`, `reviewModel`, `executor.ts` near `:4170`); there is no event for rule-based allow, ask or block. Name the store.
- P-11. Risk (`original.md:72-73`): confirmed. Today `write_file`, `shell`, `computer_act` and `browser_act` run freely in cron routines. The migration report should list routines by what they would now stop on. The flow critique replaces the report and per-routine opt-in with the normal approval card plus one release note.
- P-12. Not in the PRD but found in the walk: approvals raised by a background run land in the bot that performs the action, not the chat the user typed in; the first-run AI-data consent card can stop any run before approvals are reached; "Needs approval" wording in Activity was not confirmed. Add routing and Activity wording to section 6's UX.
