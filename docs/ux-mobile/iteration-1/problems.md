P0: 1, P1: 6, P2: many, P3: polish (clusters below carry their highest severity)

# Mobile pass 1: fix clusters

Sources: walk-W1..W4, flow.md, visual-V1..V3 in this folder, walked on the mock demo at 390x844 and 375x812 with touch emulation (`pointer: coarse`, `hover: none`). No page scrolls the whole window sideways. The problems are inner scrollers, wrapped toolbars, panels that cover content, toasts that cover controls, and controls under 44 px.

Each cluster owns its files so the clusters can be fixed in parallel.

## A [P0] Tab bars do not fit a phone (shared TabsList)
- Findings: W3-01, V2-01, W4-03, W4-04, V2-03, FLOW-03.
- Company's six tabs are 462 px wide in a 370 px space; "Review" is off screen and nothing hints at it. On Legal, Company and Investors the active pill is 44 px tall inside a 33-36 px track, so it overlaps its neighbours.
- Fix: in `packages/ui-web/src/components/ui/tabs.tsx`, the list scrolls sideways with no visible scrollbar, scrolls the active tab into view, and the track grows to fit 44 px coarse-pointer triggers. One change covers every TabsList.
- Files: `packages/ui-web/src/components/ui/tabs.tsx` (+ story), `apps/web/src/pages/Company.tsx` tab block only if needed.

## B [P1] One phone filter sheet for every list (ListControls, Data room FilterBar)
- Findings: FLOW-01, V2-04, V2-05, V2-15, W3-12, W4-08, W4-14, V3-11, V3-12, W3-17, W4-01.
- Table controls wrap to 2-3 rows on Contacts, Investors, Legal, Finance transactions, Company and Activity (about 250 px before the first record). The Data room "1 failed" chip sits 6 px off the Filters button, squeezes the search placeholder, and turns into an unnamed "Filters 1" once tapped. Finance Spend chips are 26 px high, wrap three lines and duplicate the Category dropdown.
- Fix: below `sm`, ListControls shows search plus one "Filters" button with an active-count badge that opens a bottom sheet (filter groups, sort field and direction, Clear all, Done). Active filters show as removable chips only when set. The Data room FilterBar uses the same sheet and names the failed filter while active. Desktop is unchanged.
- Files: `apps/web/src/components/ListControls.tsx`, a new shared sheet component (Drawer/Sheet from `packages/ui-web`; add from the official shadcn registry if missing), `apps/web/src/components/data-room/FilterBar.tsx`, `FailedChip.tsx`, Finance Spend chips in `apps/web/src/components/finance/`.

## C1 [P1] Contacts and Investors rows on a phone
- Findings: W3-02, V2-06, V2-07, V2-08, V2-09, W3-03, W3-04, W3-05, W3-08, W3-09/W4-10, W3-10, W3-11, W3-16, W4-06, W4-11, V2-13 (SAFEs toggle).
- A row tap in the Investors Contacts tab opens the Edit dialog with no way to the contact page (P1). Contacts hides email and organisation on a phone and its Kind column takes 45 % of the width. Invested shows as an unlabelled, truncated amount. The Action items card takes 400 px above every Investors tab. Initials for "Casey Advisor (Mock)" read "C(". Saving a new contact gives no confirmation.
- Fix: phone card rows (name, organisation and email as a muted second line, Kind as a badge); Investors contact rows open the contact page; label Invested; collapse Action items to one line on phones; initials skip punctuation; confirm save.
- Files: `apps/web/src/pages/Contacts.tsx`, `apps/web/src/pages/Investors.tsx`, `apps/web/src/components/cap-table/HoldingsTable.tsx`, the initials helper, `apps/web/src/components/ContactDialog.tsx`.

## C2 [P2] Company, Legal, Finance and Devin on a phone
- Findings: V2-02, W3-06, W3-07, W4-05, W3-13, V2-10, W4-07 (rows, not toolbar), W4-02, V2-11, V2-12, W4-12, V3-14, V3-15, V3-13.
- Company's header puts the menu button on its own row and Import is a 42x20 link; People shows headers and no empty state. `/app/devin` shows a skeleton forever when Devin is not connected. Legal titles are cut to one line while Value pins right; the "1 due soon" chip is 24 px. Finance transaction rows are 90 px and hide the category; the burn chart's y labels sit over the plot and the first x label is clipped; the upload banner takes 130 px. Data room grid tiles are 260 px tall.
- Files: `apps/web/src/pages/Company.tsx` (header, People; not the tab block), `apps/web/src/pages/Devin.tsx`, `apps/web/src/pages/legal/LegalContracts.tsx`, `apps/web/src/pages/legal/DueSoonChip.tsx`, Finance transactions list, `apps/web/src/pages/finance/FinanceTransaction.tsx`, `apps/web/src/components/finance/charts.tsx`, Data room grid tile.

## D [P1] Calendar on a phone
- Findings: W1-01..W1-07, V1-01..V1-08, FLOW-12, BotTodos tick box (V3-06).
- Week view is a 672 px grid in 358 px (Thu-Sat off screen, hour labels scroll away). Four toolbar rows use 260 of 844 px (250 of 390 in landscape). Month chips show three letters and a day tap does nothing. Day view is a blank grid with no empty text. Schedule drops prev/next and truncates the title. Tapping a to-do in Schedule opens the Inbox top, not the mail (P1). A routine row opens the bot settings, not the routine. All-day bars are 22 px, "Connect Google Calendar" is 18 px, and the BotTodos tick box is 16 px.
- Fix: on phones open Schedule (or Day) by default and offer a 3-day grid instead of Week with a sticky time column; one-row toolbar with filters in a sheet; Month shows dots and a list of the tapped day; a "Nothing scheduled" line; stable header; to-dos open their mail; routines open the routine; 44 px coarse targets.
- Files: `apps/web/src/pages/Calendar.tsx` (+ stories), `apps/web/src/components/BotTodos.tsx`.

## E [P1] Mail dialog, Context panel and Track on a phone
- Findings: W1-08..W1-13, W1-17, W1-18, W3-15, V1-09..V1-13, FLOW-08.
- The Context panel is full-screen on a phone and its open state is restored from local storage, so every new compose opens on a blank "No context yet" screen covering the editor and Send (P1). Context rows are 28 px. Track is only in the Inbox row menu and the row shows no tracked state (P1). The dialog's action row wraps and Context is an unlabelled icon. After a tap, the Inbox row date goes to opacity 0 on touch. In landscape the Archive button clips the date.
- Fix: on phones the Context panel is a bottom sheet that never opens by itself; 44 px rows; Track in the open mail's More menu with a visible tracked state; action row on one line with a labelled Context button; fix the hover-hide classes so they only apply with `hover: hover`.
- Files: `apps/web/src/components/inbox/InboxMessageDialog.tsx`, `apps/web/src/components/inbox/ContextPanel.tsx`, `apps/web/src/lib/mail-context-panel.ts`, `apps/web/src/components/ComposeEmail.tsx` (Context panel part), `apps/web/src/components/inbox/InboxRow.tsx`, `InboxSenderGroup.tsx`, `TodoCard.tsx`.

## F [P1] Toasts cover controls
- Findings: V1-14, V1-15, V3-01, W1-14, W2-03.
- The Undo toast after Send sits under the persistent approval toast (z-index 110 over 100), so Undo cannot be tapped while an approval is pending (P1). The approval toast covers the routine editor's Save button and the last rows of full-height panels.
- Fix: stack toasts so Undo is never under the approval toast; expose the toast height as a CSS variable and pad scroll containers and sticky footers by it on phones. The owner decision stands: approval toasts persist and sit above the composer.
- Files: `apps/web/src/components/AppToaster.tsx` and the padding hook-up in panels (routine editor, bot settings).

## G [P1] Routines, bot settings, Activity and approvals on touch
- Findings: V3-05, W2-02, V3-06 (switch), V3-16, V1-18, V3-07, W2-01, V1-17, V3-04, V3-02, W1-15, V1-16, W2-04, FLOW-11, V3-09, V3-08, W2-07, W1-16.
- Switches measure 40x22 and 32x18 on a coarse pointer (custom toggle in RoutineEditor and the shared switch). The approvals select clips "Same as all bots". The Routines panel leaves a 9 px sliver, a second menu button and a repeated explainer line. The approval card's chevron is named "Tool name" and leaves an empty band. Activity in the drawer clips "Working" and "Show finished runs" under a fixed-height region with a second scroller; rows are under 44 px. Page agent rows are indented 52 px and truncate. Integrations cards are 150-180 px tall.
- Fix: use the shared Switch everywhere with a 44 px coarse hit area; fit the select; Routines as a full-screen sheet with back and close; approval card shows a readable tool name without the empty band; Activity is one scroller with 44 px rows; reduce the Page agents indent; Integrations action inline with the name.
- Files: `packages/ui-web/src/components/ui/switch.tsx`, `apps/web/src/pages/RoutineEditor.tsx`, `apps/web/src/pages/RoutineSchedule.tsx`, routines panel, `apps/web/src/components/ApprovalActionsTable.tsx`, `apps/web/src/components/AskCard.tsx`, `apps/web/src/pages/ActivityList.tsx`, `apps/web/src/pages/shell/space-sidebar.tsx` (Activity and Page agents fold only), Integrations card.

## Product questions (not fixed in this pass)
The flow critic proposed removals that change what the product offers. These need the owner:
- FLOW-04: drop Company's Calendar tab and show company dates as a kind on the Calendar page.
- FLOW-05: show to-dos waiting on you in one place (Activity) instead of Calendar, Inbox and Activity.
- FLOW-06: replace the per-bot approvals table with a link to one approval rules page.
- FLOW-10: shorten the phone drawer's Pages group to Inbox, Calendar and Activity with the rest under "More pages".

## Blocked on the demo
Passkey sign-in and settings (no passkey UI on the demo), typed UI blocks (the scripted model never produced one), Waiting on you rows (no items seeded), attachment Review with AI (no attachments), Legal grouping and avatar stacks (no matching data), Devin (needs a connection), Google Calendar events and Drive data, the on-screen keyboard (headless Chrome).
