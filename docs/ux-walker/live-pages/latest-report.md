# UX Walker Report: Live pages (2026-11-01)

## Run Summary

| Metric | Value |
|--------|-------|
| **Target URL** | Demo stack on a local port (isolated demo slot, seeded data) |
| **Run mode** | Full, focused on the "Live pages" catalog |
| **Stories in catalog** | 65 |
| **Walkable stories** | 59 |
| **Not walkable** | 6 (STORY-023, 028, 031, 032 need a bot action; STORY-064, 065 are native app) |
| **Stories walked** | 58 of 59 walkable, by 8 walker sessions (STORY-026 not walked: it needs a second approval card, and the single seeded card was used by STORY-025) |
| **Stories skipped / re-verified** | 0 / 0 (first run) |
| **Result of the 55 reports** | 45 pass, 7 partial, 3 fail (pass rate 45/55, 82%) |
| **Duration** | TBD |

Corrections applied by the lead before merging:

- The "Refresh blanks blocks" finding (originally critical) is mostly a seed artifact. The seeded sources point at JSON paths (/burn, /vendors, /cash) that the demo finance_overview result lacks. Only the residual defect is kept, as medium (LP-07). The blank snapshot in STORY-050 is treated the same way.
- Raw JSON printed by the Cash HTML page comes from the seeded page's own script and is dropped (F-062-1, F-061-2, F-037-2).
- "No notification or Activity for the approval card" (F-027-1) is a seed artifact and is dropped.
- Walk limitations (F-015-3, F-022-4, F-033-4, F-040-1) and tooling notes are not app findings and are dropped.

161 raw findings were reported. 8 were dropped and the other 153 were merged into 53 issues (file: `findings.json`; each issue lists its source finding ids). Screenshots are named "story screenshot step-N" in each story's walk report.

## Findings Summary

Counts are for the 53 merged issues. No fixes were applied and no GitHub issues were filed in this run, so every issue is deferred.

### By Severity

| Severity | Count | Quick Fixed | Issue Filed | Deferred |
|----------|-------|-------------|-------------|----------|
| Critical | 0 | 0 | 0 | 0 |
| High | 6 | 0 | 0 | 6 |
| Medium | 23 | 0 | 0 | 23 |
| Low | 22 | 0 | 0 | 22 |
| Suggestion | 2 | — | — | 2 |
| **Total** | **53** | **0** | **0** | **53** |

### By Category

| Category | Count | Examples |
|----------|-------|---------|
| Error Handling | 11 | Delete block has no undo (LP-10); dead share link page is bare (LP-24) |
| Happy Path | 7 | HTML page stuck on "Loading" (LP-02); share replaces live link (LP-05) |
| Flow | 7 | Approval link lands with the card off screen (LP-14) |
| Visual | 6 | Spend chart axes unreadable (LP-03); white HTML frame in dark mode (LP-18) |
| Accessibility | 5 | Page options covered by tabs (LP-01) |
| Consistency | 5 | Sources dialog shows internal ids (LP-09) |
| Layout | 5 | Status popovers cover the value (LP-12) |
| Disclosure | 3 | Blank new page, no saved cue (LP-42) |
| Hierarchy | 3 | "Waiting for approval" looks like plain text (LP-40) |
| Simplicity | 1 | State written in block names and shown by a dot (LP-52) |

## Quick Fixes Applied

None. This run only walked and recorded.

## Issues Filed

None.

## UX Audit Summary

### Common Patterns

- **Page options button is unreachable by pointer once a page has 4+ tabs.** The selected tab overlaps the "..." button in the chat side panel, on desktop and on a phone.
  - Affected stories: STORY-002, 003, 004, 025, 051, 057, 061, 063
  - Root cause: tab strip and options button share one row without reserved space.
  - Recommendation: reserve space for the button or move it out of the tab row (LP-01).
- **The page UI uses internal names where the user sees friendly names.** Sources rows read cash, vendors, paused, pausedempty and repeat "finance_overview - Hourly".
  - Affected stories: 016, 017, 018, 019, 021, 024, 034, 060, 063
  - Recommendation: show the block title as the row label (LP-09).
- **The HTML page is a second-class page.** It can stay on "Loading", ignores Hide amounts, has no freshness or failure cue, and draws a white frame in dark mode.
  - Affected stories: 001, 012, 024, 035, 036, 037, 038, 041, 062
  - Recommendation: give HTML pages the same status chip and theme as block pages (LP-02, 16, 17, 18).
- **Silent state changes.** Share replaces a link, Stop sharing shows nothing, Refresh shows nothing, Resume keeps the "failed" badge, and the sidebar does not follow create, rename or delete.
  - Affected stories: 013, 020, 045, 048, 050, 053, 055, 056, 057
  - Recommendation: add a visible confirmation or correct the stale state (LP-05, 06, 08, 35, 43).
- **Status communication is weak.** Failed, paused and pending blocks share one amber dot; popovers cover the value they explain and give no next step.
  - Affected stories: 010, 011, 012, 019, 022, 038, 056, 059, 063
  - Recommendation: distinct icons, popovers placed beside the value, and an action in each popover (LP-11, 12, 13).

### Systemic Issues

1. **A path that resolves to nothing is hidden.** A block shows "No data yet" while Sources shows "ok", so a wrong JSON path looks like an empty result, and a manual Refresh drops the previous value. Affects 6 stories (LP-07).
2. **Spend chart is unreadable.** Raw ISO timestamps overlap, left labels are clipped, and there is no title or unit. Affects 6 stories (LP-03).
3. **Destructive controls are hover-only.** Delete block has no confirmation or undo and is invisible on touch. Affects 7 stories (LP-10).
4. **Removing the only source breaks the page** and the confirm dialog does not say so (LP-04).

## Visual Consistency and Flow

### Friction (from the walk reports)

| Story | Ideal steps | Actual steps | Cause |
|-------|-------------|--------------|-------|
| STORY-016 Monday board-prep check | 12 | about 22 | Blanked blocks, extra clicks on Page options |
| STORY-041 Long walk across surfaces | 12 | about 30 | HTML "Loading", reloads, two Back presses |
| STORY-048 Page deleted but still in sidebar | 6 | about 14 | Add page menu missing until reload, covered options button |
| STORY-050 Monday review to shared snapshot | 9 | about 17 | Sources detours, internal source names |
| STORY-003 Rename a page in the side panel | 4 | about 12 | Options button covered by tab |
| STORY-051 Share the Cash page | 4 | about 7 | Hard to find the bot, panel opens on the wrong tab, covered options |
| STORY-049 Open a sidebar page on a phone | 4 | 6 | Pages group collapsed in the drawer |
| STORY-033 Approval card on a phone | 4 | 5 (not answered) | Agent hidden behind "+11 more" |
| STORY-004 Delete a page | 4 | 5 | Mouse fails on "...", keyboard fallback |
| STORY-036 HTML page data and Refresh | 4 | 5 | No feedback after Refresh |
| STORY-021 Remove the Spend source | 5 | 6 | Cancel detour as in the story |
| STORY-046 Panel from chat | 4 | 5 | Card below the fold |
| STORY-025 Allow the pending API source | 5 | 6 | Panel opens on the wrong tab, covered gear |
| STORY-002 Add a second page | 4 | 5 | Empty editor gives no hint |

Other walks matched the ideal step count (for example STORY-001 3/3, STORY-017 3/3, STORY-019 5/5, STORY-053 3/3). STORY-007 has no path: an empty bot offers no way to create a page.

### Duplicated or conflicting information

- The same cash or burn figure shows in the chat header chip, the Cash page and the HTML page. The header chip ($1,533,221) and the Cash page ($250,000 for Cash (stale)) look like two different cash numbers for one bot (LP-53; possibly seed data).
- "Paused after 5 failed refreshes" appears in the dot popover and the Sources row.
- Failure uses different words in the dot ("Source failed") and the dialog ("failed").
- Block names carry their state in text ("Cash (stale)", "Payroll (paused)") and then also show a dot (LP-52).
- Three routes lead to the same page (sidebar, panel tabs, Add page) and two controls are both called "Page options" (LP-33).
- Cash, Cash HTML and Spend use one identical teal avatar (LP-33).
- Two table styles on one page: Markdown table with heavy borders and the live table card (LP-30).

## Top 5 Recommendations

1. **Make Page options reachable (LP-01)**: would improve 8 stories. Reserve space for the "..." button or move it out of the tab row. This blocks Share, Sources, Rename and Delete by pointer on desktop and phone.
2. **Fix the HTML page (LP-02, 16, 17, 18)**: would improve about 9 stories. Fix the "Loading" hang, add a status and freshness chip, honour Hide amounts, follow the app theme.
3. **Make the Spend chart readable (LP-03, 19)**: would improve 6 stories. Format dates, thin ticks, pad the left axis, add a title and units, and make the warning triangle a labelled button.
4. **Stop silent state changes (LP-05, 06, 08, 35, 43)**: would improve about 9 stories. Show the existing share link before replacing it, refresh the sidebar after page create, rename and delete, clear the failed badge on resume, add a confirmation to Stop sharing and Refresh.
5. **Show real names and real problems in Sources and blocks (LP-07, 09, 11, 12, 13)**: would improve about 14 stories. Use block titles in Sources, flag a path that finds nothing instead of "No data yet", and give failed, paused and pending different icons with a next step.

## Still Failing

| Story | Failure Point | Reason | Blocked By |
|-------|---------------|--------|------------|
| STORY-014 | Reading the chart | X axis is unreadable raw timestamps, y axis clipped (LP-03) | not filed |
| STORY-041 | Steps for HTML page and Hide amounts | HTML page stuck on "Loading"; ignores Hide amounts (LP-02, 16) | not filed |
| STORY-048 | Page deleted, sidebar row remains | Dead row opens an unrelated chat (LP-06) | not filed |

Partial walks:

| Story | Reason |
|-------|--------|
| STORY-010 | Failed state was lost before Retry could be observed |
| STORY-013 | Refresh shows "No data yet" for paths that resolve to nothing (LP-07); no visible feedback (LP-43) |
| STORY-016 | Same as STORY-013, plus the approval card off screen (LP-14) |
| STORY-022 | Manual Retry works but the page shows less data afterwards; auto-pause could not be walked (no worker tick) |
| STORY-040 | Bot edit steps were not walkable |
| STORY-050 | Blank page and snapshot after review (LP-07); share replaced the link (LP-05); Resume badge (LP-08) |
| STORY-059 | Failed source was no longer failed on the phone, so Retry was not exercised |

## Story Results Detail

Findings column is the raw count after dropping the 8 non-app findings. Statuses come from the walk reports.

| Story | Status | Findings |
|-------|--------|----------|
| STORY-001 | Pass | 3 |
| STORY-002 | Pass | 3 |
| STORY-003 | Pass | 3 |
| STORY-004 | Pass | 3 |
| STORY-006 | Pass | 2 |
| STORY-007 | Pass | 2 |
| STORY-008 | Pass | 2 |
| STORY-009 | Pass | 3 |
| STORY-010 | Partial | 1 |
| STORY-011 | Pass | 3 |
| STORY-012 | Pass | 5 |
| STORY-013 | Partial | 2 |
| STORY-014 | Fail | 3 |
| STORY-015 | Pass | 2 |
| STORY-016 | Partial | 5 |
| STORY-017 | Pass | 2 |
| STORY-018 | Pass | 2 |
| STORY-019 | Pass | 3 |
| STORY-020 | Pass | 2 |
| STORY-021 | Pass | 3 |
| STORY-022 | Partial | 3 |
| STORY-024 | Pass | 2 |
| STORY-025 | Pass | 3 |
| STORY-027 | Pass | 1 |
| STORY-029 | Pass | 2 |
| STORY-030 | Pass | 2 |
| STORY-033 | Pass | 3 |
| STORY-034 | Pass | 3 |
| STORY-035 | Pass | 2 |
| STORY-036 | Pass | 3 |
| STORY-037 | Pass | 1 |
| STORY-038 | Pass | 3 |
| STORY-039 | Pass | 2 |
| STORY-040 | Partial | 0 |
| STORY-041 | Fail | 4 |
| STORY-044 | Pass | 4 |
| STORY-045 | Pass | 2 |
| STORY-046 | Pass | 4 |
| STORY-047 | Pass | 2 |
| STORY-048 | Fail | 4 |
| STORY-049 | Pass | 6 |
| STORY-050 | Partial | 6 |
| STORY-051 | Pass | 3 |
| STORY-052 | Pass | 2 |
| STORY-053 | Pass | 2 |
| STORY-054 | Pass | 1 |
| STORY-055 | Pass | 1 |
| STORY-056 | Pass | 3 |
| STORY-057 | Pass | 4 |
| STORY-058 | Pass | 5 |
| STORY-059 | Partial | 2 |
| STORY-060 | Pass | 3 |
| STORY-061 | Pass | 3 |
| STORY-062 | Pass | 3 |
| STORY-063 | Pass | 5 |

Not walkable: STORY-023, 028, 031, 032 (bot action), STORY-064, 065 (native app). Not walked: STORY-026 (needs a second approval card).

### Late walk: STORY-043, STORY-042, STORY-005
- STORY-043 Remove a page from the sidebar: pass (2 low: "Remove from sidebar" wraps to two lines; the app jumps to the Chief chat with no hint).
- STORY-042 Re-add with "Add page": pass (1 low: menu item indent differs from its group header).
- STORY-005 Reach the 20-page cap: **fail**. The cap works, but from 5 tabs the tab row covers both the + and Page options buttons (real mouse clicks refused); at 20 tabs the active tab is off-screen and tab text spills out of its pill (desktop and 390 px); the disabled + gives no reason; naming a new page hides the other tabs. Same root cause as LP-01, which this raises in priority.

## Run History

| Run | Date | Walked | Passed | Partial | Failed | Fixes | Issues |
|-----|------|--------|--------|---------|--------|-------|--------|
| 1 | 2026-11-01 | 58 | 47 | 7 | 4 | 0 | 0 |

---

*Generated by `/ux-walker` — 2026-11-01*
