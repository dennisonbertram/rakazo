# Live pages: Managing sources, failure and recovery

Topic prefix: SOURCES. Read from code: PageSourcesDialog.tsx, PageLiveBlocks.tsx, page-source-tick.ts, page-sources.ts, bot-page-panel.tsx.

Facts the stories rely on (from code):
- The "Sources" item is in the page "Page options" menu and only appears when the page has at least one source. The "Refresh" item sits next to it.
- A row badge is "failed" only when the source is active AND has a last error. Otherwise "ok", "pending", "paused" or "denied".
- Pause is offered only for active sources, Resume only for paused ones. Remove is always offered.
- Pause, Resume and schedule changes update the row from the server reply and reload the page data. Remove has a confirm dialog "Remove {name}?" with "Cancel" and "Remove".
- Resume sets the source active, resets failures to 0 and schedules a refresh for now. It does not clear the old last error.
- A failure increments the failure count. The 5th failure in a row pauses the source. Retries wait at least the schedule interval, doubling per failure, capped at 6 hours.
- The "Source failed" dot (warning colour) shows a popover with the error text and "Retry". "Source paused" shows the same popover with no Retry.
- Retry calls `pages.refresh`, which only refreshes active sources whose last success is more than 60 seconds old.
- The bot thread message "A source on one of your pages stopped working. Call page_source_list to see which one and why." is posted only by the scheduler tick, not by a manual refresh.

Seeded sources used below (Finance agent, page "Cash"): "Monthly burn", "Largest vendors", "Cash (stale)" (failed twice, "Request timed out"), "Payroll (paused)", "Never fetched (paused)", "Outside rate (pending)" (http). Page "Spend" has "Spend this month".

---

## STORY-SOURCES-01: Priya opens the Sources dialog and reads every row
**Type**: short
**Topic**: Managing sources
**Persona**: Priya, a seed-stage founder checking which numbers on the Cash page are trustworthy before a board call
**Goal**: See every source on the Cash page with its state and last error.
**Preconditions**: Logged in as the seeded owner. Cash page is in the sidebar.
**Ideal path**: 3 — open the page, open "Page options", choose "Sources".
**Alternate paths**: Open the Finance agent chat at `/app/:botId`, click the header "Page" button, then use the same "Page options" menu in the side panel. The dialog is identical in both places. No other route; the mobile app has no Sources dialog.
### Steps
1. Click the Cash page in the sidebar → full-width page at `/app/pages/:botId/:pageId` with the blocks "Monthly burn", "Largest vendors" and others.
2. Click the "Page options" (three dots) button in the header → menu with "Refresh", "Sources", "Share", "Rename". There is no "Delete" on the full-width page.
3. Click "Sources" → dialog titled "Sources". Briefly shows 3 skeleton rows, then one row per source.
4. Read the "Cash (stale)" row → name, a subline ending in the schedule (for example "Hourly"), a "failed" red badge, and a line "Request timed out" under it.
5. Read "Payroll (paused)" and "Never fetched (paused)" → "paused" outline badge. "Never fetched (paused)" has no time at the right.
6. Read "Outside rate (pending)" → "pending" outline badge, no time.
7. Hover the error line on "Cash (stale)" → tooltip with the full error text.
### Variations
- Phone width (390px): the dialog fills the width; name and subline truncate, and the time, badge and menu button stay on one row. Check that the badge and "…" button are not pushed off screen.
- Keyboard: Tab reaches each "{name} options" button; Escape closes the dialog.
### Edge Cases
- On the Spend page the dialog lists one row, "Spend this month".
- The dialog has no "Add source" button and no way to edit a source's call. Only the bot can do that. A user looking for it finds nothing.
- Same state also shows on the page itself: warning dots on blocks (side panel and full-width), and sidebar rows show nothing.

---

## STORY-SOURCES-02: Slow down a source by changing its schedule
**Type**: short
**Topic**: Managing sources
**Persona**: Marcus, an ops lead who thinks the Monthly burn source refreshes too often
**Goal**: Change "Monthly burn" from its current schedule to Daily.
**Preconditions**: Logged in as the seeded owner. Cash page open.
**Ideal path**: 5 — open Sources, open the row menu, open the submenu, pick Daily.
**Alternate paths**: none found. The schedule can only be changed from this dialog (the bot can change it with `page_source_set`).
### Steps
1. Open "Page options" → "Sources" → dialog shows rows.
2. Click "Monthly burn options" → menu with "Change schedule", "Pause", "Remove".
3. Hover or click "Change schedule" → submenu with radio items "Every 15 min", "Hourly", "Every 6 hours", "Daily", "Weekly"; the current one is selected.
4. Click "Daily" → menu closes, the row subline now ends in "Daily". No toast.
5. Close the dialog with Escape → the page is unchanged visually.
### Variations
- Keyboard: open the row menu with Enter, ArrowRight on "Change schedule", ArrowDown to "Daily", Enter.
- Phone width: the submenu opens beside the menu and may be tight; check it is fully visible.
- Reopen the dialog → "Daily" persists.
### Edge Cases
- Changing the schedule on a paused source keeps it paused (the next run time is only reset for active sources).
- Picking the already selected schedule re-sends it and the next run time is moved out.
- If the request fails, a red line (role "alert") appears at the top of the dialog.

---

## STORY-SOURCES-03: Pause a source and see the block say "Paused"
**Type**: medium
**Topic**: Managing sources
**Persona**: Dana, a finance manager who wants Largest vendors frozen while the books are being cleaned up
**Goal**: Pause "Largest vendors", see its effect on the page, then resume it.
**Preconditions**: Logged in as the seeded owner. Cash page open (full-width).
**Ideal path**: 5 for pause — Page options, Sources, row menu, Pause (the last step), then close.
**Alternate paths**: none found. There is no pause control on the block itself.
### Steps
1. Note the "Largest vendors" table shows rows → table with vendor names.
2. Open "Page options" → "Sources" → dialog.
3. Click "Largest vendors options" → menu has "Change schedule", "Pause", "Remove" (no "Resume").
4. Click "Pause" → badge changes from "ok" to "paused"; the page behind reloads its data.
5. Close the dialog → the table still shows its last rows (not replaced by a placeholder) and a warning dot with aria-label "Source paused" is in the block header. The fetch time stays visible.
6. Click the dot → popover. If the source had an earlier error it shows that error; otherwise the popover is empty text. There is no Retry button.
7. Reopen "Sources" → "Largest vendors options" now shows "Resume" instead of "Pause".
8. Click "Resume" → badge returns to "ok" (or "failed" if an old error is still stored; see Edge Cases).
9. Close the dialog → the dot is gone once the page data reloads.
### Variations
- Pause a source with no data yet: use "Never fetched (paused)". The block shows the text "Paused" instead of a value.
- Phone width: the popover for the dot opens aligned to the end of the header; confirm it stays on screen.
### Edge Cases
- Pausing a source that is pending or denied: the menu has neither "Pause" nor "Resume".
- Resume does not clear the stored last error. Right after Resume a source that had failed may show "failed" until the scheduler runs it (the next run is set to now). The user sees "failed" on a source they just resumed. Possible UX defect.
- Opening the popover on a paused source with no error shows an empty popover. Possible UX defect.

---

## STORY-SOURCES-04: Resume a source that was paused after failures
**Type**: short
**Topic**: Failure and recovery
**Persona**: Priya, who sees "Payroll (paused)" and wants it running again
**Goal**: Resume "Payroll (paused)" and get fresh data.
**Preconditions**: Logged in as the seeded owner. Cash page open. Whether the refresh succeeds depends on the seed; mark the outcome as what the walker observes.
**Ideal path**: 4 — Page options, Sources, row menu, Resume.
**Alternate paths**: none found. The block's paused dot has no Resume.
### Steps
1. Open "Page options" → "Sources" → "Payroll (paused)" row has a "paused" badge.
2. Click "Payroll (paused) options" → menu has "Change schedule", "Resume", "Remove".
3. Click "Resume" → badge changes to "ok" (or "failed" if an old error line is shown under the name).
4. Close the dialog → block "Payroll (paused)" no longer says "Paused". It shows data, "No data yet" or the shimmer "Refreshing" while the scheduler runs.
5. Reopen "Sources" a minute later → the row shows a recent time and, if the refresh succeeded, no error line.
### Variations
- Keyboard only: all steps work with Tab, Enter and arrow keys.
### Edge Cases
- The scheduler tick runs on its own timer, so the change is not instant. On a demo stack without a running worker the data may not change; in that case use the page's "Refresh" item, which only refreshes active sources more than 60 seconds old.
- Failure count is reset to 0 on Resume, so the next failure starts counting from 1 again.

---

## STORY-SOURCES-05: Remove a source after a second thought
**Type**: medium
**Topic**: Managing sources
**Persona**: Marcus, who hesitates before deleting the Spend source and cancels once
**Goal**: Cancel one removal, then remove "Spend this month" and see the block react.
**Preconditions**: Logged in as the seeded owner. Spend page open.
**Ideal path**: 5 — Page options, Sources, row menu, Remove, confirm.
**Alternate paths**: none found. The bot can also remove it with `page_source_remove`.
### Steps
1. Open the Spend page → block "Spend this month" shows a value.
2. Open "Page options" → "Sources" → one row, "Spend this month".
3. Click "Spend this month options" → "Remove" is red.
4. Click "Remove" → confirm dialog titled "Remove Spend this month?" with "Cancel" and "Remove". Nothing about the effect on blocks is stated.
5. Click "Cancel" → confirm closes; the row is still there.
6. Open the row menu and "Remove" again, then click "Remove" → the row disappears and the dialog shows "No sources".
7. Close the dialog → the "Spend this month" block now shows "Source not found". The page text is otherwise unchanged.
8. Click "Page options" → "Refresh" and "Sources" are gone, because the page has no sources.
### Variations
- Enter on the confirm dialog's focused button; Escape cancels.
- Phone width: the title wraps because of a break-words class; a very long source name stays inside the dialog.
- The same block in the bot's side panel (chat "Page" button) shows "Source not found" too.
### Edge Cases
- There is no undo. To get the source back the user must ask the bot to add it again; no model runs in the demo.
- The block with the removed source is left in the page content; the user must delete it with the hover "Delete block" button.
- Failure to remove shows a red alert at the top of the dialog and the row stays.
- Removal order: an HTML page "Cash HTML" that lists the removed source in its praci-sources meta tag will show that source as missing in the frame (no visible error text).

---

## STORY-SOURCES-06: Diagnose a stale metric from the failed dot and retry
**Type**: medium
**Topic**: Failure and recovery
**Persona**: Priya, who notices "Cash (stale)" looks old before a board call
**Goal**: Find out why the number is stale and try a refresh.
**Preconditions**: Logged in as the seeded owner. Cash page open. The demo seed's call may succeed or fail on Retry; the walker records what happens.
**Ideal path**: 3 — click the warning dot, read the error, click Retry.
**Alternate paths**: Page options → Sources shows the same error text under the row; Page options → "Refresh" refreshes all sources and does the same work but gives no popover feedback.
### Steps
1. Find the "Cash (stale)" metric → label at the top left, an old value, the fetch time visible at all times (not only on hover) because the block is stale, and a small warning dot at the right.
2. Hover another healthy block, for example "Monthly burn" → its fetch time appears only on hover or focus.
3. Click the warning dot (aria-label "Source failed") → popover with "Request timed out" and a "Retry" button.
4. Click "Retry" → block pulses and shows shimmer on its value while refreshing; the whole page also reloads.
5. Read the result:
   - Success: the dot disappears, the value and the fetch time update.
   - Failure: the dot stays; the popover may have closed and must be reopened to read the error.
6. Open "Page options" → "Sources" → "Cash (stale)" row now shows the latest state (badge "ok" or "failed").
### Variations
- Keyboard: Tab to the block (it is focusable, with fetch time shown on focus), Tab to the dot, Enter to open, Tab to "Retry", Enter.
- Phone width (390px): the popover is anchored to the end of the header and must not overflow; the dot is 16px wide, a small touch target. Check it.
- Same warning appears on the side panel and full-width page; on mobile it has the label "Source failed" but is not wired the same way.
### Edge Cases
- Retry refreshes every active source on the page, not only this one. Other blocks shimmer too.
- Retry on a source whose last success was under 60 seconds ago does nothing and the popover gives no hint.
- Each failed Retry adds to the failure count; see STORY-SOURCES-07.
- Retry button remains visible even while a refresh is in progress; clicking twice sends two refreshes.

---

## STORY-SOURCES-07: Repeated failures pause a source and the bot is told
**Type**: long
**Topic**: Failure and recovery
**Persona**: Dana, a finance manager whose bank feed went down overnight
**Goal**: Follow a source from first failure to auto-pause to resume, and see where the bot and the owner are told.
**Preconditions**: Logged in as the seeded owner. Failing source: "Cash (stale)" already has 2 failures in the seed. Steps that need the scheduler to run on its own (steps 8-10) need a running worker and 3 more failed runs; otherwise they are not walkable by hand. Step 12 about the bot thread message needs the worker tick path. Note for the walker: the bot cannot reply (DEMO_NO_MODEL=1), but the message itself is posted.
**Ideal path**: not applicable as a user goal; the shortest recovery from the paused state is 4 — Page options, Sources, row menu, Resume.
**Alternate paths**: A user can skip waiting by pressing Retry three times (see Edge Cases); that pauses the source through a different code path.
### Steps
1. Open the Cash page → "Cash (stale)" shows the old value and a warning dot.
2. Click the dot → popover "Request timed out" and "Retry".
3. Close it with Escape.
4. Open "Page options" → "Sources" → "Cash (stale)" shows the red "failed" badge and the error line "Request timed out". The status is still active.
5. Close the dialog and wait for the scheduler. After each failed run the next run is pushed out: at least the schedule interval and doubling per failure, up to 6 hours. So the third, fourth and fifth failures are further apart.
6. After the third failure → the error text may change or stay; the dot stays; nothing else changes. No warning that the source is nearing the limit.
7. After the fourth failure → same.
8. After the fifth failure in a row → the source status changes to paused.
9. Reload the page → the "Cash (stale)" block now has the dot labelled "Source paused" (no Retry) and the old value is still shown.
10. Click the dot → popover shows the last error and no Retry button, and no sentence saying the source was paused after repeated failures.
11. Open "Page options" → "Sources" → badge "paused", error line still shown, row menu offers "Resume".
12. Open the Finance agent chat at `/app/:botId` → the thread has a new user-style message: "A source on one of your pages stopped working. Call page_source_list to see which one and why." The bot is started on it. The message does not name the page or the source. (Without a model nothing follows.)
13. Return to the page and open "Sources" → "Cash (stale) options" → "Resume" → badge returns to "ok" or "failed" (old error kept) and failure count is reset to 0.
14. Close the dialog and wait for the next run → on success the dot disappears, the value and time update, and the error line is gone.
15. Reopen "Sources" → the row shows a fresh time and no error line.
### Variations
- Phone width: steps 1-2, 9-11 and 13 at 390px.
- Side panel: do steps 9-11 from the chat "Page" panel; same dot and dialog.
- Fix first: if the bot fixes the call (needs a model) the source goes back to active without the owner pressing Resume only if the call changes; the story assumes the owner resumes.
### Edge Cases
- The owner gets no notification of the auto-pause on the page. If the owner is not looking at the Cash page and the chat, nothing says the number is frozen except the small dot. Possible UX defect.
- Manual path: pressing Retry on the failed dot three times (each after the 60-second debounce) reaches 5 failures and pauses the source, but the bot thread message is posted only by the scheduler tick, not by manual refresh, so in this case the bot is never told (page-source-tick.ts:79 versus the `pages.refresh` handler in apps/api/src/router.ts:4499). Possible defect.
- Resume then immediate failure: the failure count starts from 0, so five more failures are needed.
- Resume while the badge still says "failed" from the old error looks like the resume did nothing.
- The daily cap of 2,000 refreshes per space defers a due source to the next UTC midnight without any message.

---

## STORY-SOURCES-08: Stale data on a block that has never worked
**Type**: short
**Topic**: Failure and recovery
**Persona**: Sam, a new teammate who opens the Cash page and sees blanks
**Goal**: Understand why "Never fetched (paused)" and "Outside rate (pending)" show no number.
**Preconditions**: Logged in as the seeded owner. Cash page open.
**Ideal path**: 2 — read the placeholders, then open Sources to see the badges.
**Alternate paths**: Click the "Waiting for approval" link (full-width page only) to reach the chat where the approval card would be. A seeded approval card is not guaranteed; mark any step that needs one "needs seeded approval card".
### Steps
1. Scroll to the block bound to "Never fetched (paused)" → text "Paused" and a dot labelled "Source paused" (no value, no time).
2. Scroll to the block bound to "Outside rate (pending)" → text "Waiting for approval", shown as an underlined button on the full-width page.
3. Open the same Cash page in the chat side panel (Finance agent, header "Page") → the same block says "Waiting for approval" as plain text, not a link.
4. On the full-width page click "Waiting for approval" → navigates to `/app/:botId` (the chat). Needs seeded approval card to see the card; otherwise the chat just opens.
5. Back on the page, open "Sources" → "Outside rate (pending)" row has a "pending" badge and the row menu has "Change schedule" and "Remove" only.
### Variations
- Phone width: link wraps; chat navigation works the same.
- The mobile app shows the same text but the pending text is not tappable.
### Edge Cases
- While the page is first loading, these blocks show the shimmer "Refreshing" before settling on the placeholder.
- A denied source reads "Not approved" with a "denied" badge and has no Resume; the only recovery is for the bot to change the call.
- Placeholder wording ("Paused") does not say why or how to resume; the answer is in the Sources dialog.

---

## STORY-SOURCES-09: Ask the bot to fix a stopped source
**Type**: medium
**Topic**: Failure and recovery
**Persona**: Priya, who decides to let the Finance agent repair "Cash (stale)" instead of resuming it
**Goal**: Hand a broken source to the bot and confirm the result on the page.
**Preconditions**: Precondition: bot action (not walkable without a model). The walker may still do steps 1-3 and 6.
**Ideal path**: 3 — send one chat message, then check the page.
**Alternate paths**: Resume from the Sources dialog (STORY-SOURCES-04) without involving the bot; works only if the cause was temporary.
### Steps
1. Open the Finance agent chat at `/app/:botId` → thread with the header "Page" button.
2. Type "The Cash (stale) source stopped working, please fix it" and send → message appears in the thread. Without a model there is no reply.
3. With a model: the bot lists sources (`page_source_list`), then sets the source again (`page_source_set`). An mcp or http source whose call changed becomes pending and an approval card appears ("Read {server} every hour?" with "Allow" and "Not now").
4. Click "Allow" → card label becomes "Allowed". The source returns to active and the failure count is reset.
5. Open the "Page" panel → the "Cash (stale)" block refreshes and the dot is gone.
6. Open "Page options" → "Sources" → the row shows "ok".
### Variations
- Changing only the name or schedule does not need a new approval; the row simply returns to active if it was paused.
### Edge Cases
- If the user declines with "Not now" → badge "denied", block text "Not approved".
- If the bot was not told (manual-retry pause, STORY-SOURCES-07), the user must ask in chat themselves, as here.

---

## STORY-SOURCES-10: Same sources on the HTML page and on a phone
**Type**: short
**Topic**: Managing sources
**Persona**: Sam, who looks at "Cash HTML" and wants to find its sources
**Goal**: Find where "Cash HTML" gets its data and confirm what a failure looks like there.
**Preconditions**: Logged in as the seeded owner. "Cash HTML" is in the sidebar; its meta tag names the `cash` source.
**Ideal path**: 3 — open the page, Page options, Sources.
**Alternate paths**: none found.
### Steps
1. Click "Cash HTML" in the sidebar → page opens in a bordered sandboxed frame.
2. Click "Page options" → "Sources" is offered if the page has a source row.
3. Click "Sources" → dialog lists the source rows for this page only; the "Cash" blocks page's sources are not mixed in.
4. If a row shows "failed" or "paused", close the dialog and look at the frame → it keeps its last values. No dot, no popover, no Retry.
### Variations
- Phone width (390px): the frame keeps its height; the dialog is the same as in STORY-SOURCES-01.
- Native phone app: the page is read only and has no Sources dialog; the dot's accessible label is "Source failed" or "Source paused".
### Edge Cases
- An HTML page has no failed-dot UI at all, so the Sources dialog is the only place a user learns a source is broken. Possible UX gap.
- Removing a source here leaves the frame showing its last values or nothing, with no "Source not found" text.
