# Managing named pages

Topic: the side-panel page tabs, "New page", rename, delete, the 20-page cap, editing with autosave and conflicts, and the first-page quirk. Code read: `apps/web/src/pages/shell/bot-page-panel.tsx`, `apps/web/src/pages/BotPageView.tsx`, `apps/web/src/pages/Shell.tsx` (~5109, ~5488), `apps/api/src/router.ts` (pages.* at ~4596-4670), `packages/adapters/src/pages.ts`.

Demo seed assumed: Finance agent has three pages: "Cash" (blocks), "Spend" (blocks) and "Cash HTML" (html). All three appear in the sidebar.

Server rules used below: titles are trimmed, 1-60 characters, and unique per bot ignoring case (`pages.ts` createBotPage/renameBotPage). A duplicate returns CONFLICT "A page named {title} already exists". The 21st page returns BAD_REQUEST "This bot already has 20 pages". `pages.remove` has no "last page" rule on the server. Only the UI hides Delete.

## STORY-PAGES-01: Find the page tabs from the Finance agent chat
**Type**: short
**Topic**: Managing named pages
**Persona**: Priya, a seed-stage founder who wants to check cash before a board call
**Goal**: Open the Finance agent's pages beside the chat and switch between them.
**Preconditions**: Logged in as the demo owner. Seeded pages Cash, Spend, Cash HTML exist.
**Ideal path**: 3 — open the bot, click "Page", click a tab.
**Alternate paths**: Click a page row in the sidebar to open it full width at `/app/pages/:botId/:pageId` (1 click, but no tabs and no "New page"). On a phone, the same header button opens the panel.
### Steps
1. Open `/app` and click the Finance agent in the sidebar → chat at `/app/:botId` opens. The header shows a file icon button titled "Page" once the page check finishes (it is absent for a short moment while `pageBotId` loads).
2. Click "Page" in the chat header → a side panel titled "Page" opens beside the chat. The URL does not change. The button looks active.
3. Read the top of the panel → a tab row (aria-label "Pages") shows "Cash", "Spend", "Cash HTML". "Cash" is selected, because the first page opens by default. To the right are the "Page options" (three dots) and "New page" (plus) buttons.
4. Click the "Spend" tab → the editor swaps to the Spend page and shows the metric "Spend this month". The tab does not touch the URL.
5. Click "Cash HTML" → the sandboxed HTML view replaces the editor. Text cannot be typed into it.
6. Click "Page" in the header again → the panel closes.
### Variations
- Phone width (390px): the panel takes over the layout. Check that the tab row scrolls or wraps and does not push "Page options" off screen. Three tabs fit; the 20-page case is in STORY-PAGES-05.
- Keyboard: Tab to the "Pages" tab row, then use arrow keys to move between tabs (Base UI Tabs behavior, not verified in code).
### Edge Cases
- The panel remembers no tab choice. Close and reopen "Page", and "Cash" (the first page) is selected again, because the panel unmounts and `activeId` resets.
- The sidebar lists the same three pages. Opening one there gives the full-width view with a header instead of tabs. The same page content shows on both surfaces.
- After a reload on `/app/:botId` the "Page" button is absent for a moment, then appears.

## STORY-PAGES-02: Add a second page and name it
**Type**: medium
**Topic**: Managing named pages
**Persona**: Marcus, an operations lead who wants a separate "Board prep" page next to Cash
**Goal**: Create a new empty page, give it a real title and see it as a new tab.
**Preconditions**: Logged in as the demo owner. Side panel open on the Finance agent (see STORY-PAGES-01). Fewer than 20 pages.
**Ideal path**: 4 — click New page, type the title, press Enter, confirm the tab.
**Alternate paths**: Ask the bot to create a page (`page_create` or `page_write`). Precondition: bot action (not walkable without a model). The sidebar "Add page" menu only adds existing pages and cannot create one. There is no create button on the full-width page.
### Steps
1. Click "New page" (plus icon) in the panel header → a new page is created on the server at once, titled "New page". The tab row now shows "Cash", "Spend", "Cash HTML", "New page" and the new tab is selected.
2. Look at the tab row → it is replaced by an inline text field (aria-label "Page title") with "New page" selected. Options and the plus button stay on the right.
3. Type `Board prep` → the selected text is replaced, so the title is not "New pageBoard prep".
4. Press Enter → the field closes and the tab row returns with a "Board prep" tab. The editor below is empty.
5. Click into the empty editor and type `Notes for the board call` → text appears. Wait about one second.
6. Click the "Spend" tab, then click "Board prep" again → the typed text is still there (autosaved 800 ms after the last key, and again when the editor unmounts).
### Variations
- Press Escape at step 3 instead of Enter → the field closes and the page keeps the title "New page". The page already exists on the server. Nothing says "kept as New page".
- Click "New page" a second time without renaming the first → the new page is titled "New page 2" (the helper `nextTitle` counts up, ignoring case).
- Type a title of 70 characters → the field stops at 60 (`maxLength`).
- Phone width: the inline field uses the full tab-row width. Check that the on-screen keyboard does not hide the editor.
### Edge Cases
- Hesitation: click away from the field (for example into the empty editor) before pressing Enter → the field disappears on blur and the title stays "New page". Anything typed is lost without a message. Also seen in STORY-PAGES-03.
- Clear the field and press Enter → nothing is saved (the rename is skipped when the title is empty), the field closes, and the title stays.
- Two quick clicks on "New page" → the first click awaits the create call, and the second can fire before the list reloads. It may create "New page 2" before the first is renamed. Unverified.
- The first click makes a server page even if the user never types anything. Empty "New page" pages stay until deleted.

## STORY-PAGES-03: Rename a page and hit a duplicate name
**Type**: medium
**Topic**: Managing named pages
**Persona**: Dana, a finance lead tidying page names before sharing
**Goal**: Rename "Spend" to "Spend by team", then try a name that is already taken.
**Preconditions**: Side panel open on the Finance agent with Cash, Spend and Cash HTML.
**Ideal path**: 4 — open menu, Rename, type, Enter.
**Alternate paths**: The full-width page has the same "Page options" menu in its header and the same Rename. Double-clicking a tab does nothing. The bot cannot rename a page (no `page_rename` tool was found in discovery).
### Steps
1. Click the "Spend" tab, then click "Page options" → a menu shows "Refresh", "Sources", "Share", "Rename", "Delete". "Refresh" and "Sources" appear only when the page has sources. Spend has one source, so it shows them.
2. Click "Rename" → the tabs are replaced by the "Page title" field containing "Spend", all selected.
3. Type `Spend by team` and press Enter → the tab row returns with "Spend by team". The sidebar row updates after a reload or event. Whether it updates live is unverified.
4. Click "Page options" → "Rename" again, type `cash` (lowercase) and press Enter → a red line (role=alert) shows `A page named cash already exists`. The tab row does not change.
5. Press Escape → the field closes and the error line is cleared on the next action.
### Variations
- Press Enter on an unchanged title → no request is made and the field closes.
- On the full-width page `/app/pages/:botId/:pageId`: the heading is replaced by the input, and Enter saves.
- Rename the "Cash HTML" page → works the same way (rename is by id, not by kind).
### Edge Cases
- After the duplicate error the field is still open, so the user can edit and retry, but clicking anywhere (for example on the error text) blurs and closes it.
- Whitespace-only title → trimmed to empty, so no request.
- Case-only change ("Spend" to "SPEND") → the server finds the same page and allows it, since `taken.id === pageId`.
- The 60-character limit applies in the input, so a longer title cannot be pasted past it (pasted text is cut by `maxLength`).

## STORY-PAGES-04: Delete a page, and what is not offered
**Type**: medium
**Topic**: Managing named pages
**Persona**: Marcus, removing a draft page by mistake and then cancelling
**Goal**: Delete the "Board prep" page (from STORY-PAGES-02) with a confirmation, and see why the last page cannot be deleted.
**Preconditions**: At least the pages Cash, Spend, Cash HTML, and a throwaway page "Board prep" or "New page" exist. Do not delete the seeded pages if the walker needs them afterwards.
**Ideal path**: 4 — open menu, Delete, confirm, check tabs.
**Alternate paths**: None in the UI. The bot has no `page_delete` tool, and the full-width page hides Delete. A direct `pages.remove` RPC call works but is not a user route.
### Steps
1. Click the "Board prep" tab, then "Page options" → the menu includes the red item "Delete" (it shows because there are 2 or more pages and the panel is not full-width).
2. Click "Delete" → a dialog titled "Delete Board prep?" shows with "Cancel" and a red "Delete" button.
3. Click "Cancel" → the dialog closes and the page remains.
4. Repeat steps 1-2 and click "Delete" → the dialog closes. The tab "Board prep" disappears. The panel opens the first page ("Cash"), not the neighbouring tab.
### Variations
- Press Escape in the dialog → closes without deleting (standard AlertDialog).
- Open the same page full-width from the sidebar and open "Page options" → the menu has "Rename" and "Share" but no "Delete".
- Delete down to a single page: the menu loses "Delete" and the tab row disappears (tabs show only for 2 or more pages). The page is still there, and only "New page" is available to add more.
### Edge Cases
- The dialog has no warning that the page content and its revisions are deleted for good, and no undo. The title is the only context.
- A very long title wraps in the dialog (`break-words`).
- Delete a page that is also in the sidebar → the sidebar row should disappear (spec claim, not verified). If the walker is on that page's full-width URL in another tab, `onMissing` sends it to `/app` on the next list load.
- If the delete request fails, the error line appears under the tab row and the dialog has already closed (`setDeleting(false)` is only reached after a successful call, so on failure it stays open; the error then shows behind the dialog). Unverified.
- Server only: deleting the last page through the API succeeds, because only the UI blocks it.

## STORY-PAGES-05: Reach the 20-page cap
**Type**: long
**Topic**: Managing named pages
**Persona**: Tomas, a power user who creates a page per board meeting
**Goal**: Fill the bot to 20 pages, find out what the cap looks like and recover by deleting.
**Preconditions**: Finance agent has 3 pages. 17 more must be created by clicking "New page" (or seed 17 pages with `pages.create`). Side panel open.
**Ideal path**: 22 — about 17 creates, then a delete and a create. There is no shortcut.
**Alternate paths**: Seed the pages through the `pages.create` RPC, as `apps/web/e2e/bot-page.spec.ts` does for its helper. The bot can also create pages with `page_create` and hits the same cap on the server. Precondition: bot action (not walkable without a model).
### Steps
1. Click "New page" → "New page" is created and the title field opens. Press Enter to keep the name (the title is unchanged, so no rename request). The count is now 4.
2. Click "New page" again → "New page 2" is created. Press Enter. Count 5.
3. Repeat the click and Enter for 15 more pages → titles continue as "New page 3" up to "New page 17". The tab row now holds 20 tabs. Scroll sideways in the tab row if it overflows.
4. Look at the plus button after the 20th page → "New page" is disabled (greyed out, not clickable). There is no tooltip and no message that says why.
5. Hover or focus the disabled button → nothing explains the limit.
6. Click the "New page 17" tab, open "Page options" → "Delete" and confirm "Delete New page 17?" → the page is deleted and the count is 19.
7. Click "New page" again → a page is created again (title "New page 17" is free again, so `nextTitle` reuses it). The plus button is disabled again.
### Variations
- Keyboard: Tab to the plus button after the 20th page → the disabled button is skipped in the tab order.
- Phone width (390px): 20 tabs inside a 390px panel. Check whether the tab row scrolls horizontally or clips, and whether the active tab can be reached.
- Race (two browser tabs, 19 pages each): both click "New page" → one succeeds and the other shows a red line `This bot already has 20 pages`. Unverified.
### Edge Cases
- The cap is per bot, not per space. Another bot still has its own 20.
- The error line from the server is shown only if the plus button was clickable. In a single session the button is already disabled at 20.
- Tab titles are not shortened (`TabsTrigger` shows the full title), so 20 tabs with long names will be hard to scan.

## STORY-PAGES-06: Edit a page, autosave and the conflict banner
**Type**: medium
**Topic**: Managing named pages
**Persona**: Priya, typing notes on the Cash page while the bot is also changing it
**Goal**: Type in the editor, see it saved, and handle "Page changed. Reload".
**Preconditions**: Side panel open on Cash. For the conflict part: a second change to the same page by something else (a second browser tab saving the same page works without a model).
**Ideal path**: 3 — click into the editor, type, wait one second.
**Alternate paths**: Edit on the full-width page (same editor). HTML pages cannot be edited.
### Steps
1. Click at the end of the Cash page text and type ` Reviewed` → the text appears. There is no "Saving" or "Saved" indicator.
2. Wait about one second (`SAVE_DELAY_MS` 800 ms) → the change is saved in the background. Reload the browser and reopen "Page" to see the text survive.
3. Open the same Finance agent page in a second browser tab, change a word in the editor, and wait one second → this tab saves revision N+1.
4. Back in the first tab, type one more character without reloading → the autosave sends the old revision, and a secondary button "Page changed. Reload" appears above the editor. Typing stops being saved (`stale` is set).
5. Click "Page changed. Reload" → the editor replaces its content with the latest saved version. The character typed in step 4 is gone. The button disappears and saving resumes.
### Variations
- If the first tab has nothing typed when the other tab saves, the editor reloads quietly with no banner.
- Unsaved typing while a remote change arrives (for example the bot edits the page) → the banner appears at once, with no automatic merge.
- Server unreachable while typing → a red line `Could not save the page.` shows above the editor. The user does not know that typing continues to retry.
- Phone width: the Reload button sits above the editor in `mb-3` spacing, below the tab row.
### Edge Cases
- The banner never says that the user's typing will be lost on Reload. There is no way to copy the user's version first except by selecting it manually.
- While the banner shows, further typing is not saved, and nothing in the banner says so.
- Switching tabs with unsaved text triggers a save on unmount (`persist()` in the effect cleanup). A conflict found at that point is silent, because the editor is already gone.
- Live blocks (metrics, tables) are part of the page text. Deleting a block with its hover delete button counts as an edit and autosaves too.
- The page has no undo history beyond the browser editor's own undo.

## STORY-PAGES-07: The first-page quirk, an empty bot
**Type**: short
**Topic**: Managing named pages
**Persona**: Elena, a new user who opens a bot that has no page and looks for a way to add one
**Goal**: Find out how to get a first page.
**Preconditions**: A bot with no pages (for example the Inbox agent or Chief in the demo seed, which has no pages). Logged in as the demo owner.
**Ideal path**: not reachable by the owner in the UI — the only route is to ask the bot, which needs a model.
**Alternate paths**: Ask the bot in chat to write a page (`page_write` or `page_create`). Precondition: bot action (not walkable without a model). Open another bot that already has pages. The sidebar "Add page" menu lists only bots and pages that already exist.
### Steps
1. Open a bot without pages from the sidebar → the chat opens. The header has no "Page" button, because `pageBotId` is set only when the bot has a page.
2. Look at the header and other menus for a way to add a page → there is none. "New page" lives in the side panel, which cannot be opened.
3. Open the sidebar "Add page" row → it lists templates (for example "Team health") and bots with existing pages only. The empty bot is not listed.
4. Ask the bot "Make me a Cash page" in chat → with no model (`DEMO_NO_MODEL=1`) no reply arrives. With a model, the bot calls `page_create`, and the "Page" button then appears in the header.
### Variations
- With a model: after the bot's first page, "Page" appears without a reload (a `page.updated` event sets `pageBotId`). The tab row is hidden while there is only one page. The first "New page" click then creates a second page and shows the tabs.
- Phone width: same, no "Page" button.
### Edge Cases
- If the owner deletes pages until one is left, the page stays and the tab row disappears, which looks like the bot has just one page.
- Defect candidate: nothing in the UI tells the owner that pages come from the bot. The panel's own "New page" button exists but can only be reached after a first page exists (see the summary).
- A bot whose only page was removed through the API: `pages.length === 0`. The tab row and options menu are hidden and the panel shows an empty editor (`PageEditor` with `pageId` undefined), but the "Page" button may still be showing until a reload. Unverified.
