# UX flow critique: Teach a skill by demonstration

Inputs: `docs/ux-paths/unattended/teaching.md`, `docs/ux-walker/unattended/teaching.md`, and the original PRD section 4 plus the user additions. Stance: every step, screen, choice and word must earn its place. Evidence level: step counts for C1 to C7 come from the walker (demo stack, one pass); anything marked "suspected" was not observed.

Key fact for the PRD: recording already runs on the whole bot desktop, not only the browser. The gap is meaning (words and pictures for each step), not coverage. Do not build a second capture surface.

## 1. Friction scorecard (current stories)

| Story | Actual | Ideal | Verdict |
|---|---|---|---|
| C1 Start recording | 4 (open side panel, Open, Teach a task, type goal + Start) | 3 | Over by one. The Teach button lives only inside the computer window. A teach entry in the composer menu would remove the first two steps. |
| C2 Demonstrate, protected password | 1 per real step | 1 | Fine. But no sign anything was recorded (no counter), and a password typed on the screen is stored as plain text. That is a safety defect, not a polish item. |
| C3 Stop, review, save | 3 plus scroll | 3 | Step count fine. The card has 8 fields, Save falls below the fold, name/when/inputs repeat the goal sentence, steps are coordinates, "How to check" is a window title (and in the demo copied an unredacted typed string). |
| C4 Test | 1 | 1 | Starts a run, shows nothing on the card. The result is hidden in a busy thread (not confirmed). |
| C5 Run by name | not walked | 1 | Blocked by another walker's pending approval. Unknown. |
| C6 Add to routine | 3 | 2 | Pastes the playbook as text. No link to the skill, no hint it will click and type unattended with no approval. Worst story: unsafe and misleading. |
| C7 Recover interrupted recording | stuck | 1 | With the computer window closed there is no Stop control, only a small red line and a disabled composer. |

Main friction: the user cannot tell what was recorded, and the end of the chain (a schedule) runs with less protection than the start.

## 2. Future stories: simplest UX

**F1 Full desktop (browser + apps + files + commands).** Lives in the existing recording bar (`TeachRecordingChrome`). Backend change: add window-change, command and file-write events to the same event list. UI change: none, except stop hiding the dock/Terminal while recording. Do NOT add the "Screen, apps, files and commands" label, an "Add 10 minutes" button, or multi-session append. Copy: none new. Keep the 10-minute limit; the existing "time left" text is enough.

**F2 Steps in words with small pictures.** Lives in `SkillDraftCard`. One model call at Stop turns events into lines like "Click Export in the CRM toolbar". The Steps field stays one editable text area. Show the final-screen crop only under "How to check". Do NOT add per-step expanders, grouping UI, "Check this step" badges, or coordinate fallback views. If the naming call fails, show coordinates as today. Also cut the card: show Name, Steps, Save by default; collapse When to use, Inputs, What to return, Approval boundaries, Failure handling under one "More" disclosure. Save must be visible without scrolling.

**F3 Password offered as a secret.** Lives in `TeachRecordingChrome`. Remove the separate "Protected input" box over time: detect a password field and silently replace typed characters with a redacted marker; the review card line becomes "Fill saved secret". Only prompt (one inline row, "Save as secret") when a password was actually typed. Do NOT add "Mark as sensitive", a secret-name dialog beyond the existing `request_secret` card, or a warning banner. Until detection exists, the existing Protected input stays. Treat plain-text password capture as a P1 safety fix.

**F4 Try it now.** Lives in the existing computer window and `SkillDraftCard` "Test" button. Test opens the computer window, shows one line in the chrome bar ("Trying: <name>", Stop), and risky steps use the existing approval card. At the end, the card's button area shows "Worked" or "Stopped at step N". Do NOT add a step counter, per-step chat messages, run-on-a-copy, or time estimates.

**F5 List of taught skills.** Lives in `BotSkillsSection` (Settings > Skills) as a second group "Taught" in the same rows (`SkillSourceBadge` already distinguishes sources). Row: name, last run. Row click opens `SkillDraftCard`. Menu: Delete only. Do NOT add rename-as-menu (name is editable in the card), copy-to-bot, search, "8 of 9 runs" counts, or "Used by routine" labels in v1. Show "Used by N routines" only inside the Delete confirmation.

**F6 Schedule a taught skill.** Lives in `RoutineEditor`. The existing "Add a skill" picker lists taught skills in the same list as agent skills; the routine stores a reference. "Add to routine" on the card opens the form with the skill preselected, so the card no longer pastes text. Safety comes from the approvals work (unattended runs ask before write/shell/computer actions), not from new teaching UI. Do NOT add an "Only tell me if something needs me" setting or a new notification surface: use the existing approval notification and the routine's existing quiet-on-success behavior.

**F7 Versions and re-teach.** Do not build in v1. "Save overwrites" is acceptable while the skill is a short text. If needed: "Teach again" on the card replaces the steps; one previous copy kept behind "Undo". Do NOT build "Re-teach from step 4", highlighted diffs, restore lists, or a 5-version history. That is a second product.

**F8 Failure.** Reuse the run card and the existing notification. The text is one line: "Stopped at step N: <what was not on screen>", with the last screenshot only if step images already exist from F2. Buttons: "Open computer" (exists). Do NOT add "Re-teach", "Skip this run", failure counters or auto-pause UI in v1. Two failures in a row pausing the routine reuses the routine's existing paused state.

**F9 Cancel.** Add one "Cancel" next to "Stop teaching" in `TeachRecordingChrome`. No confirmation dialog if the recording is under a minute; otherwise use the existing confirm pattern. This is also the answer to C7: when the computer window is closed, show a Stop and Cancel in the composer's disabled strip.

## PRD items that would add needless UI

- "Mark as sensitive" button: replace by automatic detection (F3) plus the existing Protected input.
- Per-bot and per-space teaching settings, retention settings: none. Delete screenshots with the skill; one fixed rule.
- "Success/failure counts", "lastRunAt", "Copy to another bot", `TaughtSkillVersion`: needs-evidence features. Add when a user asks.
- New menu "composer + menu > Teach a task" is fine as a shortcut, but it must open the same popover; do not add a second teach flow.
- A separate "Skills" screen for taught skills: use the existing Skills section.
- Approval boundaries as a visible field: it has no effect today. Hide it under "More" and say nothing until it is enforced.

## 3. Redundancy

| Duplicate | Fix |
|---|---|
| Taught skills vs agent skills (`rpc.skills.*` vs `rpc.agentSkills.*`), two concepts, only one list | One list in Settings > Skills with a "Taught" group; one picker in the routine form. Keep the two backends. |
| "Add to routine" pasting the playbook vs the routine's "Add a skill" picker | Remove the paste. "Add to routine" opens the form with the skill selected. |
| Name, When to use, Inputs, Steps all repeat the goal sentence | Generate Name (short) once; hide When to use and Inputs until they differ from the goal. |
| Approval boundaries text vs the Approvals table | One source: the Approvals table. The skill field becomes a read-only note or is removed. |
| Test button vs routine form "Test run" | Keep both only if both use the same run path; the card button is enough for v1. |
| Protected input box vs password detection | Keep the box now; remove when detection ships. |
| Routines vs watchers vs check-ins lists | Taught skills add no new list. They appear in Skills and as the thing a routine runs. Watchers and check-ins should stay as routine rows with a type badge, as the PRD already says. |

## 4. Top 5 recommendations (value / effort)

1. **Fix the unsafe end of the chain (C6, F6).** A scheduled taught skill must hit the approvals gate for computer, shell and file actions, and "Add to routine" must link to the skill rather than paste text. High value, depends on the approvals work.
2. **Redact passwords on the way in (C3, F3).** Stop storing typed passwords and unredacted final-screen text as plain skill text. Safety defect with a small backend fix.
3. **Make the draft card readable (F2).** Steps in words, final-screen crop, 8 fields cut to about 3, Save in view. Biggest daily-use improvement; one model call.
4. **Add Cancel and an always-reachable Stop (F9, C7).** Small UI addition to the existing recording bar; fixes a trap.
5. **Show taught skills in Settings > Skills (F5).** Reuses the existing section, makes saved skills findable and deletable. Defer versions, counts and copy.

Not recommended for v1: versions and re-teach (F7), success counts, step counters in Test (F4), and any new teaching setting.
