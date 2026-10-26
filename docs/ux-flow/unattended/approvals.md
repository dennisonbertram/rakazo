# UX flow critique: Approvals table and read-only unattended runs

Inputs: `docs/ux-paths/unattended/approvals.md`, `docs/ux-walker/unattended/approvals.md`, and the original PRD section 6 plus the user additions. Stance: every row, choice and word must earn its place. Components named below are in `docs/design-system/components.md`.

## 1. Friction scorecard (current stories)

| Story | Actual steps | Ideal | Verdict |
|---|---|---|---|
| C1 Find approvals | 4 | 2 | Over. "Privacy and approvals" is a third level under Settings, and "Action confirmations" sits below "AI data sharing", below the fold at 577px. Two names (approvals, confirmations) for one idea. |
| C2 Turn off purchase ask | 1 | 1 | Clean, but it misleads: off does not mean never ask (connector writes with payment-like names still ask). No saved feedback. |
| C3 Approve once | 3 after the message (answer consent, open the other bot, press Send) | 1 | Over. The card appears in a different bot's chat from the one Maya typed in. Mail uses Send/Discard, consent uses Allow/Not now, generic uses Allow once/Deny. |
| C4 Deny | 1 | 1 | Step count fine, vocabulary inconsistent (Discard vs Deny). |
| C5 Always allow, then undo | not walked (est. 5) | 3 | The undo list shows raw tool ids and the rule is space-wide for every bot. |
| C6 Webhook run is read-only | not walked | 0 (just works) | No on-screen statement of what a background run may do. |

The main friction is not step count. It is that the user cannot see the whole safety setting, and the approval lands somewhere unexpected.

## 2. Future stories: simplest UX

Principle for all: one table, one set of words (Allow, Ask, Block, matching the cards), no new screens.

**F1 Table of action types.** Lives in `ApprovalRulesSettings` (Settings > Privacy and approvals), built from `Table` and `NativeSelect` (Allow / Ask / Block per row). There is no segmented control in Storybook; do not build one, a select is enough and is native on mobile. Show 5 rows by default: Send email, Spend money, Edit files and run commands, Connected apps (write), Everything else that changes things. The PRD's 14 types stay as a mapping table in core, but reveal the full 14 only under a "More actions" disclosure. Move the section above "AI data sharing" and name it "Approvals" everywhere. Replace the two switches; the old per-tool rule list stays, labelled with human tool names. Do NOT build: per-connector or per-tool editors in v1, a "defaults" legend, helper text under each row. Locked rows (explicit-approval tools) show "Ask" with a disabled select and no explanation sentence; a tooltip is enough.

**F2 Block for one bot.** Same table in the bot's settings with a "Same as all bots" first option in each select (the greyed space default is the select's placeholder, not a second column). Block message in the transcript: reuse the existing denied line, with different wording for a rule ("Blocked by your setting"). Do NOT build: a bot-vs-space comparison view, per-bot Block history.

**F3 Background runs read-only.** No new UI. Define "unattended" once as "trigger is not a live chat turn" and fail closed on unknown triggers. The existing card, `pauseForAsk` notification and Activity "Needs approval" row are the whole experience. Add one line to the routine editor only if a routine has ever paused: "Last run stopped for approval" in `RoutineRunHistory`. Do NOT build: a migration report screen. Instead, the first time a routine would have been stopped, the normal approval card appears; one release note covers the change. Per-routine opt-in is F7, defer it.

**F4 Reminders and expiry.** Notification exists. Add one reminder at 4h and expiry at 24h with the existing "Expired" answer state. No quiet-hours settings UI; reuse whatever notification quiet hours exist, or send no reminder. Do NOT build: reminder preferences.

**F5 Why a card appeared.** One short line, only when a background run or a user rule caused it. No link to the table row in v1. Do NOT add a line to every card.

**F6 Auto Review switch.** Cut from this feature. Auto Review has no UI today and the PRD only wants it for attended runs. The one-line fix is to skip it for unattended runs in code. A switch can wait for evidence that people want it.

**F7 Per-routine allowance.** Defer. It is a second permission surface that duplicates the table. Preferred alternative: when Maya answers "Allow once" on a background card, nothing persists; if she needs more, she changes the bot's table row.

**F8 Review what a run tried.** Use the Activity list that exists: paused runs already sort into "Needs you". Fix the walker finding (verify "Needs approval" appears there) rather than adding a log view. Record decisions in run events, no UI.

### PRD items that add needless UI or copy
- 14 visible rows: show 5, disclose the rest.
- Greyed space default behind bot overrides: a "Same as all bots" select option does it with no extra column.
- Card showing which rule applied on every card: only when a rule or background mode applied.
- Per-routine opt-in plus a migration report: replace with the normal approval card.
- Auto Review switch: defer.
- "Always allow this tool" on background cards: remove the button there. It writes a space-wide rule that does not even lift the webhook restriction (confusing and unsafe).
- User addition "all UI from Storybook": satisfied by `Table`, `NativeSelect`, `Switch`, `Badge`; no new component is required.
- User addition "ask before write_file and shell": a row "Edit files and run commands" defaulting to Allow in chat and Ask in background runs, one row, not two.

## 3. Redundancy

1. **Approval surfaces.** Three card vocabularies (Allow/Not now, Send/Discard, Allow once/Deny). Standardise the verbs: Allow, Deny everywhere; Send is acceptable only because it is the action itself. Table labels must match.
2. **Switches vs table.** The two existing switches become the Send email and Spend money rows. Delete them; do not keep both.
3. **`WritesSwitch` on integration agents** (`IntegrationAgentSection`) already says "writes off by default". That is a per-bot Block for connected-app writes. Make it read from the same table row so there is one source of truth, and keep the switch as the shortcut view of that row.
4. **Routine Approval boundaries text** on drafted skills is a model prompt, not a setting. Keep it hidden from the user-facing editor, since the table now enforces it.
5. **Two definitions of unattended** (`isConversationalRun` and `unattendedTriggerToolRequiresApproval`). Merge to one function.
6. **Routines, watchers, check-ins** (other PRD features): all background runs and all hit this one rule. Their list should stay one list (Routines) with a type badge (`Badge`), and approval status appears once, on the run, not per feature.
7. **Approval location.** Cards appear in the bot that performs the action, not the bot Maya talked to. Mirror the card in the originating chat (a one-line "Waiting for approval, open" link) or show it in both, rather than relying on a toast.

## 4. Top 5 recommendations (value / effort)

1. Skip Auto Review and "Always allow" for unattended runs, and use one definition of unattended with fail-closed default. Small code, large safety value.
2. Replace the two switches with a 5-row Approvals table (`Table` + `NativeSelect`, Allow/Ask/Block), move it above AI data sharing, rename the section "Approvals".
3. Fix approval routing: show the waiting approval in the chat Maya typed in, and confirm it appears under "Needs you" with "Needs approval" wording.
4. Per-bot override as a "Same as all bots" select option on the same table, plus tie `WritesSwitch` to it.
5. Standardise card verbs (Allow, Deny) and add the single "why you were asked" line only for background or rule-caused cards. Defer F6, F7 and the migration report.
