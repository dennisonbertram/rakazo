# UX walk: Watchers (wake only on change) on top of routines

Walked 2026-10-25 in the demo stack (synthetic data, mock model), browser session `unattended-watchers`, viewport 1280x577 then 1440x900. Stories: `docs/ux-paths/unattended/watchers.md` (WATCHERS-C1 to C6). Screenshots are scratch files under `ux-shots/watchers/` in the session scratchpad and are not committed; the paths below are given relative to that folder.

Result: 6 of 6 stories pass (the goal of each can be done). Several steps differ from the story text; those are listed as findings.

## Walk side effects (my own mistakes, demo data only)

- One step used a text selector ("Save") that matched a button in an old chat card, not the routine editor. It saved a draft skill ("x") and started a "Teaching" mode in the chat. This produced the red text "Teaching is in progress. Stop teaching before sending a new message." and an extra routine "Open work review" in the list. The routine list was back to "Morning briefing" only after a page reload.
- Two webhook deliveries (valid key, `{"event":"invoice.paid"...}` and `{}`) and one failed delivery (wrong key, 401) were sent to the demo API. Test routines "Cash check", "Billing events" and "Competitor pricing check" were created. The first two were deleted. The last one could not be deleted by the script and remains in the demo stack.
- No page on :5273 or :5173 was opened.

## WATCHERS-C1: See the routines a bot runs. PASS

Steps taken: 2 (click "Computer and routines", read the list). Ideal: 2.
Saw: heading "Routines", subtitle "Work this bot repeats for you, like a cash check every Monday.", "Create a routine", and the row "Morning briefing / Weekdays at 8:00 AM" with a green clock. Paused routine showed a pause icon and "Paused" (`c3-3-list.png`).

Findings
- P3. The row has no last run, next run or last result, so a user cannot tell whether a daily routine actually ran. This is the gap a watcher status line would fill. (`c1-panel.png`)
- P3. With the default 1280x577 viewport the header button is only an icon with the accessible name "Computer and routines"; the story says the button text is "Routines". The icon has no label, so a first-time user has to guess that the small calendar icon opens routines. (`00-home.png`)

## WATCHERS-C2: Create a scheduled routine. PASS

Steps taken: 6 (Create, Name, Instruction, Choose when, Every week, Save). Ideal 5. Defaults were Monday 9:00 AM, so no time change was needed.
Saw: "Save" is disabled until name and instruction are filled. The "Choose when it runs" menu has "On a schedule" items plus "From another app (advanced)". After Save the button reads "Saved", "Delete" and "Test run" appear and "Next run Mon, Oct 26, 9:00 AM" shows. (`c2-1-editor.png`, `c2-2-menu.png`, `c2-3-week.png`, `c2-5-saved.png`)

Findings
- P2. The story says "Next run" appears when a schedule is picked, but it appears only after Save (`c2-3-week.png` has none; `c2-5-saved.png` has it). The user cannot confirm what they chose before saving.
- P3. At 577 px height the Save button is below the fold when a schedule row is open; the user has to scroll the panel. At 900 px it fits. (`c2-4b-tall.png`)
- P3. "Choose when it runs" stays as a large button after one schedule is added, so it is unclear that a routine can have several schedules and whether adding another replaces or adds.
- P3. The submenu "From another app (advanced)" opens as a floating box below and left of its parent item, detached from the menu (`c4-1-submenu.png`).

## WATCHERS-C3: Pause, test and delete a routine. PASS

Steps taken: pause 3 (open row, toggle Active, Save), test 1, delete 2 (Delete, confirm). Ideal 2 for pause: the toggle needs a Save click.
Saw: after pause the list row reads "Paused" with a pause icon and "Next run" disappears (`c3-3-list.png`). Test run shows "Running…" and disables Delete; the chat answered "Current cash is $1,633,221 ... no change at the dollar-rounded level" (`c3-1-test.png`, `c5-3-refresh.png`). Delete asks "Delete Cash check? This cannot be undone." with Cancel and Delete, then returns to the list (`c3-4-delete.png`).

Findings
- P2. The test run's reply appears in the chat as an ordinary bot message with no sign that it came from the routine "Cash check" test. Nothing links the message to the routine except the "View chat" link in Run history, and that link did not visibly move or highlight anything because the message was already on screen (`c5-4-viewchat.png`). A watcher's wake would look the same: a bot message with no "why am I seeing this".
- P3. The editor still shows the schedule row after the routine is paused; only the list says "Paused". The toggle gives no hint that unsaved changes are not applied until Save.
- Confirmed edge case: the test run produced a message even though the instruction said "say nothing if unchanged", so "stay silent" is not exercised by Test run.

## WATCHERS-C4: Wake a bot from another app with a webhook. PASS

Steps taken: 8 (Create, name, instruction, Choose, From another app, Webhook, Save, Rotate key). Ideal 4.
Saw: card "When a webhook fires" with "POST to / key / header", each showing "Available after the routine is saved" before Save (`c4-2-webhook-card.png`). After Save the URL shows but the key reads "Saved. Rotate to reveal." (`c4-3-saved.png`). Rotate key reveals the key and header inline (`c4-4-rotate.png`). A POST with that key returned 200 and woke the bot. A POST with a wrong key returned 401. After rotation the old key returned 401.

Findings
- P1. The story says Save reveals the one-time key. It does not: after the first Save the key is already hidden ("Saved. Rotate to reveal."). The user must discover and click "Rotate key" to see any key, with no explanation. This is the most confusing step in the whole setup flow. (`c4-3-saved.png`)
- P2. Rotate key has no confirmation and no warning that the old key stops working. The revealed key has no copy button, and after it shows, the "Rotate key" link is gone until the panel is reloaded.
- P2. Webhook deliveries are not listed in the routine's Run history. After two deliveries, Run history said "No runs yet" (also after a page reload). A user cannot see whether the webhook fired. (`c4-7-history.png`)
- P2. In the chat the delivery appears as a large green user-style bubble holding the full instruction and a fenced `<untrusted_delivery_payload>` block, followed by a bot reply. Every delivery adds this block, so a frequent webhook would fill the chat. (`c4-7-history.png`)
- P3. The bot's reply to an empty `{}` delivery was "No event details were included", so a delivery with no change still produced a visible message; this is the "every delivery wakes the model" edge case confirmed.
- P3. Three identical placeholder lines "Available after the routine is saved" are visual noise.

## WATCHERS-C5: Read what a routine did. PASS

Steps taken: 4 (open routine, expand Run history, Refresh, View chat). Ideal 3.
Saw: empty state "No runs yet". After a test run the row showed "Oct 25, 2026, 11:50 AM / Cash check / Running". (`c5-1-history.png`)

Findings
- P2. The row stayed "Running" after the run finished (buttons had already returned to "Test run"/"Delete" and the chat showed the reply). It changed to "Done / 42s / View chat" only after clicking "Refresh" (`c5-2-after.png` vs `c5-3-refresh.png`). Run history does not update on its own.
- P2. Rows show only time, name, status and duration. They give no summary of the result ("no change" vs "changed"), so a user must open the chat to learn what the run found.
- Not exercised: "Load older runs", "Waiting on <bot>", "Could not load run history", and a silent `NO_RESPONSE` run (the mock model does not produce one).

## WATCHERS-C6: Ask a bot to schedule a check from chat. PASS

Steps taken: 3 (send request, answer the bot's question with a URL, approve). Ideal 3, but the bot asked for the URL first because the request had none; the mock model asked "What's the competitor pricing page URL? I can check it every morning at 9:00 AM".
Saw: approval card titled "Every day at 9:00 AM, posts here" with a "Details" disclosure and buttons "Allow once", "Deny", "Always allow this / Won't ask again for this kind of action." (`c6-2.png`). Details shows time zone, next run and the full prompt. After "Allow once" the card read "Approved", the routine "Competitor pricing check / Every day at 9:00 AM" appeared in the list, and Chief confirmed in text (`c6-5-approved.png`, `c6-6-after.png`).

Findings
- P2. The generated prompt compares against "the most recent prior check recorded in this routine's run history" and says "If unchanged, say there was no change." So the daily check posts a message every morning even when nothing changed, which is the opposite of the request "tell me if it changes". It also relies on run history holding the previous page, but run history rows hold no content (see C5). (`c6-3-details.png`)
- P2. With Details expanded at 1440x900 the "Allow once" and "Deny" buttons were pushed below the composer and the chat did not scroll to them with the mouse wheel; I approved through the accessibility tree. A real user may not find the buttons. This could be a harness scroll issue; re-check with a real mouse. (`c6-4-details2.png`)
- P3. The card says "Allow once" and offers "Always allow this", although the action is creating a recurring schedule; "Allow once" is a confusing word for a thing that repeats every day. The story says "Approve"; the label is "Allow once", and the card afterwards says "Approved".
- P3. No `routine.created` event was visible in the thread (the story expects one); only the bot's text confirmation.

## Notes for adding Watchers on top of routines

Where it fits today
- The routine editor's "Choose when it runs" menu is the natural place: add a "Watch for changes" group beside "On a schedule" and "From another app (advanced)". The webhook card ("When a webhook fires") is the pattern to copy for the watch card.
- The routine row in the list already has a one-line subtitle; it can carry "Watch · checked 4 min ago" without a new surface.

What is confusing or missing today that a watcher would inherit
1. No evidence of what happened on each wake. Run history has no result summary, does not auto-refresh, and does not list webhook runs (C4, C5). A watcher that mostly does nothing needs "checked, nothing new" visible somewhere other than the chat.
2. Quiet is not a supported outcome. Test run always posts, the chat-created check says "say there was no change", and the webhook with an empty payload posted a message (C3, C4, C6). Watchers need a defined silent result.
3. Wakes have no label in the chat. Test runs look like bot messages; webhook runs look like long user bubbles (C3, C4). A watcher wake should say which routine woke the bot and what changed.
4. The key and setup flow for webhooks is hidden behind "Rotate key" (C4). A watcher setup that asks for a URL should show everything needed before Save and explain results after Save.
5. Chat-created checks store the "previous version" nowhere except the prompt and run history text (C6), so comparisons depend on the model's memory. A watcher needs its own stored previous state, not the chat.
6. The approval card for a recurring schedule says "Allow once" (C6).
7. The editor does not show "Next run" before save and the list shows no last-run line (C1, C2); both would also help watchers.
