# Visual pass V2 (phone): contacts, investors, company, legal, finance transactions, artifacts, table controls

Method: agent-browser session on the mock-data demo stack, iPhone 16 profile, viewport set to 390x844 at scale 3, with CDP touch emulation (`pointer: coarse` and `hover: none` both confirmed true). `layout-audit.js`, `geometry-audit.js` and a small-target/horizontal-scroll probe ran on each state. Screenshots were opened and read.

## Coverage and limits (read first)

- 390x844: observed for Contacts list and a contact page, Investors (Cap table, Updates, Contacts tabs, holdings), Company overview and tab bar, Legal contracts, Finance overview and an account's transactions, Artifacts, and the Contacts Kind menu.
- 375x812: only Contacts (skeleton state) and the Company horizontal-scroll probe were captured before the browser session was relaunched and signed out. Treat 375 as UNVERIFIED beyond those. The 390 findings are expected to be at least as bad at 375.
- 768x1024 tablet: NOT verified (the session ended before the captures succeeded).
- Company Import, Review, History, Calendar, Privacy: the pages stayed on skeletons in my walks (4 s waits), so only the shared header and tab bar were judged. Legal grouping and party avatar stacks: the demo contracts did not produce a group or stacks, so UNVERIFIED. Devin: not visible on the demo (hidden until connected, an owner decision). Investors Updates was only seen empty.
- agent-browser `click` hung under touch emulation, so clicks were issued through `eval`; this is a tooling quirk, not an app finding.

## Verdicts

| Page | 390x844 | 375x812 | 768x1024 |
|---|---|---|---|
| Contacts list | Below excellent (V2-04, V2-05, V2-06) | unverified | unverified |
| Contact page | Excellent | unverified | unverified |
| Investors, Cap table | Below excellent (V2-04, V2-07, V2-08) | unverified | unverified |
| Investors, Updates | Fine empty; V2-07 applies | unverified | unverified |
| Investors, Contacts | Below excellent (V2-09, V2-04) | unverified | unverified |
| Company (all tabs) | FAIL: sideways scroll (V2-01, V2-02, V2-03) | same sideways scroll measured | unverified |
| Legal contracts | Below excellent (V2-04, V2-10) | unverified | unverified |
| Finance transactions | Below excellent (V2-04, V2-05, V2-11) | unverified | unverified |
| Artifacts | Good (V2-12 only) | unverified | unverified |
| Devin | Not visible (hidden until connected) | n/a | n/a |

## Findings

| id | page | sev | cat | what happened vs expected | evidence | code | fix |
|---|---|---|---|---|---|---|---|
| V2-01 | Company, every sub-page | P1 | bug | Observed. The page scroller pans sideways. The six-tab list is 462 px wide in a 390 px screen with overflow visible, so "Calendar" is clipped and "Review (0)" starts at x=399, off-screen. Norm L6 (reflow, not overflow), I4. | probe: `.rk-scroll` scrollWidth 478/458 vs 390 on overview, people, organisations, history, calendar, review, privacy; co-calendar-390.png | `apps/web/src/pages/Company.tsx:261-281`, `packages/ui-web/src/components/ui/tabs.tsx:18` | Make the tab list a single-row horizontal scroller (`overflow-x-auto`, no wrap, edge fade, active tab scrolled into view) on phones; use the same strip everywhere tabs exceed the width. |
| V2-02 | Company | P2 | visual | Observed. The hamburger sits alone on a top row and the title row starts about 100 px lower, unlike every other page where the hamburger and title share one row (H5). The Import action is an underlined text link 42x20 px (I4). | company-390.png; probe "Import 42x20" | `Company.tsx` header | Put the hamburger and title on one row like other pages; make Import a 44 px button or move it into the "..." menu. |
| V2-03 | Investors, Legal, Company | P2 | visual | Observed. The active tab pill is 44 px tall inside a roughly 36 px track, so it overhangs and looks clipped at the top (H6, D3). | investors-390.png, legal-390.png, company-390.png | `tabs.tsx` (coarse-pointer height) | Make the track grow with the 44 px tab (or inset the pill) so the pill sits inside the track. |
| V2-04 | All filterable tables (Contacts, Investors holdings, Investors contacts, Legal, Finance transactions, Artifacts) | P1 | flow | Observed. Search, filter chips, sort and direction wrap into 2-3 rows with orphaned, right-aligned chips (Investors: "Sort: Default" alone on its own row; Legal: three rows). About 250 px of an 844 px screen is spent before the first record (D5, I5). Artifacts fits one row and is the model. | investors-390.png, legal-390.png, fin-tx.png, contacts-390.png | `apps/web/src/components/ListControls.tsx:78-215` | ONE shared phone pattern: a single row with search plus one "Filters" button showing a count badge. It opens a bottom sheet holding every filter group, the sort field and the direction, with Clear and Apply. Active filters show as dismissible chips in one scrolling row only when set. |
| V2-05 | Contacts, Investors holdings, Finance transactions | P2 | visual | Observed. The column-header row stays on phones as a tall (about 60-90 px), mostly empty band ("Name / Kind", "Holder / Fully diluted", "Counterparty / Amount") with no visible sort affordance, while a separate Sort control also exists (C2 duplication, D2). | contacts-390.png, inv-hold.png, fin-tx-390.png | `apps/web/src/pages/Contacts.tsx:201-205`; sortable `TableHead` | Hide the header row below the breakpoint; sort only through the shared sheet (V2-04). |
| V2-06 | Contacts list | P1 | flow | Observed. The Kind column takes about 45% of the width and shows a single word, while email and organisation sort handles are hidden (suspected from code, matches the screen: no email on the list). Maya cannot see or sort by email on a phone. | contacts-390.png | `Contacts.tsx:201,205` | Card rows: name, then organisation and email on a muted second line, Kind as a small badge on the right; email and organisation become sort fields in the shared sheet. |
| V2-07 | Investors (all tabs) | P2 | density | Observed. The Action items card (about 400 px, includes "Drafting..." state) sits above every tab. On Cap table the KPIs start below 420 px; on Updates the card is larger than the content (L2, D5). | investors-390.png, inv-updates-390.png | `apps/web/src/pages/Investors.tsx` | On phones, collapse Action items to a one-line summary row ("1 action item") that expands in place or opens a sheet. |
| V2-08 | Investors, Cap table holdings | P2 | visual | Observed. Shares and Invested are folded into the sub-line, and it truncates ("Common · 3,000,000 · $12,5…"), so a money value is unreadable. The Casey Advisor row is taller than the others (uneven rows, L5/H6). | inv-hold.png | `apps/web/src/components/cap-table/HoldingsTable.tsx:150-160` | Let the sub-line wrap to two lines, or move Invested to its own right-hand line; fix the row height so all rows match. |
| V2-09 | Investors, Contacts tab | P2 | visual | Observed. Email is truncated at the end of the org line ("dana@acme-ventures.e…"), losing the key identifier (C4). | inv-contacts-390.png | `Investors.tsx:1489-1560` | Show the email on its own line and truncate the organisation instead. |
| V2-10 | Legal, Contracts | P2 | visual | Observed. Titles are cut with an ellipsis ("MOCK Master Services Agreement - ...") because Value is pinned right; a large gap separates the title from the three-line meta. Grouping and avatar stacks: unverified (no group in demo data). | legal-390.png, legal-scroll.png | `apps/web/src/pages/legal/LegalContracts.tsx:313,428` | Allow the title two lines and move Value to the meta line; tighten the title-to-meta gap. |
| V2-11 | Finance transactions | P2 | density | Observed. Rows are about 90 px tall (6 per screen), the Category column is not shown on phones, and the date sits on its own line far from the name. | fin-tx-390.png | `apps/web/src/components/finance/ui.tsx` (TransactionsSection) | 56 px rows: counterparty and amount on line one, "date · category" on a muted line two. |
| V2-12 | Artifacts | P3 | a11y | Suspected. Rows are 58 px tall but the name link is 20 px tall (probe lists the text anchors at height 20). If only the text is tappable, the target is small (I4). Delete (trash) sits at the row edge; confirmation was not tested. | artifacts-390.png, probe | Artifacts list row component | Make the whole row the link; confirm or offer undo on delete. |
| V2-13 | Legal | P3 | a11y | Observed. The "1 due soon" chip is 24 px tall and Investors' "SAFEs, if converted at cap" control is 20 px tall. | probe lists | `LegalContracts.tsx`, `Investors.tsx` | Use at least 44 px hit area (padding or `pointer-coarse` height). |
| V2-14 | Company sub-pages, Finance | P3 | perf | Suspected (could be demo slowness). Company people, history, review, privacy, import and Finance showed a skeleton for 4 s or more in my walks. | co-*-390.png are skeletons | n/a | Re-check with a warmer stack before treating as a defect. |
| V2-15 | Contacts, Kind filter | P3 | flow | Observed. The Kind menu is a 160x288 px dropdown with ten 44 px items that scrolls inside itself. Usable, but long lists suit a sheet. | contacts-kind.png | `ListControls.tsx:135` | Fold into the shared filter sheet from V2-04. |

## Excellent as is

- Contact page: back, avatar, name and Edit on one row; label/value pairs readable; related email clickable.
- Finance overview: KPI cards, equal heights and spacing; period tabs measure 44 px.
- Artifacts: search plus Added, Type and view toggle fit one row; list rows are clean and scannable.
- Menu rows in the Kind menu are 44 px; no window-level horizontal scroll on any page except the Company inner scroller.
- Investors tabs and Finance period tabs are 44 px high and fit the width.
- Holdings rows (name, security line, percentage, "...") are a good card-like pattern and work as the model for contacts.
- SAFEs-if-converted table fits without clipping.
