# CRM pipeline mockup: problems ranked by root cause

Each cluster lists the findings (IDs in `findings.md`) and a pass or fail test. Counts: P0 1, P1 3, P2 11, P3 9.

## 1. The table is sized for one wide container (V1, V2, V13, V11, part of V6) - P0

Root cause: the table-versus-list switch is a viewport breakpoint at 640 px, columns use fixed percentage widths with `table-fixed`, and the Interest and Status controls need more width than their columns have below about 1200 px. The mockup also skips the real table recipe: compact rows, container-query column hiding (`@lg`), `title` on truncated text, right-aligned numbers.
Acceptance:
- layout-audit `overlaps` is `[]` and geometry-audit `overflowSpills` is `[]` for Pipeline and GtmLeads at container widths 640, 768, 900, 1100 and 1440.
- At a 1100 px container, no control (toggle, badge, button) is clipped; at most Fund details and Next step may truncate, and each truncated text has a `title`.
- Below the width where all nine columns fit, columns hide by container query (or the list layout takes over) rather than squeezing.
- Possible amount and Deal value are right-aligned in header and cells.

## 2. States and side effects without feedback (V3, V4, V10) - P1

Root cause: no empty-result state; Interest and Status are coupled in code with no visible link; empty cells have no shared rule.
Acceptance:
- Filtering to zero rows shows "No matches" and a "Clear filters" button (same as `HoldingsTable`), and the card header counters either hide or reflect the filtered set.
- Clicking Interest Out (or choosing Status Passed) shows an undo toast naming the second change, and Undo restores both values.
- One rule for blank cells, for example a muted dash for unset values and the action only on hover or focus. All nine columns follow it.

## 3. Row density and long-list navigation (V6, V7) - P2

Root cause: second lines are always reserved, and the table header is not sticky inside the scroll area.
Acceptance:
- Median row height at most 52 px (target 44 px), measured on the first 10 rows at 1440.
- At least 12 rows visible at 1440x900 below the Seed card.
- After "See all", the column header row stays visible while scrolling 140 rows (header `getBoundingClientRect().top` unchanged after scrolling 3000 px).

## 4. Interest outweighs Status, and overdue is color only (V5, V8) - P2

Root cause: the solid ink fill is spent on a decision control instead of the stage; row state uses one color channel.
Acceptance:
- In any row, no more than one control carries a solid fill, and it is not an unselected-to-selected toggle repeated down a column (for example, pressed state is a border and weight change, or Interest becomes a badge menu like Status).
- Pressed In and pressed Out are distinguishable at a glance without reading the label (different icon or glyph), checked by showing 10 rows to 3 people and asking them to find all "Out" rows in under 5 seconds.
- Overdue rows carry a word or icon next to the date (for example "Overdue" in the cell's second line); "today" is distinguishable from later dates by more than weight 500.

## 5. Filter bar mirrors the column headers (V9, V24) - P2

Root cause: one filter per column by default.
Acceptance:
- At most five filters are visible at 1440; the rest sit behind one "Filters" control or appear only when their column is hidden.
- Every filter has a visible per-row signal (Wave gets a column or a row marker, or the filter is removed).
- Applying a filter does not move other pills by more than 0 px (chip adds inside a reserved slot or the bar does not reflow).

## 6. Phone row and sheet (V14, V15, V17, V22) - P2

Root cause: desktop controls were shrunk instead of redesigned for touch.
Acceptance:
- Every tappable control in a phone row is at least 44x44 px (layout-audit `smallTargets` is `[]` at 375).
- The unset Interest pill reads "Set interest" (or shows only an icon with an accessible name), not the column name.
- The Filters button shows an active-filter count when any filter is set; Sort is reachable without scrolling past the filter groups.

## 7. Copy and small consistency defects (V12, V19, V21, V23, V25, V16, V18, V20) - P2 and P3

Acceptance:
- Placeholder reads "Search companies" and "Search investors" (pluralize correctly).
- Table text and card title share one left edge (layout-audit `nearMissEdges` has no 44/52 pair).
- Next call popover does not cover the next row's date, and its date field uses the same format as the cell, or the cell uses the field's format.
- Sort header buttons are at least 24 px tall; the Interest segments have equal width.
- A focused row control shows a ring at least as strong as the row frame, or the row frame is dropped.
- Investor page has a visible way back at every width.
- Invite attendees without an email cannot be ticked until an address is entered.
