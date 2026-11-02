# UX Story Catalog: Live pages

**Generated**: 2026-11-01
**Total stories**: 65 (71 stories in the 8 topic files; 6 duplicates merged)
**Source files**: docs/ux-paths/live-pages/discovery.md and the 8 files in docs/ux-paths/live-pages/topics/
**Coverage**: all 11 feature areas in the discovery Feature Map have at least one story; Expo mobile and iOS are covered only by native stories that cannot be walked in a browser, and the bot tools (page_* tools) are covered only indirectly. See the Coverage Matrix.
**Walkable in the web demo**: 59 of 65 (50 plain yes, 9 that touch the seeded approval card, 4 bot-action only, 2 native-app only)

Notes on this catalog:
- Each story title carries its original topic ID in brackets, for example `[APPROVE-01]`, so a walker can find the full source text in docs/ux-paths/live-pages/topics/. Merged stories list both IDs.
- Cross references written in full inside story text ("STORY-APPROVE-05") were rewritten to the new catalog IDs. Short references such as "stories 01 and 02" or "or -02" still use the topic-local number.
- Names in the stories (for example "Outside rate (pending)") come from the topic files. The demo seed's pending http source is named "outside" on page Cash and its card reads "Read api.example.test every hour?" with Allow and Not now. Where a story names it differently, use the seeded name.
- Demo seed: three pages are already in the sidebar (Cash, Spend, Cash HTML); one pending approval card sits in the Finance agent chat; the Spend page has the history chart "Spend over time". The seed has no mcp source and no card for any other state.
- The topic files were written from code and nothing was run. Every expected result is a prediction for the walker to confirm.

## Summary

### By type

| Type | Count |
|---|---|
| short | 24 |
| medium | 33 |
| long | 8 |
| **Total** | **65** |

### By topic

| Topic | Stories | short | medium | long | Walkable |
|---|---|---|---|---|---|
| Managing named pages | 7 | 2 | 4 | 1 | 7 |
| Reading live blocks | 9 | 3 | 5 | 1 | 9 |
| Managing sources, failure and recovery | 8 | 4 | 3 | 1 | 7 |
| Approving outside sources | 10 | 4 | 5 | 1 | 7 |
| HTML pages | 7 | 2 | 4 | 1 | 7 |
| Sidebar and full-width pages | 9 | 4 | 4 | 1 | 9 |
| Sharing a snapshot | 7 | 2 | 4 | 1 | 7 |
| Pages on a phone | 8 | 3 | 4 | 1 | 6 |

### By walkability

| Walkability | Count |
|---|---|
| yes | 50 |
| needs seeded approval card (seeded) | 9 |
| no — bot action | 4 |
| no — native app | 2 |

### Merged duplicates

| Kept | Dropped (full text kept under the kept story as "Merged duplicate") | Why |
|---|---|---|
| STORY-024 [SOURCES-10] | HTML-04 | Same flow: open the Sources dialog of Cash HTML. The kept story adds the phone variation. |
| STORY-039 [HTML-06] | SHARE-07 | Same flow: share the Cash HTML page and open the link logged out. The kept story is longer. |
| STORY-057 [SHARE-08] | PHONE-05 | Same flow: share a snapshot from a phone. The kept story adds the mistake and replacement steps. |
| STORY-049 [NAV-08] | PHONE-01 | Same flow: open a sidebar page on a phone. The kept story adds touch and drawer detail. |
| STORY-010 [BLOCKS-03] | SOURCES-06 | Same flow: failed dot, popover, Retry. The kept story has more edge cases. |
| STORY-011 [BLOCKS-04] | SOURCES-08 | Same flow: blocks with no number (never fetched, pending). The kept story also covers paused. |

## Coverage Matrix

Feature areas come from the Feature Map in discovery.md.

| # | Feature area | Stories | Gaps |
|---|---|---|---|
| 1 | Bot page panel with named page tabs | STORY-001, STORY-002, STORY-003, STORY-004, STORY-005, STORY-006, STORY-007, STORY-046, STORY-061 | No story for GTM block Move up and Move down. Creating a bot's first page needs a model. The Electron host is not covered. |
| 2 | Live blocks (metric, table, chart) | STORY-008 to STORY-016, STORY-024 | A table with no columns or a non-usd number column is not tested for masking. Keyboard Delete on a selected block is unverified. No story for a source-backed chart whose source is paused. |
| 3 | Page sources dialog | STORY-017 to STORY-021, STORY-022, STORY-023, STORY-060 | Daily and per-space caps (2,000 refreshes, 100 sources) are not walked. The once-a-minute refresh limit in the spec is not in the code. Creating or editing a source call is bot-only (STORY-023 cannot be walked). |
| 4 | Approval cards (mcp and http) | STORY-025 to STORY-034, STORY-011 | Only one card is seeded, so Allow and Not now can each be walked once, not both. Re-approval after a call change (STORY-028, STORY-031) and mcp cards (STORY-032) need a model. Allow rules skipping the card (spec claim) are not covered. Expo and iOS cards are not covered. |
| 5 | HTML pages | STORY-035, STORY-036, STORY-037, STORY-038, STORY-039, STORY-040, STORY-041, STORY-024 | No story for malformed praci-sources meta, the 20-source limit, praci-history, or data for a different revision. A failing source on an HTML page needs a bot action. |
| 6 | Sidebar pages | STORY-042 to STORY-050 | The "Add page" template "Team health" is not covered. The rail and collapsed modes (menu hidden) are only partly covered by STORY-047. |
| 7 | Snapshot sharing | STORY-051 to STORY-056, STORY-057, STORY-039 | Expiry date wording and an expired link cannot be reached in a demo session. "Replace link" never appears in the page flow. The 60-opens-a-minute rate limit is not walked. |
| 8 | Bot tools (page_* tools) | none walkable (STORY-023 and STORY-028 depend on them) | All tool behavior (stale revision, page_source_set preview, 4,000 character limit) is untested here. No page_delete tool exists. |
| 9 | RPCs | indirect through every UI story | pages.remove has no last-page rule on the server; only the UI hides Delete. No story calls the RPCs directly. |
| 10 | Mobile (Expo) | STORY-064 | Native only; no browser walk. |
| 11 | iOS | STORY-065 | Native only; no browser walk. |
| 12 | Phone-width web (cross-cutting) | STORY-049, STORY-058, STORY-059, STORY-060, STORY-061, STORY-062, STORY-063, STORY-057, STORY-033 | Touch-only reveal of fetch times and the Delete block button depends on tap focus; verify on a real touch device if possible. |

## Story Dependency Graph

Most stories are independent reads. The rest change state that other stories need. Run the read-only ones first; the Walk order section applies these rules.

```text
Seed state (all stories start here)
|-- Read-only, any order
|   |-- STORY-001, STORY-007, STORY-008, STORY-009, STORY-011 (stop at the link), STORY-014
|   |-- STORY-017, STORY-024, STORY-035, STORY-037, STORY-038, STORY-044, STORY-046
|   |-- STORY-034, STORY-030, STORY-029, STORY-027 (all four must stop before answering the card)
|   `-- phone width: STORY-049, STORY-058, STORY-062, STORY-033 (stop before tapping Allow)
|
|-- Light state change (refresh, retry, preference, rename, schedule)
|   |-- STORY-012 Hide amounts on, then off (preference; reset it)
|   |-- STORY-013, STORY-010 Retry, STORY-036, STORY-059  --> may change the failed "Cash (stale)" source
|   |       must run AFTER STORY-011, STORY-016 and STORY-017 if those should see the seeded failure
|   |-- STORY-018, STORY-060 change a schedule
|   |-- STORY-045 renames Spend --> rename it back before STORY-042, STORY-043
|   `-- STORY-002 creates a throwaway page --> STORY-003 and STORY-006 use it --> STORY-004 deletes it
|
|-- Share links
|   |-- STORY-051 --> STORY-052 (needs the link and a logged-out window)
|   |-- STORY-056, STORY-039, STORY-041, STORY-057, STORY-063, STORY-050 each create a link
|   |-- STORY-055 (second link revokes the first) --> STORY-054 (replaced link)
|   `-- STORY-053 Stop sharing --> STORY-054 (revoked link). Stop sharing is destructive, so run it last of the share stories.
|
|-- Source state change
|   |-- STORY-019 pause --> hides the number on the paused block, so run after STORY-016 and STORY-011
|   |-- STORY-020 and STORY-050 both resume a paused source; the seed has two ("Payroll (paused)", "Never fetched (paused)"), so each takes a different one
|   |-- STORY-022 resumes the stale source after pause
|   `-- STORY-021 Remove source (destructive, no undo)
|       must run AFTER STORY-014 (history chart needs the Spend source), STORY-016 step 17-18, STORY-050 and STORY-045
|
|-- The single seeded approval card (one answer only)
|   |-- STORY-025 Allow (preferred use)
|   |-- STORY-026 Not now (only on a fresh demo stack, or in place of STORY-025)
|   |-- STORY-027, STORY-029, STORY-033 would also answer it; walk them only up to the answer
|   |-- After Allow or Not now, the placeholder "Waiting for approval" is gone, so STORY-011, STORY-016, STORY-050, STORY-029 and STORY-034 must run BEFORE it
|   `-- Allow also refreshes the http source once, which will probably fail against the emulated network and add a failed block
|
`-- Destructive, last
    |-- STORY-015 Delete block (no confirmation)
    |-- STORY-053 Stop sharing, then STORY-054
    |-- STORY-004 Delete page, STORY-048 create then delete a throwaway page
    |-- STORY-043 Remove from sidebar --> STORY-042 re-adds it (run in this order)
    `-- STORY-005 20-page cap (leaves 20 pages)

Not walkable: STORY-028, STORY-031, STORY-032, STORY-023 (bot action); STORY-064, STORY-065 (native app).
```

## All Stories

## Topic: Managing named pages

### STORY-001: Find the page tabs from the Finance agent chat [PAGES-01]
**Type**: short
**Walkable**: yes
**Topic**: Managing named pages
**Persona**: Priya, a seed-stage founder who wants to check cash before a board call
**Goal**: Open the Finance agent's pages beside the chat and switch between them.
**Preconditions**: Logged in as the demo owner. Seeded pages Cash, Spend, Cash HTML exist.
**Ideal path**: 3 — open the bot, click "Page", click a tab.
**Alternate paths**: Click a page row in the sidebar to open it full width at `/app/pages/:botId/:pageId` (1 click, but no tabs and no "New page"). On a phone, the same header button opens the panel.
#### Steps
1. Open `/app` and click the Finance agent in the sidebar → chat at `/app/:botId` opens. The header shows a file icon button titled "Page" once the page check finishes (it is absent for a short moment while `pageBotId` loads).
2. Click "Page" in the chat header → a side panel titled "Page" opens beside the chat. The URL does not change. The button looks active.
3. Read the top of the panel → a tab row (aria-label "Pages") shows "Cash", "Spend", "Cash HTML". "Cash" is selected, because the first page opens by default. To the right are the "Page options" (three dots) and "New page" (plus) buttons.
4. Click the "Spend" tab → the editor swaps to the Spend page and shows the metric "Spend this month". The tab does not touch the URL.
5. Click "Cash HTML" → the sandboxed HTML view replaces the editor. Text cannot be typed into it.
6. Click "Page" in the header again → the panel closes.
#### Variations
- Phone width (390px): the panel takes over the layout. Check that the tab row scrolls or wraps and does not push "Page options" off screen. Three tabs fit; the 20-page case is in STORY-005.
- Keyboard: Tab to the "Pages" tab row, then use arrow keys to move between tabs (Base UI Tabs behavior, not verified in code).
#### Edge Cases
- The panel remembers no tab choice. Close and reopen "Page", and "Cash" (the first page) is selected again, because the panel unmounts and `activeId` resets.
- The sidebar lists the same three pages. Opening one there gives the full-width view with a header instead of tabs. The same page content shows on both surfaces.
- After a reload on `/app/:botId` the "Page" button is absent for a moment, then appears.

### STORY-002: Add a second page and name it [PAGES-02]
**Type**: medium
**Walkable**: yes (creates a page; note the name for later cleanup)
**Topic**: Managing named pages
**Persona**: Marcus, an operations lead who wants a separate "Board prep" page next to Cash
**Goal**: Create a new empty page, give it a real title and see it as a new tab.
**Preconditions**: Logged in as the demo owner. Side panel open on the Finance agent (see STORY-001). Fewer than 20 pages.
**Ideal path**: 4 — click New page, type the title, press Enter, confirm the tab.
**Alternate paths**: Ask the bot to create a page (`page_create` or `page_write`). Precondition: bot action (not walkable without a model). The sidebar "Add page" menu only adds existing pages and cannot create one. There is no create button on the full-width page.
#### Steps
1. Click "New page" (plus icon) in the panel header → a new page is created on the server at once, titled "New page". The tab row now shows "Cash", "Spend", "Cash HTML", "New page" and the new tab is selected.
2. Look at the tab row → it is replaced by an inline text field (aria-label "Page title") with "New page" selected. Options and the plus button stay on the right.
3. Type `Board prep` → the selected text is replaced, so the title is not "New pageBoard prep".
4. Press Enter → the field closes and the tab row returns with a "Board prep" tab. The editor below is empty.
5. Click into the empty editor and type `Notes for the board call` → text appears. Wait about one second.
6. Click the "Spend" tab, then click "Board prep" again → the typed text is still there (autosaved 800 ms after the last key, and again when the editor unmounts).
#### Variations
- Press Escape at step 3 instead of Enter → the field closes and the page keeps the title "New page". The page already exists on the server. Nothing says "kept as New page".
- Click "New page" a second time without renaming the first → the new page is titled "New page 2" (the helper `nextTitle` counts up, ignoring case).
- Type a title of 70 characters → the field stops at 60 (`maxLength`).
- Phone width: the inline field uses the full tab-row width. Check that the on-screen keyboard does not hide the editor.
#### Edge Cases
- Hesitation: click away from the field (for example into the empty editor) before pressing Enter → the field disappears on blur and the title stays "New page". Anything typed is lost without a message. Also seen in STORY-003.
- Clear the field and press Enter → nothing is saved (the rename is skipped when the title is empty), the field closes, and the title stays.
- Two quick clicks on "New page" → the first click awaits the create call, and the second can fire before the list reloads. It may create "New page 2" before the first is renamed. Unverified.
- The first click makes a server page even if the user never types anything. Empty "New page" pages stay until deleted.

### STORY-003: Rename a page and hit a duplicate name [PAGES-03]
**Type**: medium
**Walkable**: yes (renames a page; rename it back)
**Topic**: Managing named pages
**Persona**: Dana, a finance lead tidying page names before sharing
**Goal**: Rename "Spend" to "Spend by team", then try a name that is already taken.
**Preconditions**: Side panel open on the Finance agent with Cash, Spend and Cash HTML.
**Ideal path**: 4 — open menu, Rename, type, Enter.
**Alternate paths**: The full-width page has the same "Page options" menu in its header and the same Rename. Double-clicking a tab does nothing. The bot cannot rename a page (no `page_rename` tool was found in discovery).
#### Steps
1. Click the "Spend" tab, then click "Page options" → a menu shows "Refresh", "Sources", "Share", "Rename", "Delete". "Refresh" and "Sources" appear only when the page has sources. Spend has one source, so it shows them.
2. Click "Rename" → the tabs are replaced by the "Page title" field containing "Spend", all selected.
3. Type `Spend by team` and press Enter → the tab row returns with "Spend by team". The sidebar row updates after a reload or event. Whether it updates live is unverified.
4. Click "Page options" → "Rename" again, type `cash` (lowercase) and press Enter → a red line (role=alert) shows `A page named cash already exists`. The tab row does not change.
5. Press Escape → the field closes and the error line is cleared on the next action.
#### Variations
- Press Enter on an unchanged title → no request is made and the field closes.
- On the full-width page `/app/pages/:botId/:pageId`: the heading is replaced by the input, and Enter saves.
- Rename the "Cash HTML" page → works the same way (rename is by id, not by kind).
#### Edge Cases
- After the duplicate error the field is still open, so the user can edit and retry, but clicking anywhere (for example on the error text) blurs and closes it.
- Whitespace-only title → trimmed to empty, so no request.
- Case-only change ("Spend" to "SPEND") → the server finds the same page and allows it, since `taken.id === pageId`.
- The 60-character limit applies in the input, so a longer title cannot be pasted past it (pasted text is cut by `maxLength`).

### STORY-004: Delete a page, and what is not offered [PAGES-04]
**Type**: medium
**Walkable**: yes (destructive: use a throwaway page, never a seeded one)
**Topic**: Managing named pages
**Persona**: Marcus, removing a draft page by mistake and then cancelling
**Goal**: Delete the "Board prep" page (from STORY-002) with a confirmation, and see why the last page cannot be deleted.
**Preconditions**: At least the pages Cash, Spend, Cash HTML, and a throwaway page "Board prep" or "New page" exist. Do not delete the seeded pages if the walker needs them afterwards.
**Ideal path**: 4 — open menu, Delete, confirm, check tabs.
**Alternate paths**: None in the UI. The bot has no `page_delete` tool, and the full-width page hides Delete. A direct `pages.remove` RPC call works but is not a user route.
#### Steps
1. Click the "Board prep" tab, then "Page options" → the menu includes the red item "Delete" (it shows because there are 2 or more pages and the panel is not full-width).
2. Click "Delete" → a dialog titled "Delete Board prep?" shows with "Cancel" and a red "Delete" button.
3. Click "Cancel" → the dialog closes and the page remains.
4. Repeat steps 1-2 and click "Delete" → the dialog closes. The tab "Board prep" disappears. The panel opens the first page ("Cash"), not the neighbouring tab.
#### Variations
- Press Escape in the dialog → closes without deleting (standard AlertDialog).
- Open the same page full-width from the sidebar and open "Page options" → the menu has "Rename" and "Share" but no "Delete".
- Delete down to a single page: the menu loses "Delete" and the tab row disappears (tabs show only for 2 or more pages). The page is still there, and only "New page" is available to add more.
#### Edge Cases
- The dialog has no warning that the page content and its revisions are deleted for good, and no undo. The title is the only context.
- A very long title wraps in the dialog (`break-words`).
- Delete a page that is also in the sidebar → the sidebar row should disappear (spec claim, not verified). If the walker is on that page's full-width URL in another tab, `onMissing` sends it to `/app` on the next list load.
- If the delete request fails, the error line appears under the tab row and the dialog has already closed (`setDeleting(false)` is only reached after a successful call, so on failure it stays open; the error then shows behind the dialog). Unverified.
- Server only: deleting the last page through the API succeeds, because only the UI blocks it.

### STORY-005: Reach the 20-page cap [PAGES-05]
**Type**: long
**Walkable**: yes (heavy: creates 17 pages through "New page" or the pages.create RPC; run last)
**Topic**: Managing named pages
**Persona**: Tomas, a power user who creates a page per board meeting
**Goal**: Fill the bot to 20 pages, find out what the cap looks like and recover by deleting.
**Preconditions**: Finance agent has 3 pages. 17 more must be created by clicking "New page" (or seed 17 pages with `pages.create`). Side panel open.
**Ideal path**: 22 — about 17 creates, then a delete and a create. There is no shortcut.
**Alternate paths**: Seed the pages through the `pages.create` RPC, as `apps/web/e2e/bot-page.spec.ts` does for its helper. The bot can also create pages with `page_create` and hits the same cap on the server. Precondition: bot action (not walkable without a model).
#### Steps
1. Click "New page" → "New page" is created and the title field opens. Press Enter to keep the name (the title is unchanged, so no rename request). The count is now 4.
2. Click "New page" again → "New page 2" is created. Press Enter. Count 5.
3. Repeat the click and Enter for 15 more pages → titles continue as "New page 3" up to "New page 17". The tab row now holds 20 tabs. Scroll sideways in the tab row if it overflows.
4. Look at the plus button after the 20th page → "New page" is disabled (greyed out, not clickable). There is no tooltip and no message that says why.
5. Hover or focus the disabled button → nothing explains the limit.
6. Click the "New page 17" tab, open "Page options" → "Delete" and confirm "Delete New page 17?" → the page is deleted and the count is 19.
7. Click "New page" again → a page is created again (title "New page 17" is free again, so `nextTitle` reuses it). The plus button is disabled again.
#### Variations
- Keyboard: Tab to the plus button after the 20th page → the disabled button is skipped in the tab order.
- Phone width (390px): 20 tabs inside a 390px panel. Check whether the tab row scrolls horizontally or clips, and whether the active tab can be reached.
- Race (two browser tabs, 19 pages each): both click "New page" → one succeeds and the other shows a red line `This bot already has 20 pages`. Unverified.
#### Edge Cases
- The cap is per bot, not per space. Another bot still has its own 20.
- The error line from the server is shown only if the plus button was clickable. In a single session the button is already disabled at 20.
- Tab titles are not shortened (`TabsTrigger` shows the full title), so 20 tabs with long names will be hard to scan.

### STORY-006: Edit a page, autosave and the conflict banner [PAGES-06]
**Type**: medium
**Walkable**: yes (edits page content; do it on a throwaway page; the conflict part needs a second browser tab)
**Topic**: Managing named pages
**Persona**: Priya, typing notes on the Cash page while the bot is also changing it
**Goal**: Type in the editor, see it saved, and handle "Page changed. Reload".
**Preconditions**: Side panel open on Cash. For the conflict part: a second change to the same page by something else (a second browser tab saving the same page works without a model).
**Ideal path**: 3 — click into the editor, type, wait one second.
**Alternate paths**: Edit on the full-width page (same editor). HTML pages cannot be edited.
#### Steps
1. Click at the end of the Cash page text and type ` Reviewed` → the text appears. There is no "Saving" or "Saved" indicator.
2. Wait about one second (`SAVE_DELAY_MS` 800 ms) → the change is saved in the background. Reload the browser and reopen "Page" to see the text survive.
3. Open the same Finance agent page in a second browser tab, change a word in the editor, and wait one second → this tab saves revision N+1.
4. Back in the first tab, type one more character without reloading → the autosave sends the old revision, and a secondary button "Page changed. Reload" appears above the editor. Typing stops being saved (`stale` is set).
5. Click "Page changed. Reload" → the editor replaces its content with the latest saved version. The character typed in step 4 is gone. The button disappears and saving resumes.
#### Variations
- If the first tab has nothing typed when the other tab saves, the editor reloads quietly with no banner.
- Unsaved typing while a remote change arrives (for example the bot edits the page) → the banner appears at once, with no automatic merge.
- Server unreachable while typing → a red line `Could not save the page.` shows above the editor. The user does not know that typing continues to retry.
- Phone width: the Reload button sits above the editor in `mb-3` spacing, below the tab row.
#### Edge Cases
- The banner never says that the user's typing will be lost on Reload. There is no way to copy the user's version first except by selecting it manually.
- While the banner shows, further typing is not saved, and nothing in the banner says so.
- Switching tabs with unsaved text triggers a save on unmount (`persist()` in the effect cleanup). A conflict found at that point is silent, because the editor is already gone.
- Live blocks (metrics, tables) are part of the page text. Deleting a block with its hover delete button counts as an edit and autosaves too.
- The page has no undo history beyond the browser editor's own undo.

### STORY-007: The first-page quirk, an empty bot [PAGES-07]
**Type**: short
**Walkable**: yes (steps 1-3 only; step 4 needs a model, DEMO_NO_MODEL gives no reply)
**Topic**: Managing named pages
**Persona**: Elena, a new user who opens a bot that has no page and looks for a way to add one
**Goal**: Find out how to get a first page.
**Preconditions**: A bot with no pages (for example the Inbox agent or Chief in the demo seed, which has no pages). Logged in as the demo owner.
**Ideal path**: not reachable by the owner in the UI — the only route is to ask the bot, which needs a model.
**Alternate paths**: Ask the bot in chat to write a page (`page_write` or `page_create`). Precondition: bot action (not walkable without a model). Open another bot that already has pages. The sidebar "Add page" menu lists only bots and pages that already exist.
#### Steps
1. Open a bot without pages from the sidebar → the chat opens. The header has no "Page" button, because `pageBotId` is set only when the bot has a page.
2. Look at the header and other menus for a way to add a page → there is none. "New page" lives in the side panel, which cannot be opened.
3. Open the sidebar "Add page" row → it lists templates (for example "Team health") and bots with existing pages only. The empty bot is not listed.
4. Ask the bot "Make me a Cash page" in chat → with no model (`DEMO_NO_MODEL=1`) no reply arrives. With a model, the bot calls `page_create`, and the "Page" button then appears in the header.
#### Variations
- With a model: after the bot's first page, "Page" appears without a reload (a `page.updated` event sets `pageBotId`). The tab row is hidden while there is only one page. The first "New page" click then creates a second page and shows the tabs.
- Phone width: same, no "Page" button.
#### Edge Cases
- If the owner deletes pages until one is left, the page stays and the tab row disappears, which looks like the bot has just one page.
- Defect candidate: nothing in the UI tells the owner that pages come from the bot. The panel's own "New page" button exists but can only be reached after a first page exists (see the summary).
- A bot whose only page was removed through the API: `pages.length === 0`. The tab row and options menu are hidden and the panel shows an empty editor (`PageEditor` with `pageId` undefined), but the "Page" button may still be showing until a reload. Unverified.

## Topic: Reading live blocks

### STORY-008: Read the Cash page numbers before a board call [BLOCKS-01]
**Type**: short
**Walkable**: yes
**Topic**: Reading live blocks
**Persona**: Priya, a seed-stage founder checking cash and top vendors five minutes before a board call
**Goal**: See current monthly burn and the biggest vendors without asking the bot anything.
**Preconditions**: Logged in as the demo owner. Page "Cash" is in the sidebar.
**Ideal path**: 2 — click "Cash" in the sidebar, read the blocks.
**Alternate paths**: Open the Finance agent chat at `/app/{botId}` and click the header "Page" button (side panel, first page opens by default; same blocks, narrower, and "Waiting for approval" is not a link there). Another route: the sidebar "Add page" menu is only for adding a row, not for reading.
#### Steps
1. In the left sidebar, click "Cash" → URL becomes `/app/pages/{botId}/{pageId}`, page header shows "Cash" and a "Page options" button. Blocks appear in order: the bot's summary line, "Monthly burn", "Largest vendors", a plain Markdown table (Item / Owner), then the stale, paused and pending metrics.
2. Read the "Monthly burn" card → label "Monthly burn" at the top left of the card, value "$86,000" in large text. No time is visible yet.
3. Read the "Largest vendors" card → title "Largest vendors", columns "Vendor" and "Total", rows Northwind Cloud $18,200, Example Payroll $12,401, Sample Legal $3,100.
4. Look at the plain Markdown table (Item / Owner) → it has no live styling and no fetch time. This is ordinary page text and looks different from the live table card.
#### Variations
- Open the same page through the chat "Page" button instead. The blocks are the same; the page has page tabs only if the bot has two or more pages.
- Phone width (390px): cards stack full width; "Largest vendors" keeps both columns. Check the table does not overflow the card.
#### Edge Cases
- While the page first loads the cards show shimmer text "Refreshing" for blocks with no value and a pulsing table. After load they settle; no "No data yet" flash (the `loaded` flag prevents it).
- The summary text can be edited in place (the editor is live), but the live cards are not editable. Typing near them must not change them.

### STORY-009: Find out how fresh a number is, by mouse and by keyboard [BLOCKS-02]
**Type**: short
**Walkable**: yes
**Topic**: Reading live blocks
**Persona**: Marcus, a finance lead who doubts whether the burn figure is from this morning
**Goal**: See when "Monthly burn" was fetched.
**Preconditions**: On the Cash page (full-width). "Monthly burn" was fetched about 5 minutes ago.
**Ideal path**: 1 — hover the card.
**Alternate paths**: Press Tab until the card has focus (the card is focusable and shows the time on focus). Tap the card on a phone (a tap focuses it, which also reveals the time). There is no tooltip, no "Updated" label and no setting to keep times visible.
#### Steps
1. Move the pointer over "Monthly burn" → a muted time appears at the top right of the card header, for example "3:05 PM" (time of day, because the fetch was today). It fades in.
2. Move the pointer away → the time fades out.
3. Click in the page background, press Tab until focus lands on the "Monthly burn" card (no visible focus ring: the block uses `outline-none`) → the time appears again.
4. Press Tab once more → focus moves to the next focusable thing inside or after the card. For a block with a failed or paused dot, focus goes to the dot button first.
5. Hover "Cash (stale)" (fetched 2 days ago) → the visible time reads like "Oct 30" (month and day only, no time of day).
#### Variations
- Screen reader: the card has no label that carries the time; the time is plain text that exists in the DOM at opacity 0, so it is likely read out. Note what the walker's accessibility snapshot shows.
- Phone width: tap the card to reveal; tap elsewhere to hide.
#### Edge Cases
- Hover near the lower right corner of a block. The "Delete block" button (an X, aria-label "Delete block") also appears on hover. Check it does not cover a value or the last table row.
- A block that has never been fetched ("Never fetched (paused)") has no time at all.
- UX note: the date-only format for older fetches cannot tell "2 days ago" from "yesterday morning" or "this morning but before midnight UTC". The user sees "Oct 30" with no time.

### STORY-010: A stale number with a warning dot, and Retry [BLOCKS-03 + SOURCES-06]
**Type**: medium
**Walkable**: yes (Retry may change the stale source; open the popover first, retry later)
**Topic**: Reading live blocks
**Persona**: Dana, a controller who notices one cash figure looks old
**Goal**: Understand why "Cash (stale)" is old and try to refresh it.
**Preconditions**: Cash page open. Source "stale" is active, failed twice with "Request timed out", last good value $250,000 from 2 days ago.
**Ideal path**: 3 — see the dot, click it, click "Retry".
**Alternate paths**: "Page options" → "Refresh" refreshes every source on the page, including this one. "Page options" → "Sources" shows a row for "stale" with a "failed" badge and the error line, but offers no retry (only schedule, pause and remove).
#### Steps
1. Find the card "Cash (stale)" → value "$250,000". Unlike healthy blocks, its fetch time is visible without hovering (for example "Oct 30") and a small amber dot sits right of the time.
2. Hover the dot → the cursor shows it is clickable. The dot has accessible name "Source failed".
3. Click the dot → a popover opens under it with the error text "Request timed out" and a small secondary button "Retry".
4. Click "Retry" → all blocks on the page dim, text values shimmer and `aria-busy` is true while `pages.refresh` runs. Then the page returns.
5. Observe the result for "Cash (stale)". The demo source is a built-in finance source that may now succeed. If it succeeds, the dot disappears and the time becomes hover-only. If it fails again, the dot and "Request timed out" stay. Record which happened.
6. Press Escape if the popover is still open → it closes.
#### Variations
- Keyboard: Tab to the dot, press Enter to open the popover, Tab to "Retry", press Enter.
- Phone width: the popover opens aligned to the right edge of the dot. Check it stays inside the 390px viewport.
#### Edge Cases
- Hesitation: the user clicks "Retry" twice quickly. The button is not disabled while refreshing (`PageLiveBlocks.tsx:139`), so a second request may start. Note if two requests are sent.
- The popover is not closed by Retry (no close call). After a successful retry the block rerenders without the dot, so the popover disappears with it. After a failed retry it stays open.
- If the refresh call itself throws, the red `role=alert` line appears at the top of the page ("Could not ..." text from the error), not inside the block.
- The failed state with no previous value (source never succeeded) shows the placeholder "No data yet" next to the dot, because `hasValue` is false.
- Same information elsewhere: Sources dialog row for "stale" shows badge "failed" and the same error as a truncated line.
**Merge note**: Merged with SOURCES-06 (Diagnose a stale metric from the failed dot and retry). The richer story was kept; the dropped story follows in full below.

#### Merged duplicate: SOURCES-06 — Diagnose a stale metric from the failed dot and retry
**Type**: medium
**Topic**: Failure and recovery
**Persona**: Priya, who notices "Cash (stale)" looks old before a board call
**Goal**: Find out why the number is stale and try a refresh.
**Preconditions**: Logged in as the seeded owner. Cash page open. The demo seed's call may succeed or fail on Retry; the walker records what happens.
**Ideal path**: 3 — click the warning dot, read the error, click Retry.
**Alternate paths**: Page options → Sources shows the same error text under the row; Page options → "Refresh" refreshes all sources and does the same work but gives no popover feedback.
**Steps**
1. Find the "Cash (stale)" metric → label at the top left, an old value, the fetch time visible at all times (not only on hover) because the block is stale, and a small warning dot at the right.
2. Hover another healthy block, for example "Monthly burn" → its fetch time appears only on hover or focus.
3. Click the warning dot (aria-label "Source failed") → popover with "Request timed out" and a "Retry" button.
4. Click "Retry" → block pulses and shows shimmer on its value while refreshing; the whole page also reloads.
5. Read the result:
   - Success: the dot disappears, the value and the fetch time update.
   - Failure: the dot stays; the popover may have closed and must be reopened to read the error.
6. Open "Page options" → "Sources" → "Cash (stale)" row now shows the latest state (badge "ok" or "failed").
**Variations**
- Keyboard: Tab to the block (it is focusable, with fetch time shown on focus), Tab to the dot, Enter to open, Tab to "Retry", Enter.
- Phone width (390px): the popover is anchored to the end of the header and must not overflow; the dot is 16px wide, a small touch target. Check it.
- Same warning appears on the side panel and full-width page; on mobile it has the label "Source failed" but is not wired the same way.
**Edge Cases**
- Retry refreshes every active source on the page, not only this one. Other blocks shimmer too.
- Retry on a source whose last success was under 60 seconds ago does nothing and the popover gives no hint.
- Each failed Retry adds to the failure count; see STORY-022.
- Retry button remains visible even while a refresh is in progress; clicking twice sends two refreshes.

### STORY-011: Understand blocks that cannot show a number (paused, pending, never fetched) [BLOCKS-04 + SOURCES-08]
**Type**: medium
**Walkable**: needs seeded approval card (seeded) (steps 1-5 are plain yes; step 6 only follows the link and must not answer the card)
**Topic**: Reading live blocks
**Persona**: Tomas, an operations manager who sees blocks without numbers and wants to know what to do
**Goal**: Tell apart "Paused", "Waiting for approval" and the paused block that still shows an old figure.
**Preconditions**: Cash page open at `/app/pages/{botId}/{pageId}`. Needs seeded approval card for the click-through in step 6 (the card text is "Read api.example.test every hour?"). Without it, stop after step 5.
**Ideal path**: 4 — scroll to the three blocks and read them.
**Alternate paths**: "Page options" → "Sources" lists all of them with badges "paused" and "pending". The same page opened in the chat side panel shows the same text but the pending text is not a link.
#### Steps
1. Scroll to "Payroll (paused)" → value "$42,000", an always-visible date such as "Oct 29", and an amber dot named "Source paused".
2. Click the dot → popover with "Paused after 5 failed refreshes" and no "Retry" button (a paused source cannot be retried from here).
3. Scroll to "Never fetched (paused)" → no value. The placeholder text reads "Paused". There is a dot "Source paused" with the same error text, and no time.
4. Scroll to "Outside rate (pending)" → the placeholder reads "Waiting for approval" and it is underlined, because this is the full-width page where it is a button. No dot, no time.
5. Press Tab to the placeholder → it has a visible focus outline (the only block text with one). 
6. Click "Waiting for approval" → the app goes to the Finance agent chat at `/app/{botId}`. The newest message is an approval card "Read api.example.test every hour?" with detail lines "Request: GET https://api.example.test/rate" and "Page: Cash" and buttons "Allow" and "Not now". Nothing marks which page the user came from, and there is no way back except the browser Back button or the sidebar.
#### Variations
- Side panel: open the Finance agent chat, click "Page", scroll to "Outside rate (pending)". The text "Waiting for approval" is plain, not a link, because `onReview` is passed only for the full-width page (`bot-page-panel.tsx:786`). The user is already in the chat, so the card is just above.
- Phone width: the full-width page is the only route; check the underlined text is large enough to tap.
#### Edge Cases
- A source that was denied shows "Not approved" (no link). A removed or misnamed source shows "Source not found". Neither is seeded; the walker may only note the strings.
- A paused block with a stale value and a paused block without a value look alike in the dot but differ in text. Nothing on the block tells the user how to resume; resuming is under "Page options" → "Sources" → row menu → "Resume".
- Same information on mobile Expo and iOS: pending is not clickable there.
**Merge note**: Merged with SOURCES-08 (Stale data on a block that has never worked). The richer story was kept; the dropped story follows in full below.

#### Merged duplicate: SOURCES-08 — Stale data on a block that has never worked
**Type**: short
**Topic**: Failure and recovery
**Persona**: Sam, a new teammate who opens the Cash page and sees blanks
**Goal**: Understand why "Never fetched (paused)" and "Outside rate (pending)" show no number.
**Preconditions**: Logged in as the seeded owner. Cash page open.
**Ideal path**: 2 — read the placeholders, then open Sources to see the badges.
**Alternate paths**: Click the "Waiting for approval" link (full-width page only) to reach the chat where the approval card would be. A seeded approval card is not guaranteed; mark any step that needs one "needs seeded approval card".
**Steps**
1. Scroll to the block bound to "Never fetched (paused)" → text "Paused" and a dot labelled "Source paused" (no value, no time).
2. Scroll to the block bound to "Outside rate (pending)" → text "Waiting for approval", shown as an underlined button on the full-width page.
3. Open the same Cash page in the chat side panel (Finance agent, header "Page") → the same block says "Waiting for approval" as plain text, not a link.
4. On the full-width page click "Waiting for approval" → navigates to `/app/:botId` (the chat). Needs seeded approval card to see the card; otherwise the chat just opens.
5. Back on the page, open "Sources" → "Outside rate (pending)" row has a "pending" badge and the row menu has "Change schedule" and "Remove" only.
**Variations**
- Phone width: link wraps; chat navigation works the same.
- The mobile app shows the same text but the pending text is not tappable.
**Edge Cases**
- While the page is first loading, these blocks show the shimmer "Refreshing" before settling on the placeholder.
- A denied source reads "Not approved" with a "denied" badge and has no Resume; the only recovery is for the bot to change the call.
- Placeholder wording ("Paused") does not say why or how to resume; the answer is in the Sources dialog.

### STORY-012: Hide amounts and see which figures are masked [BLOCKS-05]
**Type**: medium
**Walkable**: yes (toggles the Hide amounts preference; turn it off afterwards)
**Topic**: Reading live blocks
**Persona**: Priya, sharing her screen on a video call and needing money figures hidden
**Goal**: Turn on Hide amounts and confirm cash figures on the page are masked, then turn it off.
**Preconditions**: Cash page open, Hide amounts off.
**Ideal path**: 3 — open account menu, click "Hide amounts", look.
**Alternate paths**: none found on the page itself. The page has no "Amounts hidden · Show" button (`ShowAmountsButton` is used only on finance pages), so turning it back on also goes through the account menu.
#### Steps
1. Open the account menu (the user avatar or name at the bottom of the sidebar) → a row "Hide amounts" with an eye icon.
2. Click "Hide amounts" → the row gets a check and an off-eye icon; the menu closes. The Cash page updates at once with no reload.
3. Read "Monthly burn" → value now "$•••".
4. Read "Largest vendors" → in the "Total" column (format usd) every cell is "$•••". The "Vendor" column names stay readable.
5. Read "Cash (stale)" and "Payroll (paused)" → both values read "$•••". "Outside rate (pending)" still shows "Waiting for approval" (it has no value).
6. Read the plain Markdown table and the summary line → text typed by the bot is not masked unless the shared currency rule matches amounts in it (it only runs over the live blocks here, so assume it stays visible).
7. Open the account menu and click "Hide amounts" again → check disappears, real numbers return.
#### Variations
- Spend page: "Spend this month" shows "$•••". If the history chart "Spend over time" exists, it is not drawn; a grey line reads "Chart hidden while amounts are hidden" (see STORY-014).
- Phone width: same, the menu is reached through the sidebar drawer.
- Preference is stored on the user, so reloading the page keeps the mask with no flash.
#### Edge Cases
- Masking depends on `format: usd`. A metric with format "number" or "percent", or a table column without `format`, is never masked even if it holds money. A table with no `columns` list uses the first row's keys with no format, so none of its cells are masked (`PageLiveBlocks.tsx:217`, `tableColumns` in `packages/core/src/pages.ts`). The seeded blocks all set format usd, so this cannot be reached on the demo without a bot edit. Record as a code finding.
- The mask text gives no hint why a number is hidden. The user must remember the setting.
- The same switch affects the chat transcript and finance pages.

### STORY-013: Refresh the whole page by hand [BLOCKS-06]
**Type**: short
**Walkable**: yes (refreshes active sources; may change the stale source)
**Topic**: Reading live blocks
**Persona**: Marcus, who just fixed a number in the books and wants the page to catch up
**Goal**: Pull fresh data for every source on the page now.
**Preconditions**: Cash page open (has sources). Also try Spend page.
**Ideal path**: 2 — "Page options" → "Refresh".
**Alternate paths**: "Retry" in a failed block's popover (same call). Waiting for the schedule (default hourly; set per source in "Sources"). The spec says refresh is limited to once a minute per page; the handler at `apps/api/src/router.ts:4499-4520` shows no such limit, so the code wins: none is applied.
#### Steps
1. Click "Page options" (the three-dot button in the page header) → menu items "Refresh", "Sources", "Share", "Rename" in that order (no "Delete" on the full-width page).
2. Click "Refresh" → the menu closes; text values shimmer, blocks with a table or chart pulse, and each block has `aria-busy`. There is no toast, spinner or "Refreshing" label unless a block has no value.
3. Wait for the refresh to end → blocks settle. Hover "Monthly burn" → the fetch time is now the current time of day (it moved forward from the earlier 5-minute-old time).
4. Click "Page options" again and click "Refresh" immediately again → a second refresh starts. Nothing stops the user.
#### Variations
- Keyboard: focus "Page options", Enter, arrow to "Refresh", Enter.
- HTML page "Cash HTML": "Page options" has "Refresh" too (it is passed `refreshTick`). The HTML view gets new data by postMessage with no visible change unless the value changed.
- A page with no sources (not seeded): "Page options" shows no "Refresh" or "Sources" at all.
#### Edge Cases
- Paused sources are skipped by refresh, so "Payroll (paused)" keeps its old time and value. Verify on screen.
- The pending source "Outside rate (pending)" cannot be refreshed until approved.
- If the call fails, a red line appears above the blocks and the blocks keep their last data (`bot-page-panel.tsx:327-337`).
- The refresh runs again for the whole page, not one block, even when launched from one failed block's "Retry".

### STORY-014: Read a history chart and a source-backed chart [BLOCKS-07]
**Type**: medium
**Walkable**: yes (needs the seeded "Spend over time" history chart on Spend; do before STORY-021 removes the Spend source)
**Topic**: Reading live blocks
**Persona**: Dana, who wants to see whether spend is trending up before approving a budget
**Goal**: Read the "Spend over time" line chart that plots one point per refresh.
**Preconditions**: Spend page exists. Needs the extra seed (8 weekly snapshots for source "spend" plus the chart fence with `over: history`). If the chart is absent, mark "not seeded" and stop.
**Ideal path**: 2 — open "Spend" in the sidebar and read the chart.
**Alternate paths**: Chat side panel for the Finance agent → "Page" → tab "Spend" (tabs appear because the bot has more than one page). A bot action ("Precondition: bot action (not walkable without a model)") creates a new chart; the user cannot add one.
#### Steps
1. In the sidebar, click "Spend" → page shows the "Spend this month" metric ($31,000) and below it a bordered chart block "Spend over time" (a line chart).
2. Look at the chart → a line over 8 weekly points, drawn from stored snapshots, plus the latest point. The x values are dates and y values are dollar amounts.
3. Hover the chart block → the fetch time appears at the top right corner of the block (no label row, so the status sits over the content corner), and a "Delete block" X appears at the lower right.
4. Click "Page options" → "Refresh" → the chart pulses while loading, then redraws. A history chart gains one more point per successful refresh.
5. Turn on Hide amounts (account menu) → the whole chart is replaced by a small grey line "Chart hidden while amounts are hidden".
6. Turn Hide amounts off → the chart returns.
#### Variations
- A chart with `over: latest` reads an array from the source; the Cash page has none seeded.
- A static chart (no source) is a separate case: it shows a "Delete chart" button instead and has no fetch time or dot.
- Phone width (390px): the chart width follows the card (measured with a resize observer). Check axes labels stay readable and not clipped.
#### Edge Cases
- Chart hiding applies to every chart, including charts that show no money, because chart data reaches the renderer raw (`message-cards.tsx:293`). The user gets no per-chart control.
- A source-backed chart whose source is pending, denied or missing shows the status text instead ("Waiting for approval", "Not approved", "Source not found"). A paused or failed chart with no rows has no placeholder; the frame treats it as having a value and draws the snapshot stored in the fence (`PageLiveBlocks.tsx:231`), which is the chart's fallback data and can be old. The user is not told the data is a fallback. Note any seeded example.
- Chart rows come from `usePageChartRows`: live rows if present, otherwise the fence's own `data` (the seed's single row at "2026-10-01"). If the live snapshots fail to load, the chart can show that one-row stub.

### STORY-015: Delete a live block, and the phone problem [BLOCKS-08]
**Type**: medium
**Walkable**: yes (destructive: deletes a block with no confirmation; use a throwaway page)
**Topic**: Reading live blocks
**Persona**: Tomas, who wants to remove "Never fetched (paused)" because it clutters the page
**Goal**: Remove a block from the page.
**Preconditions**: Cash page open (full-width). Do this on a throwaway copy if the walker wants to keep the seed; otherwise the page stays changed.
**Ideal path**: 2 — hover the block, click the X.
**Alternate paths**: Chat side panel "Page" gives the same X. Ask the bot to remove it (needs a model, not walkable). There is no menu item on the block, no Delete key action (the block is selectable but this was not verified), and no multi-select.
#### Steps
1. Move the pointer over "Never fetched (paused)" → an X button appears at the lower right of the block, named "Delete block".
2. Click "Delete block" → the block disappears from the page immediately. There is no confirmation dialog and no toast.
3. Wait about a second (autosave is 800 ms) → the page is saved. No "Saved" text appears. Reload the page → the block stays gone.
4. Click into the text of the page and press Cmd+Z (Ctrl+Z on Windows) → the editor may restore the block (Tiptap history). Record what happens; there is no Undo control on screen.
5. Check "Page options" → "Sources". The source "pausedempty" still exists with no block using it. Deleting a block does not remove its source.
#### Variations
- Keyboard: Tab to the block; Tab again to reach the X (it becomes visible on focus; `focus-visible:opacity-100`); press Enter to delete.
- Phone width (390px): there is no hover, so the X is invisible (`opacity-0`) until it has keyboard focus. A touch user may not find it at all (`bot-page-panel.tsx:58-66`). Report this as a defect if it is true on the device.
- A static chart's button is named "Delete chart" and sits at top right; live blocks use "Delete block" at bottom right. Different place and name for the same job.
#### Edge Cases
- Mistake: clicking the X while aiming at a number or a table row near the bottom right. There is no confirmation, so one stray click removes the block.
- Conflicting edit: if the bot changes the page at the same time, the page offers "Page changed. Reload" and the delete may be lost.
- Deleting every live block leaves a page with no sources in use but sources still listed, so the "Refresh" item remains.
- The editor must be editable; in a read-only view (public share) no X is rendered.

### STORY-016: Monday board-prep check of the whole Cash page [BLOCKS-09]
**Type**: long
**Walkable**: needs seeded approval card (seeded) (long; step 21 only views the card and must not answer it; step 8 refreshes sources)
**Topic**: Reading live blocks
**Persona**: Priya, a seed-stage founder preparing a Monday board update, who reads every block, refreshes, masks amounts for a screen share, and records what is trustworthy
**Goal**: Decide which Cash page numbers can go into the board deck and which cannot.
**Preconditions**: Logged in as the demo owner; Finance agent has pages "Cash", "Spend", "Cash HTML". Needs seeded approval card for step 21.
**Ideal path**: 12 — sidebar to page, refresh, read each block once, check the dots.
**Alternate paths**: Do the same in the Finance agent chat side panel: click "Page", then use the "Pages" tabs. The sidebar entry is faster because it opens the page at full width with no chat next to it.
#### Steps
1. Click "Cash" in the sidebar → full-width page, header "Cash", options button "Page options".
2. Read "Monthly burn" → "$86,000".
3. Hover "Monthly burn" → a time of day such as "3:05 PM" appears at the top right. Move away; it hides.
4. Read "Largest vendors" → three vendors with totals $18,200, $12,401, $3,100.
5. Hover the table card → its fetch time appears in the card header at the right.
6. Scroll to "Cash (stale)" → "$250,000" with a visible date (for example "Oct 30") and an amber dot.
7. Click the dot → popover "Request timed out" with "Retry". Do not click Retry yet. Press Escape.
8. Open "Page options" → "Refresh" → blocks dim and shimmer, then settle.
9. Re-check "Cash (stale)". Record whether the dot disappeared (the refresh fixed it) or stayed.
10. If the dot stayed, click the dot and click "Retry". Record the outcome.
11. Scroll to "Payroll (paused)" → "$42,000", old date, dot "Source paused". Click the dot → "Paused after 5 failed refreshes", no Retry. Press Escape.
12. Scroll to "Never fetched (paused)" → "Paused" text and no number.
13. Scroll to "Outside rate (pending)" → underlined "Waiting for approval".
14. Open the account menu → click "Hide amounts". Return to the page.
15. Check every dollar value is "$•••": burn, vendor totals, stale cash, payroll. The vendor names remain.
16. Open "Page options" → "Sources" → the dialog titled "Sources" lists the sources with badges (ok, failed, paused, pending). Rows show names and errors; the money values in them (if any) are a different surface. Close the dialog.
17. Click "Spend" in the sidebar → "Spend this month" shows "$•••". If the chart exists, it reads "Chart hidden while amounts are hidden".
18. Open the account menu and click "Hide amounts" to turn it off. The Spend page shows "$31,000" and the chart (if seeded).
19. Click "Cash" in the sidebar again → numbers visible. The sidebar keeps the pages in the same order.
20. Hover "Monthly burn" again → the time of day moved forward since step 3 (because step 8 refreshed it).
21. Click "Waiting for approval" → lands on the Finance agent chat at `/app/{botId}` with the approval card "Read api.example.test every hour?". Do not click "Allow" or "Not now" in this story (that belongs to the approval topic).
22. Use the browser Back button → returns to the Cash page at the same scroll position, or at the top. Record which.
#### Variations
- Phone width (390px): steps 1–15 read in a single column. Hover steps become taps. The dots are 16px targets; check they are reachable. Delete X is not reachable by touch (see STORY-015).
- Side panel version: in step 13 the text is not a link.
- Keyboard-only run: Tab through the whole page. Record the order of focus stops (blocks, dots, placeholder button, X buttons) and whether any block has a visible focus ring (the block itself has none).
#### Edge Cases
- Hesitation at step 7: the user closes the popover without Retry because "Request timed out" says nothing about what to do. The popover has no help text and no link to "Sources".
- Mistake at step 14: the user looks for Hide amounts on the page itself. There is no control on the page; it is only in the account menu.
- Do not report a cash figure as current when the date beside it is older than today and the amber dot is present. Note this is the only on-block signal; the number itself looks the same as a fresh one.
- Page change from the bot while reading: the page shows "Page changed. Reload" (a different topic).

## Topic: Managing sources, failure and recovery

### STORY-017: Priya opens the Sources dialog and reads every row [SOURCES-01]
**Type**: short
**Walkable**: yes
**Topic**: Managing sources
**Persona**: Priya, a seed-stage founder checking which numbers on the Cash page are trustworthy before a board call
**Goal**: See every source on the Cash page with its state and last error.
**Preconditions**: Logged in as the seeded owner. Cash page is in the sidebar.
**Ideal path**: 3 — open the page, open "Page options", choose "Sources".
**Alternate paths**: Open the Finance agent chat at `/app/:botId`, click the header "Page" button, then use the same "Page options" menu in the side panel. The dialog is identical in both places. No other route; the mobile app has no Sources dialog.
#### Steps
1. Click the Cash page in the sidebar → full-width page at `/app/pages/:botId/:pageId` with the blocks "Monthly burn", "Largest vendors" and others.
2. Click the "Page options" (three dots) button in the header → menu with "Refresh", "Sources", "Share", "Rename". There is no "Delete" on the full-width page.
3. Click "Sources" → dialog titled "Sources". Briefly shows 3 skeleton rows, then one row per source.
4. Read the "Cash (stale)" row → name, a subline ending in the schedule (for example "Hourly"), a "failed" red badge, and a line "Request timed out" under it.
5. Read "Payroll (paused)" and "Never fetched (paused)" → "paused" outline badge. "Never fetched (paused)" has no time at the right.
6. Read "Outside rate (pending)" → "pending" outline badge, no time.
7. Hover the error line on "Cash (stale)" → tooltip with the full error text.
#### Variations
- Phone width (390px): the dialog fills the width; name and subline truncate, and the time, badge and menu button stay on one row. Check that the badge and "…" button are not pushed off screen.
- Keyboard: Tab reaches each "{name} options" button; Escape closes the dialog.
#### Edge Cases
- On the Spend page the dialog lists one row, "Spend this month".
- The dialog has no "Add source" button and no way to edit a source's call. Only the bot can do that. A user looking for it finds nothing.
- Same state also shows on the page itself: warning dots on blocks (side panel and full-width), and sidebar rows show nothing.

### STORY-018: Slow down a source by changing its schedule [SOURCES-02]
**Type**: short
**Walkable**: yes (changes a schedule)
**Topic**: Managing sources
**Persona**: Marcus, an ops lead who thinks the Monthly burn source refreshes too often
**Goal**: Change "Monthly burn" from its current schedule to Daily.
**Preconditions**: Logged in as the seeded owner. Cash page open.
**Ideal path**: 5 — open Sources, open the row menu, open the submenu, pick Daily.
**Alternate paths**: none found. The schedule can only be changed from this dialog (the bot can change it with `page_source_set`).
#### Steps
1. Open "Page options" → "Sources" → dialog shows rows.
2. Click "Monthly burn options" → menu with "Change schedule", "Pause", "Remove".
3. Hover or click "Change schedule" → submenu with radio items "Every 15 min", "Hourly", "Every 6 hours", "Daily", "Weekly"; the current one is selected.
4. Click "Daily" → menu closes, the row subline now ends in "Daily". No toast.
5. Close the dialog with Escape → the page is unchanged visually.
#### Variations
- Keyboard: open the row menu with Enter, ArrowRight on "Change schedule", ArrowDown to "Daily", Enter.
- Phone width: the submenu opens beside the menu and may be tight; check it is fully visible.
- Reopen the dialog → "Daily" persists.
#### Edge Cases
- Changing the schedule on a paused source keeps it paused (the next run time is only reset for active sources).
- Picking the already selected schedule re-sends it and the next run time is moved out.
- If the request fails, a red line (role "alert") appears at the top of the dialog.

### STORY-019: Pause a source and see the block say "Paused" [SOURCES-03]
**Type**: medium
**Walkable**: yes (pauses an active source)
**Topic**: Managing sources
**Persona**: Dana, a finance manager who wants Largest vendors frozen while the books are being cleaned up
**Goal**: Pause "Largest vendors", see its effect on the page, then resume it.
**Preconditions**: Logged in as the seeded owner. Cash page open (full-width).
**Ideal path**: 5 for pause — Page options, Sources, row menu, Pause (the last step), then close.
**Alternate paths**: none found. There is no pause control on the block itself.
#### Steps
1. Note the "Largest vendors" table shows rows → table with vendor names.
2. Open "Page options" → "Sources" → dialog.
3. Click "Largest vendors options" → menu has "Change schedule", "Pause", "Remove" (no "Resume").
4. Click "Pause" → badge changes from "ok" to "paused"; the page behind reloads its data.
5. Close the dialog → the table still shows its last rows (not replaced by a placeholder) and a warning dot with aria-label "Source paused" is in the block header. The fetch time stays visible.
6. Click the dot → popover. If the source had an earlier error it shows that error; otherwise the popover is empty text. There is no Retry button.
7. Reopen "Sources" → "Largest vendors options" now shows "Resume" instead of "Pause".
8. Click "Resume" → badge returns to "ok" (or "failed" if an old error is still stored; see Edge Cases).
9. Close the dialog → the dot is gone once the page data reloads.
#### Variations
- Pause a source with no data yet: use "Never fetched (paused)". The block shows the text "Paused" instead of a value.
- Phone width: the popover for the dot opens aligned to the end of the header; confirm it stays on screen.
#### Edge Cases
- Pausing a source that is pending or denied: the menu has neither "Pause" nor "Resume".
- Resume does not clear the stored last error. Right after Resume a source that had failed may show "failed" until the scheduler runs it (the next run is set to now). The user sees "failed" on a source they just resumed. Possible UX defect.
- Opening the popover on a paused source with no error shows an empty popover. Possible UX defect.

### STORY-020: Resume a source that was paused after failures [SOURCES-04]
**Type**: short
**Walkable**: yes (resumes a paused source; the seed has two paused sources, so only two walks can resume)
**Topic**: Failure and recovery
**Persona**: Priya, who sees "Payroll (paused)" and wants it running again
**Goal**: Resume "Payroll (paused)" and get fresh data.
**Preconditions**: Logged in as the seeded owner. Cash page open. Whether the refresh succeeds depends on the seed; mark the outcome as what the walker observes.
**Ideal path**: 4 — Page options, Sources, row menu, Resume.
**Alternate paths**: none found. The block's paused dot has no Resume.
#### Steps
1. Open "Page options" → "Sources" → "Payroll (paused)" row has a "paused" badge.
2. Click "Payroll (paused) options" → menu has "Change schedule", "Resume", "Remove".
3. Click "Resume" → badge changes to "ok" (or "failed" if an old error line is shown under the name).
4. Close the dialog → block "Payroll (paused)" no longer says "Paused". It shows data, "No data yet" or the shimmer "Refreshing" while the scheduler runs.
5. Reopen "Sources" a minute later → the row shows a recent time and, if the refresh succeeded, no error line.
#### Variations
- Keyboard only: all steps work with Tab, Enter and arrow keys.
#### Edge Cases
- The scheduler tick runs on its own timer, so the change is not instant. On a demo stack without a running worker the data may not change; in that case use the page's "Refresh" item, which only refreshes active sources more than 60 seconds old.
- Failure count is reset to 0 on Resume, so the next failure starts counting from 1 again.

### STORY-021: Remove a source after a second thought [SOURCES-05]
**Type**: medium
**Walkable**: yes (destructive: removes the only source on Spend, which breaks the Spend blocks and the history chart)
**Topic**: Managing sources
**Persona**: Marcus, who hesitates before deleting the Spend source and cancels once
**Goal**: Cancel one removal, then remove "Spend this month" and see the block react.
**Preconditions**: Logged in as the seeded owner. Spend page open.
**Ideal path**: 5 — Page options, Sources, row menu, Remove, confirm.
**Alternate paths**: none found. The bot can also remove it with `page_source_remove`.
#### Steps
1. Open the Spend page → block "Spend this month" shows a value.
2. Open "Page options" → "Sources" → one row, "Spend this month".
3. Click "Spend this month options" → "Remove" is red.
4. Click "Remove" → confirm dialog titled "Remove Spend this month?" with "Cancel" and "Remove". Nothing about the effect on blocks is stated.
5. Click "Cancel" → confirm closes; the row is still there.
6. Open the row menu and "Remove" again, then click "Remove" → the row disappears and the dialog shows "No sources".
7. Close the dialog → the "Spend this month" block now shows "Source not found". The page text is otherwise unchanged.
8. Click "Page options" → "Refresh" and "Sources" are gone, because the page has no sources.
#### Variations
- Enter on the confirm dialog's focused button; Escape cancels.
- Phone width: the title wraps because of a break-words class; a very long source name stays inside the dialog.
- The same block in the bot's side panel (chat "Page" button) shows "Source not found" too.
#### Edge Cases
- There is no undo. To get the source back the user must ask the bot to add it again; no model runs in the demo.
- The block with the removed source is left in the page content; the user must delete it with the hover "Delete block" button.
- Failure to remove shows a red alert at the top of the dialog and the row stays.
- Removal order: an HTML page "Cash HTML" that lists the removed source in its praci-sources meta tag will show that source as missing in the frame (no visible error text).

### STORY-022: Repeated failures pause a source and the bot is told [SOURCES-07]
**Type**: long
**Walkable**: yes (steps 1-4 and 11-15 by hand; steps 5-10 and 12 need a running scheduler worker, or the manual Retry route, which never posts the bot message)
**Topic**: Failure and recovery
**Persona**: Dana, a finance manager whose bank feed went down overnight
**Goal**: Follow a source from first failure to auto-pause to resume, and see where the bot and the owner are told.
**Preconditions**: Logged in as the seeded owner. Failing source: "Cash (stale)" already has 2 failures in the seed. Steps that need the scheduler to run on its own (steps 8-10) need a running worker and 3 more failed runs; otherwise they are not walkable by hand. Step 12 about the bot thread message needs the worker tick path. Note for the walker: the bot cannot reply (DEMO_NO_MODEL=1), but the message itself is posted.
**Ideal path**: not applicable as a user goal; the shortest recovery from the paused state is 4 — Page options, Sources, row menu, Resume.
**Alternate paths**: A user can skip waiting by pressing Retry three times (see Edge Cases); that pauses the source through a different code path.
#### Steps
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
#### Variations
- Phone width: steps 1-2, 9-11 and 13 at 390px.
- Side panel: do steps 9-11 from the chat "Page" panel; same dot and dialog.
- Fix first: if the bot fixes the call (needs a model) the source goes back to active without the owner pressing Resume only if the call changes; the story assumes the owner resumes.
#### Edge Cases
- The owner gets no notification of the auto-pause on the page. If the owner is not looking at the Cash page and the chat, nothing says the number is frozen except the small dot. Possible UX defect.
- Manual path: pressing Retry on the failed dot three times (each after the 60-second debounce) reaches 5 failures and pauses the source, but the bot thread message is posted only by the scheduler tick, not by manual refresh, so in this case the bot is never told (page-source-tick.ts:79 versus the `pages.refresh` handler in apps/api/src/router.ts:4499). Possible defect.
- Resume then immediate failure: the failure count starts from 0, so five more failures are needed.
- Resume while the badge still says "failed" from the old error looks like the resume did nothing.
- The daily cap of 2,000 refreshes per space defers a due source to the next UTC midnight without any message.

### STORY-023: Ask the bot to fix a stopped source [SOURCES-09]
**Type**: medium
**Walkable**: no — bot action (steps 1-3 and 6 are walkable; the bot fix itself needs a model)
**Topic**: Failure and recovery
**Persona**: Priya, who decides to let the Finance agent repair "Cash (stale)" instead of resuming it
**Goal**: Hand a broken source to the bot and confirm the result on the page.
**Preconditions**: Precondition: bot action (not walkable without a model). The walker may still do steps 1-3 and 6.
**Ideal path**: 3 — send one chat message, then check the page.
**Alternate paths**: Resume from the Sources dialog (STORY-020) without involving the bot; works only if the cause was temporary.
#### Steps
1. Open the Finance agent chat at `/app/:botId` → thread with the header "Page" button.
2. Type "The Cash (stale) source stopped working, please fix it" and send → message appears in the thread. Without a model there is no reply.
3. With a model: the bot lists sources (`page_source_list`), then sets the source again (`page_source_set`). An mcp or http source whose call changed becomes pending and an approval card appears ("Read {server} every hour?" with "Allow" and "Not now").
4. Click "Allow" → card label becomes "Allowed". The source returns to active and the failure count is reset.
5. Open the "Page" panel → the "Cash (stale)" block refreshes and the dot is gone.
6. Open "Page options" → "Sources" → the row shows "ok".
#### Variations
- Changing only the name or schedule does not need a new approval; the row simply returns to active if it was paused.
#### Edge Cases
- If the user declines with "Not now" → badge "denied", block text "Not approved".
- If the bot was not told (manual-retry pause, STORY-022), the user must ask in chat themselves, as here.

### STORY-024: Same sources on the HTML page and on a phone [SOURCES-10 + HTML-04]
**Type**: short
**Walkable**: yes
**Topic**: Managing sources
**Persona**: Sam, who looks at "Cash HTML" and wants to find its sources
**Goal**: Find where "Cash HTML" gets its data and confirm what a failure looks like there.
**Preconditions**: Logged in as the seeded owner. "Cash HTML" is in the sidebar; its meta tag names the `cash` source.
**Ideal path**: 3 — open the page, Page options, Sources.
**Alternate paths**: none found.
#### Steps
1. Click "Cash HTML" in the sidebar → page opens in a bordered sandboxed frame.
2. Click "Page options" → "Sources" is offered if the page has a source row.
3. Click "Sources" → dialog lists the source rows for this page only; the "Cash" blocks page's sources are not mixed in.
4. If a row shows "failed" or "paused", close the dialog and look at the frame → it keeps its last values. No dot, no popover, no Retry.
#### Variations
- Phone width (390px): the frame keeps its height; the dialog is the same as in STORY-017.
- Native phone app: the page is read only and has no Sources dialog; the dot's accessible label is "Source failed" or "Source paused".
#### Edge Cases
- An HTML page has no failed-dot UI at all, so the Sources dialog is the only place a user learns a source is broken. Possible UX gap.
- Removing a source here leaves the frame showing its last values or nothing, with no "Source not found" text.
**Merge note**: Merged with HTML-04 (Check where an HTML page's numbers come from (Sources)). The richer story was kept; the dropped story follows in full below.

#### Merged duplicate: HTML-04 — Check where an HTML page's numbers come from (Sources)
**Type**: short
**Topic**: HTML pages
**Persona**: Dana, a finance manager who needs to know which feed a page uses
**Goal**: Find the page's source, its last refresh and its status, then pause it.
**Preconditions**: As STORY-035.
**Ideal path**: 3 — open "Page options", click "Sources", read the row.
**Alternate paths**: The page itself may print source names; there is no other place that lists them.
**Steps**
1. On "Cash HTML", click "Page options" → "Sources" is listed.
2. Click "Sources" → A dialog titled "Sources" opens. A row for the source named `cash` shows `serverName · tool · schedule`, a last-refresh time like "Nov 1, 3:05 PM" and a badge ("ok" or another status).
3. Click the row's menu (`cash options`) → "Change schedule" (submenu), "Pause" and "Remove" are shown ("Resume" instead of "Pause" if paused).
4. Click "Pause" → The badge changes to "paused". Close the dialog. The page's data is refetched.
5. Look at the HTML page → The page receives `status: "paused"` for `cash`. What the user sees depends on the page markup; the frame itself shows no paused indicator. Record what the seeded page shows.
6. Reopen "Sources", click "Resume" → The badge returns to "ok" or "pending" after the next refresh.
**Variations**
- Phone width: the dialog fits in 390px and the row's menu stays reachable.
**Edge Cases**
- Remove the `cash` source and confirm "Remove cash?" with "Remove": the "Refresh" and "Sources" menu items disappear only after the page reloads its sources; the frame keeps showing the page, now with a missing source in its data. Record what the user sees. Note this destroys seed data, so run it last.
- A page that does not declare any source (no `praci-sources` meta) has no "Refresh" or "Sources" item at all, so the user cannot tell why a static page never changes.

## Topic: Approving outside sources

### STORY-025: Allow a pending API source from the chat card [APPROVE-01]
**Type**: medium
**Walkable**: needs seeded approval card (seeded) (CONSUMES the single card: Allow)
**Topic**: Approving outside sources
**Persona**: Priya, a seed-stage founder who asked the Finance agent last week to show an exchange rate on her Cash page
**Goal**: Let the page read the API and see the number appear on the page.
**Preconditions**: needs seeded approval card (card for the "Outside rate (pending)" http source, thread of the Finance agent). Card text expected: "Read {host} every hour?" with the detail lines `Request: GET {url}` and `Page: Cash`.
**Ideal path**: 5 — open the bot chat, read the card, click Allow, open the page, see the value.
**Alternate paths**: Click the notification toast "Finance agent needs approval" (it links to `/app/{botId}`) instead of opening the bot from the sidebar. No other place can answer the card: the Sources dialog has Pause/Resume/Remove/Change schedule but no Allow.
#### Steps
1. Open `/app/{botId}` for the Finance agent → the chat opens. The card sits in the thread as a bot message with the question "Read {host} every hour?".
2. Read the detail text under the question → three lines: `Request: GET https://…`, optionally `Key: {secret name}`, `Page: Cash`.
3. Click "Allow" → the button reads "Sending…", then the card is replaced by a check icon and "Allowed". Both buttons are gone.
4. Click the "Page" button in the chat header → the side panel opens on the Cash tab.
5. Find the block that uses "Outside rate" → the "Waiting for approval" text is gone. A value shows, or "No data yet" for a moment, then the value after the one-time refresh. Hover or focus shows the fetch time.

#### Variations
- Same flow from `/app/pages/{botId}/{pageId}` after clicking the "Waiting for approval" link (see STORY-029).
- Open the page options menu, "Sources": the row for "Outside rate" now shows badge "ok" (or "failed" with the error line if the API call fails; Allow itself still succeeds and the failure is recorded on the source).
- Keyboard: Tab to "Allow" and press Enter; Tab order is Allow, then Not now.
- Phone width 390px: the buttons are full width, left aligned, and wrap long text (`whitespace-normal`). The `Request:` line is shown in full on purpose (up to 500 characters), so a long URL wraps over several lines; check that it does not push the buttons off screen.

#### Edge Cases
- The API call fails after Allow (timeout, 401): the card still says "Allowed". The only sign of failure is on the page (warning dot "Source failed" with Retry) and in the Sources dialog. The owner has no hint in the thread.
- Double-click on "Allow": the second click is blocked by the disabled "Sending…" button; a second request would be rejected with CONFLICT.

### STORY-026: Decline with "Not now" and see what the page shows [APPROVE-02]
**Type**: short
**Walkable**: needs seeded approval card (seeded) (CONSUMES the single card: Not now; only on a fresh demo stack or if STORY-025 was skipped)
**Topic**: Approving outside sources
**Persona**: Marcus, a cautious COO who does not recognise the URL on the card
**Goal**: Refuse the request and confirm that nothing is read.
**Preconditions**: needs seeded approval card (pending http source on page "Cash").
**Ideal path**: 3 — read, click "Not now", check the page.
**Alternate paths**: Ignore the card (it stays pending forever; the placeholder keeps saying "Waiting for approval"). Remove the source in the Sources dialog ("Remove", confirm "Remove {name}?") instead of declining.
#### Steps
1. Open `/app/{botId}` and read the card → "Read {host} every hour?" with a `Request: GET …` line.
2. Click "Not now" → "Sending…", then a red X and "Not now" replace the buttons.
3. Click the "Page" button, then look at the block that uses the source → the placeholder reads "Not approved". It is no longer a link.
4. Page options menu "…" → "Sources" → the row badge reads "denied".

#### Variations
- Full-width page: the same "Not approved" text, plain (not a button).
- Phone width: the card and the sources dialog stack in one column; badge "denied" must stay readable.

#### Edge Cases
- After "Not now" there is no button on the card or the dialog to change the decision. Only the bot can ask again, by changing the call (url, secret, accept; or server, tool, args) with `page_source_set`. Calling it with the same call keeps the source denied. The tool tells the bot: "The owner declined this request. Change the request to ask again." The owner sees none of this guidance. A walker should note that "Not now" reads as postponing, but acts as a permanent refusal (code: a denied source stays denied until the call changes).
- Tooltip/label mismatch: "Not now" on the card vs "Not approved" on the page vs "denied" in the dialog. Three words for one state.

### STORY-027: Find the approval card when the owner is somewhere else in the app [APPROVE-03]
**Type**: medium
**Walkable**: needs seeded approval card (seeded) (the toast or unread dot may not exist for a seeded message; stop before answering)
**Topic**: Approving outside sources
**Persona**: Dana, a founder who was in the Inbox when the Finance agent asked
**Goal**: Notice that an approval is waiting and get to the card.
**Preconditions**: needs seeded approval card. The thread must be unread and a notification must exist; if the seed only inserts a message, the toast and the unread dot may not appear (note this to the walker).
**Ideal path**: 2 — click the toast.
**Alternate paths**: Open the bot from the sidebar (the unread marker on the bot row is the cue). Open the Finance agent's thread through the bot list. Open the Page: a pending block reads "Waiting for approval" and on the full-width route it is a link to the chat. There is no approvals page that collects page-source cards (the "approval" toast and notification are the only central signals; `ApprovalRulesSettings.tsx` is about standing rules, not this card).
#### Steps
1. Stay on another route (for example the Inbox) when the card arrives → a sticky toast titled "Finance agent needs approval" with the body "Read {host} every hour?" appears (needs_input toasts do not time out).
2. Click the toast → the app opens `/app/{botId}`.
3. Look at the thread → the card is shown. The thread opens at the unread messages; check whether the card is visible without scrolling.
4. Click "Allow" or "Not now" → the card closes as in STORY-025 or -02.

#### Variations
- Toast dismissed: open the bot from the sidebar instead; the bot row should show unread. Check that the unread state clears after opening.
- Browser notifications while the tab is in the background: OS notification with the same title, body clipped to 120 characters.
- If "help" notifications are off in notification settings: no toast and no notification; only the unread state on the bot and the placeholder on the page remain.
- Phone width: toast stacks at the top; tapping it should navigate the same way.

#### Edge Cases
- The page agent can post several cards in a row (one per source). Several toasts or notifications with the same title "Finance agent needs approval" appear; the body (question) is the only difference. Notification keys are per message, so none are merged.
- The transcript scroll anchor (`answerableAskMessageId`, transcript.tsx:631) covers cards for a waiting run. Page source cards do not wait for a run, so on a long thread the card may sit above the fold. Verify this in the walk.

### STORY-028: Bot changes the call, the first card goes stale, a second card appears [APPROVE-04]
**Type**: long
**Walkable**: no — bot action (needs the bot to change a call and post a second card)
**Topic**: Approving outside sources
**Persona**: Priya again, who allowed the rate source last week; today the bot found a better endpoint
**Goal**: Understand that a changed call needs a new decision and approve only the new one.
**Preconditions**: Precondition: bot action (not walkable without a model) for the call change, plus needs seeded approval cards (card A, still pending, and card B for the same source with a different URL). If the seed can write both cards directly, the stale-card part is walkable.
**Ideal path**: 6 — ignore card A, answer card B, check the page.
**Alternate paths**: Answer card A first (see step 3); there is no way to dismiss it without answering.
#### Steps
1. Open `/app/{botId}` → two cards are visible for the same source name: card A (old call, `Request: GET {old url}`) and card B (new call). Both show "Allow" and "Not now". Card A looks exactly as live as card B.
2. Compare the `Request:` lines of A and B → they differ; the `Page:` line is the same.
3. Click "Allow" on card A (the mistake) → the server finds the call hash no longer matches, closes the card as superseded, and returns CONFLICT. The card turns into "Replaced by a newer request" in muted text. The source stays pending. A toast or inline error may also show the conflict message "This prompt is no longer awaiting an answer"; record what appears.
4. Click "Allow" on card B → "Sending…", then "Allowed".
5. Open the page → the old values are gone (the bot's change deleted the old snapshots); the block shows "Waiting for approval" before step 4, and the new value after.
6. Page options "…" → "Sources" → the row shows the new URL in the subline context and badge "ok".

#### Variations
- Same call, only the name or schedule changes: no new card appears and the source keeps its status. Card text on the old card still shows the old schedule ("every hour") if the schedule changed while pending, because the card is not rewritten. Approving it then runs the source on the new schedule, not the one shown.
- A denied source, then a changed call: a new card appears, "Not now" can be chosen again.
- Reverse: the call changes back to the exact earlier call while card A is still pending. The hashes match again, so card A can be answered; card B (the in-between request) is replaced.
- Keyboard-only: Tab through four buttons; check that the focus order matches the reading order.

#### Edge Cases
- Source removed (via "Remove" in the Sources dialog) while a card is pending: clicking Allow closes the card as "Expired" and the request returns CONFLICT.
- Two browser tabs: answer in tab 1, then click the still-pending card in tab 2: CONFLICT, and the card in tab 2 should update through the `thread.message.updated` event to "Allowed"; verify it updates without a reload.
- The card cannot show the previous request, so the owner cannot tell what changed from the card alone.

### STORY-029: Page shows "Waiting for approval", user follows the link to the chat [APPROVE-05]
**Type**: short
**Walkable**: needs seeded approval card (seeded) (walk steps 1-2; step 3 would answer the card)
**Topic**: Approving outside sources
**Persona**: Tom, a board member who opened the Cash page from the sidebar and sees a gap
**Goal**: Find out why the "Outside rate" block is empty and reach the decision.
**Preconditions**: the seed's "Outside rate (pending)" source. Needs seeded approval card to complete step 3 (the link works without a card but lands on a chat without one).
**Ideal path**: 3 — open the page, click "Waiting for approval", answer in the chat.
**Alternate paths**: In the side panel (chat header "Page" button) the same text is not a link, so the owner is already in the chat. They scroll up to find the card.
#### Steps
1. Click "Cash" in the sidebar → the full-width page opens at `/app/pages/{botId}/{pageId}`. The pending block shows the muted underlined text "Waiting for approval".
2. Click "Waiting for approval" → the app navigates to `/app/{botId}`. It does not scroll to the card and does not tell the user which block the link was on.
3. Look for the card in the thread and click "Allow" → "Allowed". Press the browser Back button → the full-width page opens again, and the block now shows data.

#### Variations
- Keyboard: the link is a real `button`; Tab to it, Enter activates it, a focus outline appears.
- Phone width: the full-width page is the normal route on a phone; after the click the chat opens on the unread position.
- A paused or denied source: the placeholder reads "Paused" or "Not approved" and is not a link.
- Public share `/s#token`: a pending block in the frozen snapshot has no live data. Check what it shows; it is not interactive.

#### Edge Cases
- If the card was already answered "Not now", the placeholder no longer says "Waiting for approval", so there is no link to follow. If the card is missing (for example, the thread was cleared), the link goes to a chat with nothing to answer.
- With several pending blocks the link is identical on each one, with no source name.
- The link text is a state label, not an action. A first-time user may not guess that it is clickable on this route only (see Surprises).

### STORY-030: Open an approval card in a thread that no longer allows answers [APPROVE-06]
**Type**: short
**Walkable**: needs seeded approval card (seeded) (the seed gives one pending card; other card states exist only after answering)
**Topic**: Approving outside sources
**Persona**: Leo, a returning user checking an old Finance thread
**Goal**: Check what an old, answered, or stale card shows and whether anything is still actionable.
**Preconditions**: needs seeded approval card in each state: pending, answered "allow", answered "deny", answered "superseded", answered "expired". Without seeding, the walker can only check the states created in stories 01, 02 and 04.
**Ideal path**: 2 — scroll the thread and read the states.
**Alternate paths**: none found.
#### Steps
1. Open the thread and scroll to the old cards → answered cards show a single line: "Allowed" with a check; "Not now" with a red X; "Replaced by a newer request" or "Expired" in muted grey. No buttons.
2. Select the text of an answered card → the original question and detail lines stay visible above the result. Check this is true; the detail text comes from the stored block.

#### Variations
- Pending cards in a thread whose run is cancelled or finished still show "Allow" and "Not now" (the transcript marks page source cards answerable always; transcript.tsx:2015).
- Phone width: the check or X icon plus the label wrap onto one line.

#### Edge Cases
- The label "No longer active" exists in AskCard.tsx:313, but it can only appear for a page-source card if `canAnswer` is false. The transcript passes `canAnswer || Boolean(block.pageSource)`, so the label can not show for these cards on the web. A walker should not expect it. The story brief mentions it; in this code path it is unreachable, so treat a pending page-source card showing "No longer active" as a defect.
- "Allowed" does not show when the allowed source is later paused, removed or failing. The card is a record of the answer only.
- Another user in a shared space: the thread query matches the owner (`thread: { spaceId, userId }`), so a non-owner cannot answer; whether the card is hidden or inert for them was not checked.

### STORY-031: Bot asks again after a "Not now" and the owner reconsiders [APPROVE-07]
**Type**: medium
**Walkable**: no — bot action (needs the bot to change a denied call and post a new card)
**Topic**: Approving outside sources
**Persona**: Marcus, who declined last week and now sees a new card from the same bot
**Goal**: Decide with the new information.
**Preconditions**: Precondition: bot action (not walkable without a model) to change a denied source's call, plus needs seeded approval card (old card answered "Not now"; new card pending for the same source).
**Ideal path**: 3 — read the new card, compare, answer.
**Alternate paths**: Ignore the new card; the page keeps saying "Waiting for approval" because the source is pending again, not "Not approved".
#### Steps
1. Open the thread → the old card shows "Not now" (red X); a new card below it shows the question and buttons.
2. Read the new `Request:` and `Key:` lines → they show the changed URL or key name. The card has no text saying that it replaces a declined request.
3. Click "Allow" → "Allowed". Open the page: the block fills in.

#### Variations
- Click "Not now" again: the source returns to denied, and the page reads "Not approved".
- Open the Sources dialog before answering: the badge reads "pending" (not "denied").

#### Edge Cases
- The key name on the card is only the secret's name (for example `billing`), never its value. Check that no part of an API key appears in the card, the notification body or the dialog.
- Request line over 100 characters: the `Page:` line is cut at 100 characters but the `Request:` line is never cut (the hash covers every argument), so a very long query string makes the card tall.

### STORY-032: Approve an MCP source (tool call) and compare with an API source [APPROVE-08]
**Type**: medium
**Walkable**: no — bot action (needs an mcp source and card; the seed has only the http card)
**Topic**: Approving outside sources
**Persona**: Aisha, an operations lead who connected a Mercury MCP server
**Goal**: Read an MCP card and understand what Allow lets the page do.
**Preconditions**: needs seeded approval card with an mcp source (card text like "Read Mercury every 6 hours?", detail `Request: getAccounts {"limit":5}` then `Page: Finance`). The demo seed has only an http pending source, so this needs extra seeding.
**Ideal path**: 3 — read, Allow, check the page.
**Alternate paths**: none found.
#### Steps
1. Open the thread and read the card → question "Read Mercury every 6 hours?"; the detail shows `Request: getAccounts {"limit":5}` (tool name plus JSON args, no `GET`, no `Key:` line) and `Page: Finance`.
2. Click "Allow" → "Sending…", then "Allowed".
3. Open the page's "Sources" dialog → the row subline reads `{server} · {tool} · {schedule}` and the badge "ok" after the one-time refresh.

#### Variations
- Schedule "15m", "1h", "6h", "1d", "1w" give "every 15 minutes", "every hour", "every 6 hours", "every day", "every week" in the question. An unknown value would print the raw value.
- A tool call with no args: the `Request:` line is just the tool name.

#### Edge Cases
- A card for a tool that writes (the bot picks the tool): the card has no read-only/write label. The product expects the bot to use only read tools, but the card cannot confirm it.
- The question says "Read {server}" for any tool, even if the tool name sounds like a write.

### STORY-033: Approval flow on a phone-width screen [APPROVE-09]
**Type**: medium
**Walkable**: needs seeded approval card (seeded) (phone width; stop before tapping Allow unless this walk is the one that answers the card)
**Topic**: Approving outside sources
**Persona**: Dana, on her phone browser at 390px between meetings
**Goal**: Get the notification, read the card and answer it with one hand.
**Preconditions**: needs seeded approval card. Browser resized to 390 px wide.
**Ideal path**: 4 — open the app, open the bot, read, tap Allow.
**Alternate paths**: The mobile app (Expo, apps/mobile/app/thread.tsx ~3815) and the iOS app render the same card; those are outside what a browser walker can check.
#### Steps
1. Open `/app` at 390 px → the sidebar is collapsed; the Finance agent's row shows an unread marker.
2. Open the bot → the chat fills the screen; the card question is at the top of the card.
3. Read the detail text → a long URL wraps; the card does not scroll sideways.
4. Tap "Allow" → full-width button reads "Sending…", then "Allowed".

#### Variations
- Tap the toast if it is still visible.
- Rotate to landscape / resize to 844 px: buttons stay stacked.
- Open the Page from the header: the side panel becomes a full-screen view or a sheet (check which); the block for the source should update without a reload.

#### Edge Cases
- The touch targets: each button is tall (`py-3`), above the 44 px target.
- Tapping "Not now" by mistake has no undo (see STORY-026).

### STORY-034: Empty and absent states: no card, no pending source [APPROVE-10]
**Type**: short
**Walkable**: yes (adapted: the seed has a card, so record the contrast with the described no-card state; do before the card is answered)
**Topic**: Approving outside sources
**Persona**: A tester checking what a user sees when nothing is waiting
**Goal**: Confirm the approval UI stays out of the way when it has nothing to show.
**Preconditions**: the base seed only (no approval card in a thread). The "Outside rate (pending)" source exists but its card is missing, which is itself a state worth recording.
**Ideal path**: 3 — open Cash, read the placeholder, open the chat and find nothing to answer.
**Alternate paths**: none found.
#### Steps
1. Open Cash full-width → the "Outside rate" block shows "Waiting for approval" as a link.
2. Click it → the chat opens. No approval card is in the thread (the seed did not create one).
3. Look for any other control that could approve the source: the Sources dialog row menu has "Change schedule", "Pause", "Remove" but no "Allow". → There is no way to approve from the UI. The owner can only wait for the bot to post a new card, or remove the source.

#### Variations
- The Cash HTML page and the Spend page have no pending sources; no approval UI should appear.
- Keyboard: the link is reachable by Tab on the full-width page, and not offered in the side panel.

#### Edge Cases
- The seeded state may be a defect in the walk setup rather than the product: a pending source without a card cannot be approved in the product. In real use the card is created in the same step as the pending source, but if the card is lost (for example, if the thread message fails to post after the source saved), `page_source_set` called again with the same call posts no card (`needsCard` is false when only the schedule changes). The owner is then stuck with "Waiting for approval" and no way forward until the bot changes the call.

## Topic: HTML pages

### STORY-035: Open the Cash HTML page from the chat side panel [HTML-01]
**Type**: short
**Walkable**: yes
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder checking cash before a board call
**Goal**: See the bot-written Cash HTML page next to the Finance agent chat.
**Preconditions**: Logged in as the demo owner. Finance agent has the three seeded pages.
**Ideal path**: 3 — open the agent, click "Page", click the "Cash HTML" tab.
**Alternate paths**: Click "Cash HTML" in the sidebar to open it full-width (see STORY-037).
#### Steps
1. Open the Finance agent at `/app/:botId` → The chat opens. The header shows a `FileText` button with title and label "Page".
2. Click "Page" → A side panel opens next to the chat with no URL change. A tab row labelled "Pages" shows three tabs ("Cash", "Spend", "Cash HTML"). The first page is selected by default and is a blocks page.
3. Click the "Cash HTML" tab → A bordered rounded frame, at least 384px and about 70% of the viewport tall, replaces the blocks page. There is no editor, no toolbar and no text caret anywhere in the frame.
4. Look at the frame content → The page renders its own markup. Data for source `cash` appears once the page script receives it (a moment after the frame appears).
#### Variations
- Click "Page" again → The panel closes. Click it a second time → The panel reopens on the page last viewed (record whether it is "Cash HTML" or the first page).
- Keyboard: Tab to "Page", press Enter, arrow keys inside the "Pages" tab list to reach "Cash HTML".
#### Edge Cases
- Between clicking the tab and the frame appearing there is a short blank area: the component returns nothing until the page loads (`HtmlPageView.tsx:62`). Record how long it is and whether the layout jumps.
- Click inside the frame, then press Escape or `j`/`k`. Keys inside the sandboxed frame do not reach the app (see the comment at `SandboxedHtmlViewer.tsx:209`, which only fixes this for email). Record whether the panel shortcuts still work.

### STORY-036: Page data reaches the frame and is refreshed on demand [HTML-02]
**Type**: medium
**Walkable**: yes (Refresh changes source state lightly)
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder checking cash before a board call
**Goal**: Confirm the numbers on the HTML page are current, and update them without asking the bot.
**Preconditions**: As STORY-035. The `cash` source is a praci source over the canned finance data.
**Ideal path**: 4 — open the page, open "Page options", click "Refresh".
**Alternate paths**: Leave the page open and wait for the schedule; the server pushes a `page.data` event and the page updates without a click. Open "Sources" (STORY-024) to see the last refresh time.
#### Steps
1. Open the Finance agent, click "Page", click "Cash HTML" → The frame shows the page.
2. Read the cash value and any "as of" time the page shows → Note them as the before values.
3. Click "Page options" (the `…` button in the tab row) → A menu lists "Refresh", "Sources", "Share", "Rename" and "Delete". "Refresh" and "Sources" are present because the page has a source.
4. Click "Refresh" → The server refreshes the page's sources and the new data is posted to the frame. The frame does not reload or flash; only the page's own script redraws. There is no spinner, toast or "Refreshing" text for an HTML page (the blocks page shows a shimmer, this one does not).
5. Compare the values with step 2 → With canned finance data the numbers may be the same. The fetched-at time (if the page prints it) is newer.
6. Click "Refresh" three times quickly → No error text appears. Record whether each click causes a request (the spec says one refresh per minute per page; this was not verified in code).
#### Variations
- Phone width (390px): the panel is narrower and the frame keeps `min-h-96`. Check the options menu is reachable and the page content does not need sideways scrolling.
- Switch to the "Cash" blocks tab and back to "Cash HTML" → The frame is re-created (`key={active.id}`) and shows data again after a short delay.
#### Edge Cases
- Open "Page options" on the "Cash" tab, then switch to "Cash HTML": the menu entries come from a `hasSources` flag that is shared by all tabs and is only updated when a page loads successfully (`bot-page-panel.tsx:555`, `HtmlPageView.tsx:51`). If a load fails, a stale value stays. Record the menu on each tab.
- If the refresh fails on the server, the user sees nothing on this surface (`HtmlPageView.tsx:52`). The page script gets `status`/`error` in the data and must show it itself. See STORY-038.

### STORY-037: Open the HTML page full-width from the sidebar [HTML-03]
**Type**: short
**Walkable**: yes
**Topic**: HTML pages
**Persona**: Marcus, an operations lead who keeps the page in his sidebar as a dashboard
**Goal**: Use the HTML page at full width and know the controls that differ from the side panel.
**Preconditions**: "Cash HTML" is in the sidebar for the demo owner.
**Ideal path**: 1 — click "Cash HTML" in the sidebar.
**Alternate paths**: Sidebar "Add page" `+`, pick it under the Finance agent group (only if it is not already there).
#### Steps
1. Click "Cash HTML" in the sidebar → The URL becomes `/app/pages/:botId/:pageId`. A page header shows the title "Cash HTML" and a "Page options" button. There are no tabs and no "New page" button.
2. Look at the frame → Same 70vh frame, now as wide as the content column. Data appears as in STORY-036.
3. Click "Page options" → "Refresh", "Sources", "Share" and "Rename" are listed. There is no "Delete" item at full width.
4. Click "Rename", type a new name, press Enter → The header shows the new name. The sidebar row shows it too. The frame is not reloaded.
5. Click "Page options" → "Rename", press Escape → The old name stays.
#### Variations
- Keyboard: open the menu with Enter on "Page options", use arrow keys, Enter on "Refresh".
- Type a title longer than 60 characters → The field stops at 60.
#### Edge Cases
- Open `/app/pages/:botId/not-a-real-id` → The app navigates to `/app` (replace) and the user lands without any message (`bot-page-panel.tsx:581`, `onMissing`).
- Rename is available on an HTML page but editing content is not: record that the user cannot fix a typo in the page and must ask the bot.

### STORY-038: A source fails and the HTML page has to tell the user [HTML-05]
**Type**: medium
**Walkable**: yes (compares page types; a failing source on an HTML page needs a bot action and is skipped)
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder who sees a number that looks old
**Goal**: Work out whether the HTML page is stale or broken.
**Preconditions**: Demo seed includes a source with failures, but the failing ones are on the blocks page "Cash" ("Cash (stale)", "Request timed out"), not on "Cash HTML". Failing HTML sources need a bot action (not walkable without a model), so this story compares the two page types.
**Ideal path**: 6 — the user has to check three places.
**Alternate paths**: Open "Sources" for the page (STORY-024) and read the badge and the error line.
#### Steps
1. Open the Finance agent, click "Page", select the "Cash" tab → "Cash (stale)" shows a warning dot labelled "Source failed". Hover or click it → A popover shows "Request timed out" and a "Retry" button.
2. Select the "Cash HTML" tab → There is no warning dot, no "Retry" button and no popover anywhere on an HTML page. The user-visible status of each source lives only inside the data passed to the page script.
3. Click "Page options", then "Sources" → The dialog lists the sources of the open page only (for "Cash HTML": `cash`). Record whether the badge is "ok".
4. If a source were failing, the dialog would show "failed" and the error text, and the page would receive `{status, error}` for it. The frame shows the error only if the bot wrote the page to show it (needs bot-written page; not walkable without a model).
#### Variations
- Click "Refresh" on the HTML page while the source is failing → Nothing visible changes and no message appears (`HtmlPageView.tsx:52` swallows load errors).
#### Edge Cases
- Defect candidate: a failed refresh RPC on an HTML page (offline, server error) gives no feedback at all; on a blocks page the same case shows an error line. Record both.
- A failing source on a blocks page has "Retry"; an HTML page has no retry control other than "Page options" > "Refresh".

### STORY-039: Share a snapshot of the HTML page and open it logged out [HTML-06 + SHARE-07]
**Type**: medium
**Walkable**: yes (creates a share link; needs a second logged-out browser window)
**Topic**: HTML pages
**Persona**: Marcus, an operations lead sending a snapshot to a board member
**Goal**: Create a view-only link to the HTML page and check what a visitor sees.
**Preconditions**: As STORY-035. A second private browser window with no session.
**Ideal path**: 4 — "Page options", "Share", copy, open in the private window.
**Alternate paths**: none found (Share exists only in the options menu; there is no share button on the page itself).
#### Steps
1. On "Cash HTML", click "Page options" then "Share" → A dialog titled "Share link" opens with the link, a copy control, and the note "Anyone with this link can view this version until you stop sharing or for 30 days."
2. Click the copy control → The link `…/s#<token>` is copied.
3. Open the link in a private window → The public page `/s` loads. It shows the HTML page with the data it had when shared. The data arrives through the same `praci-data` message, sent when the document loads (`page-snapshot.ts:116`). Record whether anything on the page differs from the in-app view (fonts, height, scroll).
4. In the app, click "Refresh" on the page, reload the private window → The shared page still shows the older data. It is frozen.
5. Back in the app, click "Stop sharing" in the dialog (reopen via "Share" if it closed) → A confirmation titled "Stop sharing this link?" with "Cancel" and "Stop sharing". Click "Stop sharing" → The dialog closes.
6. Reload the private window → The link no longer shows the page.
#### Variations
- Click "Share" twice → Each click calls `pages.share` and makes a new link. Record whether the first link still works; the page dialog has no "Replace link" button, only the share note.
- Phone width: the dialog and the shared page both fit 390px.
#### Edge Cases
- Defect candidate: the dialog is only held in memory (`shared` state, `bot-page-panel.tsx:557`). Close it with the "x" and the link cannot be shown again, and "Stop sharing" is no longer reachable from this page. Record whether the page offers any way to revoke a link after the dialog closes.
- Sharing fails (offline) → An error line appears in the panel above the page (`role=alert`), not inside the dialog, because the dialog is not open yet.
**Merge note**: Merged with SHARE-07 (Share the HTML page "Cash HTML"). The richer story was kept; the dropped story follows in full below.

#### Merged duplicate: SHARE-07 — Share the HTML page "Cash HTML"
**Type**: medium
**Topic**: Sharing a snapshot
**Persona**: Priya, sharing a designed one-pager
**Goal**: Share the HTML page and check that data shows in the public view.
**Preconditions**: Seeded html page "Cash HTML" (meta praci-sources cash), reached from the sidebar at `/app/pages/:botId/:pageId`.
**Ideal path**: 4 — open page, options, Share, copy.
**Alternate paths**: none found; the page is not editable, but "Page options" still has "Share".
**Steps**
1. Click "Cash HTML" in the sidebar → page renders in a bordered frame.
2. Click "Page options" then "Share" → "Share link" dialog; same note and "Copy".
3. Click "Copy", then "Done".
4. Open the link logged out → header "Cash HTML snapshot" and "Shared from Praci"; the page renders in a sandboxed frame.
5. Look at the `cash` value → it shows the value seen in the app, delivered after the frame's load event.
**Variations**
- Phone width (390px): the frame fills the viewport under the header.
- If the frame shows empty values for a moment, wait; data arrives on load.
**Edge Cases**
- If the page script reads data before the load event it finds none. If the viewer's browser blocks the sandboxed message, values stay blank with no error text.
- Source errors are stripped from the data, so a failed source shows as no value, not an error.

### STORY-040: The page changes while the user is looking at it [HTML-07]
**Type**: medium
**Walkable**: yes (data part only; content change needs a model)
**Topic**: HTML pages
**Persona**: Dana, a finance manager with the page open while the bot is working
**Goal**: Keep reading the page while the bot edits it or its data changes.
**Preconditions**: Bot action (not walkable without a model) to change page content. The data-only part (steps 1 to 3) is walkable by clicking "Refresh" or by waiting for the schedule.
**Ideal path**: 2 — do nothing; the page updates itself.
**Alternate paths**: Click "Refresh" for data. For a content change, the user cannot reload only the frame; they reload the app.
#### Steps
1. Open "Cash HTML" in the side panel and scroll the page down inside the frame → The frame has its own scroll.
2. Click "Page options" then "Refresh" → The frame content updates in place. The scroll position inside the frame stays (the document is not recreated, only a new message arrives).
3. Switch to "Spend" and back to "Cash HTML" → The frame is rebuilt, scroll is back at the top, and the data reappears after a short delay.
4. (Bot action) The bot calls `page_write` with new markup while the panel is open → A `page.updated` event reloads the page. The whole document is replaced, scroll resets to the top and the data is sent again after the new document says it is ready.
5. (Bot action) While the revision changed, data fetched for the old revision is held back (`htmlPageSourcesFor`) → The new document may show no values for a moment, then the matching data.
#### Variations
- Phone width: after the bot's edit, the frame scroll resets with no notice.
#### Edge Cases
- If the edit renames a source and the old name is no longer declared, the new page gets data only for the declared names and the `praci-sources` error ("praci-sources has an invalid source name …", `html-page.ts:89`) appears for the bot, not the user. The user sees a page with no data and no explanation. (needs bot-written page)
- The bot's edit and the user's click on "Refresh" at the same moment: record whether the page ends with matching data.

### STORY-041: Long walk across surfaces, sandbox and hide-amounts [HTML-08]
**Type**: long
**Walkable**: yes (long; step 9 opens Share, which creates a link)
**Topic**: HTML pages
**Persona**: Priya, a seed-stage founder moving between her laptop, the sidebar and her phone before a board call
**Goal**: See the same HTML page everywhere, and check the privacy controls and the page's isolation.
**Preconditions**: As STORY-035. A way to resize the browser to 390px wide.
**Ideal path**: 12 — there is no shorter route that covers all surfaces.
**Alternate paths**: Mobile app `/agent-page` and iOS show the same page through their own previews (not walkable in the web demo).
#### Steps
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
#### Variations
- Keyboard-only: reach the frame with Tab; the iframe takes focus and Tab then moves inside it. Record whether the user can leave the frame by keyboard.
- Screen reader: the iframe title is the page title ("Cash HTML"); the frame has no other label.
#### Edge Cases
- Offline after step 1: click "Refresh" → no message, frame unchanged (see STORY-038).
- Open the browser console during the walk → There should be no errors from the viewer. A CSP violation report from the frame is expected only if the page tries to load something from outside (network, fonts, remote images); the page cannot load any.
- A page that has no internet access cannot show a remote chart library or font; the bot must inline everything. A page that tries shows a blank or broken region and no message to the user.

## Topic: Sidebar and full-width pages

### STORY-042: Re-add a page with the "Add page" menu [NAV-01]
**Type**: short
**Walkable**: yes (needs STORY-043 first so that Spend is out of the sidebar)
**Topic**: Sidebar and full-width pages
**Persona**: Priya, a seed-stage founder who removed a page from the sidebar yesterday and now wants it back before a board call
**Goal**: Put "Spend" back in the sidebar and open it full width.
**Preconditions**: Logged in as the demo owner. "Spend" has been removed from the sidebar (run STORY-043 first). Sidebar is expanded, "Pages" group is expanded.
**Ideal path**: 3 — open the menu, pick the page, read the result.
**Alternate paths**: Open the Finance agent chat, click the header "Page" button, click the "Spend" tab (the page shows but it is not added to the sidebar). Navigate by URL `/app/pages/{botId}/{pageId}` (also does not add a sidebar row).
#### Steps
1. Click the "Add page" row at the bottom of the "Pages" group (data-testid `sidebar-add-page`) → a menu opens. It lists "Team health" with the description "Workload and key people, from your connected tools" (if available), then a "Finance agent" header with its avatar, then the pages not yet in the sidebar.
2. Click "Spend" under "Finance agent" → the app navigates to `/app/pages/{botId}/{pageId}`. The heading "Spend" shows in the page header. A "Spend" row with the Finance agent avatar now appears in the sidebar and is highlighted.
3. Look at the metric "Spend this month" → the value renders.
#### Variations
- Phone width (390px): open the navigation drawer with the menu button, click "Add page" and pick "Spend". The drawer closes on its own (`onOpen` calls `setMobileSidebarOpen(false)`) and the page is shown.
- Keyboard: Tab to "Add page", Enter opens the menu, arrow keys move between items, Enter picks.
#### Edge Cases
- Every page already in the sidebar and "Team health" already added: the "Add page" row does not render at all (AddSidebarPage.tsx:34). There is no disabled row and no hint.
- A mistake: the user opens the menu and presses Escape. Nothing changes.
- Clicking the same page twice quickly: the add is idempotent on the server, so only one row appears.
- The menu has no search. With many bots the list is long.

### STORY-043: Remove the page you are viewing from the sidebar [NAV-02]
**Type**: short
**Walkable**: yes (removes Spend from the sidebar; re-add with STORY-042)
**Topic**: Sidebar and full-width pages
**Persona**: Marcus, a founder tidying his sidebar after a demo
**Goal**: Remove "Spend" from the sidebar and learn that the page itself still exists.
**Preconditions**: Logged in as demo owner. "Spend" is in the sidebar. Currently on `/app/pages/{botId}/{spendId}`.
**Ideal path**: 2 — open the row menu, choose "Remove from sidebar".
**Alternate paths**: none found. The full-width page's own "Page options" menu has no "Remove from sidebar" item. The "Show in sidebar" checkbox menu in the group header lists added pages, but it only hides a row; it does not remove it (and those hidden rows come back in the "Show in sidebar" list).
#### Steps
1. Hover the "Spend" row in the sidebar → a "…" button with aria-label "Page options" appears at the row's right edge (always visible on touch screens).
2. Click "Page options", then "Remove from sidebar" → the row disappears and, because the user was on that page, the app navigates to `/app` (SidebarPages.tsx:136). `/app` then selects the usual default bot chat.
3. Open "Add page" → "Spend" is listed under "Finance agent" again.
#### Variations
- Remove a row while on a different page (for example on "Cash"): the row disappears and the user stays on "Cash".
- Keyboard: Tab to the row, Tab to its "Page options" button (it shows on focus), Enter, then Enter on "Remove from sidebar".
#### Edge Cases
- No confirmation dialog and no "Undo" toast. A mistaken click removes the row, but re-adding takes the "Add page" menu (STORY-042).
- The API fails: a red `role=alert` line appears under the "Add page" row and the row stays.
- Hesitation: the user might expect "Remove from sidebar" to delete the page. The row's menu says "Remove from sidebar" only, and the page remains in the Finance agent's side panel.
- In the icon rail (sidebar hidden) the "Page options" button is not rendered (SidebarPages.tsx:162), so a page cannot be removed from the rail.

### STORY-044: Read the full-width page header and options menu [NAV-03]
**Type**: medium
**Walkable**: yes
**Topic**: Sidebar and full-width pages
**Persona**: Dana, a founder's chief of staff who needs to know what she can and cannot do on the full-width Cash page
**Goal**: Find every control on the full-width "Cash" page and confirm which ones are missing compared with the side panel.
**Preconditions**: Logged in as demo owner. "Cash" is in the sidebar.
**Ideal path**: 3 — click the sidebar row, open "Page options", read the menu.
**Alternate paths**: Go straight to `/app/pages/{botId}/{cashId}`.
#### Steps
1. Click the "Cash" row in the sidebar → the URL becomes `/app/pages/{botId}/{cashId}`. The page header shows the title "Cash" and a "…" button with aria-label "Page options". The sidebar row is highlighted (`aria-current="page"`).
2. Look at the page → there are no tabs ("Pages" tab list), no "New page" button, and no chat "Page" button in the chat header (the page is not a chat route).
3. Click "Page options" → the menu lists "Refresh", "Sources", "Share" and "Rename". It has no "Delete" item (bot-page-panel.tsx:715).
4. Scroll the page → "Monthly burn" (metric), "Largest vendors" (table), "Cash (stale)" with a warning dot, "Payroll (paused)" and "Never fetched (paused)" showing "Paused", and "Outside rate (pending)" showing "Waiting for approval" as an underlined link.
5. Press Escape, then click "Cash HTML" in the sidebar → the header changes to "Cash HTML" and the content shows in the sandbox frame. The options menu now lists "Refresh", "Sources", "Share", "Rename" (HTML pages are read-only; the frame has no editor).
#### Variations
- Phone width (390px): the header shows a navigation button (aria-label "Open navigation"). The "Page options" button may drop onto its own line under the title when the header is narrow (PageHeader wraps actions).
- Press Tab from the header: the first stops are the "Page options" button, then the editable blocks, each focusable.
#### Edge Cases
- A page with no sources: the menu shows only "Share" and "Rename". "Refresh" and "Sources" are hidden.
- While the page list is loading (`pages.length === 0`), the header has no actions.
- The page content is an editor on blocks pages. A user typing in it will autosave after 800 ms, so the page is editable, not read-only. Only HTML pages are read-only.
- Information repeated: the same live-block warning dots and "Waiting for approval" text show in the side panel too, but only the full-width page makes "Waiting for approval" clickable.

### STORY-045: Rename a page on the full-width route and check the sidebar [NAV-04]
**Type**: short
**Walkable**: yes (renames Spend; rename it back)
**Topic**: Sidebar and full-width pages
**Persona**: Marcus, a founder who wants "Spend" called "Spend by vendor"
**Goal**: Rename the page and see the new name in the header and the sidebar.
**Preconditions**: Logged in as demo owner. "Spend" is in the sidebar and open full-width.
**Ideal path**: 3 — "Page options", "Rename", type and press Enter.
**Alternate paths**: Rename it from the side panel (Finance agent chat, "Page" button, "Page options", "Rename").
#### Steps
1. Click "Page options" in the header, then "Rename" → the title becomes an input with aria-label "Page title". Its text is selected.
2. Type "Spend by vendor" and press Enter → the header shows "Spend by vendor".
3. Look at the sidebar row → code reading says it still shows "Spend" until the sidebar list reloads. Reload the browser to check; after reload the row reads "Spend by vendor".
#### Variations
- Press Escape instead of Enter, or click away: the rename is cancelled (blur cancels), and the old title stays. A user who types a new name and then clicks elsewhere loses the text with no warning.
- Phone width: the input replaces the title in the header.
#### Edge Cases
- Empty or unchanged text: nothing is saved and the input closes.
- Title longer than 60 characters: the input stops accepting text at 60.
- Defect candidate: `SidebarPages` loads its list once on mount and only again after its own add or remove (SidebarPages.tsx:56-64). Nothing tells it a page was renamed, so the sidebar title is stale until reload. Observe and report.

### STORY-046: Move between the side panel and the full-width page [NAV-05]
**Type**: medium
**Walkable**: yes
**Topic**: Sidebar and full-width pages
**Persona**: Priya, a founder who prefers chatting with the Finance agent but wants to open the Cash page wide when the numbers are long
**Goal**: Go from the chat's side panel to the full-width page and back to the chat, without losing her place.
**Preconditions**: Logged in as demo owner. Finance agent has "Cash", "Spend" and "Cash HTML". "Cash" is in the sidebar.
**Ideal path**: 4 — open the Finance agent, click "Page", click the sidebar "Cash", click the Finance agent in the roster.
**Alternate paths**: A pending block's "Waiting for approval" link on the full-width page goes to `/app/{botId}` directly (Shell/BotPageView `review`).
#### Steps
1. Click the Finance agent in the roster → the chat opens at `/app/{botId}`. The header shows a "Page" button (title and aria-label "Page"), because the bot has pages.
2. Click "Page" → a side panel opens beside the chat. A tab list with aria-label "Pages" shows "Cash", "Spend" and "Cash HTML". "Cash" is selected. The panel also has a "Page options" button and a "New page" (+) button.
3. Click the "Spend" tab, then click the sidebar row "Cash" → the view changes to the full-width `/app/pages/{botId}/{cashId}`. The chat and its header "Page" button are gone.
4. Click the "Outside rate (pending)" block's "Waiting for approval" → the app goes to `/app/{botId}`, the chat. If an approval card was seeded, it shows "Allow" and "Not now"; otherwise the thread has no card.
5. Click "Page" again → the side panel reopens.
#### Variations
- Press the browser Back button from the full-width page: it returns to the chat route.
- Phone width (390px): the side panel is replaced by a full view and the sidebar is a drawer. Opening a sidebar page closes the drawer.
#### Edge Cases
- The side panel remembers nothing about the selected tab when the page is reopened (`activeId` is local state), so it starts on the first page ("Cash").
- Step 4 with no seeded approval card: the user lands in a chat that has nothing to approve. Mark "needs seeded approval card" if a card is expected.
- The full-width route has no live updates: Shell passes `remote={null}` and `dataRemote={null}` (Shell.tsx:5183), so a page change by the bot while the user reads the wide page does not show until reload. The side panel does update live.
- The two views of the same page use separate editors. A user editing in one and viewing in the other may see "Page changed. Reload".

### STORY-047: Collapse the Pages group and hide the sidebar [NAV-06]
**Type**: short
**Walkable**: yes (collapses the group; restore afterwards)
**Topic**: Sidebar and full-width pages
**Persona**: Dana, working on a small laptop screen who wants more room
**Goal**: Collapse the sidebar Pages group, then the whole sidebar, and still reach "Cash".
**Preconditions**: Logged in as demo owner. On `/app/pages/{botId}/{cashId}`. Sidebar expanded.
**Ideal path**: 3 — collapse the group, hide the sidebar, restore the sidebar.
**Alternate paths**: Keyboard shortcut for the sidebar (Shell.tsx ~4963-4974 toggles collapse). Not verified which keys.
#### Steps
1. Click the "Pages" header (aria-label "Collapse Pages", data-testid `sidebar-pages-toggle`) → all page rows hide except the current one, "Cash", which stays visible. The "Add page" row disappears too (it receives no items while collapsed). The chevron turns.
2. Click "Hide sidebar" → the sidebar becomes an icon rail. The "Cash" row shows only its avatar; hovering or focusing shows a tooltip "Cash". A "Show sidebar" button (data-testid `restore-bots-sidebar`) appears on a page route.
3. Click "Show sidebar" → the full sidebar returns, with the Pages group still collapsed.
4. Click "Expand Pages" → all rows and "Add page" return.
#### Variations
- Open "Spend" while the group is collapsed using a link elsewhere (URL): "Spend" becomes the visible current row; "Cash" hides.
#### Edge Cases
- In the rail, the "Page options" button and "Add page" are both missing. The rail has no way to add or remove a page.
- In the rail the group never collapses; the rail shows all rows regardless (`usePagesCollapsed` reads false in the rail).
- The "…" button in the group header (aria-label "Page options", same name as each row's menu) opens "Show in sidebar" with a checkbox per page. Unchecking "Cash" hides it but keeps it added. Two buttons with the same accessible name "Page options" on one screen is confusing for a screen-reader user.

### STORY-048: A page is deleted while it is still in the sidebar [NAV-07]
**Type**: medium
**Walkable**: yes (destructive: creates then deletes a throwaway page)
**Topic**: Sidebar and full-width pages
**Persona**: Marcus, who deletes an old page in the chat panel and later clicks its sidebar row
**Goal**: See what the sidebar does after the page it points to is deleted.
**Preconditions**: Logged in as demo owner. "Spend" is in the sidebar. A throwaway page exists: create one in step 1. Use a throwaway page so the seed is not lost.
**Ideal path**: 6 — create, add to the sidebar, delete, then confirm.
**Alternate paths**: The bot cannot delete pages (no `page_delete` tool shipped). The full-width route cannot delete either.
#### Steps
1. Open the Finance agent chat, click "Page", click "New page" (+) → a page "New page" is created and opened with an inline "Page title" input. Type "Scratch" and press Enter.
2. Click "Add page" in the sidebar → the menu now lists "Scratch" under "Finance agent". Click it → the full-width "Scratch" page opens and the sidebar shows "Scratch".
3. Go back to the Finance agent chat, click "Page", select the "Scratch" tab, then "Page options" → "Delete" → a dialog titled "Delete Scratch?" with buttons "Cancel" and "Delete".
4. Click "Delete" → the tab disappears and the panel selects the first page.
5. Look at the sidebar → code reading says the "Scratch" row remains until the sidebar reloads (no refresh on delete). Observe.
6. Click that "Scratch" row (if it is still there) → `BotPagePanel` loads the list, does not find the page, and calls `onMissing`. The app navigates to `/app` with replace, and the user sees the default chat with no message explaining why.
#### Variations
- Reload the browser after step 4: the "Scratch" row is gone (the server skips rows whose page no longer exists, or the row cascades).
- Open `/app/pages/{botId}/{deletedId}` straight from a bookmark: same silent redirect to `/app`.
#### Edge Cases
- Cancel in step 3: nothing changes.
- The last remaining page cannot be deleted: "Delete" does not show when there is only one page.
- Defect candidate: a dead sidebar row followed by a silent redirect, with no toast. See SidebarPages.tsx:56-64 and bot-page-panel.tsx:569-571.

### STORY-049: Open a sidebar page on a phone [NAV-08 + PHONE-01]
**Type**: medium
**Walkable**: yes (phone width 390 px)
**Topic**: Sidebar and full-width pages
**Persona**: Priya, checking cash from her phone in a taxi (390px wide)
**Goal**: Reach the Cash page through the navigation drawer and use its options menu with a thumb.
**Preconditions**: Logged in as demo owner at a 390px-wide viewport. Touch input if possible (coarse pointer).
**Ideal path**: 4 — open the drawer, tap "Cash", tap "Page options", read the menu.
**Alternate paths**: Swipe from the left edge to open the drawer (there is an e2e for sidebar swipe: apps/web/e2e/mobile-sidebar-swipe.spec.ts).
#### Steps
1. Tap the navigation button (aria-label "Open navigation") → the sidebar drawer opens with the "Pages" group at the top.
2. Tap the "Cash" row → the drawer closes and the full-width page opens.
3. Look at the header → the title "Cash", the navigation button, and "Page options" (on the same row or wrapped below the title).
4. Tap "Page options" → "Refresh", "Sources", "Share", "Rename". Tap "Sources" → the "Sources" dialog opens.
5. Close it and reopen the drawer; tap the row's "Page options" → "Remove from sidebar". On touch screens that button is always visible (no hover needed).
#### Variations
- Landscape phone: the sidebar may stay as a rail.
- Group header "…" button also visible. Tap targets on the row are 44 px tall (`pointer-coarse:min-h-11`), but the row's "Page options" button is 24 px (`h-6 w-6`), which is small for a thumb.
#### Edge Cases
- Long page titles are not truncated in the sidebar row text (`SidebarPageLink` label has no truncate class), so a long title may push the row wide. Check with a 60-character title.
- A table such as "Largest vendors" may scroll sideways inside the page.
- The drawer's Pages area scrolls on its own when there are many rows.
**Merge note**: Merged with PHONE-01 (Open the Cash page from the sidebar on a phone). The richer story was kept; the dropped story follows in full below.

#### Merged duplicate: PHONE-01 — Open the Cash page from the sidebar on a phone
**Type**: short
**Topic**: Pages on a phone
**Persona**: Priya, a seed-stage founder checking cash on her phone before a board call
**Goal**: Reach the full-width Cash page from a cold start on a 390px screen.
**Preconditions**: Logged in at 390x844 on `/app`. Seed pages are in the sidebar.
**Ideal path**: 3 — Open navigation, tap the page row, read.
**Alternate paths**: Swipe right from the left screen edge (12px zone) to open the sidebar instead of tapping the menu button; open Finance agent chat, then tap the "Page" header button (side panel, not full width).
**Steps**
1. Tap "Open navigation" (menu icon, top left) → the sidebar slides over the content; the page behind is inert.
2. Find the row "Cash" with the Finance agent avatar in the pages group (not "Add page") and tap it → URL becomes `/app/pages/{botId}/{pageId}`; the sidebar closes (verify it closes on its own) and the h1 "Cash" shows.
3. Look at the top of the page → a menu button, the title "Cash" and a "Page options" button fit on one line without overlap or horizontal scroll.
**Variations**
- Open the sidebar by edge swipe instead of the button.
- Tap "Spend" next, then "Cash HTML", from the sidebar each time (3 trips through the menu).
**Edge Cases**
- Tap the menu button twice quickly: the sidebar should not flicker or stack.
- Rotate to landscape (844x390): header still reachable.
- Reload on the page URL at 390px: the page loads directly with no sidebar open.

### STORY-050: Founder's Monday cash review, from sidebar to shared snapshot [NAV-09]
**Type**: long
**Walkable**: needs seeded approval card (seeded) (long; step 11 only follows the link, do not answer the card; resumes Payroll, makes and stops a share)
**Topic**: Sidebar and full-width pages (cross-topic: blocks, sources, source recovery, sharing)
**Persona**: Priya, a seed-stage founder doing her Monday review before sending a cash update to her investor
**Goal**: Open the Cash page from the sidebar, check each block, see why one number is stale and another is paused, resume the paused source, and share a frozen copy of the page.
**Preconditions**: Logged in as demo owner. Finance agent seeded as described in the brief. "Cash", "Spend" and "Cash HTML" in the sidebar. Sidebar expanded. The "Outside rate (pending)" http source is pending with no approval card (unless the walker seeds one: "needs seeded approval card" for step 11). Resuming a source needs no model. A real fetch may fail on the demo network. Treat the post-resume value as "observe and note".
**Ideal path**: 9 — sidebar row, read blocks, retry stale, Sources, resume Payroll, share, copy link.
**Alternate paths**: Reach "Cash" through the Finance agent chat "Page" button and the side panel (same menu items, plus tabs and "New page"). The source fixes work the same in either view; the "Waiting for approval" link only exists on the full-width page.
#### Steps
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
#### Variations
- Phone width (390px): same steps. The Sources dialog fills the screen. Use the drawer for steps 1 and 16.
- Do the whole review from the Finance agent chat's side panel instead: steps 2-10 and 12-17 are the same, but there is no clickable "Waiting for approval" (step 11 is not available), and the page updates live while the bot works.
- Keyboard only: the blocks are tabbable. Enter on the warning dot opens its popover. The menus open with Enter and close with Escape.
#### Edge Cases
- Dialog opened while the page is being edited: typing in the page before opening "Sources" is autosaved after 800 ms, so there is no loss.
- In step 8 the praci or http source may fail again. The badge goes to "failed" with a new error, and after 5 failures the source pauses again and the bot's thread gets "A source on one of your pages stopped working. Call page_source_list to see which one and why."
- The "Share" dialog creates a link every time it is opened (`pages.share` runs on click), so opening it to look replaces the old link. A founder who opens "Share" only to check the status can silently invalidate the link already sent to an investor. Confirm in the walk and flag as a defect if so.
- Share in step 12 shares a frozen copy, so changing the Payroll source afterwards does not change the shared view.
- No error shows for a failed share request except a line inside the dialog.

## Topic: Sharing a snapshot

### STORY-051: Share the Cash page and copy the link [SHARE-01]
**Type**: short
**Walkable**: yes (creates a share link)
**Topic**: Sharing a snapshot
**Persona**: Priya, a seed-stage founder who wants to send her cofounder the current cash picture
**Goal**: Get a link to the Cash page onto the clipboard.
**Preconditions**: Logged in as the demo owner. Finance agent has page "Cash" with data.
**Ideal path**: 4 — open page, options, Share, Copy.
**Alternate paths**: Full-width page `/app/pages/:botId/:pageId` has the same "Page options" menu, so the same 4 steps. Side panel via the chat header "Page" button is the other route.
#### Steps
1. Open the Finance agent chat, click "Page" in the header, select the "Cash" tab → Cash page shows metric "Monthly burn" and table "Largest vendors".
2. Click "Page options" (the ... button) → menu lists "Refresh", "Sources", "Share", "Rename", "Delete".
3. Click "Share" → dialog "Share link" opens with a read-only field (aria-label "Link for Cash") holding `{origin}/s#<token>`.
4. Read the note → "Anyone with this link can view this version until you stop sharing or for 30 days."
5. Click "Copy" → button changes to "Copied".
6. Click "Done" → dialog closes, page unchanged.
#### Variations
- Click into the link field: its text is selected (onFocus select), so Ctrl/Cmd+C also works.
- Phone width (390px): "Copy" button has a taller tap target (min-h-11).
- Repeat from the full-width route; same dialog.
#### Edge Cases
- Clipboard blocked by the browser: "Copy" stays "Copy" with no message (copy error is swallowed, CopyLinkDialog.tsx). Select the field and copy by hand.
- Defect to note: the note says "30 days" but never shows a date; the "until {date}" wording exists but the panel does not pass `expiresAt`.

### STORY-052: Open the shared link logged out and see the frozen snapshot [SHARE-02]
**Type**: medium
**Walkable**: yes (needs a logged-out browser window)
**Topic**: Sharing a snapshot
**Persona**: Marcus, an advisor with no Praci account who gets the link in a message
**Goal**: Read the numbers without signing in.
**Preconditions**: A link from STORY-051. A fresh private/incognito browser session (no cookies).
**Ideal path**: 1 — open the link.
**Alternate paths**: none found; there is no in-app way to preview the public view as the owner (an owner who is logged in sees the same page at `/s#token`).
#### Steps
1. Paste the link into a logged-out browser → brief "Loading…", no login redirect.
2. Wait for load → header "Cash snapshot" with "Shared from Praci" on the right.
3. Read the body → title "Cash", metric "Monthly burn" with its value, table "Largest vendors" with rows, footer "Snapshot YYYY-MM-DD HH:MM UTC".
4. Look for the stale metric "Cash (stale)" → it shows its last value if one was stored, otherwise "No data yet".
5. Look for "Payroll (paused)" and "Never fetched (paused)" → "Payroll (paused)" shows its last value; "Never fetched (paused)" shows "No data yet". "Outside rate (pending)" shows "Waiting for approval".
6. Check for any controls (Retry, warning dots, hover times, Sources, Refresh, edit) → none; the view is read only and has no app sidebar.
7. In the owner session, change nothing, wait for a refresh, then reload the public link → values unchanged (frozen at click time).
#### Variations
- Phone width (390px): the frame fills the screen below the header; body column is max 760px and tables scroll sideways inside their section.
- Dark OS theme: snapshot follows `prefers-color-scheme`.
- Open the link in a second tab: works; each open counts against 60 opens per minute.
#### Edge Cases
- Link typed without the `#token` (just `/s`): "This link is not available."
- Token with a character cut off in a chat app: "This link is not available."
- Compare surfaces: failure reasons ("Request timed out") and the Retry button seen on the app page do not appear in the snapshot.
- Defect to check: a stale or failed metric looks the same as a healthy one in the snapshot, with only the footer time as a hint.

### STORY-053: Stop sharing, then confirm the old link is dead [SHARE-03]
**Type**: medium
**Walkable**: yes (destructive: Stop sharing)
**Topic**: Sharing a snapshot
**Persona**: Priya, who sent the link to the wrong person
**Goal**: Cut off access.
**Preconditions**: A live link from STORY-051, still on screen in the "Share link" dialog.
**Ideal path**: 3 — Stop sharing, confirm, check the link.
**Alternate paths**: none found. Closing the dialog first loses the way back: reopening "Share" makes a new link rather than showing the old one, and the dialog opens fresh with `artifactId` of the new snapshot (see STORY-055).
#### Steps
1. In the "Share link" dialog, click "Stop sharing" → confirmation "Stop sharing this link?" with "Cancel" and "Stop sharing".
2. Click "Cancel" → confirmation closes; the "Share link" dialog is still open with the link.
3. Click "Stop sharing" again, then "Stop sharing" in the confirmation → both dialogs close; the page is as before. No toast.
4. In a logged-out window open the old link → "This link is not available."
5. Reload the app page → no sign that sharing ended or ever existed (no share badge).
#### Variations
- Escape on the confirmation closes only the confirmation.
- Keyboard: Tab to "Stop sharing", Enter, Tab to the destructive button, Enter.
#### Edge Cases
- Network error during revoke: the red error text appears inside the confirmation and the dialog stays open; "Stop sharing" can be retried. (The same error is hidden in the main dialog while the confirmation is open.)
- Defect to note: no confirmation toast after success, so the owner relies on the dialog disappearing.
- Revoke calls `artifactShares.revoke` and ends every live link of the same snapshot family, not only this token.

### STORY-054: Revoked, replaced and expired links [SHARE-04]
**Type**: short
**Walkable**: yes (needs a revoked link from STORY-053 and a replaced link from STORY-055)
**Topic**: Sharing a snapshot
**Persona**: Marcus, who bookmarked an old link
**Goal**: Find out why the link no longer works.
**Preconditions**: A link that has been revoked (STORY-053) or superseded (STORY-055).
**Ideal path**: 1 — open the link.
**Alternate paths**: none found.
#### Steps
1. Open the old link logged out → "Loading…" then a centered "This link is not available."
2. Reload → same message.
3. Look for a reason, a sign-in prompt or a way to contact the owner → none.
#### Variations
- Phone width: the message is centered on a plain page.
#### Edge Cases
- All failure causes (never existed, revoked, replaced, expired after 30 days, rate-limited) show the same copy, so a viewer cannot tell "ask for a new link" from "try again in a minute".
- Opening one link more than 60 times in a minute returns the same message (`openArtifactShare` "limited"). Not worth walking.

### STORY-055: Share again, and the earlier link stops working [SHARE-05]
**Type**: medium
**Walkable**: yes (creates a second link and revokes the first)
**Topic**: Sharing a snapshot
**Persona**: Priya, who wants fresher numbers in the link
**Goal**: Send an updated link and be sure the old one is gone.
**Preconditions**: Link A from STORY-051 already made and closed with "Done".
**Ideal path**: 3 — options, Share, copy new link.
**Alternate paths**: "Replace link" button does not exist in this flow; the code path (`url === null`) is unused by the page panel.
#### Steps
1. On the Cash page, click "Page options" then "Share" → a new "Share link" dialog with link B, different from A.
2. Click "Copy", then "Done" → "Copied", dialog closes.
3. Open link A logged out → "This link is not available." (making B ended A.)
4. Open link B logged out → "Cash snapshot" view with a newer footer time.
#### Variations
- Share "Spend" afterwards: its snapshot is a different family (name "Spend snapshot"), so the Cash link B should keep working; check this, it depends on the artifact family being per page title.
- Two owner tabs click Share at the same moment: only one link survives (advisory lock in `createArtifactShare`).
#### Edge Cases
- Defect to note: Share silently revokes the previous link with no warning. An owner who shared A with two people breaks one person's link without being told.
- The dialog gives no hint that the link already existed.

### STORY-056: Share a page with paused, failed and pending blocks [SHARE-06]
**Type**: medium
**Walkable**: yes
**Topic**: Sharing a snapshot
**Persona**: Dana, a controller who wants to share the Cash page as is, problems included
**Goal**: Understand what a viewer sees for blocks that have problems.
**Preconditions**: Seeded Cash page with "Cash (stale)" (two failures, "Request timed out"), "Payroll (paused)", "Never fetched (paused)", "Outside rate (pending)". Source status in the Sources dialog should match.
**Ideal path**: 6 — compare app page and snapshot.
**Alternate paths**: Full-width page for the compare in the app, side panel otherwise.
#### Steps
1. On the Cash page note the app view: "Cash (stale)" with the "Source failed" dot, paused blocks with "Paused" or the "Source paused" dot, "Outside rate (pending)" with "Waiting for approval".
2. Click "Page options", "Share" → "Share link" dialog opens with no warning that some blocks are failing or pending.
3. Click "Copy", "Done".
4. Open the link logged out → page renders.
5. Find "Outside rate (pending)" → "Waiting for approval", plain text, not clickable.
6. Find "Never fetched (paused)" → "No data yet" (the app says "Paused").
7. Find "Cash (stale)" → last stored value, no error mark.
#### Variations
- Approve "Outside rate" in the chat first (needs seeded approval card), re-share, and compare.
#### Edge Cases
- A viewer sees "Waiting for approval" for something they cannot approve and may think the page is broken.
- Source errors, source names' calls, URLs and key names are not in the snapshot (check by viewing page source: no "Request timed out", no URL).

### STORY-057: First-time owner shares from the side panel on a phone, with a mistake [SHARE-08 + PHONE-05]
**Type**: long
**Walkable**: yes (phone width; needs a logged-out browser window)
**Topic**: Sharing a snapshot
**Persona**: Priya, on her phone (390px) before a board call, a bit rushed
**Goal**: Share Cash, then realise she shared too early and fix it.
**Preconditions**: Logged in at 390px width. Finance agent has "Cash" and "Spend". Second logged-out browser available.
**Ideal path**: 12 — two shares plus a revoke across two pages.
**Alternate paths**: Do it on the full-width route to avoid the cramped side panel.
#### Steps
1. Open `/app/{botId}` at 390px → chat shown; header has "Page".
2. Tap "Page" → side panel (or full-screen on narrow screens) with the Cash page; tabs "Cash" and "Spend" under aria-label "Pages".
3. Tap "Page options", "Share" → "Share link" dialog.
4. Tap the field → link text is selected.
5. Tap "Copy" → "Copied".
6. Tap "Done" → back at the page.
7. Realise the burn number is wrong; tap "Page options", "Refresh" → blocks shimmer "Refreshing" and then show new values.
8. Tap "Page options", "Share" again → new link, B. Copy it.
9. Open link A in the logged-out browser → "This link is not available." (replaced).
10. Open link B → shows the refreshed numbers and a new footer time.
11. Tap the "Spend" tab, "Page options", "Share" → link C, a different snapshot; "Copy".
12. Open link B again → still works (different family), or does not; record what happens.
13. Back in the app tap "Page options", "Share" on Cash → new dialog; tap "Stop sharing" and confirm.
14. Open links B and C → B: "This link is not available."; C works.
#### Variations
- Pressing Escape on a desktop keyboard at step 3 closes the dialog; the link is gone and a new Share is needed.
- Rotate the phone to landscape: dialog still fits.
#### Edge Cases
- Closing the dialog by tapping outside before copying loses the link; there is no way to see it again, only to make a new one (which revokes the old).
- Step 13 shows that "Stop sharing" works on a freshly made link, not on an older link: the dialog never shows existing shares.
- If step 12 fails, the "one family per page title" claim in page-snapshot.ts does not hold; file a defect.
**Merge note**: Merged with PHONE-05 (Share a page snapshot from a phone). The richer story was kept; the dropped story follows in full below.

#### Merged duplicate: PHONE-05 — Share a page snapshot from a phone
**Type**: medium
**Topic**: Pages on a phone
**Persona**: Priya, sending the Cash page to her co-founder from her phone
**Goal**: Create a share link, copy it, stop sharing.
**Preconditions**: On the full-width Cash page at 390x844. Clipboard permission may prompt.
**Ideal path**: 3 — Page options, Share, copy.
**Alternate paths**: Same menu in the side panel.
**Steps**
1. Tap "Page options" → "Share" → a dialog titled "Share link" opens with the link, the line "Anyone with this link can view this version until {date}." (or "...until you stop sharing or for 30 days.") and "Links are shown once. Replacing this one stops the old link."
2. Check the URL field → the full `/s#token` link is visible or scrolls inside its field and does not stretch the dialog beyond 390px.
3. Tap the copy control → feedback that the link was copied (use the control's exact label from the dialog).
4. Tap "Replace link" → a new link replaces the old; the note says the old one stops working.
5. Tap "Stop sharing" → confirmation "Stop sharing this link?" with "Cancel" and "Stop sharing".
6. Tap "Stop sharing" → the dialog closes; reopening Share creates a fresh link.
**Variations**
- Tap "Cancel" in step 5: the link stays active.
- Open the copied `/s#token` in a new tab at 390px: a static view-only copy with no edit controls (not verified in a browser).
**Edge Cases**
- Dismiss the dialog without copying, then reopen "Share": a new link is created each time, so the first one is gone; the copy shown once matches the note "Links are shown once".
- Share error: shown as a line inside the dialog (cannot be forced with the seed).
- Share while the page has a failed source: the snapshot should carry the last good value (not verified).

## Topic: Pages on a phone

### STORY-058: Open and close the page side panel from chat on a phone [PHONE-02]
**Type**: short
**Walkable**: yes (phone width)
**Topic**: Pages on a phone
**Persona**: Marcus, a founder who asked the Finance agent for a page and wants to see it without leaving the chat
**Goal**: Use the "Page" header button, read the panel, and return to the chat.
**Preconditions**: At 390x844, open `/app/{financeBotId}` (the Finance agent). The bot has pages, so the "Page" header button is present.
**Ideal path**: 3 — tap Page, read, tap Close panel.
**Alternate paths**: Go to the full-width page via the sidebar instead (STORY-049).
#### Steps
1. Tap the document icon labelled "Page" in the chat header → the chat is replaced by a full sheet whose top bar reads "Page" with a gear and an X; the tab row (aria-label "Pages") shows "Cash", "Spend" and "Cash HTML".
2. Scroll the sheet → content scrolls inside the sheet; the sticky top bar stays.
3. Tap "Close panel" (X) → back at the chat with the composer visible.
#### Variations
- Tap the "Page" button again while the panel is open: it is covered by the sheet, so only X closes it (check whether a hardware back or swipe closes it; none is coded).
- Tap the gear ("Show settings") in the sheet: it switches to the bot's settings panel in place, and the title changes to "{name} settings". Close with X returns to chat, not to the page.
#### Edge Cases
- Look for "Open navigation" inside the sheet: it is hidden below 640px, so a phone user must close the panel first to reach the sidebar.
- The "Page" button is absent for a bot with no page. Open the Inbox agent: no "Page" button in its header.

### STORY-059: Read metrics and the table, check freshness, and retry a failed source [PHONE-03]
**Type**: medium
**Walkable**: yes (phone width; includes a Retry)
**Topic**: Pages on a phone
**Persona**: Priya, on the train, checking whether the numbers are current
**Goal**: See "Monthly burn" and "Largest vendors" fit at 390px, learn when each was fetched, and understand the stale "Cash (stale)" metric.
**Preconditions**: On `/app/pages/{financeBotId}/{cashPageId}` at 390x844.
**Ideal path**: 6 — scroll, tap a metric for time, tap the warning dot, read, Retry, read the result.
**Alternate paths**: Panel via the "Page" button shows the same blocks inside the sheet; the full-width page gives wider blocks (`px-4`, content max 5xl).
#### Steps
1. Scroll the page → blocks appear in a single column: metric cards "Monthly burn", then "Largest vendors" table, then the other metrics. No horizontal page scroll.
2. Look at the "Largest vendors" table → all columns are readable or the table scrolls inside its card; the card does not push the page wider than 390px (check column clipping).
3. Tap the "Monthly burn" card → the card takes focus (it has tabindex 0) and a muted fetch time such as "Nov 1, 3:05 PM" appears at the right of its label row. Before the tap there is no time.
4. Find the "Cash (stale)" card → its value is shown and a warning dot with aria-label "Source failed" sits at the right of the label row; its fetch time is always visible (stale blocks do not hide it).
5. Tap the warning dot (16px target) → a popover opens with the text "Request timed out" and a "Retry" button, and it stays inside the 390px viewport.
6. Tap "Retry" → the blocks show the shimmer "Refreshing", then the page data reloads. Since the seeded source is failing, the dot is expected to remain (verify).
#### Variations
- Toggle the hide-amounts preference (eye control elsewhere in the app) and revisit: dollar values in usd-format metrics and table cells are masked.
- Open "Payroll (paused)": dot has aria-label "Source paused", popover has the error text and no "Retry".
- "Never fetched (paused)": no value, no time; the placeholder reads "Paused".
- "Outside rate (pending)": the placeholder reads "Waiting for approval". On this full-width page it is an underlined button; tapping it goes to `/app/{financeBotId}`. In the side panel it is plain text.
#### Edge Cases
- The dot is a 16px button next to a 16px-high label row. Missing the dot by a finger-width taps the card instead; that is a touch-target risk to note, not a failure.
- Hover-only content: a user who never taps a fresh block never sees its fetch time.
- Tap Retry twice: the second tap should not stack two refreshes.

### STORY-060: Open the Sources dialog and manage a source on a phone [PHONE-04]
**Type**: medium
**Walkable**: yes (phone width; changes a schedule)
**Topic**: Pages on a phone
**Persona**: Marcus, who wants to pause a payroll source from his phone
**Goal**: Open "Sources", read each row, pause or resume a source, and remove one.
**Preconditions**: On the full-width Cash page at 390x844. Seeded sources include "Cash (stale)" (failed twice), "Payroll (paused)", "Never fetched (paused)", "Outside rate (pending)".
**Ideal path**: 4 — Page options, Sources, row options, Pause/Resume.
**Alternate paths**: The same menu exists in the side panel ("Page options" in the sheet). Sources cannot be created here.
#### Steps
1. Tap "Page options" in the page header → a menu opens with "Refresh", "Sources", "Share", "Rename" (no "Delete" on the full-width page).
2. Tap "Sources" → a dialog titled "Sources" opens, a skeleton of 3 rows appears briefly, then the rows.
3. Read one row, for example "Cash (stale)" → name on the first line, a muted subline (`server · tool · schedule`), last-refresh text, a badge "failed" and a "… options" button, then the error "Request timed out" on its own truncated line.
4. Tap "Payroll (paused) options" → menu: "Change schedule", "Resume" (no "Pause" because it is paused), "Remove".
5. Tap "Resume" → the badge changes from "paused" to "active-style ok/pending" (verify the exact badge; for a never-run source it may say "ok"), no error appears.
6. Open "Payroll (paused) options" again, then "Change schedule" → submenu with radios "Every 15 min", "Hourly", "Every 6 hours", "Daily", "Weekly" with the current one selected.
7. Pick "Daily" → the subline now ends with the daily schedule label.
8. Close the dialog (Escape or the close control) → back on the page; blocks reflect any status change.
#### Variations
- Use "Never fetched (paused)" "Remove": confirmation "Remove Never fetched (paused)?" with "Cancel" and "Remove". Confirming removes the row; the block using it shows "Source not found".
- Tap "Cancel" in the remove confirmation: nothing changes.
#### Edge Cases
- Row crowding: name, refresh time, badge and options button share one flex row inside a dialog about 358px wide (`PageSourcesDialog.tsx` row at the `flex items-center gap-3` div). Check whether names truncate to a few characters and whether the badge or time wraps.
- Long error text: only one truncated line is shown, with the full text in a `title` tooltip that touch devices cannot show. A phone user cannot read the whole error here; the warning-dot popover on the page is the only full-text route.
- The dialog list has no max height set in the sources code; with many sources check that the dialog scrolls and the title stays visible.
- Submenu on touch: "Change schedule" opens on tap; check it stays on screen at 390px.

### STORY-061: Switch, add and rename a page in the side panel on a phone [PHONE-06]
**Type**: medium
**Walkable**: yes (phone width; adds and renames a page)
**Topic**: Pages on a phone
**Persona**: Marcus, rearranging the Finance agent's pages
**Goal**: Switch between the three tabs, add a page, rename it with the on-screen keyboard.
**Preconditions**: Finance agent chat at 390x844, panel open via "Page".
**Ideal path**: 5 — tap tab, tap "+", type name, Enter, read.
**Alternate paths**: Full-width page cannot add or switch pages; use the sidebar for switching and the panel for adding.
#### Steps
1. Look at the tab row "Pages" → "Cash", "Spend" and "Cash HTML" tabs, the "Page options" button and the "New page" (+) button on one row. Check whether the tabs scroll sideways or squeeze the buttons.
2. Tap "Spend" → the sheet shows the metric "Spend this month"; the active tab is marked.
3. Tap "Cash HTML" → the sandboxed frame loads in a box about 70vh tall with a rounded border.
4. Tap "New page" (+) → a page titled "New page" is created and an inline field (aria-label "Page title", 60 characters max, text selected) replaces the tab row.
5. Type "Runway" and press Enter on the on-screen keyboard → the title is saved, tabs show four entries.
6. Open "Page options" → "Rename", type a longer title, tap elsewhere (blur) → renaming is cancelled without saving.
7. Open "Page options" → "Delete" → dialog "Delete Runway?" with "Cancel" and "Delete"; tap "Delete" → the page is removed and a remaining tab opens.
#### Variations
- Press Escape (external keyboard) while renaming: cancels.
- Tap into the empty new page and type: autosave runs after about 800 ms with no visible confirmation; a failed save shows "Could not save the page.".
#### Edge Cases
- On-screen keyboard covers the sheet bottom: confirm the rename field and editor stay visible.
- Blur cancels a rename. A phone user who taps "done" on the keyboard or taps away loses their edit; only Enter saves.
- Created pages are blocks pages: "New page" cannot be an HTML page.
- At 20 pages the "New page" button is disabled with no explanation (not reachable with the seed).

### STORY-062: View the HTML page "Cash HTML" on a phone [PHONE-07]
**Type**: short
**Walkable**: yes (phone width)
**Topic**: Pages on a phone
**Persona**: Priya, opening the designed cash view
**Goal**: See the HTML page render inside 390px and show current data.
**Preconditions**: Sidebar page "Cash HTML" (meta `praci-sources` cash).
**Ideal path**: 3 — open sidebar, tap row, read.
**Alternate paths**: Panel tab "Cash HTML" in the Finance chat sheet.
#### Steps
1. Tap "Open navigation" → sidebar opens.
2. Tap "Cash HTML" → full-width page, h1 "Cash HTML", then a bordered frame about 70vh high (about 590px at 844px high, at least 384px).
3. Wait for data → the frame shows the cash source value pushed by the app; no visible error text if it fails.
#### Variations
- Open "Page options": for an HTML page, "Refresh" and "Sources" show only if the page has sources.
- Scroll the page by dragging on the frame: scrolling inside the frame and scrolling the page compete; check you can still scroll past the frame.
#### Edge Cases
- The page cannot be edited from the UI (read only).
- A failed load keeps the last view with no message. On a phone a user cannot tell the data is stale (no stale marker in the frame).
- The HTML itself may not be responsive at 390px: check horizontal clipping inside the frame, which is outside Praci's control.

### STORY-063: Board-call prep, a full phone walk across pages, sources and sharing [PHONE-08]
**Type**: long
**Walkable**: yes (phone width, long; changes a schedule and creates a share link)
**Topic**: Pages on a phone
**Persona**: Priya, ten minutes before a board call, only her phone
**Goal**: Check cash, understand a stale number, fix what she can, and send a snapshot.
**Preconditions**: 390x844, owner logged in, Finance agent seed. No model available.
**Ideal path**: 14 — see steps; cannot be shorter because the pages, sources and share are in separate menus.
**Alternate paths**: Do the same from the Finance chat sheet; skip the sidebar by using the "Page" header button.
#### Steps
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
#### Variations
- Use the "Waiting for approval" link on "Outside rate (pending)" at step 6: jumps to the chat. Without a seeded approval card the chat has nothing to approve (precondition for a better walk: needs seeded approval card).
- Do steps 9 to 11 from the side-panel sheet instead.
#### Edge Cases
- Count the taps from "open the app" to "read Cash": menu, row, which is 2. To "open the Sources dialog": plus Page options, Sources, which is 4.
- Any accidental tap outside a dialog closes it; a half-done schedule change inside the submenu is lost.
- Network drops: page shows "Could not save the page." only on a failed save; read failures show a `role=alert` error line.

### STORY-064: Read a bot page in the Expo mobile app [PHONE-09]
**Type**: medium
**Walkable**: no — native app
**Topic**: Pages on a phone
**Persona**: Marcus, using the Expo app
**Goal**: Open a bot's page from the thread, switch pages, hide amounts, refresh.
**Preconditions**: Precondition: native app (not walkable in the browser). Expo app signed in to the demo stack.
**Ideal path**: 3 — thread header page item, read, pick page.
**Alternate paths**: The home index lists bot pages in the sidebar section (`sidebarBotPages`).
#### Steps
1. Open the Finance agent thread and tap the page header item → the "Page" screen opens (`apps/mobile/app/agent-page.tsx`; pushed from `thread.tsx:1055`).
2. Read the metrics → label and value cards; chart images are server-drawn SVGs.
3. Tap the page picker (label "Page") → choose "Spend".
4. Tap "Hide amounts" → usd values are masked; the control now reads "Show amounts".
5. Pull down to refresh → the refresh spinner shows and live data reloads.
#### Variations
- A pending source reads "Waiting for approval" and is not tappable (the web full-width page makes it a link).
- A failed or paused source shows only a warning icon with accessibility label "Source failed" or "Source paused".
#### Edge Cases
- The failed warning icon has no popover, error text or "Retry" button. Refresh is only by pull-down, and there is no share and no Sources control on this screen.
- Load error shows "Could not load this page."; a bot with no page shows "No page yet.".
- Chart SVG failure shows "Chart could not be drawn.".

### STORY-065: Share and stop sharing a page in the native iOS app [PHONE-10]
**Type**: short
**Walkable**: no — native app
**Topic**: Pages on a phone
**Persona**: Priya, on iPhone
**Goal**: Share a page snapshot and stop sharing it.
**Preconditions**: Precondition: native app (not walkable in the browser). iOS app signed in to the demo stack (`apps/ios/Sources/Praci/AgentPages/AgentPageScreen.swift`).
**Ideal path**: 3 — More, Share, system share sheet.
**Alternate paths**: Web "Page options" then "Share".
#### Steps
1. Open the Cash page → the navigation title reads "Cash"; blocks show label/value rows and tables.
2. Tap the "More" menu (ellipsis, accessibility id `pageMore`) → items: a "Page" picker (only with 2 or more pages), "Share".
3. Tap "Share" → a link is created and the system share sheet opens.
4. Reopen "More" → "Stop sharing" now appears.
5. Tap "Stop sharing" → confirmation dialog "Stop sharing this link?" with "Stop sharing" and "Cancel"; confirm.
#### Variations
- A source failure shows a warning icon; tapping it shows the error and a "Retry" button (iOS has Retry, Expo does not).
- A bot with no page shows "No page yet" with a primary "Open chat" button.
#### Edge Cases
- An error shows an alert titled "Something went wrong" with "OK".
- "Waiting for approval" is plain text; there is no link to the approval card.
- HTML pages use the sandboxed web view, filling to the bottom edge.

## Redundancy Candidates

Built from the Alternate paths fields and the multi-surface notes in the topic files. Each item says what is duplicated, and what a walker should look at.

| Kind | Item | Description |
|---|---|---|
| Duplicate paths | Open a page | Three routes reach the same page: the sidebar row (full-width, `/app/pages/:botId/:pageId`), the chat header "Page" button (side panel, no URL change), and the "Waiting for approval" link in reverse. The side panel has tabs, "New page" and "Delete"; the full-width route has none. Same content, different capabilities. See STORY-001, STORY-046, STORY-044, STORY-058. |
| Duplicate paths | Rename | "Rename" exists in the "Page options" menu on both surfaces. The sidebar row does not update after a rename (stale until reload, per STORY-045). See STORY-003, STORY-045. |
| Duplicate paths | Refresh | "Refresh" in Page options and "Retry" in a failed dot's popover both call `pages.refresh` for the whole page. Retry reads as per-block but is page-wide. See STORY-013, STORY-010. |
| Duplicate paths | Removing things | Three actions that sound alike remove different things: "Remove from sidebar" (row only), "Delete" (the page), "Delete block" / "Delete chart" (one block; two labels for the same X button). "Show in sidebar" in the group menu only hides a row. See STORY-043, STORY-004, STORY-015. |
| Duplicate paths | Add page vs New page | The sidebar "Add page" adds an existing page to the sidebar; the side panel "New page" creates a page. Similar names, different effects, and the panel button only exists after a first page exists. See STORY-042, STORY-002, STORY-007. |
| Duplicate paths | Resume / Retry for a stuck source | Recovery for a failed source is split: Retry (dot), Refresh (menu), Resume (Sources dialog), or ask the bot. The failed dot has Retry but the Sources dialog row for a failed active source has no retry. See STORY-020, STORY-022, STORY-010. |
| Duplicate paths | Share dialog exits | "Done", Escape, and click-outside all close the Share dialog and lose the link; "Stop sharing" is only reachable inside that same dialog, and reopening Share makes a new link. See STORY-053, STORY-055, STORY-057. |
| Duplicate information | Source health | A source problem shows in four places: the warning dot and popover on the block, the badge and error line in the Sources dialog, the bot thread message (scheduler only), and nothing at all on HTML pages except the dialog. See STORY-022, STORY-024, STORY-038. |
| Duplicate information | Freshness | Time of last fetch appears on hover/focus per block, as "last refresh" in the Sources dialog, and as the "Snapshot YYYY-MM-DD HH:MM UTC" footer in a shared copy. Older fetches show only month and day. See STORY-009, STORY-017, STORY-052. |
| Duplicate information | Pending approval | An unapproved source shows in the "Waiting for approval" placeholder, the "pending" badge in Sources, a thread card, a sticky toast and notification, and the unread marker. Only the card can act. See STORY-027, STORY-029, STORY-034. |
| Duplicate information | Denied state wording | "Not now" (card), "Not approved" (page) and "denied" (Sources badge) all name one state, and it is permanent until the bot changes the call. See STORY-026. |
| Duplicate information | Page content on every surface | The same page appears in the sidebar, side panel, full-width route, Expo `/agent-page`, native iOS, and the public `/s#token` snapshot, each with different controls (Sources and Retry on web only; Share on web and iOS, not Expo). See STORY-064, STORY-065, STORY-052. |
| Overlapping features | Hide amounts | One account-menu switch masks usd metrics and table cells but hides charts entirely and does not touch HTML pages; the page has no on-page toggle. See STORY-012, STORY-041. |
| Overlapping features | Story overlap | Long walks repeat shorter ones: STORY-016, STORY-050, STORY-063, STORY-041 and STORY-057 re-walk read, retry, sources and share steps from STORY-009, STORY-010, STORY-017 and STORY-051. Walk the long ones for flow friction and the short ones for exact copy. |
| Overlapping features | Sources dialog vs bot | The dialog changes schedule, pauses, resumes and removes; the bot creates and edits calls. A user looking for "Add source" finds nothing (STORY-017, STORY-023). |

## Code-read defects to confirm

Merged from the defect lists at the end of the approvals, html-pages and live-blocks topic files, plus defect candidates written inline in the sharing, sidebar-navigation, sources and pages-management stories. All are predictions from code reading; confirm each in the browser before filing.

| # | file:line | Defect candidate | Stories that expose it |
|---|---|---|---|
| D1 | `apps/web/src/pages/shell/transcript.tsx:2015` | A pending page-source card can never show "No longer active" (`canAnswer` forced true when `block.pageSource` is set). A stale card A looks as live as the current card B and is only closed after a click, as "Replaced by a newer request" or "Expired", with CONFLICT (apps/api/src/router.ts:3595). | STORY-028, STORY-030 |
| D2 | `apps/web/src/pages/BotPageView.tsx:19, apps/web/src/components/pages/PageLiveBlocks.tsx:103` | "Waiting for approval" is a link only on the full-width route. In the side panel and in the Sources dialog (badge "pending") there is no way to the card. The link goes to `/app/{botId}` with no scroll to or highlight of the card. | STORY-029, STORY-034, STORY-011 |
| D3 | `packages/adapters/src/page-sources.ts:1131` | `needsCard` is false when only the schedule changes, and a lost card is never re-posted, so a pending source without a card cannot be approved from the UI. | STORY-034 |
| D4 | `packages/adapters/src/page-source-approval.ts (card text) and apps/api/src/router.ts:3584-3603` | A schedule change on a pending source keeps the old card text ("every hour") and approving applies the new schedule. The card is not rewritten. | STORY-028 |
| D5 | `apps/api/src/router.ts:3584-3603` | "Not now" is a permanent refusal (source `denied` until the bot changes the call), yet reads as postponing. Three labels for one state: "Not now", "Not approved", "denied". | STORY-026, STORY-031 |
| D6 | `apps/api/src/router.ts:3584-3603` | Allow reports success even if the one-time refresh fails; the failure shows only later as the warning dot and in Sources. | STORY-025 |
| D7 | `apps/web/src/components/pages/HtmlPageView.tsx:52, :62` | A failed `pages.get`, `pages.data` or `pages.refresh` is swallowed with no message. The frame shows old data or stays blank (line 62 returns null, no loading state), and Refresh gives no feedback. | STORY-036, STORY-038, STORY-041 |
| D8 | `apps/web/src/components/SandboxedHtmlViewer.tsx:144-147, :173` | Only the email path calls `maskAmounts`. `useHideAmounts()` re-renders HTML pages but their text is not masked, so Hide amounts does not apply to an HTML page. | STORY-041, STORY-012 |
| D9 | `apps/web/src/pages/shell/bot-page-panel.tsx:555` | `hasSources` is one flag for all tabs, updated only on a successful load, so Refresh and Sources can be wrong after a tab switch or failed load. | STORY-001, STORY-035 |
| D10 | `apps/web/src/pages/shell/bot-page-panel.tsx:557, :801-809` | The share link dialog is held only in memory and gets no `expiresAt` or `onReplace`. After it closes, the share cannot be revoked from the page, "Replace link" never appears, and Share on a page makes a new link every time it is opened (silently revoking the one already sent). | STORY-053, STORY-055, STORY-057, STORY-050 |
| D11 | `apps/web/src/pages/shell/bot-page-panel.tsx:581 (and :569-571)` | An unknown page id at full-width silently redirects to `/app` with no message; a deleted page leaves a dead sidebar row followed by that silent redirect (SidebarPages.tsx:56-64). | STORY-048, STORY-037 |
| D12 | `apps/web/src/components/SidebarPages.tsx:56-64` | The sidebar list loads once on mount and again only after its own add or remove. A rename does not update the sidebar title until reload. | STORY-045, STORY-003 |
| D13 | `apps/web/src/pages/shell/bot-page-panel.tsx:58-66 (`LiveDelete`)` | The "Delete block" X is `opacity-0` until hover or keyboard focus, so a touch user at phone width never sees it. It also deletes with no confirmation. | STORY-015 |
| D14 | `apps/web/src/components/pages/PageLiveBlocks.tsx:217, :178-205` | Masking depends on `format: usd`. A table with no `columns`, or a number column with another format, is never masked. | STORY-012 |
| D15 | `apps/web/src/pages/shell/message-cards.tsx:293-303` | Hide amounts hides every chart entirely, including charts with no money, with a one-line notice. Pages have no "Amounts hidden · Show" control, unlike finance pages. | STORY-012, STORY-014 |
| D16 | `apps/web/src/components/pages/PageLiveBlocks.tsx:231-233` | A source-backed chart with status paused, failed or empty always counts as having a value and silently draws the fallback data from the fence. | STORY-014 |
| D17 | `apps/web/src/components/pages/PageLiveBlocks.tsx:139` | "Retry" is not disabled while a refresh runs and the popover is not closed by it. A Retry within 60 seconds of the last success does nothing and gives no hint. | STORY-010, STORY-059 |
| D18 | `apps/web/src/lib/mail-time.ts` | An older fetch shows only month and day ("Oct 30") with no time of day. | STORY-009 |
| D19 | `apps/api/src/router.ts:4499-4520 vs docs/agent-pages/live-pages.md` | The spec says refresh is limited to once a minute per page; the handler applies no such limit (only sources with last success older than 60 seconds are refreshed). | STORY-013 |
| D20 | `packages/adapters/src/page-source-tick.ts:79 vs apps/api/src/router.ts:4499` | Manual Retry three or more times can reach 5 failures and pause a source, but the bot thread message is posted only by the scheduler tick, so the bot is never told. | STORY-022 |
| D21 | `packages/adapters/src/page-source-tick.ts, apps/web/src/components/pages/PageSourcesDialog.tsx` | Resume does not clear the stored last error, so a just-resumed source can still read "failed". The popover on a paused source with no error is empty. The auto-pause shows nowhere but the small dot (no sentence on the page, no notification). | STORY-020, STORY-022 |
| D22 | `apps/web/src/components/SandboxedHtmlViewer.tsx, apps/web/src/components/pages/PageSourcesDialog.tsx` | An HTML page has no failed or paused indicator at all; the Sources dialog is the only place a user learns a source is broken. Removing a source leaves the frame with its last values or nothing, with no "Source not found" text. | STORY-024, STORY-021, STORY-038 |
| D23 | `apps/web/src/components/ArtifactShareDialog.tsx` | The note says "30 days" but never shows a date. No confirmation toast after Stop sharing; a stale or failed metric looks healthy in the snapshot, with only the footer time as a hint. | STORY-051, STORY-052, STORY-053, STORY-056 |
| D24 | `apps/web/src/pages/shell/bot-page-panel.tsx (pages empty state)` | Nothing in the UI says pages come from the bot, and the panel's "New page" is reachable only after a first page exists. A bot whose only page was removed through the API may keep the "Page" button until reload (unverified). | STORY-007 |

Line numbers are as quoted in the topic files; the file may have moved since. Items D21 to D24 were written without exact line numbers in the topic files.

## Gaps & Recommendations

1. **Only one approval card is seeded.** Allow and Not now cannot both be walked, and the re-approval stories (STORY-028, STORY-031) and the mcp card (STORY-032) cannot be walked at all. Recommend seeding two extra cards (one mcp, one superseded pair) or running a second demo slot for the Not now path.
2. **No model in the demo.** Everything that needs the bot (first page, creating or fixing sources, page_* tools) is untested here. Recommend one recorded manual run with a model, or a scripted bot action that calls the page_source_set tool directly.
3. **Native apps have no walker.** STORY-064 and STORY-065 need the Expo and iOS apps. Mobile and iOS pending blocks are not clickable, and Expo has no Retry.
4. **Scheduler steps are not walkable by hand.** STORY-022 needs a running worker. Recommend a way to trigger `pages.refresh.tick` for a source in the demo.
5. **HTML pages have thin coverage of failure.** The seeded HTML page has no failing source, so STORY-038 compares page types only. Recommend an HTML page whose meta names "Cash (stale)".
6. **Redundant recovery and removal vocabulary** (see Redundancy Candidates) is the largest UX finding so far: three labels for the denied state, four places for source health, three removal actions.
7. **Features without stories:** GTM block Move up and Move down, the "Team health" template in Add page, the keyboard shortcut for the sidebar, expiry of share links, and the rail/collapsed sidebar mode.
8. **Seeded names differ between topic files.** The topic files call the pending source "Outside rate (pending)"; the demo seed names it "outside" with the card "Read api.example.test every hour?". Walkers should match by position (the only pending block on Cash).

## Walk order

One shared browser session, one demo stack, signed in as the demo owner. The order puts read-only stories first and state-changing stories last. Desktop width is 1280 px unless a phase says phone width (390 x 844); resize once per phase, not per story. A second logged-out browser window is needed from phase 4.

**The single seeded approval card** is consumed by the first story that answers it. Plan: answer it in STORY-025 (Allow). Stories STORY-027, STORY-029, STORY-033, STORY-011, STORY-016 and STORY-050 must stop before answering. STORY-026 (Not now) needs a fresh demo stack and is listed as optional. After the card is answered, the "Waiting for approval" placeholder is gone for good.

### Phase 1: read-only, desktop

1. STORY-001 [PAGES-01] Find the page tabs from the Finance agent chat
2. STORY-007 [PAGES-07] The first-page quirk, an empty bot — steps 1-3 only
3. STORY-008 [BLOCKS-01] Read the Cash page numbers before a board call
4. STORY-009 [BLOCKS-02] Find out how fresh a number is, by mouse and by keyboard
5. STORY-011 [BLOCKS-04] Understand blocks that cannot show a number (paused, pending, never fetched) — stop at the link, do not answer
6. STORY-014 [BLOCKS-07] Read a history chart and a source-backed chart
7. STORY-017 [SOURCES-01] Priya opens the Sources dialog and reads every row
8. STORY-024 [SOURCES-10] Same sources on the HTML page and on a phone
9. STORY-035 [HTML-01] Open the Cash HTML page from the chat side panel
10. STORY-037 [HTML-03] Open the HTML page full-width from the sidebar
11. STORY-038 [HTML-05] A source fails and the HTML page has to tell the user
12. STORY-044 [NAV-03] Read the full-width page header and options menu
13. STORY-046 [NAV-05] Move between the side panel and the full-width page
14. STORY-034 [APPROVE-10] Empty and absent states: no card, no pending source
15. STORY-030 [APPROVE-06] Open an approval card in a thread that no longer allows answers
16. STORY-029 [APPROVE-05] Page shows "Waiting for approval", user follows the link to the chat — steps 1-2 only
17. STORY-027 [APPROVE-03] Find the approval card when the owner is somewhere else in the app — steps 1-3, do not answer

### Phase 2: read-only, phone width (390 x 844)

18. STORY-049 [NAV-08] Open a sidebar page on a phone
19. STORY-058 [PHONE-02] Open and close the page side panel from chat on a phone
20. STORY-062 [PHONE-07] View the HTML page "Cash HTML" on a phone
21. STORY-033 [APPROVE-09] Approval flow on a phone-width screen — stop before Allow

### Phase 3: light changes, desktop (preferences, refresh, retry, rename, schedule)

22. STORY-012 [BLOCKS-05] Hide amounts and see which figures are masked
23. STORY-047 [NAV-06] Collapse the Pages group and hide the sidebar
24. STORY-016 [BLOCKS-09] Monday board-prep check of the whole Cash page — do not answer the card at step 21
25. STORY-010 [BLOCKS-03] A stale number with a warning dot, and Retry
26. STORY-013 [BLOCKS-06] Refresh the whole page by hand
27. STORY-036 [HTML-02] Page data reaches the frame and is refreshed on demand
28. STORY-040 [HTML-07] The page changes while the user is looking at it
29. STORY-018 [SOURCES-02] Slow down a source by changing its schedule
30. STORY-045 [NAV-04] Rename a page on the full-width route and check the sidebar — rename back afterwards
31. STORY-002 [PAGES-02] Add a second page and name it — keep the new page for PAGES-03, PAGES-06, PAGES-04
32. STORY-003 [PAGES-03] Rename a page and hit a duplicate name — on the new page; rename back
33. STORY-006 [PAGES-06] Edit a page, autosave and the conflict banner — on the new page; second tab for conflict

### Phase 3b: light changes, phone width

34. STORY-059 [PHONE-03] Read metrics and the table, check freshness, and retry a failed source
35. STORY-060 [PHONE-04] Open the Sources dialog and manage a source on a phone
36. STORY-061 [PHONE-06] Switch, add and rename a page in the side panel on a phone

### Phase 4: share links (desktop, then phone; needs a logged-out window)

37. STORY-051 [SHARE-01] Share the Cash page and copy the link
38. STORY-052 [SHARE-02] Open the shared link logged out and see the frozen snapshot
39. STORY-056 [SHARE-06] Share a page with paused, failed and pending blocks
40. STORY-039 [HTML-06] Share a snapshot of the HTML page and open it logged out
41. STORY-041 [HTML-08] Long walk across surfaces, sandbox and hide-amounts
42. STORY-057 [SHARE-08] First-time owner shares from the side panel on a phone, with a mistake
43. STORY-063 [PHONE-08] Board-call prep, a full phone walk across pages, sources and sharing
44. STORY-055 [SHARE-05] Share again, and the earlier link stops working

### Phase 5: source state changes (desktop)

45. STORY-019 [SOURCES-03] Pause a source and see the block say "Paused"
46. STORY-020 [SOURCES-04] Resume a source that was paused after failures — resume a different paused source than NAV-09 will use
47. STORY-022 [SOURCES-07] Repeated failures pause a source and the bot is told — manual Retry route; scheduler steps not walkable
48. STORY-050 [NAV-09] Founder's Monday cash review, from sidebar to shared snapshot — do not answer the card at step 11; resumes a paused source and shares

### Phase 6: answer the approval card

49. STORY-025 [APPROVE-01] Allow a pending API source from the chat card — CONSUMES the card (Allow)
50. STORY-026 [APPROVE-02] Decline with "Not now" and see what the page shows — optional; fresh demo stack only (card already used)

### Phase 7: destructive, last

51. STORY-021 [SOURCES-05] Remove a source after a second thought — after BLOCKS-07 and NAV-09
52. STORY-015 [BLOCKS-08] Delete a live block, and the phone problem — throwaway page only
53. STORY-053 [SHARE-03] Stop sharing, then confirm the old link is dead — stops sharing
54. STORY-054 [SHARE-04] Revoked, replaced and expired links — needs revoked and replaced links
55. STORY-004 [PAGES-04] Delete a page, and what is not offered — throwaway page only
56. STORY-048 [NAV-07] A page is deleted while it is still in the sidebar — creates then deletes a throwaway page
57. STORY-043 [NAV-02] Remove the page you are viewing from the sidebar — then run NAV-01
58. STORY-042 [NAV-01] Re-add a page with the "Add page" menu — restores Spend to the sidebar
59. STORY-005 [PAGES-05] Reach the 20-page cap — leaves 20 pages; very last

**Walk order length**: 59 stories (all 59 walkable stories, each once). Not in the order: STORY-023, STORY-028, STORY-031, STORY-032 (bot action) and STORY-064, STORY-065 (native app).

**Stories that consume or depend on the single approval card**

- Consumes it: STORY-025 (Allow). STORY-026, STORY-027, STORY-029, STORY-033 would also consume it if they answered; in this order they stop first or run on a fresh stack.
- Reads it without answering: STORY-011, STORY-016, STORY-050, STORY-030.
- Depends on it still being pending: STORY-034, STORY-029, STORY-011, STORY-016, STORY-050, STORY-017 (pending badge), STORY-056 (pending block in the snapshot).

