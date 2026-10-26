# UX walk: Quiet check-ins and open items

Walked 2026-10-25 on branch `feat/unattended-bots`, demo stack (synthetic data), web at 1400x1000, dark theme, session `unattended-checkins`. Stories: `docs/ux-paths/unattended/checkins.md` (CHECKINS-C1 to C7). The demo stack was shared with other walkers, so the Chief chat showed unrelated runs, an email approval card and a "Teaching in progress" banner that I did not cause. Screenshots are in the scratch folder `ux-shots/checkins/` (named below).

## Summary

| Story | Result | Notes |
|---|---|---|
| C1 Add a to-do | Pass (step 4 not walked) | 5 steps instead of the story's 4 plus hidden list |
| C2 Park and reopen | Pass | Works; emphasis and wrapping issues |
| C3 Complete | Pass | Item vanishes, no undo, no done view |
| C4 Silent routine | Pass with caveats | Walked end to end, but could not confirm silence |
| C5 notify_user | Not walked | Needs a bot turn calling the tool; code only |
| C6 Stuck-work reminders | Partly walked | Activity "Needs you" seen; 4h and 24h timers not observable |
| C7 Open work in routine prompt | Not walked | Prompt content is not visible in the UI |

## C1: Add a to-do to a bot's open work (pass)

Steps taken: (1) open Chief (already open after sign-in), (2) click header "Chief" to open settings, (3) click "Advanced" in the panel, (4) click the "Add item" field, (5) type and press Enter. Ideal: 3. The "Open work" list sits inside Advanced, between "Workspace" and "Model", and the panel opens with the page scrolled so "Advanced" is at the very bottom edge at small window heights.
Step 4 of the story ("What is on my plate?") was not walked: the shared demo chat was busy and the story needs a live prompt-context check.

Findings:
- P2: Open work is hidden under Advanced next to Workspace and Model. A user who wants a follow-up list will not look there. Screenshot `c1-3-adv-open.png`.
- P3: In the 384px-wide panel the row title wraps ("Chase Halcyon / security questionnaire") because the status text, Park button and X take the right side. Screenshot `c1-4-added.png`.
- P3: The "open" status text is tiny and dim, and "Park" is low contrast, so the row's actions are hard to read. Same screenshot.
- P3: A taught-run card in the chat also has an "Advanced" disclosure, so a text-based click on "Advanced" hit the wrong control for me (tooling-visible; a real user sees two unrelated "Advanced" labels on screen at once). Screenshot `c1-2-big.png`.

## C2: Park and reopen (pass)

Steps: click "Park" (status text becomes "parked", button becomes "Open", accessible name "Reopen"), click again (back to open). 2 steps, equals ideal.

Findings:
- P3: After parking, "Open" is drawn bold and bright while "Park" was dim, so the same slot changes emphasis and the title wraps to three lines. Screenshot `c2-1-parked.png`.
- P3: "Open" as a button label next to the status word "open" and the heading "Open work" is ambiguous (action or state?). The story already notes that "parked" means two things on the GTM page.

## C3: Complete an item (pass)

Steps: tick "Complete". The row disappears at once and "None yet" returns. 1 step, equals ideal. Screenshot `c3-1-completed.png`.

Findings:
- P2: No toast, no undo, and no way to see or reopen done items. A mis-click loses the item from view. This matters for check-ins, since a bot or the user may close items and the user needs to see what closed and why.
- P3: Checkbox "Complete" and the X "Remove" (permanent, no confirmation) sit a few pixels apart on the same row.

## C4: Bot ends a routine run silently (pass with caveats)

Steps: click header "Computer and routines", click "Create a routine", type name and instruction, open "Choose when it runs", pick "Every week" (defaults to Monday 9:00 AM), "Save" (shows "Saved", "Next run Mon, Oct 26, 9:00 AM"), "Test run". The run finished "Done" in 6.3 s. 7 steps counting both fields; ideal per the story is 4. After the walk I deleted the test routine (confirmation dialog "Delete Open work review?" appeared).

Findings:
- P2: Quiet behavior depends on the user typing the literal word `NO_RESPONSE` in the instruction. Nothing in the editor says this exists, and there is no "only tell me if something needs me" control. Screenshot `c4-2-editor.png`.
- P2: I could not tell whether the test run was silent. Run history shows only "Oct 25, 11:52 AM / Open work review / 6.3s / Done". No new bubble appeared in Chief's chat, but the history does not say "nothing to report" versus "replied". In Activity the run is listed under "Finished" as "Chief, Done, Review open work. If nothing needs me, r…" like any other run, so a quiet run costs a row of Activity noise. Screenshots `c4-10-after.png`, `c6-2-finished.png`. I did not verify which reply the demo model gave.
- P3: The sliders icon labelled "Advanced" (time zone and model) opens a popover that overlays and blocks the "Choose when it runs" button, and the schedule menu also has an item "Advanced…" and "From another app (advanced)". Three different "advanced" things in one panel. Screenshots `c4-3-advanced.png`, `c4-5-when.png`.
- P3: The routines panel (list view) has no title bar; "Routines" is only a small grey label, and the right side header shows just a gear and close. Screenshot `c4-1-routines.png`.
- P3: Run history rows are not expandable, so output cannot be inspected from the panel.

## C5: Agent raises a notification only when something is new (not walked)

Needs a bot to call `notify_user`; not triggerable from the UI. No browser evidence. Notes for the feature: Chief's panel shows "Notifications" switch disabled with "Off in Settings" link, which is where a per-bot check-in switch would sit (screenshot `c1-1-settings.png`). The switch is disabled with no explanation of why until the user follows the link.

## C6: Stuck-work reminders (partly walked)

Steps: click the clock icon "Activity" at the top of the sidebar. The panel shows "Needs you" (Investor Relations, "Needs your answer", amber dot), "Working" (Finance helper, Running) and a collapsed "Show 15 finished runs" that expands to a "Finished" list. 1 step to see all of it. Screenshot `c6-1-activity.png`, `c6-2-finished.png`.
Not observable: the 4 hour warning colour, the reminder notification, the 24 hour cancel. Those are in `packages/core/src/stuck-work.ts` only.

Findings:
- P3: The only entry in "Needs you" shows a one-line truncated question ("Should the October update name the Bolt…") with no way to answer from the row; it opens the chat. Acceptable, but the check-in feature should reuse this row style.
- P3: "Show 15 finished runs" then "+5 more": a finished list grows quickly once check-ins run weekly or daily across bots.

## C7: Bot reads open work at the start of a routine run (not walked)

The prompt block `<scratchpad_open>` is invisible in the UI. After my test run I could not see whether it was included, or what the bot did with the item list (no items existed at that time since I had completed the only one). No UI reflects item changes made by a run except reopening the panel.

## Notes for adding "Quiet check-ins and open items"

- Where it would fit: the per-bot "Notifications" row in the bot settings panel is the natural place for a check-in control (Off by default). The Routines panel is where users already schedule unattended runs. Open work is the data a check-in would read, but today it is the least visible control in the panel.
- What is confusing today:
  1. Open work is buried in Advanced; it is the core input of a check-in.
  2. There is no done view, so closed items (by the user or a bot) cannot be audited or reopened.
  3. Quiet runs are a hidden magic word; a run that stays silent looks identical to a run that spoke, in both run history and Activity.
  4. "Open", "Advanced" and "parked" each mean more than one thing across the panel and the GTM page.
  5. There is no cross-bot view of open items (the list needs a bot panel per bot; Activity lists runs, not items).
- Reusable pieces seen working: the row with checkbox, Park and X; the schedule picker ("Every week", day and time, "Next run" line); the Activity "Needs you / Working / Finished" grouping; the delete confirmation dialog.
