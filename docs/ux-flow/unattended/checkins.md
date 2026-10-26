# UX flow critique: Quiet check-ins and open items

Inputs: `docs/ux-paths/unattended/checkins.md`, `docs/ux-walker/unattended/checkins.md`, and the original PRD section 2. Read from code and the walk report; no new browser session.

## 1. Friction scorecard (current stories)

| Story | Actual | Ideal | Verdict |
|---|---|---|---|
| C1 Add a to-do | 5 | 3 | Open work is hidden in Advanced. Move it out. |
| C2 Park / reopen | 2 | 2 | Fine. Button emphasis flips; rename "Open" to "Reopen". |
| C3 Complete | 1 | 1 | Fast but destructive to view: no undo, no done list, Remove sits beside Complete. |
| C4 Quiet routine | 7 | 3 | Magic word `NO_RESPONSE`; a silent run looks like any other run. |
| C5 notify_user | not walked | 1 | Per-bot switch disabled with no reason shown. |
| C6 Stuck-work reminder | 1 | 1 | Good. Finished list grows. |
| C7 Items in routine prompt | 0 | 0 | Good, but invisible to the user. |

## 2. Future stories: simplest version

Principle: a check-in is a scheduled run that can say nothing. Do not add a second scheduler, a new page for it, or new status words.

- **F1 Turn on a check-in.** Lives in bot settings next to "Notifications" (`NativeSelect`, saves on change): Off / Daily / Every 4 hours. One select, no time picker (Daily is 9:00 in the user's time zone). Do NOT build: quiet-hours picker here, per-bot budget control, a "next check-in" line (the select value is enough), a setup wizard.
- **F2 Waiting on / due.** Add `dueAt` and `waitingOn` to the existing `ScratchpadSection` row as one muted second line ("Halcyon security team, due Fri"). Do NOT build: `source` badge, links to contacts or bots, editable fields in the form. Only the bot sets them; the user edits by chat. Keep `resolvedReason` as a tooltip-free muted line in the done view only.
- **F3 Check-in message.** Pure prompt behavior: first line is the ask, then silence if nothing needs the user. No UI. Do NOT build a length-cap setting.
- **F4 Quiet hours and budget.** Cut to one fixed rule: a check-in posts at most once per bot per day, and attention pushes are held outside 22:00-08:00 local time. No setting in v1. If a setting is later required, one "Quiet hours" row in account Notifications (`NotificationSettings`, existing `Switch` plus two time selects). Do NOT add the per-bot override under Advanced.
- **F5 All open items in one place.** Do not add a sidebar entry or a Home page. Extend the existing Activity panel (`ActivityList`): add a "Waiting on you" group at the top of the same "Needs you / Working / Finished" grouping, with rows that link to the bot. Needs a space-wide list API (scoped by space and user). Do NOT build a grouped "Waiting on others / Parked" page; others-blocked items belong in the bot panel only.
- **F6 Auto-resolve.** No UI beyond a done view: a "Done" disclosure under Open work with the reason and a Reopen checkbox (this also fixes C3). Do NOT build matching rules or a confidence display.
- **F7 Past-due alert.** One grouped attention notification per bot per day via the existing reconciler and `createNotification`. No snooze control; completing or reopening is enough. Use `dueAt`, never `scheduledFor`.
- **F8 Hand-off to peer bot.** Defer. Rare, adds authorization rules and GTM gate risks. Chat already covers "tell Investor Relations to do this" via message_bot.
- **F9 Onboarding offer.** Defer. The bot can mention check-ins in chat once, but a built-in prompt flow and an inline "Turn on" action is a new surface for a setting that is already one select.

### PRD items that add needless UI, settings, or copy

| PRD item | Smaller version |
|---|---|
| Setting "Off / Every 4h / Daily 9:00 + quiet hours" | Off / Daily / Every 4 hours. Quiet hours fixed, no UI. |
| Max messages/bot/day as a budget | Fixed at 1 for check-ins; not configurable. |
| "Open items panel per bot + combined Home view" | Per-bot panel exists. Combined view = new group in Activity, not a new Home. |
| Fields `source`, `nextReviewAt`, `resolvedReason` in the model | Keep `dueAt`, `waitingOn`, `resolvedReason`. Drop `source` and `nextReviewAt` (the check-in cadence already decides review time). |
| Hand item to peer bot | Defer. |
| Past-due "notifies even if check-ins off" | Keep; it is the only must-have outside the check-in. |

## 3. Redundancy

1. **Check-ins vs routines.** A check-in is a routine with a built-in instruction and the `NO_RESPONSE` behavior. Implement it as a routine row (created or removed by the setting) so there is one scheduler, one run history, one "Next run" display. In the Routines panel, mark it with the same row style; do not create a third list beside Routines and the PRD's watchers. Merge all three into the one Routines list with a type label (Schedule, Check-in, Watch).
2. **Quiet behavior everywhere.** Replace the typed magic word with one switch on the routine editor: "Only message me if something needs me" (default on for check-ins and watchers). It sets the guidance server-side; users never type `NO_RESPONSE`. Fixes C4 for all routines.
3. **Open items vs Activity vs stuck-work reminders.** All three answer "what is waiting on me". Put items in Activity's "Needs you" group; the stuck-work reminder and the past-due alert should share one notification path and one grouped copy.
4. **Notifications switches.** Bot "Notifications" (finish/help), `Routine.notify` (no UI), and the check-in setting overlap. Decision: a check-in's message is an ordinary attention notification governed by the existing Notifications switch. Do not add a fourth control. Explain the disabled switch with a one-line reason instead of "Off in Settings".
5. **"parked".** It means "set aside" in Open work and "needs founder approval" on GTM. Rename the GTM state label in the UI ("Needs approval"), leaving the stored value alone.
6. **Silent runs in Activity.** A run that ended silently should appear with a dimmed "Nothing to report" and be excluded from "Finished" count by default, so daily check-ins do not fill the list.

## 4. Top 5 recommendations (value / effort)

1. **Move Open work out of Advanced** into the main bot panel (above Model). Tiny change, fixes the biggest finding (C1).
2. **Add a "Done" disclosure with Reopen and an undo toast on Complete.** Small; needed before bots can auto-close items (F6) and fixes C3.
3. **Replace the `NO_RESPONSE` magic word with a routine switch "Only message me if something needs me";** show "Nothing to report" on silent runs in history and Activity. Medium effort, benefits check-ins, watchers and plain routines.
4. **Ship the check-in as one select in bot settings that creates a managed routine.** One scheduler, no new list. Fixed one-message-a-day and fixed quiet hours, no settings.
5. **Show open items in Activity ("Waiting on you") instead of a new Home page,** and send one grouped past-due notification per bot per day using a new `dueAt` field.
