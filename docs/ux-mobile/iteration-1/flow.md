# Phone UX flow critique, group FLOW (iteration 1)

Method: /ux-flow, applied to the phone catalog (`docs/ux-mobile/catalog.md`) and the code at `origin/main` 4ee112806. Evidence is code reading only. No browser session was run for this file, so every finding is marked suspected (S) unless the code states it outright (C = confirmed in code). Walkers' screenshots should confirm the S items. Decisions in `docs/ux-flow/report.md` and the owner decisions in the shared rules are not re-raised.

Paths are under `apps/web/src/` unless noted.

## Summary

The main phone problem is not any single page. It is that each table page builds its own filter row from desktop chips (`PickFilter`, `SearchField`, `SortControl` in `components/ListControls.tsx`), and a phone has no room for them. One shared filter and sort bottom sheet would fix about nine pages at once. The second problem is the same fact shown in several places: to-dos (three places), approvals (four), routines (no home page of their own), Company calendar (a second calendar). The third is the wide-table and tab-bar items from the code audit, where a phone-only layout is clearer than squeezing the desktop one.

## Already good (do not touch)

- `PickFilter` shows the active choice in the pill and offers a clear action; the content is right, only the container is wrong on a phone (`ListControls.tsx:97-170`).
- Finance, Investors section tabs and Legal view tabs already use `max-w-full` tabs (`Investors.tsx:1272`, `Legal.tsx:513`).
- Inbox rows swap hover actions for an overflow menu under `pointer-coarse` (`components/inbox/InboxRow.tsx`).
- Activity puts "Needs you" first and folds finished runs (`pages/ActivityList.tsx:258-300`). That ordering is right for a phone.

## Findings

### FLOW-01: One filter and sort sheet for every table (replace chip rows on phones)
- Stories: MOB-TBL-*, MOB-CAL-02, MOB-CON-*, MOB-INV-*, MOB-COM-*, MOB-DEV-01, MOB-DRM-*, MOB-FIN-*.
- Severity: P1. Category: flow. Status: S for the wrapping, C for the usage.
- What happens: `PickFilter` is used on Calendar (2), Contacts, Company, Artifacts (3), Activity, Investors, Holdings, Data room (5), Finance (2). Each page lays out search plus 1-5 pills, plus a sort control, in a wrapping row. Calendar has a four-button view row, then a second row of search, Kind and Bot (`pages/Calendar.tsx:630-690`). Investors Contacts wraps to three lines (catalog audit item 6). Each pill opens its own small dropdown, so combining three filters costs six taps and the result is spread over several lines.
- Expected: below the `sm` breakpoint, every list page shows a single row: search field plus one "Filter" button with a count badge. The button opens one bottom sheet with every filter as a labelled radio list, a Sort section, a Clear all and a Done button. Active filters appear as removable chips in one scrolling line under the row. Desktop keeps the current pills.
- Fix: add one `FilterSheet` to `packages/ui-web` (shadcn Drawer or Sheet on Base UI) that takes the same `[value, label][]` option lists as `PickFilter` and `SortControl`, and have `ListControls.tsx` render it under `useIsMobile`. Pages do not change.
- Saves: 9 pages, 2-5 rows of chrome each, about 3 taps per combined filter.

### FLOW-02: Card list instead of wide tables on phones (Company, Contacts, Holdings, approvals)
- Stories: MOB-COM-*, MOB-CON-*, MOB-INV-*, MOB-UNA-*.
- Severity: P1. Category: flow. Status: C for the hidden columns, S for the look.
- What happens: tables hide columns on phones, which removes the sort handles for them: Contacts hides email and org headers (`pages/Contacts.tsx:201,205`), Holdings hides Shares and Invested below `@lg` so sorting by Invested is impossible (`components/cap-table/HoldingsTable.tsx:150-160`), Company keeps four columns with no hiding (`pages/Company.tsx:163-207`), the approvals table puts a Allow/Ask/Block select in a right-hand cell (`components/ApprovalActionsTable.tsx:79-104`).
- Expected: one `RowCard` pattern for phones: title and primary value on line one, two quiet facts on line two, the whole card one tap target, and the current sort key always shown as a fact. Sort moves into the sheet from FLOW-01, so a hidden column can still be a sort key. For the approvals table, each row becomes a label with the select under it at full width.
- Fix: a `ResponsiveTable` helper that renders `<Table>` at `md:` and a list of cards below, fed by the same column definitions (title, subtitle, trailing value) already defined per page.
- Saves: no sideways scrolling and no lost sort keys on four pages.

### FLOW-03: Scrolling tab bar for six-tab and four-tab pages (Company)
- Stories: MOB-COM-01, MOB-INV-01.
- Severity: P1. Category: visual. Status: C (code), S (rendering).
- What happens: Company has six tabs in a `w-fit inline-flex` list of about 560 px (`pages/Company.tsx:261-281`, `packages/ui-web/src/components/ui/tabs.tsx:18`), so on a 390 px screen it overflows with no scroll rule. Investors and Legal already add `max-w-full`.
- Expected: `TabsList` gets `overflow-x-auto` plus hidden scrollbar and edge fade as its phone behaviour, so every tab bar in the app (28 `TabsList` uses) scrolls instead of clipping, and the active tab scrolls into view on load and on selection.
- Fix: change the shared `TabsList` variants in `packages/ui-web/src/components/ui/tabs.tsx` once, not per page. Also drop the count text from Review's label on phones in favour of a small badge (`Company.tsx:279`).
- Saves: one fix covers Company, Investors, Legal, Finance, Data room.

### FLOW-04: Company has its own Calendar tab; the app has a Calendar page
- Stories: MOB-COM-*, MOB-CAL-*.
- Severity: P1. Category: flow. Status: C.
- What happens: `pages/Company.tsx:274` shows a Calendar tab backed by `CompanyCalendar` (its own month and agenda views, its own month stepper and a anniversaries toggle, `CompanyCalendar.tsx:15-40`). `/app/calendar` is a second calendar with Day, Week, Month and Schedule. On a phone Maya sees two items called Calendar, one in the drawer and one as a tab, with different controls and different data.
- Expected: one calendar. Company dates (funding, filings, anniversaries) become a Kind in the Calendar page (the page already has a Kind filter with Routines, To-dos etc., `Calendar.tsx:48-50`), and the Company tab is removed. This also takes a tab off the six-tab bar in FLOW-03.
- Fix: feed `rpc.company.calendar` items into the Calendar page as a new kind; delete the tab. If the owner wants it kept, rename the tab to "Dates" so the two names differ.
- Saves: one screen, one stepper, one set of controls to learn.

### FLOW-05: To-dos are shown in three places and the Calendar copy does double work
- Stories: MOB-CAL-05, MOB-MAIL-*, MOB-UNA-*.
- Severity: P1. Category: flow. Status: C.
- What happens: `BotTodos` (bot to-dos the person must do) renders at the top of Calendar (`Calendar.tsx:709`) and in the Inbox Important pile (`Inbox.tsx:1812`). Activity lists the same items again as "Waiting on you" (`ActivityList.tsx:265`, `WaitingRow`). Inbox also has its own `TodoCard` for mail to-dos (`Inbox.tsx:1170`). The Calendar list uses `hideDueBetween` to avoid showing an item twice on the same screen, which shows the duplication is known. The Calendar tick box has no touch size (`BotTodos.tsx:62-67`, catalog audit item 9) while `TodoCard.tsx:118` has one.
- Expected: Activity "Waiting on you" is the one list of everything that needs her (it is already first). Calendar shows to-dos only as dated items on the grid (they are a Kind already), with no block above the grid, so the first screen on a phone is the grid, not a list. Inbox keeps mail to-dos only (it knows the thread). Anything undated that someone shows on Calendar is not needed there.
- Fix: remove `<BotTodos>` from `Calendar.tsx:709`; keep it in Inbox Important only if a walker finds users do not find Activity; share one tick-box size with `TodoCard`.
- Saves: about one block per screen on two pages and one duplicate list.

### FLOW-06: Approvals live in four places with different shapes
- Stories: MOB-UNA-01..09.
- Severity: P1. Category: flow. Status: C for the four surfaces, S for confusion.
- What happens: an approval can be answered in the toast (decided: persists above the composer), as a card in the transcript (`pages/shell/transcript.tsx:1923`, `components/MailApprovalCard.tsx`), as a row in Activity "Needs you", and its standing rule is set in two tables: per bot (`pages/shell/bot-panel.tsx:721`) and global (`components/ApprovalRulesSettings.tsx:67` in Settings, `AccountSettingsOverlay.tsx:366`). The same `ApprovalActionsTable` is mounted twice with a different scope, and the per-bot select has a long "Same as all bots" option (catalog audit item 10).
- Expected (the toast decision stands): answering a request has two homes, the card where it was asked and Activity. The toast should open that card (no second set of Allow/Deny buttons if the card is on screen). Standing rules have two homes, so on a phone present one page: "Approval rules", with a bot picker at the top ("All bots" first), rather than a table in Settings and another table inside each bot's panel.
- Fix: replace the in-bot-panel table with one link row "Approval rules for this bot", which opens the Settings page with the bot preselected; render the select full width under its label (see FLOW-02).
- Saves: one fewer table on the bot panel, one fewer concept to learn.

### FLOW-07: Routines have no page and are reachable from many places
- Stories: MOB-UNA-02, MOB-UNA-03, MOB-CAL-02.
- Severity: P2. Category: flow. Status: C for the entry points, S for the effort.
- What happens: routine state is kept in `Shell.tsx` (list, draft, editing, delete target, lines 766-1035), opened from a bot (`bot-panel.tsx`), from search hits (`Shell.tsx:581`, `?routine=`), shown as a Kind on Calendar, and as runs in Activity. The editor is a 1192-line page with no breakpoints (audit item 11), including a custom 40x22 toggle and a popover for schedule. A phone user who wants to see "what runs on its own" has four starting points and no list.
- Expected: Activity is the canonical place for runs (keep), the bot's page is the canonical place for editing (keep), Calendar shows them read only and its item opens the bot's routine. State which is canonical in the code and remove the extra entry from search results on phones if it duplicates a bot link. On a phone, the editor should be a full-screen sheet with one section per screen step (When, What, Quiet or check in) rather than one long form.
- Fix: split the editor into step sections for `useIsMobile`; use the standard `Switch` from `packages/ui-web` instead of the custom 40x22 toggle at `RoutineEditor.tsx:533`.
- Saves: one concept with one edit surface.

### FLOW-08: Email Context panel should be a bottom sheet, not a full-screen overlay
- Stories: MOB-MAIL-*.
- Severity: P1. Category: flow. Status: C for the overlay, S for the effect.
- What happens: below `md` the panel is a full-screen overlay when writing (`components/ComposeEmail.tsx:950`) and a `w-full max-w-[384px]` panel covering the message when reading (`components/inbox/InboxMessageDialog.tsx:698`). Context rows are `py-1` with hover styling only and no touch size (`components/inbox/ContextPanel.tsx:31`). Maya cannot see her draft and the context together, and returning costs a close tap.
- Expected: a bottom sheet at about 60% height, with a drag handle, 44 px rows, tapping a row shows or inserts it, and the draft visible above. Same sheet for the contact page "related mail, meetings, documents" blocks if they share the component.
- Fix: render `ContextPanel` inside the shared Drawer from `packages/ui-web` below `md`, keep the side panel at `md:`.
- Saves: removes the one remaining "cannot read and write at once" conflict.

### FLOW-09: Contact page and Context panel show the same related items
- Stories: MOB-CON-*, MOB-MAIL-*.
- Severity: P2. Category: flow. Status: S (not compared on screen).
- What happens: `ContactDetail.tsx` shows related mail, meetings and documents, and `inbox/ContextPanel.tsx` shows the same kinds of items for the person on the mail. On a phone both are full screens.
- Expected: one `RelatedItems` component used by both, with the Context panel's first row being "Open Sam's page" so there is one canonical place to go deeper. Do not add a third surface for Investors.
- Fix: extract the list rows into one component under `components/`, and link from the panel header to `/app/contacts/<id>`.
- Saves: one component, one set of touch sizes.

### FLOW-10: The drawer lists 12 pages, Activity, Search and Create at the same level
- Stories: MOB-SHL-01..04.
- Severity: P2. Category: flow. Status: C for the list, S for the effect on a phone.
- What happens: `pages/shell/space-sidebar.tsx:807-818` lists Inbox, Finance, Legal, GTM, (Devin), Investors, Fundraising, Company, Calendar, Contacts, Data room, Artifacts in one flat Pages group, above Page agents and chats, with Activity, Search and Create as icons in the header (`:649-722`). On a phone the drawer is the only navigation, and Maya must scroll past 11 equal items to reach her chats.
- Expected: keep the user-hideable list but give the phone drawer three tiers: (1) today: Inbox, Calendar, Activity (what needs her); (2) chats and page agents; (3) "More pages" collapsed: Finance, Legal, GTM, Investors, Fundraising, Company, Contacts, Data room, Artifacts. Fundraising and Investors are two pages in one money area; consider one "Investors" page with Fundraising as a tab (the Investors page already has section tabs, `Investors.tsx:1272`).
- Fix: on `useIsMobile`, default the Pages group collapsed except the first three; the collapse state already exists (`collapsedSidebarSections`, `:803`). Merging Investors and Fundraising is a product call, listed here as a question.
- Saves: about 9 rows of scrolling in the most-used surface.

### FLOW-11: Activity is a nav icon and a page; "Waiting on you" repeats what Calendar and Inbox show (see FLOW-05) and its rows are under touch size
- Stories: MOB-UNA-05, MOB-UNA-06.
- Severity: P2. Category: a11y. Status: C.
- What happens: rows use `py-[9px]` (`ActivityList.tsx:480-531`), a `max-w-[40%]` bot label, and the file has no breakpoints. It is the canonical list per FLOW-05, so it matters most.
- Expected: rows at least 44 px high under `pointer-coarse`, bot label under the title instead of beside it, and the "Show # finished runs" button (`h-7`, `:282`) at touch size.
- Fix: add `pointer-coarse:` min heights to `ActivityRow`/`WaitingRow`; move the bot label to line two on phones.
- Saves: no steps, fewer mis-taps.

### FLOW-12: Calendar header spends two rows of controls before the first event
- Stories: MOB-CAL-01, MOB-CAL-02.
- Severity: P2. Category: flow. Status: S.
- What happens: row one: Today, prev, next, title, four view buttons; row two: search, Kind, Bot (`Calendar.tsx:630-690`). With text buttons the title is squeezed. Week view has `min-w-[40rem]` (`:527`).
- Expected on a phone: Day, Schedule and Month only (Week is too wide for a phone; Schedule is the phone default). Use a `Select` or a three-segment control for the view, the title and prev/next on their own row, and the search and filters folded into the FLOW-01 sheet. Month view shows dots, and tapping a day opens its agenda, instead of 80-px cells with truncated chips (`:450`).
- Fix: on `useIsMobile`, hide Week and render Month cells as dot indicators with a day agenda beneath.
- Saves: two rows and a sideways scroll area.

### FLOW-13: Data room: hover-only tile menu, folder column that cannot narrow
- Stories: MOB-DRM-*.
- Severity: P2. Category: flow. Status: C for code, S for effect.
- What happens: the folder tree has a 180 px minimum at every width and a 7 px drag handle (`components/data-room/ResizableFolders.tsx:6,74,85`, `pages/DataRoom.tsx:849`); tile menus show on hover (`ItemRows.tsx:193,377,483`, fallbacks in code need checking on a real coarse pointer); the filter bar has fixed `w-40` inputs (`FilterBar.tsx:167,177`) and five `PickFilter`s.
- Expected: folders become a "Folder: All files" button that opens a sheet with the tree (the same bottom sheet pattern), the list takes the full width, the tile menu is always a visible "..." button, and filters go in FLOW-01's sheet.
- Fix: `useIsMobile` branch in `DataRoom.tsx` that renders the tree inside the shared Drawer; drop the resizable handle on phones.
- Saves: about 180 px of width.

### FLOW-14: Credentials, teach and share dialogs: desktop forms on a phone
- Stories: MOB-UNA-07..09.
- Severity: P2. Category: flow. Status: C for missing breakpoints.
- What happens: `pages/shell/bot-credentials.tsx:263-385` uses 12-13 px text and small buttons; `ArtifactShareDialog.tsx:20-72` and `PasskeySettings.tsx:48-97` have no phone layout. Teach recording overlays are pointer-driven (`components/teach/*`).
- Expected: credentials as cards with a status line ("Last used 2 days ago" or "Needs attention" as the only highlighted state) and a single action; share dialog full-screen sheet with the link and a Copy button first; teach recording stated as desktop-only, with a short phone message instead of a broken overlay (explicit degrade, per AGENTS.md).
- Fix: reuse FLOW-02's `RowCard` and the shared Drawer for the dialogs; a `useIsMobile` guard on teach entry.
- Saves: no steps; avoids a broken screen.

### FLOW-15: Naming and copy drift between surfaces
- Stories: various.
- Severity: P3. Category: copy. Status: C.
- What happens: "Waiting on you" (Activity), "To-dos" (Calendar kind), "To do" (Inbox card) and "Needs you" (Activity group) name overlapping ideas; "Bot", "page agent" and "Chief" appear across the drawer and Calendar filters; the Calendar kind filter says "All" while other pages say "Any".
- Expected: one noun per concept: "To-dos" for things saved for her, "Needs you" for approvals and failures; "All" everywhere or "Any" everywhere.
- Fix: one copy pass over the labels above; no layout change.
- Saves: no steps; less to decode.

## Proposed shared phone patterns (summary)

| Pattern | Replaces | Component home |
|---|---|---|
| Filter and sort sheet (FLOW-01) | chip rows on 9 pages | `packages/ui-web`, used inside `components/ListControls.tsx` |
| Row card list (FLOW-02, FLOW-14) | wide tables on Company, Contacts, Holdings, approvals, credentials | new `ResponsiveTable` helper beside the table component |
| Scrolling tab bar (FLOW-03) | clipped `TabsList` on Company and others | `packages/ui-web/src/components/ui/tabs.tsx` |
| Bottom sheet for side panels (FLOW-08, FLOW-13) | Context panel overlay, folder column | shared Drawer in `packages/ui-web` |

## Removals and merges (ranked)

1. Company Calendar tab (FLOW-04).
2. To-do block above the Calendar grid (FLOW-05).
3. Per-bot approvals table replaced by a link (FLOW-06).
4. Week view on phones (FLOW-12).
5. Optional product question: Fundraising folded into Investors (FLOW-10).

## Not verified

Nothing in this file was seen in a browser. Whether `pointer: coarse` emulation was available was not tested here. Walkers should confirm the S items, especially FLOW-03 (tab clipping), FLOW-08 (panel behaviour) and FLOW-12 (header squeeze).
