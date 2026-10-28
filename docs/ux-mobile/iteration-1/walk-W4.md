# Walk W4: tables and filters, Legal, Data room, Finance (phone)

Setup: demo stack, 390x844 at device scale 3, touch emulation with `pointer: coarse` and `hover: none` confirmed true (verified with matchMedia after every navigation; the emulation had to be re-attached to the page target, and measurements taken while it was false were discarded). Persona Maya. Screenshots are in the walker's scratch folder (names below, not committed). No horizontal page scroll (`pageOverflowX` 0) on any page walked.

## Verdicts (taps actual/ideal)

- MOB-TBL-01 PASS 3/2. Legal: Sort Value, direction, Status Active gives `?sort=value&dir=desc&status=active`; opening a contract opens a Data room preview dialog; one history Back restored the filters and sort. Not tested: iOS edge swipe (headless), only `history.back()`.
- MOB-TBL-02 PASS 3/3 with notes. Legal, Investors (Contacts tab and Cap table) and Finance Spend show "Sort: field" plus direction arrow; menus fit and rows are 52 px. Contacts has no Sort button: sorting is only the Name/Kind header text (no visible hint until active). Artifacts has no sort at all.
- MOB-TBL-03 FAIL. No page scroll anywhere, but Contacts hides Email and Organization (no way to see or sort by them), Company tab bar is clipped, Company People tab renders an empty table with no empty state (demo has no company data). Activity page: see W4-13. Devin: BLOCKED (see below).
- MOB-LEG-01 BLOCKED. No "Group similar" button appears in the demo Legal toolbar (10 contracts, no near-duplicate names). Not walked.
- MOB-LEG-02 PASS 1/1 with notes. Chip switches to the Deadlines tab with a "Due: Due soon" filter chip and X; clearing is the X (the original chip is gone, so "tap again" does not apply). The list shows one overdue item.
- MOB-DRM-01 PASS 1/2 with notes. "1 failed" chip is visible without scrolling and filters (`?status=failed`, one row). It then turns into "Filters 1" with no "failed" label.
- MOB-DRM-02 PASS 2/2. Under coarse the row "..." and the grid tile "..." are opacity 1 and 44x44 (computed). Menu: Send to agent, Share, Move, Rename, Delete. Not tested: iPad desktop-mode profile where coarse is false.
- MOB-DRM-03 PASS 0/0. There is no folder column on a phone: an "All items" dropdown replaces the tree, files use full width. Divider drag is not applicable. (Catalog code audit is outdated for this.)
- MOB-DRM-04 PASS 1/2 (partial). Tapping a file opens a full-width Preview dialog with Open, Download, metadata; demo files are not renderable PDFs so zoom was not exercised. Preview "..." and Send to agent from the preview not tried.
- MOB-FIN-01 PASS 2/2. KPI cards equal height with outlines in a 1+2+2 grid; Burn card goes to the Burn page; Category/Vendor tabs fit; chart labels do not collide. Under coarse these controls measured 44 px.
- MOB-FIN-02 PASS 5/3. There is no "Transactions" entry: the list is Spend (reached from "Show all 9" in Breakdown). Search, Category filter (two ways), Sort, open transaction all work; Back keeps `q` and `category`.
- Devin page (part of MOB-TBL-03): BLOCKED. Direct URL shows only "Connect Devin"; needs a real connection.

Counts: 9 PASS, 1 FAIL, 2 BLOCKED (LEG-01, Devin portion), 0 SKIPPED.

## Findings

| id | sev | cat | story/page | what happened vs expected | evidence | suspected code | fix |
|---|---|---|---|---|---|---|---|
| W4-01 | P2 | a11y | Finance Spend | Category chip row (All, Rent, ...) are 26 px high under coarse and wrap to 3 lines; the same filter is also in the "Category" dropdown below (two ways to do one thing). Observed. | fin-spend.png, measured 36..104 x 26 | `apps/web/src/components/finance/ui.tsx` (chip row near :939) | Use pointer-coarse:h-11 on the chips or one scrolling row, and drop one of the two category controls on phone. |
| W4-02 | P2 | a11y | Legal | "1 due soon" chip is 80x24 under coarse; Company "Import" link is 42x20. Observed. | leg-02.png | `apps/web/src/pages/legal/DueSoonChip.tsx`, `apps/web/src/pages/Company.tsx` (header) | Add pointer-coarse min-h-11 and padding. |
| W4-03 | P2 | visual | Legal, Company, Investors tabs | Under coarse the active tab pill grows to 44 px inside a 33 px track, so it sticks out above and below and overlaps neighbouring tab labels (People over Organisations). Observed. | leg-02.png, co-people3.png, inv-contacts.png | `packages/ui-web/src/components/ui/tabs.tsx:18` | Make the track pointer-coarse:h-11 (or keep triggers h-8) so the pill stays inside. |
| W4-04 | P2 | visual | Company | Six tabs scroll inside a 390 px container but Review is off screen and nothing hints that the bar scrolls (overflow auto, no fade). Observed. | p-company.png, scrollWidth 458 vs 390 | `apps/web/src/pages/Company.tsx:261-281` | Add an edge fade or scroll the selected tab into view. |
| W4-05 | P2 | bug | Company People | People tab shows a header row (Name, Role, Since, Sources) and a blank area, no empty message, after 10 s. Observed in demo (no company data); no console errors. | co-people3.png | `apps/web/src/pages/Company.tsx` (people table) | Show an empty state when there are no rows. |
| W4-06 | P2 | flow | Contacts | Email and Organization columns are hidden at phone width, so email is not visible in the list and cannot be sorted. Name/Kind headers are the only sort handles, with no visible sort hint until used. Observed. | p-contacts.png, con-kind.png | `apps/web/src/pages/Contacts.tsx:201,205` | Show email or organization as a second line and add the shared SortControl. |
| W4-07 | P2 | visual | Legal | Toolbar takes 4 rows (Search+Type, Party+Status+Sort, plus the chip and tabs above); with a filter active the list starts at about 42 percent of the screen height. Observed. | leg-filtered.png | `apps/web/src/pages/legal/LegalContracts.tsx` toolbar | Collapse filters behind one "Filters" button like Data room does. |
| W4-08 | P2 | flow | Data room | Tapping "1 failed" replaces it with a "Filters 1" pill; the failed state has no label and cannot be cleared in one tap (open Filters first). Observed. | drm-failed2.png | `apps/web/src/components/data-room/FailedChip.tsx`, `FilterBar.tsx:393` | Keep a removable "Failed" chip (X) next to Filters when active. |
| W4-09 | P3 | perf | Data room | After tapping the failed chip the full 50-row list stayed under "Filters 1" for several seconds before narrowing to 1 row (once; the second try was fast). No loading cue. Observed once. | drm-failed.png | `apps/web/src/pages/DataRoom.tsx` | Dim or show a skeleton while the filtered query loads. |
| W4-10 | P3 | bug | Contacts | Avatar initials for names ending in "(Mock)" show "C(", "S(", "T(". Observed (demo data pattern). | p-contacts.png | shared initials helper used by `Contacts.tsx` | Strip parenthesised suffixes before taking initials. |
| W4-11 | P3 | flow | Investors Contacts | Action items card fills the first ~45 percent of the screen before the contact list. Observed. | inv-contacts.png | `apps/web/src/pages/Investors.tsx` | Collapse the card to one line on the Contacts tab. |
| W4-12 | P3 | visual | Finance transaction | Header wraps: Ask and company switcher drop to a second row. Observed. | fin-txn.png | `apps/web/src/pages/finance/FinanceTransaction.tsx` | Keep Ask in the first row, move company switcher below title. |
| W4-13 | P3 | perf | Activity (drawer) | Activity panel stayed on a skeleton for 8+ s with the chat list drawn below it. Suspected demo slowness, not confirmed. | act-02.png | `apps/web/src/pages/ActivityList.tsx` | Verify against the real API; show one state only. |
| W4-14 | P3 | copy | Data room | Search placeholder truncates ("Search names and te›") while the Failed chip is present. Observed. | drm-02.png | `apps/web/src/components/data-room/FilterBar.tsx:167` | Shorten to "Search". |

Already good: Artifacts (card list, always-visible 44 px delete, filter chip with X, no sideways scroll); Data room list and tile menus visible on touch; filter and sort menus fit the screen; active filters show as chips with an X in Legal, Contacts and Artifacts; Finance cards, chart labels and tabs; URL params survive Back.

Not covered: the Investors cap-table row list was only checked for its sort menu (Invested is reachable there), 375 px width, real iOS edge-swipe Back.
