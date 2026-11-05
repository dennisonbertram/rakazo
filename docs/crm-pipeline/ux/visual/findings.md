# CRM pipeline mockup: visual audit

Scope: `apps/web/src/pages/CrmPipeline.stories.tsx` (Storybook title "Fundraising/CRM pipeline mockup"), seven stories, four viewports (1440x900, 1920x1080, 768x1024, 375x812), light and dark. All 56 screenshots and the interaction shots are in `shots/`. Audit JSON (layout-audit and geometry-audit, light theme, every story and viewport) is in `audit.json`. Second opinions are in `second-opinion.json`.

Labels: [own] my observation, [muse] Meta Muse Wonder, [argon] Gemini 4 Argon. Evidence tags: measured (a number from an eval), observed (seen in a screenshot or by hand), suspected (inferred, not shown directly). Norm IDs come from the ux-visual skill's visual-heuristics reference.

Counts: P0 1, P1 3, P2 11, P3 9. Total 24.

## Answers to the specific questions

- Does the 9-column table fit at 1440? Yes in the story. Table width 1352 px equals its container, `pageScrollX` 0, no truncated text with the fixture data (measured). But the story has no app sidebar. The real app reserves a 316 px bots sidebar (`apps/web/src/pages/ResizableSidePanel.tsx`, `BOTS_SIDEBAR_WIDTH`), so the real table gets about 1100 px at a 1440 window. I re-measured at a 1100 px viewport as a proxy: 17 texts truncated and 11 cells clipped (measured). At 1280 five texts already truncate. At 768 it breaks (P0 below).
- Hierarchy of Interest versus Status: inverted. See V5.
- Red overdue text against the monochrome rule: red is an allowed status color, so the rule is not broken. The weakness is that red is the only signal per row. See V8.
- Filter row: nine identical pills repeating the nine column names, plus Wave which has no column. See V9.
- Row height for a long list: 65 px measured per row (every row, every width). The real compact table uses 44 px. See V6, V7.
- Phone row: well recomposed, with three small defects. See V16, V17, V22.
- Consistency with real app tables: the mockup does not use the real table recipe (compact rows, container queries, title tooltips, right-aligned numbers, empty state). See cluster 1.

## Praise (verified)

- 1440 story: no horizontal scroll, header and cells share left edges, Investor name bold with muted contact line, tabular numbers, one sorted header with an arrow (`pipeline-1440x900-light.png`). [own][muse]
- Phone recomposition: search plus one Filters button, rows become name / status and amount / next call, Seed card restacks 2x2 (`pipeline-375x812-light.png`). [own][muse]
- Progressive disclosure of "Log": it shows on row hover, row keyboard focus, and always on touch (`pointer-coarse`). It stays in the tab order. Observed with Tab (`i-tab-log-1440.png`). [own]
- Accessible names exist on every row control ("Status of Sample Street Capital: Intro made", "Interest: Sample Street Capital"). Contrast audit reports zero low-contrast text in light mode at every viewport (measured). [own]
- Dark mode has parity: same layout, pressed toggle inverts to a light fill, overdue red lightens (`pipeline-1440x900-dark.png`). [own][argon]
- Reconcile card: the disabled "Add 96" button has its reason beside it ("1 left to choose"), and the collapsed groups carry counts (`reconcile-1440x900-light.png`). [own]
- Invite dialog: the primary button counts recipients ("Send invite to 1 person"); title is pre-filled and focused (`invite-confirm-1440x900-light.png`). [own][muse]
- Investor page: fields on the left, timeline on the right, one screen at 1440 (`investor-timeline-1440x900-light.png`). [own][argon]

## Findings

### P0

**V1. Table collapses into overlapping text at 768 (and GTM too).** Measured and observed. `pipeline-768x1024-light.png`: the Interest toggle sits on top of Referred by ("Maybe" over "Sam E..."), the Status badge runs under the toggle, "$250,000" touches "Seed lead". layout-audit `overlaps` lists toggle versus referrer link and Add button on 8+ rows; geometry-audit counts 27 clipped cells at 768 (table width 680). `gtm-leads-768x1024-light.png` shows the same, with 30 px overflow spills. The table is shown from 640 px up (`max-sm:hidden` / `sm:hidden` in `PipelineTable`), but fixed percentage widths give Interest 68 px at 768 while its toggle group needs 112 px. Norm L6, I8. [own][muse][argon agree: P0]

### P1

**V2. In the real app the table is narrower than the story, so truncation starts at 1440.** Measured at a 1100 px viewport as a proxy for 1440 minus the 316 px sidebar: 17 truncated texts, 11 clipped cells, Investor column 142 px. Suspected for the real app (I did not render it there). Norm L6, C4. [own]

**V3. Filtering to zero rows shows a header row and nothing else.** Observed. `i-filter-two-1440.png`: after "Status: Called" plus "Next call: Overdue" the card ends under the column headers; no message, no "Clear filters" button; "2 overdue" and "2 today" still show. The real `HoldingsTable` shows "No matches" with a "Clear filters" button. Norm I8, H5. [own][muse][argon]

**V4. Choosing Interest "Out" silently changes Status, and the reverse.** Observed. `i-interest-out-row.png`: "Left message" became "Passed" the moment I clicked Out, with no toast and no undo; picking status Committed or Passed sets Interest the same way (`fromStatus` and `outStatus` in the config). Two controls describing overlapping facts, with a hidden link between them. Norm I3, I2, C2. [own]

### P2

**V5. Hierarchy of Interest versus Status is inverted, and In and Out look the same.** Observed. The selected Interest segment is solid ink, the only ink fill in each row, so it forms a dark column down the table, while Status (the pipeline stage) is a pale grey badge. A pressed "In" and a pressed "Out" are identical except for the word (`i-interest-out-row.png`, `pipeline-1440x900-light.png`). Thirty bordered segments in ten rows add visual noise. Norm H2, H1. [own][muse P2][argon P1]

**V6. Rows are 65 px.** Measured, every row at 1440, 1920 and 768. Norm D1 (dense tools: 28-36 px) and the app's own compact table (`h-11`, 44 px, `HoldingsTable.tsx`). Cause: second lines are reserved even when empty (`mt-1 h-6` slot under Investor, Fund details, Last call), and Next step clamps to two lines. Rows such as "Test Harbor Fund" carry a blank second line. Ten rows take 650 px; with the 150 px Seed card above, about eight rows are visible at 900 px high. [own][muse][argon]

**V7. With "See all" the column headers scroll away.** Observed, `i-seeall-bottom-1440.png` (143 rows, inner scroll height 9458 px, no sticky header, filter row also scrolls off). Rows 100+ have no column labels. Norm I6, L3. [own]

**V8. Overdue is shown by color alone on each row.** Observed. "Nov 2, 10:00" and "Nov 3" are red; the word "overdue" appears only in the card header. "Today" is marked only by font weight 500 versus 400 on the other dates, which is hard to see. Norm C3 (words plus color), H4. Red itself is the permitted `destructive` token, so the monochrome rule is intact. [own][muse][argon: praised red, flagged today versus future]

**V9. Nine filter pills duplicate the nine column headers, and Wave filters something you cannot see.** Observed. The pill row spans 1190 px at 1440 and wraps to two lines at 768. The real compact tables carry two or three filters. "Wave" has no column and no per-row marker, so a Wave filter cannot be verified in any row. Norm I5, C2, I6. [own][muse][argon]

**V10. Empty cells are handled three different ways.** Observed. Referred by shows a permanent "+ Add"; Next call shows "Set date" only on hover; Possible amount, Fund details, Last call and Next step are plain blank. A blank cell reads as a loading failure. Norm I8, H5. [own][muse][argon]

**V11. Amounts are left-aligned.** Observed. "$250,000", "$750,000" and "$100,000" do not line up by magnitude; `HoldingsTable` right-aligns its numeric columns. Same for Deal value in GTM. Norm H6. [own][argon P3]

**V12. GTM search placeholder reads "Search companys".** Measured text, `gtm-leads-1440x900-light.png`. The placeholder is built as `` `Search ${primary}s` `` in `PipelineTable`. Norm C1. [own][muse][argon]

**V13. Truncated names have no tooltip.** Measured: with a long name injected into row 1, Investor, Referred by and Fund details truncate (4 truncated elements) and every `title` attribute is empty. `HoldingsTable` sets `title` and uses `line-clamp-2`. Norm C4. [own]

**V14. Phone: the unset Interest control is labeled "Interest".** Observed, `pipeline-375x812-light.png`. Unset rows show an outlined "Interest v" pill, which looks like a column label; set rows show "Maybe v" or "In v". Setting it costs two taps, versus one on desktop. Norm I1, C1. [own][muse][argon]

**V15. Phone: the actions button is 32x32.** Measured (`Actions for Sample Street Capital`, 32x32; the Interest pill is 72x44). Norm I4 (44 on touch). [own]

### P3

**V16. Small hit areas in the shared table.** Measured: sort header buttons 16 px tall, name, status badge and referrer link 20 px. The Interest segments are 24 px tall with unequal widths (25 / 52 / 35 px; geometry-audit `unevenRows`). Norm I4, H6. The header buttons come from the shared `TableHead`. [own]

**V17. Phone: the "..." button is unlabeled to a sighted user and sits beside a pill of different shape.** Observed. Norm I1, P2. [own][muse P3]

**V18. Focus: the row frame is loud and the control ring is faint.** Observed (`i-focus-in-toggle-row.png`, `i-tab-toggle-1440.png`): the whole row gets a 2 px dark frame, while the focused segment gets only a thin ring. Each row has 7-8 tab stops, so reaching "See all" takes about 80 Tabs (8 stops counted in row 1). Tab order is logical, every stop shows focus, and Escape closes the menus. Norm I7. [own]

**V19. Left edge mismatch.** Measured: card title and search field start at x=44, table text at x=52 (header cells use `ps-2`). Norm L4, H6. [own]

**V20. Investor page has no back control at 1440.** Observed. The phone view has a left arrow; the 1440 story has no arrow or breadcrumb. May be covered by the app sidebar. Suspected. Norm I6. [own][argon P2]

**V21. Off-scale spacing.** Measured: 6 px and 10 px gaps, with near-duplicate pairs 4/6, 6/8, 8/10 and 10/12 (spacing audit). Norm D3. Likely shared component styling, not specific to this mockup. [own]

**V22. Phone Filters sheet is long, and Sort sits at the bottom after ten filter groups.** Observed (`i-phone-filters-bottom-375.png`). With a filter active, the closed "Filters" button shows no indicator (suspected; only the idle state was captured). Norm I5, I6. [own]

**V23. Next call popover and date format.** Observed. The popover (`sideOffset=32`) covers the next row's date (`i-nextcall-popover-1440.png`). The native date input shows "11/02/2026" while the cell shows "Nov 2". Norm H5. [own][argon]

**V24. "2 overdue" and "2 today" look like plain text, and filter chips shift when a filter is applied.** Observed. The counters are ghost buttons without a pressed state; when a filter becomes a chip, later pills move 56 px right (`i-filter-overdue-1440.png`). Norm I1, L5. [own]

**V25. Invite dialog: an attendee without an email is still checkable.** Observed (`invite-confirm-1440x900-light.png`, "Morgan Example" with "No email: add one"). Norm I3. [own][muse P2]

## External claims I rejected

- [argon] "Backdrop blur ends at 900 px, leaving the bottom rows unblurred" (P1): a capture artifact. I used full-page screenshots and the overlay is fixed to the viewport. Not a product issue.
- [muse] "Status pill carries an unexplained heavy double outline" (P1): that was the keyboard focus ring left on the pill after I closed its menu. Active filter chips are otherwise distinguishable (grey fill plus x). Rejected. "No Clear all" on desktop is true but minor and folded into V3.
- [muse] "Dark mode text contrast is low": layout-audit `lowContrast` is empty in light mode; I did not run the dark audit, so contrast in dark mode is unmeasured. Visually dark mode reads fine. Not accepted as a finding.
- [muse] "Progress bar is ambiguous (25% grey)": the Seed round card is an existing component, out of scope for this mockup.
- [own, dismissed] `pageScrollY` 280 at 1440x900 comes from the story harness (`h-[1180px]`), not the product.

## Not tested

Dark-mode layout-audit, 200% zoom, row click opening the investor page while clicking inside controls, drag or resize of the real sidebar, real keyboard use of the native date picker.
