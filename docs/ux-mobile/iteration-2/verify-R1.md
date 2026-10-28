# Pass-2 verifier R1: clusters A, B, C1, C2

Target: the mock-data demo running the integration branch with all pass-1 fixes. Phone: 390x844 (spot-check 375x812), device scale 3, CDP touch emulation. Confirmed `pointer: coarse` = true and `hover: none` = true before every measurement. Desktop: 1440x900, `pointer: coarse` = false. The machine was loaded, so slow loads are not filed. Screenshot file names are listed per section (kept outside the repo).

Verdict summary: A partly met, B mostly met, C1 mostly met, C2 met except three items. Two new P1 findings (R1-01, R1-02). No page scrolls the window sideways at 390 or 375. Desktop looks unchanged.

## Cluster A: tab bars (packages/ui-web tabs.tsx)

| Finding | Verdict | Evidence |
|---|---|---|
| W3-01 | partly | Review (0) is now reachable: tablist scrollWidth 446 / clientWidth 358, `scrollbar-width: none`, Review selected sits at x 277..371 after tapping it (co-Review.png). But Overview is now unreachable, see R1-01. |
| V2-01 | partly | No sideways page scroll (documentElement.scrollWidth 390 = innerWidth on every Company view). The list scrolls inside its own track, with no scrollbar. The left end is clipped (R1-01). |
| W4-03 | met | Track 52 px, triggers 45 px, so the active pill sits inside the track (co-People.png, inv.png, legal.png). |
| V2-03 | met | Same measurement on Company, Legal, Investors, Finance Spend tabs (45 px triggers in 52 px track). |
| W4-04 | partly | The active tab scrolls into view when selected (Review, Calendar). There is no edge fade or other hint that the bar scrolls; at rest on Overview the right edge shows a half-cut "Calendar" only. |
| FLOW-03 | partly | Same as W3-01: scrolling works to the right, not to the left. |

Legal (3 tabs), Investors (3 tabs) and Finance Spend (4 tabs) fit: tablist 262/262, 268/268, no scroll needed. Desktop: tabs are 25 px high and the tablist 32 px, unchanged.

## Cluster B: one phone filter sheet

Checked on Contacts, Investors (Cap table holders, Contacts tab), Legal, Finance Spend, Artifacts, Company People/Organisations, Activity and Data room.

| Finding | Verdict | Evidence |
|---|---|---|
| FLOW-01 | met except Data room and Activity | Search + one Filters button (77x44) on one row on Contacts, Legal, Spend, Artifacts, Investors holders, Company People/Organisations. The sheet (bottom sheet, 44 px chips) lists every filter group plus sort field and direction (sheet-contacts.png, sheet-legal.png, sheet-spend.png, inv-sheet.png, act-sheet.png). Clear all empties the URL params (`?kind=legal` -> empty) and keeps the sheet open. Active filters show a count badge on Filters and a removable chip below (con-active.png, legal-active.png: "Kind: Investor x", "Status: Active x", chip 44 px high). Opening a contact and pressing Back returns to `/app/contacts?kind=legal` with the chip still shown. Data room does not use the shared sheet (R1-03). Activity uses the sheet but not one row (R1-05). Contacts sheet has no sort (W3-08). |
| V2-04 | met | Legal list starts at y 301 with one toolbar row (legal.png); Spend rows start at y 435. Before: about 250 px of toolbar. |
| V2-05 | partly | The tall column header band ("Name / Kind", "Holder / Fully diluted", "Counterparty / Amount") is still shown on phones, about 50 px on Contacts and Spend. A sort sheet now exists on Spend, Legal and Investors, so the header is a duplicate. |
| V2-15 | met | Kind is a sheet with ten 44 px chips, no inner scrolling menu. |
| W3-12 | met | Same. |
| W4-08 | met | Tapping "1 failed" gives "Status: Failed x" (122x44) in the main row (dr-failed.png); one tap on x removes it and the URL loses `status=failed`. |
| W4-14 | partly | Placeholder on phone is "Search" (shorter). At rest with no query and no focus the field shrinks to a 41 px icon box with a 16 px wide input (R1-03). |
| V3-11 | met | Chip and Filters share top 68 (was 62 vs 68). The failed chip is named while active. See R1-03 for the empty-search squeeze. |
| V3-12 | met | Active failed filter stays named in the row. |
| W3-17 | met | Chip top 68 = Filters top 68, both 44 px. |
| W4-01 | met | Finance Spend category chips are gone on the phone; Category is in the sheet (sheet-spend.png). Desktop keeps the chips (d-finance-spend.png). |

## Cluster C1: Contacts and Investors rows

| Finding | Verdict | Evidence |
|---|---|---|
| W3-02 | met | Investors Contacts tab: tapping "Dana Fakename" opens `/app/contacts/<id>` with no dialog; Back returns to `/app/investors?tab=contacts`. |
| V2-06 | met | Contacts rows: name, then organisation and email on a muted second line, Kind as a badge (contacts.png). Rows are about 77 px. |
| W4-06 | met | Email is visible on the phone list. It is still cut with an ellipsis ("casey.advisor@advi...") because organisation takes half of the line. |
| V2-09 | partly | Investors Contacts rows still end the email with an ellipsis ("dana@acme-ventures.exa...") (inv-contacts.png). Org and email share one line; the email still loses its tail. |
| V2-07, W3-05, W4-11 | met | Action items card is a 44 px row on Cap table, Updates and Contacts, with a 45x44 chevron (aria-expanded false, "Show 1 action items"). Expanding shows the item and its buttons (inv-actions-open.png). Contacts list now starts at y 296 instead of the fold. |
| V2-08 | partly | The sub-line now wraps ("Common · 3,000,000 · $12,500 invested"), so Invested is readable. The "Casey Advisor (Mock)" row is still taller (65 px vs 49) with a gap between the name and its sub-line (inv-scrolled.png). |
| W3-03 | met | Invested reads "$2,500 invested". |
| W3-04 | partly | Search and Filters on one row (met); the Casey row is still uneven (above). |
| W3-08 | not met | Contacts has no sort in the sheet; Email and Organization cannot be sorted on a phone (sheet shows Kind only). The Investors Contacts sheet does offer Name/Organization. |
| W3-09, W4-10 | met | "Casey Advisor (Mock)" shows "CA"; also SA, TO, DC, FG. |
| W3-10 | met | Names are no longer truncated by the Kind column ("Casey Advisor (Mock)" in full). Kind is a badge at the right. |
| W3-11 | met | Saving a new contact shows the toast "Added Riley Verifier R1", clears the search/filter and highlights the new row (con-saved.png). (I created this one demo contact.) |
| W3-16 | not checked | Focus ring on contact rows was not inspected. |
| V2-13 (SAFEs toggle) | code only | No SAFE rows are rendered in the demo, so the control could not be measured. `SafeRows.tsx` gives the link `pointer-coarse:min-h-11`. |

## Cluster C2: Company, Legal, Finance, Devin, Data room

| Finding | Verdict | Evidence |
|---|---|---|
| V2-02, W3-06 | met | Hamburger, "Company", Ask, Import and "..." share one row at y 20 (all 44 px high); "Reconstructed" sits on a line below. Import is 58x44 (co-People.png). |
| W3-07, W4-05 | met | People shows "No people yet", Organisations "No organisations yet", Review "Nothing to review"; the search + Filters row is above them. |
| W3-13 | met | `/app/devin` shows "Devin / Connect Devin to see its sessions here / Connect Devin" with no skeleton. |
| V2-10 | met | Legal titles wrap in full ("MOCK Insurance Policy - Shieldwell"), Value moves into the meta line (legal.png). |
| W4-07 | met | One toolbar row, then rows of about 109 px. |
| W4-02 | met | "1 due soon" chip 81x44; Import 58x44. |
| V2-11 | met | Spend rows are about 61 px (was 90) with "Oct 28 · Payroll" under the counterparty (fin-spend.png). |
| V2-12 | not met | Artifacts row link is 217x20 (name only); the delete button is 44 px. The row is 49 px high. |
| W4-12 | not met | Finance transaction header still wraps: back button + title on row 1, Ask (156..225) and the company switcher on row 2 (fin-txn.png). |
| V3-14 | met | Burn chart: the y labels sit in a left gutter and the first x label "Apr" is whole (fin-chart.png). |
| V3-15 | met | Upload banner is one row with the Upload button inline, about 65 px (fin.png). |
| V3-13 | partly | Grid tiles are 185-233 px (was 260), two per row (dr-grid.png). The three-row header block is still about 160 px. |

## Desktop at 1440x900 (no regressions)

Page scrollWidth 1440 on Company, Contacts, Investors, Legal, Finance Spend, Data room, Artifacts. Contacts shows the full Name/Email/Organization/Kind table with the Kind menu inline (d-contacts.png). Data room shows search, Failed, Type, Party, Date and Sort in one row, with the folder tree beside the grid (d-data-room.png). Finance Spend still shows the category chip row (d-finance-spend.png). Company tabs are 25 px high with no scroll (d-company.png). Investors was still loading in my screenshot (d-investors.png, skeleton): tab bar only, not judged.

## 375x812 spot-check

Window scrollWidth 375 on Company, Investors, Contacts, Legal, Finance Spend, Data room and Artifacts. Company tablist 439/343 with Overview at x -77 (same defect as R1-01). Investors and Spend tab bars fit.

## Not-met list

W3-08 (Contacts cannot sort by email or organisation), V2-12 (Artifacts row link 20 px), W4-12 (Finance transaction header wraps). Partly: W3-01, V2-01, W4-04, FLOW-03 (Overview clipped, no scroll hint), V2-05, W4-14, V2-09, V2-08, W3-04, V3-13. Unverified: W3-16, SAFEs toggle.

## New findings

| Id | Sev | Cat | Finding | File |
|---|---|---|---|---|
| R1-01 | P1 | bug | Company's first tab "Overview" cannot be reached on a phone. The list is `justify-center` and `overflow-x-auto`, so when the content is wider than the track the left overflow has a negative offset that cannot be scrolled to. Observed: Overview left = -69 px at 390 (scrollLeft 0, clamped) and -77 px at 375, whether Overview or People is active (co-overview.png shows no Overview pill, the bar starts at "People"). Fix: on coarse pointers use `justify-start` (or `safe center`) so scrollLeft 0 shows the first tab. | `packages/ui-web/src/components/ui/tabs.tsx` (tabsListVariants, `justify-center`) |
| R1-02 | P1 | bug | Investors Contacts tab: the search box is squeezed to a 16x44 px sliver between the "SAFEs and funds / Board" segmented control and Filters, so the field cannot be seen or typed in (inv-contacts.png; measured Search 277..293). Fix: put the segmented control on its own row, or move it into the sheet, so search gets the row. | `apps/web/src/pages/Investors.tsx` (Contacts tab toolbar) |
| R1-03 | P2 | flow | Data room: with no query and no focus the search is a 41 px icon box holding a 16 px input (dr.png), so it is not clear it is a field. Filters does not open the shared sheet; it unfolds inline rows of Type/Party/Document date plus a Sort menu, and "Status: Failed" then appears twice (main row chip and pill row) (sheet-dr.png). | `apps/web/src/components/data-room/FilterBar.tsx` (~L285-345) |
| R1-04 | P3 | flow | Contacts sheet has no sort control, so the "Name/Kind" header band stays as the only sort. Same as W3-08, listed here as the cause. | `apps/web/src/pages/Contacts.tsx` (no `SortControl`) |
| R1-05 | P3 | visual | Activity filter in the drawer stacks "Search runs", a Filters button, From and To on four rows (act-filter.png) instead of search + Filters on one row. The sheet itself is good (Status + Sort). | `apps/web/src/pages/ActivityList.tsx` |
