# Pass-3 verifier (mob3-R): pass-2 follow-ups and regression sweep

Target: the mock-data demo serving the integration worktree live (Vite) with the pass-1 and pass-2 fixes. Every page was hard-reloaded before measuring. Phone: 390x844 (main) and 375x812 (spot check), device scale 3, CDP touch emulation held open by a background script. `pointer: coarse` was confirmed true on every phone run and false at 1440x900. Menus and sheets were opened with eval clicks because `click` hangs under touch emulation. The machine was loaded, so slow loads are not filed. Screenshot file names (kept outside the repo) are named per row; each one was opened and looked at.

Verdict summary: all the key pass-2 follow-ups are met (R1-01, R1-02, R1-03, R1-04, R1-05, R2-01, R2-02 in Schedule, R2-03, R2-04, R3-01, R3-02). Still partly met: long agent names in the drawer (V3-09), the Investors Contacts email tail (V2-09), and the half row under "+N more" on desktop. No window-level horizontal scroll and no console errors on any page at 390 or 375. Desktop layouts are intact. No P0 or P1 findings. Seven new P2/P3 findings below.

## 1. Pass-2 follow-ups

| Item | Verdict | Evidence |
|---|---|---|
| R1-01 Company Overview reachable | met | Tablist scrollWidth 534 / clientWidth 358, scrollLeft 0. Overview left = 19 px (x >= 0), People 106. Tapping Review (0) scrolls the list to 176 and puts Review at 277..371. 375x812: Overview left 19 as well. Screenshots: co.png, co-review.png, s-co.png. |
| R1-02 Investors Contacts search | met | Search input 211x44 at 390 and 196x44 at 375, on a row with Filters (inv-contacts.png, s-inv-c.png). The SAFEs and funds / Board control has its own row. |
| R1-03 Data room search and Filters | met | At rest the search is 200 px wide with a "Search" placeholder, then Filters, then the failed chip on one row (dr.png). Filters opens the shared bottom sheet (Type, Party, Document date From/To, Sort field, ascending/descending, Clear all, Done; every chip 44 px: dr-sheet.png). The sheet does not repeat Failed. After tapping "2 failed", the failed filter appears once as "Status: Failed x" (122x44) and Filters shows a "1" badge; URL `?status=failed`; the list drops to the two failed rows (dr-failed.png). Grid view: two tiles per row, nothing clipped (dr-grid.png). |
| R1-04 Contacts sort in the sheet | met | Sheet lists Kind chips and "Sort: Default" with Name / Email / Organization / Kind, 44 px each (contacts-sheet.png). The old Name/Kind header band is gone from the phone list. |
| R1-05 Activity filter | met | Filter (text button, 55x44) opens one row: "Search runs" 157x44 plus Filters 77x44. The sheet holds Status chips, From and To date inputs (44 px), and Sort Updated/Bot with ascending/descending (act-filter.png, act-sheet.png). See P3-06. |
| R2-01 Calendar hour label | met | Day and 3 days open at 12 PM with the label fully visible, not under the sticky day header (cal-Day.png, cal-3d.png). |
| R2-02 Schedule title one line | met | "Oct 28 – Nov 26" is a single line (H2 height 18). Today, title and view menu sit on one row at y 68, 44 px high (cal-sched.png, s-cal.png). |
| R2-03 Month weekday labels | met | Sun..Sat labels are centred over their date column (cal-Month.png). |
| R2-04 compose Context sheet | met | The sheet is a top sheet about 380 px tall; the lower part of the editor and the Send bar (792..836) stay visible (compose-ctx.png). Residual: it covers From/To/Subject while open (P3-07). |
| W1-09 Context contact line (16 px) | met | The Context contact link is 199x44 (measured). |
| R3-01 toast reserve | met | New-routine editor: Save 591..635, toast starts at 666 even with the expanded toast; `--toast-panel-reserve` 162 px (routine-new.png). Bot settings last row "Clear conversation" 621..665 with nothing under it (botset-bottom.png). |
| R3-02 Integration cards | met | All connected cards (Gmail, Carta, Mercury, Brex) are the same height (about 124 px, 136 px pitch) with the action button on its own row; no 82 vs 126 mix (integ.png). They are taller than the old Gmail/Carta cards, so four fit instead of five. |
| R3-03 / W1-16 "+N more" half row | partly | Phone: expanded Pages shows "+7 more" with a clean gap and no half row (drawer-expanded.png); Activity view shows "+1 more" with a clean gap (activity.png). Desktop 1440x900: the "Leadership sync (mock)" row is still cut in half behind "+2 more" (d-contacts.png, d-co.png). |
| V3-09 agent names not truncated | partly | "Investor Relations (mock)" and "Finance helper (mock)" now show in full (their status line replaces the time). "Leadership sync (mock)" is still cut: text 156 px in 132 px, because the "12:30 PM" time shares its row (drawer.png). |
| V3-05 hint under "Choose when it runs" | met | Gone (routine-new.png). |
| Toast vs Save | met | See R3-01. |
| Artifacts rows 44 px | met | Row links are 44 px high inside 49 px rows, delete buttons 44 px (art.png). |
| V2-09 Investors Contacts email tail | partly | Emails still end with an ellipsis ("dana@acme-ventures.exa...", inv-contacts.png). |
| W4-12 Finance transaction header | met | One row: back/breadcrumb "Finance / Burn / Oct 2026" and the company switcher (fin-txn.png). See P3-05 for its target size. |

## 2. Phone regression sweep at 390x844

For each page: window scrollWidth = innerWidth (390), no interactive control under 44 px in the viewport (unless listed as a finding), nothing covered or clipped, no console errors (console log had only React/Vite info lines).

| Page | Result | Screenshot |
|---|---|---|
| Calendar: Schedule, Day, 3 days, Month | pass | cal-sched, cal-Day, cal-3d, cal-Month |
| Inbox list, mail dialog, Context, compose | pass (mail dialog full screen, actions Reply/Archive/Context/... all 44 px; row checkboxes 44x44) | inbox, mail, mail-ctx, compose |
| Contacts, contact page | pass for size; P3-03 for truncation | contacts, contact |
| Investors: Cap table, Updates, Contacts | pass for size; P3-02 on Cap table | inv-Captable, inv-Updates, inv-contacts |
| Company: Overview, People, Organisations, History, Calendar, Review | pass except P3-01 on the Calendar tab | co, co-People, co-Calendar |
| Legal | pass (one toolbar row, titles wrap in full) | legal |
| Finance overview, Spend, transaction | pass for width; P3-04, P3-05 | fin, fin-spend, fin-txn |
| Data room list, grid, Filters | pass | dr, dr-grid, dr-sheet |
| Artifacts | pass | art |
| Activity in the drawer | pass (one scroller; rows 76/44 px) | activity |
| Bot settings: Routines, new routine, settings, Approvals | pass (selects 176x44 reading "Same as all bots"; skill switches 44x44 hit areas) | routines, routine-new, botset, botset-bottom |
| Integrations | pass | integ |

375x812: Company, Investors (Contacts search 196 px), Contacts, Data room, Calendar, Inbox, Legal and Finance Spend all have scrollWidth 375 and no small controls (s-*.png).

## 3. Desktop 1440x900 (pointer coarse false)

Company, Contacts, Calendar, Data room and Inbox: scrollWidth 1440, no dialog or sheet open, no "Filters" phone button. Company tabs are inline and compact (d-co.png). Contacts shows the Name/Email/Organization/Kind table with an inline Search and a Kind menu (d-contacts.png). Calendar shows Search, Kind and Bot inline with the Day/Week/Month/Schedule text switcher and the 7-day grid (d-cal.png). Data room shows search, failed chip, Type, Party, Document date and Sort inline beside the folder tree (d-dr.png). Inbox has the 358 px inline search (d-inbox.png). The Inbox mail dialog on desktop was not reopened in this pass; the list page is unchanged. No phone-only styling leaks.

## 4. Observations that are not findings

- On a phone, a fresh profile starts with Pages collapsed to the pages that show a count (Inbox, Legal, Data room); Calendar, Company and Contacts are behind the Pages chevron (drawer.png, drawer-expanded.png). This is deliberate (`readCollapsedSidebarSections` in `apps/web/src/pages/Shell.tsx`), so I note it only because pass 2 saw Calendar in the default list.
- Not verified: to-do tap in Calendar and All-day bars (no such data in the demo), Complete checkbox size, drawer closing after an Activity row tap.

## 5. New findings

| Id | Sev | Cat | Finding | Evidence | File |
|---|---|---|---|---|---|
| P3-01 | P3 | a11y | Company Calendar tab: the "Anniversaries" checkbox row is 86x20, and the in-cell event link ("Q3 bo...") is 42x24 and truncated, so a coarse-pointer tap on a month event is hard. | co-Calendar.png (measured) | `apps/web/src/pages/Company.tsx` (calendar tab) and its calendar component |
| P3-02 | P2 | visual | Investors Cap table on a phone: holder names are cut ("Maya Chen ...", "River Cofou...") while the sub-line wraps to three lines ("Common · 4,000,000 · $2,500 invested") in a narrow column, and the 40.0% column keeps its width. Rows are about 90 px tall. Give the name the row width and put the share percent in the sub-line. | inv-Captable.png (observed) | `apps/web/src/pages/Investors.tsx` (holders table) |
| P3-03 | P3 | visual | Contacts: names are cut even though there is room ("Casey Advisor (...", "Jamie Placehold..."), and organisation/email shrink to "Halcyo… · dana@halc…" because the Kind badge column is wide. At 1440 the Name column is also truncated ("Casey Advisor (Mo…") while Email has spare width. Let Name take the free width and wrap the badge below on a phone. | contacts.png, d-contacts.png (observed) | `apps/web/src/pages/Contacts.tsx` (row and column widths) |
| P3-04 | P3 | a11y | Finance Spend rows: the counterparty link is 18 or 38 px high (e.g. 106x38, 115x18) inside a 61 px row. The chevron is a 44 px target, so the row is reachable, but the name is the obvious tap target. | fin-spend.png (measured) | `apps/web/src/pages/Finance*` spend table, name link |
| P3-05 | P3 | a11y | Finance transaction header breadcrumb links ("Finance", "Burn", "Oct 2026") are 20 px high on coarse pointers. In the details list the Merchant and Category values sit about 12 px below their labels. | fin-txn.png (measured and observed) | `apps/web/src/pages/Finance*` transaction page header |
| P3-06 | P3 | visual | Activity drawer: opening the filter puts a floating "Search runs / Filters" card on top of the first run, so "Investors agent, Needs approval" is covered while filtering. The card should push the list down. | act-filter.png (observed) | `apps/web/src/pages/ActivityList.tsx` |
| P3-07 | P3 | visual | Compose Context sheet covers From, To and Subject while open (it is a top sheet). Pass-2 asked for the editor and Send to stay visible, which they do; the recipient fields are what is hidden. A half-height bottom sheet would keep the whole form in view. | compose-ctx.png (observed) | `apps/web/src/components/ComposeEmail.tsx`, `ContextPanel.tsx` |

Carried over and not re-filed: "Leadership sync (mock)" name cut by the time (V3-09); half row behind "+N more" on desktop at 900 px height (W1-16 / R3-03); Investors Contacts email tail (V2-09).

Already excellent in this pass: one-row toolbars with a single Filters sheet across Contacts, Data room, Activity, Legal, Spend and Investors; the Company tab bar; the Schedule header; consistent Integrations cards; toast reserve in panels; 44 px chips and inputs in every sheet; no window-level horizontal scroll on any page at either width.
