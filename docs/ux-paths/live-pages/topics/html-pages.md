# Live pages: HTML pages

Topic: "HTML pages". Code read: `apps/web/src/components/pages/HtmlPageView.tsx`, `apps/web/src/components/SandboxedHtmlViewer.tsx`, `apps/web/public/html-viewer.html`, `packages/core/src/html-page.ts`, `apps/web/src/pages/shell/bot-page-panel.tsx`, `packages/adapters/src/page-snapshot.ts`, `apps/web/e2e/html-bridge.spec.ts`.

Facts the stories rely on:
- An HTML page is read-only. The panel shows no editor for it. The frame is `h-[70vh] min-h-96` with a bordered rounded box and a white background.
- Data arrives by `postMessage` of `{type:"praci-data", sources:{name:{status, fetchedAt, error?, value, history?}}}`. It is sent after each document load (the shell pings `praci-viewer-ready`) and again whenever the page data changes.
- `HtmlPageView` renders nothing (blank, no skeleton) until `pages.get` returns the page. If a later data load fails, it keeps what it last showed and shows no error text.
- The options menu items "Refresh" and "Sources" appear only when `pages.sources` returned at least one source. "Share", "Rename" and "Delete" always appear (Delete only with 2+ pages and not full-width).
- Seed: the Finance agent has three pages, "Cash", "Spend" and "Cash HTML" (meta `praci-sources` = `cash`). The exact markup of "Cash HTML" is not known to the author of these stories. Where a story says "the page shows its data", the walker should record what the seeded page actually renders.

---

## STORY-HTML-01: Open the Cash HTML page from the chat side panel
**Type**: short
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder checking cash before a board call
**Goal**: See the bot-written Cash HTML page next to the Finance agent chat.
**Preconditions**: Logged in as the demo owner. Finance agent has the three seeded pages.
**Ideal path**: 3 — open the agent, click "Page", click the "Cash HTML" tab.
**Alternate paths**: Click "Cash HTML" in the sidebar to open it full-width (see STORY-HTML-03).
### Steps
1. Open the Finance agent at `/app/:botId` → The chat opens. The header shows a `FileText` button with title and label "Page".
2. Click "Page" → A side panel opens next to the chat with no URL change. A tab row labelled "Pages" shows three tabs ("Cash", "Spend", "Cash HTML"). The first page is selected by default and is a blocks page.
3. Click the "Cash HTML" tab → A bordered rounded frame, at least 384px and about 70% of the viewport tall, replaces the blocks page. There is no editor, no toolbar and no text caret anywhere in the frame.
4. Look at the frame content → The page renders its own markup. Data for source `cash` appears once the page script receives it (a moment after the frame appears).
### Variations
- Click "Page" again → The panel closes. Click it a second time → The panel reopens on the page last viewed (record whether it is "Cash HTML" or the first page).
- Keyboard: Tab to "Page", press Enter, arrow keys inside the "Pages" tab list to reach "Cash HTML".
### Edge Cases
- Between clicking the tab and the frame appearing there is a short blank area: the component returns nothing until the page loads (`HtmlPageView.tsx:62`). Record how long it is and whether the layout jumps.
- Click inside the frame, then press Escape or `j`/`k`. Keys inside the sandboxed frame do not reach the app (see the comment at `SandboxedHtmlViewer.tsx:209`, which only fixes this for email). Record whether the panel shortcuts still work.

---

## STORY-HTML-02: Page data reaches the frame and is refreshed on demand
**Type**: medium
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder checking cash before a board call
**Goal**: Confirm the numbers on the HTML page are current, and update them without asking the bot.
**Preconditions**: As STORY-HTML-01. The `cash` source is a praci source over the canned finance data.
**Ideal path**: 4 — open the page, open "Page options", click "Refresh".
**Alternate paths**: Leave the page open and wait for the schedule; the server pushes a `page.data` event and the page updates without a click. Open "Sources" (STORY-HTML-04) to see the last refresh time.
### Steps
1. Open the Finance agent, click "Page", click "Cash HTML" → The frame shows the page.
2. Read the cash value and any "as of" time the page shows → Note them as the before values.
3. Click "Page options" (the `…` button in the tab row) → A menu lists "Refresh", "Sources", "Share", "Rename" and "Delete". "Refresh" and "Sources" are present because the page has a source.
4. Click "Refresh" → The server refreshes the page's sources and the new data is posted to the frame. The frame does not reload or flash; only the page's own script redraws. There is no spinner, toast or "Refreshing" text for an HTML page (the blocks page shows a shimmer, this one does not).
5. Compare the values with step 2 → With canned finance data the numbers may be the same. The fetched-at time (if the page prints it) is newer.
6. Click "Refresh" three times quickly → No error text appears. Record whether each click causes a request (the spec says one refresh per minute per page; this was not verified in code).
### Variations
- Phone width (390px): the panel is narrower and the frame keeps `min-h-96`. Check the options menu is reachable and the page content does not need sideways scrolling.
- Switch to the "Cash" blocks tab and back to "Cash HTML" → The frame is re-created (`key={active.id}`) and shows data again after a short delay.
### Edge Cases
- Open "Page options" on the "Cash" tab, then switch to "Cash HTML": the menu entries come from a `hasSources` flag that is shared by all tabs and is only updated when a page loads successfully (`bot-page-panel.tsx:555`, `HtmlPageView.tsx:51`). If a load fails, a stale value stays. Record the menu on each tab.
- If the refresh fails on the server, the user sees nothing on this surface (`HtmlPageView.tsx:52`). The page script gets `status`/`error` in the data and must show it itself. See STORY-HTML-05.

---

## STORY-HTML-03: Open the HTML page full-width from the sidebar
**Type**: short
**Topic**: HTML pages
**Persona**: Marcus, an operations lead who keeps the page in his sidebar as a dashboard
**Goal**: Use the HTML page at full width and know the controls that differ from the side panel.
**Preconditions**: "Cash HTML" is in the sidebar for the demo owner.
**Ideal path**: 1 — click "Cash HTML" in the sidebar.
**Alternate paths**: Sidebar "Add page" `+`, pick it under the Finance agent group (only if it is not already there).
### Steps
1. Click "Cash HTML" in the sidebar → The URL becomes `/app/pages/:botId/:pageId`. A page header shows the title "Cash HTML" and a "Page options" button. There are no tabs and no "New page" button.
2. Look at the frame → Same 70vh frame, now as wide as the content column. Data appears as in STORY-HTML-02.
3. Click "Page options" → "Refresh", "Sources", "Share" and "Rename" are listed. There is no "Delete" item at full width.
4. Click "Rename", type a new name, press Enter → The header shows the new name. The sidebar row shows it too. The frame is not reloaded.
5. Click "Page options" → "Rename", press Escape → The old name stays.
### Variations
- Keyboard: open the menu with Enter on "Page options", use arrow keys, Enter on "Refresh".
- Type a title longer than 60 characters → The field stops at 60.
### Edge Cases
- Open `/app/pages/:botId/not-a-real-id` → The app navigates to `/app` (replace) and the user lands without any message (`bot-page-panel.tsx:581`, `onMissing`).
- Rename is available on an HTML page but editing content is not: record that the user cannot fix a typo in the page and must ask the bot.

---

## STORY-HTML-04: Check where an HTML page's numbers come from (Sources)
**Type**: short
**Topic**: HTML pages
**Persona**: Dana, a finance manager who needs to know which feed a page uses
**Goal**: Find the page's source, its last refresh and its status, then pause it.
**Preconditions**: As STORY-HTML-01.
**Ideal path**: 3 — open "Page options", click "Sources", read the row.
**Alternate paths**: The page itself may print source names; there is no other place that lists them.
### Steps
1. On "Cash HTML", click "Page options" → "Sources" is listed.
2. Click "Sources" → A dialog titled "Sources" opens. A row for the source named `cash` shows `serverName · tool · schedule`, a last-refresh time like "Nov 1, 3:05 PM" and a badge ("ok" or another status).
3. Click the row's menu (`cash options`) → "Change schedule" (submenu), "Pause" and "Remove" are shown ("Resume" instead of "Pause" if paused).
4. Click "Pause" → The badge changes to "paused". Close the dialog. The page's data is refetched.
5. Look at the HTML page → The page receives `status: "paused"` for `cash`. What the user sees depends on the page markup; the frame itself shows no paused indicator. Record what the seeded page shows.
6. Reopen "Sources", click "Resume" → The badge returns to "ok" or "pending" after the next refresh.
### Variations
- Phone width: the dialog fits in 390px and the row's menu stays reachable.
### Edge Cases
- Remove the `cash` source and confirm "Remove cash?" with "Remove": the "Refresh" and "Sources" menu items disappear only after the page reloads its sources; the frame keeps showing the page, now with a missing source in its data. Record what the user sees. Note this destroys seed data, so run it last.
- A page that does not declare any source (no `praci-sources` meta) has no "Refresh" or "Sources" item at all, so the user cannot tell why a static page never changes.

---

## STORY-HTML-05: A source fails and the HTML page has to tell the user
**Type**: medium
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder who sees a number that looks old
**Goal**: Work out whether the HTML page is stale or broken.
**Preconditions**: Demo seed includes a source with failures, but the failing ones are on the blocks page "Cash" ("Cash (stale)", "Request timed out"), not on "Cash HTML". Failing HTML sources need a bot action (not walkable without a model), so this story compares the two page types.
**Ideal path**: 6 — the user has to check three places.
**Alternate paths**: Open "Sources" for the page (STORY-HTML-04) and read the badge and the error line.
### Steps
1. Open the Finance agent, click "Page", select the "Cash" tab → "Cash (stale)" shows a warning dot labelled "Source failed". Hover or click it → A popover shows "Request timed out" and a "Retry" button.
2. Select the "Cash HTML" tab → There is no warning dot, no "Retry" button and no popover anywhere on an HTML page. The user-visible status of each source lives only inside the data passed to the page script.
3. Click "Page options", then "Sources" → The dialog lists the sources of the open page only (for "Cash HTML": `cash`). Record whether the badge is "ok".
4. If a source were failing, the dialog would show "failed" and the error text, and the page would receive `{status, error}` for it. The frame shows the error only if the bot wrote the page to show it (needs bot-written page; not walkable without a model).
### Variations
- Click "Refresh" on the HTML page while the source is failing → Nothing visible changes and no message appears (`HtmlPageView.tsx:52` swallows load errors).
### Edge Cases
- Defect candidate: a failed refresh RPC on an HTML page (offline, server error) gives no feedback at all; on a blocks page the same case shows an error line. Record both.
- A failing source on a blocks page has "Retry"; an HTML page has no retry control other than "Page options" > "Refresh".

---

## STORY-HTML-06: Share a snapshot of the HTML page and open it logged out
**Type**: medium
**Topic**: HTML pages
**Persona**: Marcus, an operations lead sending a snapshot to a board member
**Goal**: Create a view-only link to the HTML page and check what a visitor sees.
**Preconditions**: As STORY-HTML-01. A second private browser window with no session.
**Ideal path**: 4 — "Page options", "Share", copy, open in the private window.
**Alternate paths**: none found (Share exists only in the options menu; there is no share button on the page itself).
### Steps
1. On "Cash HTML", click "Page options" then "Share" → A dialog titled "Share link" opens with the link, a copy control, and the note "Anyone with this link can view this version until you stop sharing or for 30 days."
2. Click the copy control → The link `…/s#<token>` is copied.
3. Open the link in a private window → The public page `/s` loads. It shows the HTML page with the data it had when shared. The data arrives through the same `praci-data` message, sent when the document loads (`page-snapshot.ts:116`). Record whether anything on the page differs from the in-app view (fonts, height, scroll).
4. In the app, click "Refresh" on the page, reload the private window → The shared page still shows the older data. It is frozen.
5. Back in the app, click "Stop sharing" in the dialog (reopen via "Share" if it closed) → A confirmation titled "Stop sharing this link?" with "Cancel" and "Stop sharing". Click "Stop sharing" → The dialog closes.
6. Reload the private window → The link no longer shows the page.
### Variations
- Click "Share" twice → Each click calls `pages.share` and makes a new link. Record whether the first link still works; the page dialog has no "Replace link" button, only the share note.
- Phone width: the dialog and the shared page both fit 390px.
### Edge Cases
- Defect candidate: the dialog is only held in memory (`shared` state, `bot-page-panel.tsx:557`). Close it with the "x" and the link cannot be shown again, and "Stop sharing" is no longer reachable from this page. Record whether the page offers any way to revoke a link after the dialog closes.
- Sharing fails (offline) → An error line appears in the panel above the page (`role=alert`), not inside the dialog, because the dialog is not open yet.

---

## STORY-HTML-07: The page changes while the user is looking at it
**Type**: medium
**Topic**: HTML pages
**Persona**: Dana, a finance manager with the page open while the bot is working
**Goal**: Keep reading the page while the bot edits it or its data changes.
**Preconditions**: Bot action (not walkable without a model) to change page content. The data-only part (steps 1 to 3) is walkable by clicking "Refresh" or by waiting for the schedule.
**Ideal path**: 2 — do nothing; the page updates itself.
**Alternate paths**: Click "Refresh" for data. For a content change, the user cannot reload only the frame; they reload the app.
### Steps
1. Open "Cash HTML" in the side panel and scroll the page down inside the frame → The frame has its own scroll.
2. Click "Page options" then "Refresh" → The frame content updates in place. The scroll position inside the frame stays (the document is not recreated, only a new message arrives).
3. Switch to "Spend" and back to "Cash HTML" → The frame is rebuilt, scroll is back at the top, and the data reappears after a short delay.
4. (Bot action) The bot calls `page_write` with new markup while the panel is open → A `page.updated` event reloads the page. The whole document is replaced, scroll resets to the top and the data is sent again after the new document says it is ready.
5. (Bot action) While the revision changed, data fetched for the old revision is held back (`htmlPageSourcesFor`) → The new document may show no values for a moment, then the matching data.
### Variations
- Phone width: after the bot's edit, the frame scroll resets with no notice.
### Edge Cases
- If the edit renames a source and the old name is no longer declared, the new page gets data only for the declared names and the `praci-sources` error ("praci-sources has an invalid source name …", `html-page.ts:89`) appears for the bot, not the user. The user sees a page with no data and no explanation. (needs bot-written page)
- The bot's edit and the user's click on "Refresh" at the same moment: record whether the page ends with matching data.

---

## STORY-HTML-08: Long walk across surfaces, sandbox and hide-amounts
**Type**: long
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder moving between her laptop, the sidebar and her phone before a board call
**Goal**: See the same HTML page everywhere, and check the privacy controls and the page's isolation.
**Preconditions**: As STORY-HTML-01. A way to resize the browser to 390px wide.
**Ideal path**: 12 — there is no shorter route that covers all surfaces.
**Alternate paths**: Mobile app `/agent-page` and iOS show the same page through their own previews (not walkable in the web demo).
### Steps
1. Open the Finance agent, click "Page", select "Cash HTML" → Frame with the page.
2. Click "Cash HTML" in the sidebar → Full-width page `/app/pages/:botId/:pageId`. Compare the content with step 1; it is the same document and data.
3. Press the browser Back button → Returns to the chat at `/app/:botId`. Record whether the side panel is still open.
4. Turn on "hide amounts" in the app (the same preference the blocks pages use) → The "Cash" blocks tab masks its USD values. Switch to "Cash HTML". Record whether the currency amounts in the HTML page are masked. The viewer calls `useHideAmounts()` but only the email path masks text (`SandboxedHtmlViewer.tsx:173` and `:144`), so amounts on an HTML page are probably shown. This is a defect candidate; the privacy switch is silently ignored here.
5. Click inside the frame on text and links → Links do nothing (the guard blocks navigation; `#` anchors change the in-frame hash). Nothing opens a new tab.
6. Select text in the frame and copy → Copy works inside the frame.
7. Resize the window to 390px wide → The frame stays at 70vh with a 384px minimum. The page is not wider than the viewport. Record any horizontal scroll, either of the app or inside the frame.
8. Rotate or resize to a short window (height below 550px) → The 384px minimum height keeps the frame taller than the viewport, so the app scrolls. Record whether the frame's own scroll and the app's scroll fight on touch.
9. Click "Page options" → "Share" → "Share link" dialog opens; close it with the close control.
10. Click "Page options" → "Rename", press Escape → Name unchanged.
11. Switch the app to dark theme → The frame stays white (`bg-white`, page-defined). Record contrast against the dark app around it.
12. Reload the browser at the full-width URL → The page returns with data after a short blank interval.
### Variations
- Keyboard-only: reach the frame with Tab; the iframe takes focus and Tab then moves inside it. Record whether the user can leave the frame by keyboard.
- Screen reader: the iframe title is the page title ("Cash HTML"); the frame has no other label.
### Edge Cases
- Offline after step 1: click "Refresh" → no message, frame unchanged (see STORY-HTML-05).
- Open the browser console during the walk → There should be no errors from the viewer. A CSP violation report from the frame is expected only if the page tries to load something from outside (network, fonts, remote images); the page cannot load any.
- A page that has no internet access cannot show a remote chart library or font; the bot must inline everything. A page that tries shows a blank or broken region and no message to the user.

---

## Defect candidates seen in the code

1. `apps/web/src/components/pages/HtmlPageView.tsx:52` — a failed `pages.get`, `pages.data` or `pages.refresh` is swallowed with no message. The frame shows old data or stays blank (line 62 returns `null` with no loading state), and "Refresh" gives no feedback.
2. `apps/web/src/components/SandboxedHtmlViewer.tsx:144-147` — only the email path calls `maskAmounts`. `useHideAmounts()` (line 173) re-renders HTML pages, but their text is not masked, so the "hide amounts" setting does not apply to an HTML page.
3. `apps/web/src/pages/shell/bot-page-panel.tsx:555` — `hasSources` is one flag for all tabs, updated only on a successful load, so "Refresh" and "Sources" can be wrong after a tab switch or failed load.
4. `apps/web/src/pages/shell/bot-page-panel.tsx:557` and `:802` — the share link dialog is held only in memory. After it closes, a page share cannot be revoked from the page (the page dialog gets no `expiresAt` or `onReplace`).
5. `apps/web/src/pages/shell/bot-page-panel.tsx:581` — an unknown page id at full-width silently redirects to `/app` with no message.
