# VIS-01: Shell keeps both side panels at 768 and crushes the content column

## Problem
Root cause, corrected after reading the code. problems.md suspected `reservedLeadingPx` was not passed to the panel. It is passed.
The defect is arithmetic in `ResizableSidePanel.maximumWidth()`: `max(MIN_WIDTH 320, min(1000, innerWidth - 316 - MIN_CHAT_WIDTH 320))`.
At 768 the inner term is 132, so the 320 floor wins and main = 768 - 316 - 320 = 132px (matches the cap-table screenshot).
Three contributing causes: the 316px sidebar docks at `md` (768, 41% of the screen); the panel docks at `md`; and the
Models overlay switches to a row at `md` with a fixed 310px left column, leaving ~138px on the right.
Findings covered: CS-P0, CT-F01, BA-A1, SI-F01, SI-F02, FI-F1, LG-F6, DR-11, SI-F21, AO-32, AO-17.
Evidence: `pages/{chat-shell,cap-table,board-artifacts,settings-integrations,finance,legal,data-room}/shots/768x1024-*.png`
(in the rakazo-ux-visual worktree). I read the cap-table shot only; the rest are taken from problems.md, not re-measured.

## Options considered
Weighted score out of 60 (weights 3/2/2/2/2/1 over criteria, usability, consistency, simplicity as in solution-rubric.md).
| Option | Idea | Usability lens | Visual lens | Engineering lens | MUSE Wonder | Gemini Argon |
|---|---|---|---|---|---|---|
| A Minimal | Move dock breakpoints (sidebar 1024, panel 1280), chat min 480, Models stacks <900 | 56 | 54 | 55 | 56 | 58 |
| B Restructure | `useShellLayout` width-budget hook, auto-collapse sidebar | 38 | 40 | 31 | 35 | 34 |
| C Convention | A plus scrim sheet, Escape, never restore open | 50 | 50 | 48 | 50 | 50 |
Internal lens scores are my own judgement (single agent, three lenses). External votes are the two models' own scores
converted with the same weights (raw output in `proposals/VIS-01/external-judges.json`). Both externals picked A.

## Decision
Proposal A, with one graft from C (both external judges suggested a version of it).
1. Sidebar docks from `lg` (1024). Below it, it is the existing drawer. All `md:` classes that mean "sidebar is docked"
   in Shell.tsx (about lines 3572, 3580, 3609, 3620, 4456, 4525, 4532, 4543) become `lg:`.
2. Right panel (`ResizableSidePanel`) docks from `xl` (1280): `md:relative md:w-(--panel-width) md:max-w-none` and the
   resize handle `md:block` become `xl:`. Below 1280 it is the existing overlay (`max-w-[384px]`) with `max-xl:shadow-xl`.
3. `MIN_CHAT_WIDTH` 320 -> 480.
4. One exported constant `DOCKED_SIDEBAR_QUERY = "(min-width: 1024px)"` replaces the five
   `matchMedia("(min-width: 768px)")` calls (Shell.tsx 424, 539, 743, 3520, 3543); a second `PANEL_DOCK_QUERY = "(min-width: 1280px)"` is used by the graft.
5. Models overlay: `md:flex-row`, `md:w-[310px]`, `md:min-h-0 md:max-h-none md:flex-1` become `min-[900px]:` (ModelSettingsOverlay.tsx ~1228-1243).
6. Graft (from C, shrunk): a right-panel state saved in storage is not restored open when `PANEL_DOCK_QUERY` does not match,
   so a reload at tablet width never covers the page (CS-P0 "panel persists after reload"). The implementer must find the
   restore read site (`pendingPanelRestore` / `panelStorageKey` effect near Shell.tsx 3088) and gate it. An explicit user
   open still works. Not taken from C: the 480px sheet, scrim, Escape handling and pressed toggle states; Escape and focus
   return belong to VIS-03 and the sheet widens cover to 62% of a 768 screen.

## Why this is the best
- Against B: it fixes the same widths with class swaps instead of a ResizeObserver hook across an 8622-line Shell.
  B's auto-collapse changes the user's navigation when they open a panel, and writes preference state as a side effect.
  Its one real gain (docking both from 1116px, and docking the panel beside a collapsed sidebar sooner) is not in any acceptance criterion.
- Against C: same widths; C adds a new sheet pattern, a scrim that blocks the main column at 1024-1279, and Escape/focus code that
  collides with VIS-03. Its useful part (do not restore an open overlay) is in the graft.
- Norms satisfied: L1/L2 (composer and primary action stay in view at 768), L3, L4, L6, L7 (nav left, work area largest), D2, I4.
- Costs and what it rules out: at 1024-1279 the agent panel is an overlay, not docked, even if the user hid the sidebar; users who
  liked a docked sidebar on an iPad portrait lose it (it is one tap away as a drawer). The overlay panel covers part of the main column.
  If the product wants docked panel with collapsed sidebar at 800-1279, that is B's budget logic and can be added later.
- Re-scope note: criterion 6 as written in problems.md cannot be met by this cluster alone because the board has its own horizontal scroll (VIS-14).
  The final criterion excludes `/app/board`.

## Final acceptance criteria (measurable)
Measure `main#main-content` and `[data-testid=bots-sidebar]` via `getBoundingClientRect()`.
1. 768x1024, chat with the Computer, Settings and Routines panels each opened, and the Carta agent panel on /app/cap-table:
   `main#main-content` width >= 480 (expected 768) and the composer textarea width >= 320. Sidebar is not visible (drawer closed).
2. At 768 and 1023: the sidebar is a drawer (`translateX` off-screen) and the panel `aside` is `position:absolute`.
   At 1280: sidebar docked, panel docked (`position:relative`).
3. 1440x900: drag the panel resize handle to the far left; chat main width >= 480. `End` key on the handle gives the same cap.
4. Reload at 768x1024 with a saved panel width of 900 and a saved open panel: panel is closed on load, and after opening it its width <= 384. At 1440 with a saved width of 1000 the panel width is <= 644.
5. Settings > Models at 768 and 375: single column; no text line shorter than 20 characters; `scrollWidth <= clientWidth` for the dialog body.
   At 900 and 1080 it is two columns with the right pane >= 400px.
6. `pageOverflowX === 0` at 768x1024 for the eight app areas other than `/app/board`, and no control clipped by its container (layout-audit).
7. Regression: at 1440x900 and 1920x1080 the layout is unchanged (sidebar 316, panel docked, no visual difference in the cap-table and chat screenshots).

## Implementation plan
Design system tokens: none new. Order: (1) `ResizableSidePanel.tsx` constants, breakpoint classes, shadow, export the two media-query constants
(put in `apps/web/src/lib/shell-layout.ts` only if Shell and the panel both import them; otherwise keep in the panel file). (2) Shell.tsx sidebar and header
class swaps plus the five `matchMedia` calls and the restore gate. (3) ModelSettingsOverlay breakpoint swap. (4) Update e2e specs that assume a docked
sidebar at 768 (grep `768` and `bots-sidebar` in `e2e/`). No story changes expected; run Storybook smoke only if a story file is touched. Run
`pnpm design-system:check`, tsc, biome ci. `intl:extract` only if strings change (none planned).

## Test plan (write failing first)
- New Playwright spec `e2e/shell-layout.spec.ts` (harness command in the task brief): sets viewports 768x1024, 1023x768, 1280x800, 1440x900, opens each panel, asserts criteria 1-4 with bounding boxes; fails on current main because main is 132px.
- Same spec: Models overlay at 768, 375 and 900 (criterion 5), including a min-line-length check by measuring a paragraph's `getClientRects()` width.
- Unit test (root vitest) for `maximumWidth` if extracted: at 768 with sidebar docked it can no longer return a value that leaves main < 480.
- Update existing e2e specs that open a panel at 768 and expect a docked sidebar; do not weaken assertions.
- Verify phase: agent-browser screenshots at 768x1024, 1024x768, 1440x900 of chat+Computer, cap table, artifact detail, finance, legal, data room, hub, Models; compare to the problem screenshots.
