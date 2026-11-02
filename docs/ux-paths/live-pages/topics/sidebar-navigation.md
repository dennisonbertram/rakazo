# Live pages: Sidebar and full-width pages

Stories for the sidebar "Pages" group, the "Add page" menu, and the full-width route `/app/pages/:botId/:pageId`. Written from code in apps/web/src/components/SidebarPages.tsx, AddSidebarPage.tsx, SidebarPagesGroup.tsx, SidebarPageLink.tsx, apps/web/src/pages/BotPageView.tsx, apps/web/src/pages/shell/bot-page-panel.tsx, and Shell.tsx. Nothing here was run in a browser.

Demo seed assumed: Finance agent with blocks pages "Cash" and "Spend" and html page "Cash HTML", all three already in the sidebar. Because they are already added, the "Add page" menu does not list them (the server returns only pages not yet in the sidebar, packages/db/src/sidebar-pages.ts:82). Stories 01 and 02 therefore remove a page first.

Same information on several surfaces: a page's title and content appear in the sidebar row, the side panel (`/app/:botId`, header "Page" button), and the full-width route. The side panel has page tabs, "New page" and "Delete". The full-width route has none of these (bot-page-panel.tsx:715, 726, 736).

## STORY-NAV-01: Re-add a page with the "Add page" menu
**Type**: short
**Topic**: Sidebar and full-width pages
**Persona**: Priya, a seed-stage founder who removed a page from the sidebar yesterday and now wants it back before a board call
**Goal**: Put "Spend" back in the sidebar and open it full width.
**Preconditions**: Logged in as the demo owner. "Spend" has been removed from the sidebar (run STORY-NAV-02 first). Sidebar is expanded, "Pages" group is expanded.
**Ideal path**: 3 — open the menu, pick the page, read the result.
**Alternate paths**: Open the Finance agent chat, click the header "Page" button, click the "Spend" tab (the page shows but it is not added to the sidebar). Navigate by URL `/app/pages/{botId}/{pageId}` (also does not add a sidebar row).
### Steps
1. Click the "Add page" row at the bottom of the "Pages" group (data-testid `sidebar-add-page`) → a menu opens. It lists "Team health" with the description "Workload and key people, from your connected tools" (if available), then a "Finance agent" header with its avatar, then the pages not yet in the sidebar.
2. Click "Spend" under "Finance agent" → the app navigates to `/app/pages/{botId}/{pageId}`. The heading "Spend" shows in the page header. A "Spend" row with the Finance agent avatar now appears in the sidebar and is highlighted.
3. Look at the metric "Spend this month" → the value renders.
### Variations
- Phone width (390px): open the navigation drawer with the menu button, click "Add page" and pick "Spend". The drawer closes on its own (`onOpen` calls `setMobileSidebarOpen(false)`) and the page is shown.
- Keyboard: Tab to "Add page", Enter opens the menu, arrow keys move between items, Enter picks.
### Edge Cases
- Every page already in the sidebar and "Team health" already added: the "Add page" row does not render at all (AddSidebarPage.tsx:34). There is no disabled row and no hint.
- A mistake: the user opens the menu and presses Escape. Nothing changes.
- Clicking the same page twice quickly: the add is idempotent on the server, so only one row appears.
- The menu has no search. With many bots the list is long.

## STORY-NAV-02: Remove the page you are viewing from the sidebar
**Type**: short
**Topic**: Sidebar and full-width pages
**Persona**: Marcus, a founder tidying his sidebar after a demo
**Goal**: Remove "Spend" from the sidebar and learn that the page itself still exists.
**Preconditions**: Logged in as demo owner. "Spend" is in the sidebar. Currently on `/app/pages/{botId}/{spendId}`.
**Ideal path**: 2 — open the row menu, choose "Remove from sidebar".
**Alternate paths**: none found. The full-width page's own "Page options" menu has no "Remove from sidebar" item. The "Show in sidebar" checkbox menu in the group header lists added pages, but it only hides a row; it does not remove it (and those hidden rows come back in the "Show in sidebar" list).
### Steps
1. Hover the "Spend" row in the sidebar → a "…" button with aria-label "Page options" appears at the row's right edge (always visible on touch screens).
2. Click "Page options", then "Remove from sidebar" → the row disappears and, because the user was on that page, the app navigates to `/app` (SidebarPages.tsx:136). `/app` then selects the usual default bot chat.
3. Open "Add page" → "Spend" is listed under "Finance agent" again.
### Variations
- Remove a row while on a different page (for example on "Cash"): the row disappears and the user stays on "Cash".
- Keyboard: Tab to the row, Tab to its "Page options" button (it shows on focus), Enter, then Enter on "Remove from sidebar".
### Edge Cases
- No confirmation dialog and no "Undo" toast. A mistaken click removes the row, but re-adding takes the "Add page" menu (STORY-NAV-01).
- The API fails: a red `role=alert` line appears under the "Add page" row and the row stays.
- Hesitation: the user might expect "Remove from sidebar" to delete the page. The row's menu says "Remove from sidebar" only, and the page remains in the Finance agent's side panel.
- In the icon rail (sidebar hidden) the "Page options" button is not rendered (SidebarPages.tsx:162), so a page cannot be removed from the rail.

## STORY-NAV-03: Read the full-width page header and options menu
**Type**: medium
**Topic**: Sidebar and full-width pages
**Persona**: Dana, a founder's chief of staff who needs to know what she can and cannot do on the full-width Cash page
**Goal**: Find every control on the full-width "Cash" page and confirm which ones are missing compared with the side panel.
**Preconditions**: Logged in as demo owner. "Cash" is in the sidebar.
**Ideal path**: 3 — click the sidebar row, open "Page options", read the menu.
**Alternate paths**: Go straight to `/app/pages/{botId}/{cashId}`.
### Steps
1. Click the "Cash" row in the sidebar → the URL becomes `/app/pages/{botId}/{cashId}`. The page header shows the title "Cash" and a "…" button with aria-label "Page options". The sidebar row is highlighted (`aria-current="page"`).
2. Look at the page → there are no tabs ("Pages" tab list), no "New page" button, and no chat "Page" button in the chat header (the page is not a chat route).
3. Click "Page options" → the menu lists "Refresh", "Sources", "Share" and "Rename". It has no "Delete" item (bot-page-panel.tsx:715).
4. Scroll the page → "Monthly burn" (metric), "Largest vendors" (table), "Cash (stale)" with a warning dot, "Payroll (paused)" and "Never fetched (paused)" showing "Paused", and "Outside rate (pending)" showing "Waiting for approval" as an underlined link.
5. Press Escape, then click "Cash HTML" in the sidebar → the header changes to "Cash HTML" and the content shows in the sandbox frame. The options menu now lists "Refresh", "Sources", "Share", "Rename" (HTML pages are read-only; the frame has no editor).
### Variations
- Phone width (390px): the header shows a navigation button (aria-label "Open navigation"). The "Page options" button may drop onto its own line under the title when the header is narrow (PageHeader wraps actions).
- Press Tab from the header: the first stops are the "Page options" button, then the editable blocks, each focusable.
### Edge Cases
- A page with no sources: the menu shows only "Share" and "Rename". "Refresh" and "Sources" are hidden.
- While the page list is loading (`pages.length === 0`), the header has no actions.
- The page content is an editor on blocks pages. A user typing in it will autosave after 800 ms, so the page is editable, not read-only. Only HTML pages are read-only.
- Information repeated: the same live-block warning dots and "Waiting for approval" text show in the side panel too, but only the full-width page makes "Waiting for approval" clickable.

## STORY-NAV-04: Rename a page on the full-width route and check the sidebar
**Type**: short
**Topic**: Sidebar and full-width pages
**Persona**: Marcus, a founder who wants "Spend" called "Spend by vendor"
**Goal**: Rename the page and see the new name in the header and the sidebar.
**Preconditions**: Logged in as demo owner. "Spend" is in the sidebar and open full-width.
**Ideal path**: 3 — "Page options", "Rename", type and press Enter.
**Alternate paths**: Rename it from the side panel (Finance agent chat, "Page" button, "Page options", "Rename").
### Steps
1. Click "Page options" in the header, then "Rename" → the title becomes an input with aria-label "Page title". Its text is selected.
2. Type "Spend by vendor" and press Enter → the header shows "Spend by vendor".
3. Look at the sidebar row → code reading says it still shows "Spend" until the sidebar list reloads. Reload the browser to check; after reload the row reads "Spend by vendor".
### Variations
- Press Escape instead of Enter, or click away: the rename is cancelled (blur cancels), and the old title stays. A user who types a new name and then clicks elsewhere loses the text with no warning.
- Phone width: the input replaces the title in the header.
### Edge Cases
- Empty or unchanged text: nothing is saved and the input closes.
- Title longer than 60 characters: the input stops accepting text at 60.
- Defect candidate: `SidebarPages` loads its list once on mount and only again after its own add or remove (SidebarPages.tsx:56-64). Nothing tells it a page was renamed, so the sidebar title is stale until reload. Observe and report.

## STORY-NAV-05: Move between the side panel and the full-width page
**Type**: medium
**Topic**: Sidebar and full-width pages
**Persona**: Priya, a founder who prefers chatting with the Finance agent but wants to open the Cash page wide when the numbers are long
**Goal**: Go from the chat's side panel to the full-width page and back to the chat, without losing her place.
**Preconditions**: Logged in as demo owner. Finance agent has "Cash", "Spend" and "Cash HTML". "Cash" is in the sidebar.
**Ideal path**: 4 — open the Finance agent, click "Page", click the sidebar "Cash", click the Finance agent in the roster.
**Alternate paths**: A pending block's "Waiting for approval" link on the full-width page goes to `/app/{botId}` directly (Shell/BotPageView `review`).
### Steps
1. Click the Finance agent in the roster → the chat opens at `/app/{botId}`. The header shows a "Page" button (title and aria-label "Page"), because the bot has pages.
2. Click "Page" → a side panel opens beside the chat. A tab list with aria-label "Pages" shows "Cash", "Spend" and "Cash HTML". "Cash" is selected. The panel also has a "Page options" button and a "New page" (+) button.
3. Click the "Spend" tab, then click the sidebar row "Cash" → the view changes to the full-width `/app/pages/{botId}/{cashId}`. The chat and its header "Page" button are gone.
4. Click the "Outside rate (pending)" block's "Waiting for approval" → the app goes to `/app/{botId}`, the chat. If an approval card was seeded, it shows "Allow" and "Not now"; otherwise the thread has no card.
5. Click "Page" again → the side panel reopens.
### Variations
- Press the browser Back button from the full-width page: it returns to the chat route.
- Phone width (390px): the side panel is replaced by a full view and the sidebar is a drawer. Opening a sidebar page closes the drawer.
### Edge Cases
- The side panel remembers nothing about the selected tab when the page is reopened (`activeId` is local state), so it starts on the first page ("Cash").
- Step 4 with no seeded approval card: the user lands in a chat that has nothing to approve. Mark "needs seeded approval card" if a card is expected.
- The full-width route has no live updates: Shell passes `remote={null}` and `dataRemote={null}` (Shell.tsx:5183), so a page change by the bot while the user reads the wide page does not show until reload. The side panel does update live.
- The two views of the same page use separate editors. A user editing in one and viewing in the other may see "Page changed. Reload".

## STORY-NAV-06: Collapse the Pages group and hide the sidebar
**Type**: short
**Topic**: Sidebar and full-width pages
**Persona**: Dana, working on a small laptop screen who wants more room
**Goal**: Collapse the sidebar Pages group, then the whole sidebar, and still reach "Cash".
**Preconditions**: Logged in as demo owner. On `/app/pages/{botId}/{cashId}`. Sidebar expanded.
**Ideal path**: 3 — collapse the group, hide the sidebar, restore the sidebar.
**Alternate paths**: Keyboard shortcut for the sidebar (Shell.tsx ~4963-4974 toggles collapse). Not verified which keys.
### Steps
1. Click the "Pages" header (aria-label "Collapse Pages", data-testid `sidebar-pages-toggle`) → all page rows hide except the current one, "Cash", which stays visible. The "Add page" row disappears too (it receives no items while collapsed). The chevron turns.
2. Click "Hide sidebar" → the sidebar becomes an icon rail. The "Cash" row shows only its avatar; hovering or focusing shows a tooltip "Cash". A "Show sidebar" button (data-testid `restore-bots-sidebar`) appears on a page route.
3. Click "Show sidebar" → the full sidebar returns, with the Pages group still collapsed.
4. Click "Expand Pages" → all rows and "Add page" return.
### Variations
- Open "Spend" while the group is collapsed using a link elsewhere (URL): "Spend" becomes the visible current row; "Cash" hides.
### Edge Cases
- In the rail, the "Page options" button and "Add page" are both missing. The rail has no way to add or remove a page.
- In the rail the group never collapses; the rail shows all rows regardless (`usePagesCollapsed` reads false in the rail).
- The "…" button in the group header (aria-label "Page options", same name as each row's menu) opens "Show in sidebar" with a checkbox per page. Unchecking "Cash" hides it but keeps it added. Two buttons with the same accessible name "Page options" on one screen is confusing for a screen-reader user.

## STORY-NAV-07: A page is deleted while it is still in the sidebar
**Type**: medium
**Topic**: Sidebar and full-width pages
**Persona**: Marcus, who deletes an old page in the chat panel and later clicks its sidebar row
**Goal**: See what the sidebar does after the page it points to is deleted.
**Preconditions**: Logged in as demo owner. "Spend" is in the sidebar. A throwaway page exists: create one in step 1. Use a throwaway page so the seed is not lost.
**Ideal path**: 6 — create, add to the sidebar, delete, then confirm.
**Alternate paths**: The bot cannot delete pages (no `page_delete` tool shipped). The full-width route cannot delete either.
### Steps
1. Open the Finance agent chat, click "Page", click "New page" (+) → a page "New page" is created and opened with an inline "Page title" input. Type "Scratch" and press Enter.
2. Click "Add page" in the sidebar → the menu now lists "Scratch" under "Finance agent". Click it → the full-width "Scratch" page opens and the sidebar shows "Scratch".
3. Go back to the Finance agent chat, click "Page", select the "Scratch" tab, then "Page options" → "Delete" → a dialog titled "Delete Scratch?" with buttons "Cancel" and "Delete".
4. Click "Delete" → the tab disappears and the panel selects the first page.
5. Look at the sidebar → code reading says the "Scratch" row remains until the sidebar reloads (no refresh on delete). Observe.
6. Click that "Scratch" row (if it is still there) → `BotPagePanel` loads the list, does not find the page, and calls `onMissing`. The app navigates to `/app` with replace, and the user sees the default chat with no message explaining why.
### Variations
- Reload the browser after step 4: the "Scratch" row is gone (the server skips rows whose page no longer exists, or the row cascades).
- Open `/app/pages/{botId}/{deletedId}` straight from a bookmark: same silent redirect to `/app`.
### Edge Cases
- Cancel in step 3: nothing changes.
- The last remaining page cannot be deleted: "Delete" does not show when there is only one page.
- Defect candidate: a dead sidebar row followed by a silent redirect, with no toast. See SidebarPages.tsx:56-64 and bot-page-panel.tsx:569-571.

## STORY-NAV-08: Open a sidebar page on a phone
**Type**: medium
**Topic**: Sidebar and full-width pages
**Persona**: Priya, checking cash from her phone in a taxi (390px wide)
**Goal**: Reach the Cash page through the navigation drawer and use its options menu with a thumb.
**Preconditions**: Logged in as demo owner at a 390px-wide viewport. Touch input if possible (coarse pointer).
**Ideal path**: 4 — open the drawer, tap "Cash", tap "Page options", read the menu.
**Alternate paths**: Swipe from the left edge to open the drawer (there is an e2e for sidebar swipe: apps/web/e2e/mobile-sidebar-swipe.spec.ts).
### Steps
1. Tap the navigation button (aria-label "Open navigation") → the sidebar drawer opens with the "Pages" group at the top.
2. Tap the "Cash" row → the drawer closes and the full-width page opens.
3. Look at the header → the title "Cash", the navigation button, and "Page options" (on the same row or wrapped below the title).
4. Tap "Page options" → "Refresh", "Sources", "Share", "Rename". Tap "Sources" → the "Sources" dialog opens.
5. Close it and reopen the drawer; tap the row's "Page options" → "Remove from sidebar". On touch screens that button is always visible (no hover needed).
### Variations
- Landscape phone: the sidebar may stay as a rail.
- Group header "…" button also visible. Tap targets on the row are 44 px tall (`pointer-coarse:min-h-11`), but the row's "Page options" button is 24 px (`h-6 w-6`), which is small for a thumb.
### Edge Cases
- Long page titles are not truncated in the sidebar row text (`SidebarPageLink` label has no truncate class), so a long title may push the row wide. Check with a 60-character title.
- A table such as "Largest vendors" may scroll sideways inside the page.
- The drawer's Pages area scrolls on its own when there are many rows.

## STORY-NAV-09: Founder's Monday cash review, from sidebar to shared snapshot
**Type**: long
**Topic**: Sidebar and full-width pages (cross-topic: blocks, sources, source recovery, sharing)
**Persona**: Priya, a seed-stage founder doing her Monday review before sending a cash update to her investor
**Goal**: Open the Cash page from the sidebar, check each block, see why one number is stale and another is paused, resume the paused source, and share a frozen copy of the page.
**Preconditions**: Logged in as demo owner. Finance agent seeded as described in the brief. "Cash", "Spend" and "Cash HTML" in the sidebar. Sidebar expanded. The "Outside rate (pending)" http source is pending with no approval card (unless the walker seeds one: "needs seeded approval card" for step 11). Resuming a source needs no model. A real fetch may fail on the demo network. Treat the post-resume value as "observe and note".
**Ideal path**: 9 — sidebar row, read blocks, retry stale, Sources, resume Payroll, share, copy link.
**Alternate paths**: Reach "Cash" through the Finance agent chat "Page" button and the side panel (same menu items, plus tabs and "New page"). The source fixes work the same in either view; the "Waiting for approval" link only exists on the full-width page.
### Steps
1. Click the "Cash" row in the sidebar → `/app/pages/{botId}/{cashId}` opens. The header reads "Cash".
2. Read the blocks → "Monthly burn" shows a value. "Largest vendors" shows a table. "Cash (stale)" shows a warning dot. "Payroll (paused)" and "Never fetched (paused)" show "Paused". "Outside rate (pending)" shows "Waiting for approval".
3. Hover or focus "Monthly burn" → the fetch time appears.
4. Click the warning dot on "Cash (stale)" (aria-label "Source failed") → a popover shows the error "Request timed out" and a "Retry" button.
5. Click "Retry" → a brief "Refreshing" shimmer shows. In the demo the call may fail again; the popover may return with the same error. Note what you see. Press Escape to close.
6. Click "Page options", then "Sources" → a dialog titled "Sources" lists every source. Each row shows a name, a subline `server · tool · schedule`, a last-refresh time, and a badge. "Cash (stale)" has "failed" with its error line "Request timed out". "Payroll (paused)" and "Never fetched (paused)" have "paused". "Outside rate (pending)" has "pending".
7. Click "Payroll (paused) options" → the menu shows "Change schedule", "Resume" and "Remove" (no "Pause", because it is paused).
8. Click "Resume" → the badge changes from "paused" to "ok" or no longer "paused". The failure count resets.
9. Hesitate: open "Cash (stale) options" and look at the menu → "Change schedule", "Pause", "Remove". There is no "Resume" or retry here (it is active). Close the menu with Escape without changing anything. Do not click "Remove" (it asks "Remove Cash (stale)?" with "Cancel" and "Remove", and dependent blocks would then show "Source not found").
10. Close the dialog (Escape) → the "Payroll (paused)" block no longer shows "Paused". It may show "No data yet" until the next refresh, or a value.
11. Click "Waiting for approval" on "Outside rate (pending)" → the app goes to the Finance agent chat at `/app/{botId}`. If an approval card was seeded, it reads "Read {host} every hour?" with "Allow" and "Not now". Click the browser Back button to return to the page. (Skip the Allow click unless the card was seeded.)
12. Click "Page options", then "Share" → a dialog titled "Share link" shows the note "Anyone with this link can view this version until you stop sharing or for 30 days." (or until a date), the line "Links are shown once. Replacing this one stops the old link.", the link with "Copy", and the buttons "Replace link" and "Stop sharing".
13. Click "Copy" → the label changes to "Copied".
14. In a separate logged-out browser context, open the copied `/s#token` link → a view-only copy of "Cash" shows, frozen at the share time. It shows no "Page options", no Sources and no Retry. The "Payroll (paused)" value in the copy is whatever the page held at share time.
15. Back in the first window, click "Done" → the dialog closes. The page is still full-width "Cash".
16. Click "Spend" in the sidebar → the header becomes "Spend" and "Spend this month" shows. Click "Cash" again → the Cash page returns with the Payroll change kept.
17. Click "Page options", "Share" again → a new link is created. The first link no longer opens (the dialog says replacing it stops the old link). Click "Stop sharing" then "Stop sharing" in the confirmation titled "Stop sharing this link?" → the link stops working; reloading the `/s#token` tab shows the viewer an unavailable page. Observe the exact copy.
### Variations
- Phone width (390px): same steps. The Sources dialog fills the screen. Use the drawer for steps 1 and 16.
- Do the whole review from the Finance agent chat's side panel instead: steps 2-10 and 12-17 are the same, but there is no clickable "Waiting for approval" (step 11 is not available), and the page updates live while the bot works.
- Keyboard only: the blocks are tabbable. Enter on the warning dot opens its popover. The menus open with Enter and close with Escape.
### Edge Cases
- Dialog opened while the page is being edited: typing in the page before opening "Sources" is autosaved after 800 ms, so there is no loss.
- In step 8 the praci or http source may fail again. The badge goes to "failed" with a new error, and after 5 failures the source pauses again and the bot's thread gets "A source on one of your pages stopped working. Call page_source_list to see which one and why."
- The "Share" dialog creates a link every time it is opened (`pages.share` runs on click), so opening it to look replaces the old link. A founder who opens "Share" only to check the status can silently invalidate the link already sent to an investor. Confirm in the walk and flag as a defect if so.
- Share in step 12 shares a frozen copy, so changing the Payroll source afterwards does not change the shared view.
- No error shows for a failed share request except a line inside the dialog.
