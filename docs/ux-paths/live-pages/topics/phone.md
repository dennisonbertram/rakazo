# Live pages: Pages on a phone

Web stories assume a browser viewport of 390x844 (touch emulation on if the walker supports it) logged in as the demo's seeded owner, with the Finance agent's seeded pages "Cash", "Spend" and "Cash HTML" in the sidebar. Native stories at the end are marked and are not walkable in a browser.

Code facts the stories rely on:
- Phone panel: in the chat, the header "Page" button opens the panel as a full sheet that replaces the chat. Its top bar shows the text "Page", a gear ("Show settings") and an X ("Close panel"). The "Open navigation" menu button inside the sheet is hidden below the `sm` breakpoint (`apps/web/src/pages/Shell.tsx` ~5422, class `max-sm:hidden lg:hidden`), so on a 390px phone the X is the only way out.
- Full-width page (`/app/pages/:botId/:pageId`): `PageHeader` with an "Open navigation" menu button, the page title as h1, and the "Page options" menu. No tabs, no "New page", no "Delete".
- Fetch times and block delete buttons are revealed by hover or focus (`group-hover`, `group-focus`), so on touch they depend on a tap focusing the block.

## STORY-PHONE-01: Open the Cash page from the sidebar on a phone
**Type**: short
**Topic**: Pages on a phone
**Persona**: Priya, a seed-stage founder checking cash on her phone before a board call
**Goal**: Reach the full-width Cash page from a cold start on a 390px screen.
**Preconditions**: Logged in at 390x844 on `/app`. Seed pages are in the sidebar.
**Ideal path**: 3 — Open navigation, tap the page row, read.
**Alternate paths**: Swipe right from the left screen edge (12px zone) to open the sidebar instead of tapping the menu button; open Finance agent chat, then tap the "Page" header button (side panel, not full width).
### Steps
1. Tap "Open navigation" (menu icon, top left) → the sidebar slides over the content; the page behind is inert.
2. Find the row "Cash" with the Finance agent avatar in the pages group (not "Add page") and tap it → URL becomes `/app/pages/{botId}/{pageId}`; the sidebar closes (verify it closes on its own) and the h1 "Cash" shows.
3. Look at the top of the page → a menu button, the title "Cash" and a "Page options" button fit on one line without overlap or horizontal scroll.
### Variations
- Open the sidebar by edge swipe instead of the button.
- Tap "Spend" next, then "Cash HTML", from the sidebar each time (3 trips through the menu).
### Edge Cases
- Tap the menu button twice quickly: the sidebar should not flicker or stack.
- Rotate to landscape (844x390): header still reachable.
- Reload on the page URL at 390px: the page loads directly with no sidebar open.

## STORY-PHONE-02: Open and close the page side panel from chat on a phone
**Type**: short
**Topic**: Pages on a phone
**Persona**: Marcus, a founder who asked the Finance agent for a page and wants to see it without leaving the chat
**Goal**: Use the "Page" header button, read the panel, and return to the chat.
**Preconditions**: At 390x844, open `/app/{financeBotId}` (the Finance agent). The bot has pages, so the "Page" header button is present.
**Ideal path**: 3 — tap Page, read, tap Close panel.
**Alternate paths**: Go to the full-width page via the sidebar instead (STORY-PHONE-01).
### Steps
1. Tap the document icon labelled "Page" in the chat header → the chat is replaced by a full sheet whose top bar reads "Page" with a gear and an X; the tab row (aria-label "Pages") shows "Cash", "Spend" and "Cash HTML".
2. Scroll the sheet → content scrolls inside the sheet; the sticky top bar stays.
3. Tap "Close panel" (X) → back at the chat with the composer visible.
### Variations
- Tap the "Page" button again while the panel is open: it is covered by the sheet, so only X closes it (check whether a hardware back or swipe closes it; none is coded).
- Tap the gear ("Show settings") in the sheet: it switches to the bot's settings panel in place, and the title changes to "{name} settings". Close with X returns to chat, not to the page.
### Edge Cases
- Look for "Open navigation" inside the sheet: it is hidden below 640px, so a phone user must close the panel first to reach the sidebar.
- The "Page" button is absent for a bot with no page. Open the Inbox agent: no "Page" button in its header.

## STORY-PHONE-03: Read metrics and the table, check freshness, and retry a failed source
**Type**: medium
**Topic**: Pages on a phone
**Persona**: Priya, on the train, checking whether the numbers are current
**Goal**: See "Monthly burn" and "Largest vendors" fit at 390px, learn when each was fetched, and understand the stale "Cash (stale)" metric.
**Preconditions**: On `/app/pages/{financeBotId}/{cashPageId}` at 390x844.
**Ideal path**: 6 — scroll, tap a metric for time, tap the warning dot, read, Retry, read the result.
**Alternate paths**: Panel via the "Page" button shows the same blocks inside the sheet; the full-width page gives wider blocks (`px-4`, content max 5xl).
### Steps
1. Scroll the page → blocks appear in a single column: metric cards "Monthly burn", then "Largest vendors" table, then the other metrics. No horizontal page scroll.
2. Look at the "Largest vendors" table → all columns are readable or the table scrolls inside its card; the card does not push the page wider than 390px (check column clipping).
3. Tap the "Monthly burn" card → the card takes focus (it has tabindex 0) and a muted fetch time such as "Nov 1, 3:05 PM" appears at the right of its label row. Before the tap there is no time.
4. Find the "Cash (stale)" card → its value is shown and a warning dot with aria-label "Source failed" sits at the right of the label row; its fetch time is always visible (stale blocks do not hide it).
5. Tap the warning dot (16px target) → a popover opens with the text "Request timed out" and a "Retry" button, and it stays inside the 390px viewport.
6. Tap "Retry" → the blocks show the shimmer "Refreshing", then the page data reloads. Since the seeded source is failing, the dot is expected to remain (verify).
### Variations
- Toggle the hide-amounts preference (eye control elsewhere in the app) and revisit: dollar values in usd-format metrics and table cells are masked.
- Open "Payroll (paused)": dot has aria-label "Source paused", popover has the error text and no "Retry".
- "Never fetched (paused)": no value, no time; the placeholder reads "Paused".
- "Outside rate (pending)": the placeholder reads "Waiting for approval". On this full-width page it is an underlined button; tapping it goes to `/app/{financeBotId}`. In the side panel it is plain text.
### Edge Cases
- The dot is a 16px button next to a 16px-high label row. Missing the dot by a finger-width taps the card instead; that is a touch-target risk to note, not a failure.
- Hover-only content: a user who never taps a fresh block never sees its fetch time.
- Tap Retry twice: the second tap should not stack two refreshes.

## STORY-PHONE-04: Open the Sources dialog and manage a source on a phone
**Type**: medium
**Topic**: Pages on a phone
**Persona**: Marcus, who wants to pause a payroll source from his phone
**Goal**: Open "Sources", read each row, pause or resume a source, and remove one.
**Preconditions**: On the full-width Cash page at 390x844. Seeded sources include "Cash (stale)" (failed twice), "Payroll (paused)", "Never fetched (paused)", "Outside rate (pending)".
**Ideal path**: 4 — Page options, Sources, row options, Pause/Resume.
**Alternate paths**: The same menu exists in the side panel ("Page options" in the sheet). Sources cannot be created here.
### Steps
1. Tap "Page options" in the page header → a menu opens with "Refresh", "Sources", "Share", "Rename" (no "Delete" on the full-width page).
2. Tap "Sources" → a dialog titled "Sources" opens, a skeleton of 3 rows appears briefly, then the rows.
3. Read one row, for example "Cash (stale)" → name on the first line, a muted subline (`server · tool · schedule`), last-refresh text, a badge "failed" and a "… options" button, then the error "Request timed out" on its own truncated line.
4. Tap "Payroll (paused) options" → menu: "Change schedule", "Resume" (no "Pause" because it is paused), "Remove".
5. Tap "Resume" → the badge changes from "paused" to "active-style ok/pending" (verify the exact badge; for a never-run source it may say "ok"), no error appears.
6. Open "Payroll (paused) options" again, then "Change schedule" → submenu with radios "Every 15 min", "Hourly", "Every 6 hours", "Daily", "Weekly" with the current one selected.
7. Pick "Daily" → the subline now ends with the daily schedule label.
8. Close the dialog (Escape or the close control) → back on the page; blocks reflect any status change.
### Variations
- Use "Never fetched (paused)" "Remove": confirmation "Remove Never fetched (paused)?" with "Cancel" and "Remove". Confirming removes the row; the block using it shows "Source not found".
- Tap "Cancel" in the remove confirmation: nothing changes.
### Edge Cases
- Row crowding: name, refresh time, badge and options button share one flex row inside a dialog about 358px wide (`PageSourcesDialog.tsx` row at the `flex items-center gap-3` div). Check whether names truncate to a few characters and whether the badge or time wraps.
- Long error text: only one truncated line is shown, with the full text in a `title` tooltip that touch devices cannot show. A phone user cannot read the whole error here; the warning-dot popover on the page is the only full-text route.
- The dialog list has no max height set in the sources code; with many sources check that the dialog scrolls and the title stays visible.
- Submenu on touch: "Change schedule" opens on tap; check it stays on screen at 390px.

## STORY-PHONE-05: Share a page snapshot from a phone
**Type**: medium
**Topic**: Pages on a phone
**Persona**: Priya, sending the Cash page to her co-founder from her phone
**Goal**: Create a share link, copy it, stop sharing.
**Preconditions**: On the full-width Cash page at 390x844. Clipboard permission may prompt.
**Ideal path**: 3 — Page options, Share, copy.
**Alternate paths**: Same menu in the side panel.
### Steps
1. Tap "Page options" → "Share" → a dialog titled "Share link" opens with the link, the line "Anyone with this link can view this version until {date}." (or "...until you stop sharing or for 30 days.") and "Links are shown once. Replacing this one stops the old link."
2. Check the URL field → the full `/s#token` link is visible or scrolls inside its field and does not stretch the dialog beyond 390px.
3. Tap the copy control → feedback that the link was copied (use the control's exact label from the dialog).
4. Tap "Replace link" → a new link replaces the old; the note says the old one stops working.
5. Tap "Stop sharing" → confirmation "Stop sharing this link?" with "Cancel" and "Stop sharing".
6. Tap "Stop sharing" → the dialog closes; reopening Share creates a fresh link.
### Variations
- Tap "Cancel" in step 5: the link stays active.
- Open the copied `/s#token` in a new tab at 390px: a static view-only copy with no edit controls (not verified in a browser).
### Edge Cases
- Dismiss the dialog without copying, then reopen "Share": a new link is created each time, so the first one is gone; the copy shown once matches the note "Links are shown once".
- Share error: shown as a line inside the dialog (cannot be forced with the seed).
- Share while the page has a failed source: the snapshot should carry the last good value (not verified).

## STORY-PHONE-06: Switch, add and rename a page in the side panel on a phone
**Type**: medium
**Topic**: Pages on a phone
**Persona**: Marcus, rearranging the Finance agent's pages
**Goal**: Switch between the three tabs, add a page, rename it with the on-screen keyboard.
**Preconditions**: Finance agent chat at 390x844, panel open via "Page".
**Ideal path**: 5 — tap tab, tap "+", type name, Enter, read.
**Alternate paths**: Full-width page cannot add or switch pages; use the sidebar for switching and the panel for adding.
### Steps
1. Look at the tab row "Pages" → "Cash", "Spend" and "Cash HTML" tabs, the "Page options" button and the "New page" (+) button on one row. Check whether the tabs scroll sideways or squeeze the buttons.
2. Tap "Spend" → the sheet shows the metric "Spend this month"; the active tab is marked.
3. Tap "Cash HTML" → the sandboxed frame loads in a box about 70vh tall with a rounded border.
4. Tap "New page" (+) → a page titled "New page" is created and an inline field (aria-label "Page title", 60 characters max, text selected) replaces the tab row.
5. Type "Runway" and press Enter on the on-screen keyboard → the title is saved, tabs show four entries.
6. Open "Page options" → "Rename", type a longer title, tap elsewhere (blur) → renaming is cancelled without saving.
7. Open "Page options" → "Delete" → dialog "Delete Runway?" with "Cancel" and "Delete"; tap "Delete" → the page is removed and a remaining tab opens.
### Variations
- Press Escape (external keyboard) while renaming: cancels.
- Tap into the empty new page and type: autosave runs after about 800 ms with no visible confirmation; a failed save shows "Could not save the page.".
### Edge Cases
- On-screen keyboard covers the sheet bottom: confirm the rename field and editor stay visible.
- Blur cancels a rename. A phone user who taps "done" on the keyboard or taps away loses their edit; only Enter saves.
- Created pages are blocks pages: "New page" cannot be an HTML page.
- At 20 pages the "New page" button is disabled with no explanation (not reachable with the seed).

## STORY-PHONE-07: View the HTML page "Cash HTML" on a phone
**Type**: short
**Topic**: Pages on a phone
**Persona**: Priya, opening the designed cash view
**Goal**: See the HTML page render inside 390px and show current data.
**Preconditions**: Sidebar page "Cash HTML" (meta `praci-sources` cash).
**Ideal path**: 3 — open sidebar, tap row, read.
**Alternate paths**: Panel tab "Cash HTML" in the Finance chat sheet.
### Steps
1. Tap "Open navigation" → sidebar opens.
2. Tap "Cash HTML" → full-width page, h1 "Cash HTML", then a bordered frame about 70vh high (about 590px at 844px high, at least 384px).
3. Wait for data → the frame shows the cash source value pushed by the app; no visible error text if it fails.
### Variations
- Open "Page options": for an HTML page, "Refresh" and "Sources" show only if the page has sources.
- Scroll the page by dragging on the frame: scrolling inside the frame and scrolling the page compete; check you can still scroll past the frame.
### Edge Cases
- The page cannot be edited from the UI (read only).
- A failed load keeps the last view with no message. On a phone a user cannot tell the data is stale (no stale marker in the frame).
- The HTML itself may not be responsive at 390px: check horizontal clipping inside the frame, which is outside Praci's control.

## STORY-PHONE-08: Board-call prep, a full phone walk across pages, sources and sharing
**Type**: long
**Topic**: Pages on a phone
**Persona**: Priya, ten minutes before a board call, only her phone
**Goal**: Check cash, understand a stale number, fix what she can, and send a snapshot.
**Preconditions**: 390x844, owner logged in, Finance agent seed. No model available.
**Ideal path**: 14 — see steps; cannot be shorter because the pages, sources and share are in separate menus.
**Alternate paths**: Do the same from the Finance chat sheet; skip the sidebar by using the "Page" header button.
### Steps
1. Open `/app` → the chat list or last chat shows at phone width.
2. Tap "Open navigation" → sidebar over content.
3. Tap "Cash" → full-width Cash page.
4. Read "Monthly burn" and "Largest vendors" → both fit with no horizontal page scroll.
5. Tap "Monthly burn" → fetch time appears.
6. Scroll to "Cash (stale)" → warning dot visible with its time.
7. Tap the dot → popover "Request timed out" with "Retry".
8. Tap "Retry" → "Refreshing" shimmer, then data reloads (the dot may remain).
9. Tap "Page options" → "Sources".
10. In the dialog, read "Cash (stale)" row: badge "failed", error line "Request timed out".
11. Tap "Cash (stale) options" → "Change schedule" → "Every 6 hours".
12. Close the dialog.
13. Tap "Page options" → "Share" → "Share link" dialog; copy the link.
14. Close the dialog; tap "Open navigation" → "Spend" → read "Spend this month".
15. Tap "Open navigation" → "Cash HTML" → frame renders.
16. Tap "Open navigation" → open the Finance agent chat, tap "Page" → sheet with tabs.
17. Tap "Close panel" → chat.
### Variations
- Use the "Waiting for approval" link on "Outside rate (pending)" at step 6: jumps to the chat. Without a seeded approval card the chat has nothing to approve (precondition for a better walk: needs seeded approval card).
- Do steps 9 to 11 from the side-panel sheet instead.
### Edge Cases
- Count the taps from "open the app" to "read Cash": menu, row, which is 2. To "open the Sources dialog": plus Page options, Sources, which is 4.
- Any accidental tap outside a dialog closes it; a half-done schedule change inside the submenu is lost.
- Network drops: page shows "Could not save the page." only on a failed save; read failures show a `role=alert` error line.

## STORY-PHONE-09: Read a bot page in the Expo mobile app
**Type**: medium
**Topic**: Pages on a phone
**Persona**: Marcus, using the Expo app
**Goal**: Open a bot's page from the thread, switch pages, hide amounts, refresh.
**Preconditions**: Precondition: native app (not walkable in the browser). Expo app signed in to the demo stack.
**Ideal path**: 3 — thread header page item, read, pick page.
**Alternate paths**: The home index lists bot pages in the sidebar section (`sidebarBotPages`).
### Steps
1. Open the Finance agent thread and tap the page header item → the "Page" screen opens (`apps/mobile/app/agent-page.tsx`; pushed from `thread.tsx:1055`).
2. Read the metrics → label and value cards; chart images are server-drawn SVGs.
3. Tap the page picker (label "Page") → choose "Spend".
4. Tap "Hide amounts" → usd values are masked; the control now reads "Show amounts".
5. Pull down to refresh → the refresh spinner shows and live data reloads.
### Variations
- A pending source reads "Waiting for approval" and is not tappable (the web full-width page makes it a link).
- A failed or paused source shows only a warning icon with accessibility label "Source failed" or "Source paused".
### Edge Cases
- The failed warning icon has no popover, error text or "Retry" button. Refresh is only by pull-down, and there is no share and no Sources control on this screen.
- Load error shows "Could not load this page."; a bot with no page shows "No page yet.".
- Chart SVG failure shows "Chart could not be drawn.".

## STORY-PHONE-10: Share and stop sharing a page in the native iOS app
**Type**: short
**Topic**: Pages on a phone
**Persona**: Priya, on iPhone
**Goal**: Share a page snapshot and stop sharing it.
**Preconditions**: Precondition: native app (not walkable in the browser). iOS app signed in to the demo stack (`apps/ios/Sources/Praci/AgentPages/AgentPageScreen.swift`).
**Ideal path**: 3 — More, Share, system share sheet.
**Alternate paths**: Web "Page options" then "Share".
### Steps
1. Open the Cash page → the navigation title reads "Cash"; blocks show label/value rows and tables.
2. Tap the "More" menu (ellipsis, accessibility id `pageMore`) → items: a "Page" picker (only with 2 or more pages), "Share".
3. Tap "Share" → a link is created and the system share sheet opens.
4. Reopen "More" → "Stop sharing" now appears.
5. Tap "Stop sharing" → confirmation dialog "Stop sharing this link?" with "Stop sharing" and "Cancel"; confirm.
### Variations
- A source failure shows a warning icon; tapping it shows the error and a "Retry" button (iOS has Retry, Expo does not).
- A bot with no page shows "No page yet" with a primary "Open chat" button.
### Edge Cases
- An error shows an alert titled "Something went wrong" with "OK".
- "Waiting for approval" is plain text; there is no link to the approval card.
- HTML pages use the sandboxed web view, filling to the bottom edge.
