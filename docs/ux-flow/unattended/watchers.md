# UX flow critique: Watchers (wake only on change) on routines

Inputs: `docs/ux-paths/unattended/watchers.md`, `docs/ux-walker/unattended/watchers.md`, and the original PRD section 1. Stance: a watcher is a routine whose trigger is "this source changed". It needs one new card in the existing editor and one extra line in the existing list. Nothing else. Components named are in `docs/design-system/components.md`.

## 1. Friction scorecard (current stories)

| Story | Actual | Ideal | Verdict |
|---|---|---|---|
| C1 See routines | 2 | 2 | Steps fine, but rows do not show last run or next run, so "is it still working?" cannot be answered. Header button is an unlabeled icon at narrow widths. |
| C2 Create scheduled routine | 6 | 5 | "Next run" shows only after Save. Show it as soon as a schedule is picked. |
| C3 Pause / test / delete | pause 3, test 1, delete 2 | pause 1 | Active toggle needs a Save click. Test reply looks like any bot message. |
| C4 Webhook | 8 | 4 | Worst flow. Save does not reveal the key, Rotate key has no confirm or copy button and no warning. Deliveries are absent from Run history. |
| C5 Read what a routine did | 3 plus a manual Refresh | 2 | History does not refresh itself and rows do not say "changed" or "nothing new". |
| C6 Ask from chat | 3 | 3 | Steps fine. The prompt Chief writes posts every day ("say there was no change") and compares against history that holds no page content. This is the problem a watcher exists to fix. |

## 2. Future stories: simplest version

Principle: no new page, no new list, no new status vocabulary. A watch is a routine. It uses `RoutineEditor`, `RoutineListRow`, `RoutineRunHistory` and the approval card.

- **F1 Watch a web page.** In `RoutineEditor`, add one entry "Watch a page" to the "Choose when it runs" menu, next to "Every week". It adds a card in the same shape as `InboundTriggerCard` with two fields: "Page address" and "Check every" (a `NativeSelect`: 15 minutes, hourly, daily; default hourly). The Instruction field already says what to do on a change. Do NOT build: CSS selector field, ignore pattern, threshold, debounce, "Only this part". Add the selector later only if real pages prove too noisy. Do NOT put it in a second submenu ("From another app (advanced)" already hides things badly).
- **F2 Watch a connected app.** Same "Watch" card with a second entry "Connected app". Pick the app and a read-only query (picker lists only tools with `connectorToolRequiresApproval === false`). Hide all argument forms in v1: let Chief set it up from chat (F3) and show the result as a read-only summary line. Do NOT build a schema-driven argument form, per-field filters, or "first check is silent" as a switch (make it the fixed behavior).
- **F3 Set up from chat.** Reuse the existing schedule approval card (`scheduleApproval` shape) with the summary "Checks the page hourly, tells you only when it changes". No new card type. `watch_create` is one tool; `watch_list/update/cancel` are not needed because `schedule_list`, `schedule_update` and `schedule_cancel` already operate on routines. Extend those instead.
- **F4 Status at a glance.** Extend `RoutineListRow` with one muted second line for every routine, schedule or watch: "Checked 4 min ago · Changed yesterday" for watches, "Last ran 8:00 AM · Next Mon 8:00 AM" for schedules. No type badge: the existing trigger summary text already tells the type ("Every hour", "When a webhook fires"). A failing watch shows one word of state in the same line ("Paused after 5 failed checks") with the existing Active switch to resume. Do NOT build a "Checks" log section. A no-change check creates no `Run`, so `RoutineRunHistory` keeps only wakes; the row line carries the rest.
- **F5 Noisy watch.** Do not build the "want me to check daily?" negotiation. A fixed rule is smaller: at most one wake per watch per interval, and further changes are folded into the next wake ("3 changes since the last check"). No setting, no suggestion UI. Add a hard cap only if cost shows a need.
- **F6 Read-only.** No UI. The approval card already exists. This is the same rule as the approvals area (every non-chat trigger is unattended); do not make a watch-specific rule or setting. One sentence on the card suffices when it fires: "Chief wanted to send this while checking the pricing page."
- **F7 Webhook filter.** Cut from this release. The right fix is the existing bug: a webhook with no matching routine should return `ignored` like the Git route does. A user-facing filter field and sample-payload picker are separate UI and copy for an advanced user. Fix C4 first.
- **F8 Mobile.** Show the same row second line and the Active switch in `RoutineDetail` using the native list style. No create or edit on mobile; chat covers it.

PRD items that add needless UI, and the smaller version:

| PRD item | Smaller version |
|---|---|
| `http` selector (CSS/JSONPath), ignore regex, threshold, debounce | Fetch the page text, hash it. Add one option later if needed. |
| `command` probe | Cut (shell on a schedule is a separate trust decision). |
| Type badge in the list | Use the existing trigger summary. |
| `trigger cron\|watch` column plus separate list | A routine can have several triggers already; add a watch spec beside them. One list. |
| Per-source failure settings | Fixed: backoff, pause after 5 failures, message in the row. |
| `watch_*` tool family | One `watch_create`; reuse `schedule_*` for list, update, cancel. |

## 3. Redundancy

- **Routines vs watchers**: one list, one editor. Do not add a "Watchers" panel.
- **Watchers vs check-ins** (see `docs/ux-flow/unattended/checkins.md`): a check-in is a daily routine that may say nothing; a watch is a routine that wakes only on change. Both are rows in the Routines panel. Do not give check-ins their own list or a second schedule setting; the bot settings select for check-ins should create or toggle one routine.
- **Silent finish vs no wake**: `NO_RESPONSE` stays as the fallback for model-based routines. A watch should not need it. Remove the instruction "say there was no change" from what Chief writes, and make Chief choose a watch for "tell me if it changes".
- **Webhook vs watch**: both are "wake on outside change". Push (webhook) already exists; show it in the same menu group as "Watch a page" with the heading "When something changes".
- **Test run**: reuse it for a watch. It runs the instruction once with the current page as the "change".
- **Last run info** is missing for schedules too (C1); the F4 line fixes both.

## 4. Top 5 recommendations (value / effort)

1. **Fix the webhook setup (C4)**: reveal the key once on Save with a copy button, add a rotate confirmation, show deliveries in Run history. Highest pain, small change, and it is the pattern watchers will copy.
2. **Add the status line to `RoutineListRow`** for all routines (last run or checked, next run, last result). Fixes C1, C5 and gives watchers their visible output.
3. **Ship one "Watch a page" card**: URL plus "Check every", model-free hash compare, wake with a short before and after, no run on no-change. No selector, no threshold.
4. **Make Chief pick a watch** for "tell me if it changes" and stop writing "say no change" prompts (C6); reuse `schedule_*` tools and the schedule approval card.
5. **Label routine output in chat**: a small source line on a bot message from a routine or watch ("From routine: Pricing check") and a working "View chat" jump. This also answers "why am I seeing this" for every unattended message.

Cut or defer: F5 negotiation UI, F7 filter field, selector/ignore/debounce, command probe, Checks log.
