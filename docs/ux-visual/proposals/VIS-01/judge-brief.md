# Judge brief: VIS-01 Shell keeps both side panels at 768 and crushes the content column

Root cause: panel max width = max(320, innerWidth-316-320) so the 320 floor wins; at 768 main = 132px. Sidebar (316px) docks at 768. Acceptance: (1) 768x1024 with right panel open main>=480, composer>=320; (2) below 1024 sidebar and panel are overlays or mutually exclusive; (3) 1440 max drag leaves chat>=480; (4) stored panel width/open clamped on load; (5) Models stacks below 900, no <20ch lines; (6) no overflowX or clipped controls at 768 on nine areas. Score each proposal 1-5 on: meets criteria x3, simplicity x2, consistency x2, usability x2, visual quality x2, effort/risk x1. Return winner, optional graft, defense. Persona: naive first-time founder using a tablet or small laptop.

---
# VIS-01 Proposal A (Minimal): move two breakpoints and raise one minimum

## Root cause (confirmed in source)
The squeeze is arithmetic, not a missing prop. `ResizableSidePanel.maximumWidth()` is
`max(MIN_WIDTH=320, min(1000, innerWidth - 316 - MIN_CHAT_WIDTH=320))`. At 768 that is
`max(320, 132)`, so the 320px floor wins and the main column is 768 - 316 - 320 = 132px.
`reservedLeadingPx` IS passed (`botsSidebarCollapsed` prop), so the "not passed" hypothesis in
problems.md is wrong. The real defects: (1) the sidebar docks at `md` (768) although 316px is
41% of that width; (2) the panel docks at `md` too; (3) the panel's own minimum beats the
"keep chat wide" rule; (4) Models uses `md:flex-row` with a fixed 310px left column.

## Change
1. Sidebar docks from `lg` (1024) instead of `md` (768); below that it is the existing phone drawer
   (hamburger, scrim, swipe edge). Classes `md:` -> `lg:` on the sidebar `<aside>` (Shell.tsx ~3580), its
   scrim (~3572), hide/close buttons (~3609, ~3620), edge handle (~4456), swipe edge (~4525), header
   hamburger and `md:px-[22px]`/`md:hidden` (~4530-4543).
2. Right panel docks from `xl` (1280). Below that it is the existing phone overlay (`absolute`, `max-w-[384px]`).
   `md:relative md:w-(--panel-width) md:max-w-none` -> `xl:`; resize handle `md:block` -> `xl:block`.
   Add `max-xl:shadow-xl` so an overlay panel separates from the page.
3. `MIN_CHAT_WIDTH` 320 -> 480 in ResizableSidePanel. At 1280 with sidebar the cap is 1280-316-480=484, at
   1440 it is 644, so dragging can never leave chat under 480. Stored width is already clamped through
   `Math.min(maxWidth, preferredWidth)` on first render, so a reload cannot restore a bad layout.
4. One constant `DOCKED_SIDEBAR_QUERY = "(min-width: 1024px)"` replaces the five
   `matchMedia("(min-width: 768px)")` calls (Shell.tsx 424, 539, 743, 3520, 3543) so JS and CSS agree.
   Page-agent panels default to collapsed below 1024 as they do on phones today.
5. Models overlay: `md:flex-row` / `md:w-[310px]` / `md:min-h-0 md:max-h-none md:flex-1` ->
   `min-[900px]:` (ModelSettingsOverlay.tsx 1228-1243). Below 900 it is already a single column.

## Before / after (768x1024, cap table, Carta panel open)
```
before: [sidebar 316][main 132][panel 320]       after: [main 768 (hamburger)        ]
                                                        [  panel overlay 384 at right ]
1024:   [sidebar 316][main 708]  panel = overlay 384
1280:   [sidebar 316][main 644][panel 320]
1440:   [sidebar 316][main >=480 .. 644][panel 320..644]
```

## Files and tokens
Shell.tsx, ResizableSidePanel.tsx, ModelSettingsOverlay.tsx. No new tokens. Uses existing `shadow-xl`
and Tailwind breakpoints already in the design system. No new component. Update stories only if a story
renders the shell (none found).

## Effort / risk
S-M: about 20 class swaps, one constant, one number. Risks: (a) 1024-1279 users lose the docked panel and
get an overlay; (b) tests with 768 viewport that assume a docked sidebar (e2e specs using `bots-sidebar`
at 768) need new viewport; (c) a persisted `botsSidebarCollapsed` is meaningless in drawer mode (harmless);
(d) a panel that is "collapsed" for the user at 1280 when the sidebar is hidden could have docked earlier but
overlays until 1280 (no collapse-aware logic).

## Acceptance criteria
1. 768: sidebar is a drawer, main = 768, panel overlays. Composer is full main width (>=320). Met by (1)(2).
2. Below 1024 sidebar is a drawer; panel is an overlay below 1280, so never both docked beside main. Met.
3. 1440 max drag leaves 1440-316-644=480. Met by (3).
4. Reload clamp: width is `min(maxWidth, preferred)` and overlay below 1280 ignores width. Met.
5. Models stacks under 900. Met by (5). The 20-character check is verified by test at 768 and 375.
6. pageOverflowX 0 / no clipped controls on the nine areas at 768: removes the squeeze that caused most
   clipping. The board's own horizontal scroll (VIS-14) is out of scope and must be excluded from this check.

---
# VIS-01 Proposal B (Restructure): a layout budget hook decides what docks

## Change
Replace scattered breakpoints with one `useShellLayout()` hook (ResizeObserver on `shell-root`) that
owns a width budget: `MAIN_MIN = 480`, `SIDEBAR = 316`, `PANEL_MIN = 320`.
- `sidebar = "docked"` if width >= 316 + 480 (796) and the user has not collapsed it, else `"drawer"`.
- `panel = "docked"` if width - (sidebar docked ? 316 : 0) - 480 >= 320, else `"overlay"`.
- When the user opens a panel and the sidebar is docked but the budget fails, the sidebar auto-collapses to
  the rail state (existing `botsSidebarCollapsed` path) and the panel docks if it now fits, else overlays.
- The hook exposes `data-sidebar-mode` / `data-panel-mode` on `shell-root`; Tailwind classes key off those
  attributes (`group-data-[panel-mode=docked]/shell:relative`) instead of `md:`.
- `ResizableSidePanel` reads `panelMode` and `maxWidth = width - sidebarWidth - 480` from the hook, deleting its own
  resize listener and constants.
- Models overlay uses a container query (`@container`, `@[900px]:flex-row`) on the dialog.

## Before / after
```
768:  [main 768]  panel overlay                 (sidebar drawer: 768 < 796)
900:  [sidebar 316][main 584]  panel overlay    (320+316+480 = 1116 needed to dock both)
1000 with panel open: sidebar auto-collapses -> [main 680][panel 320]
1116+: [sidebar 316][main 480..][panel 320..]
```

## Files and tokens
New `apps/web/src/lib/useShellLayout.ts` (+ unit test), Shell.tsx (state wiring, remove 5 matchMedia calls,
class rewrite for about 18 `md:` uses), ResizableSidePanel.tsx (rewrite props), ModelSettingsOverlay.tsx,
`app.css` only if group variants need a utility. No tokens.

## Effort / risk
L. Shell.tsx is 8622 lines and the auto-collapse writes `bots-sidebar-pref` as a side effect of opening a panel,
which can surprise users who then find the sidebar still hidden on a wider screen (must be non-persisted).
ResizeObserver on the root causes a layout pass per resize, and there is a first-render flash if the hook starts
with a default width (SSR is not used, so measure synchronously with `useLayoutEffect`).
Many existing e2e specs target `md:` behavior and need rewriting.

## Acceptance criteria
1-4 met by the budget (guaranteed >= 480 whenever docked, by construction, including after reload as the hook
reads the live width). 5 met by the container query. 6 as in A. It meets every criterion, but is the only
proposal that also removes the 1024-1279 dead zone for collapsed-sidebar users.

---
# VIS-01 Proposal C (Convention): drawer + side sheet, the Linear / Slack / Notion / Gmail pattern

## Convention being copied
- Linear, Notion, Gmail, Slack: persistent left navigation docks on laptop widths (>= 1024) and becomes a
  hamburger drawer on tablets. Nobody docks 316px of nav on an iPad portrait.
- Slack thread pane, Notion side peek, Linear issue peek, Gmail side panel: the secondary pane docks beside
  the main view only when there is room; on narrower screens it becomes a full-height sheet over the main view
  with a scrim, a close button and Escape to close.
We do not copy any brand asset, only the behavior.

## Change
Same breakpoints as A (sidebar docks at 1024, panel docks at 1280, `MIN_CHAT_WIDTH` 480, Models stacks under
900) plus:
1. Below 1280 the right panel is a **sheet**: `w-full max-w-[480px]`, `shadow-xl`, a scrim button (reusing the
   sidebar's `bg-overlay` scrim pattern), and Escape closes it (and returns focus to the control that opened it).
2. A panel that is open at load below 1280 starts closed (sheets are never restored open) so a reload never
   covers the page the user came to see.
3. Header toggle buttons (Computer / Settings / Routines) show a pressed state so the sheet is reachable again.

## Before / after
```
768: [main 768 + hamburger]   tap Computer -> [dim scrim][ sheet 480 ]   Esc or scrim closes
1280+: [sidebar 316][main][panel 320..]  (docked, resizable)
```

## Files and tokens
Everything in A, plus Shell.tsx (scrim + Escape + restore rule, near `restoredPanelKey` ~3088),
ResizableSidePanel.tsx (`mode` prop), existing `bg-overlay` token. Possibly a story for the sheet.

## Effort / risk
M. Escape handling and focus return overlap VIS-03 (keyboard path) and risk merge conflicts with that
lane. Not restoring an open panel changes existing behavior that some e2e specs rely on (`restoredPanelKey`).
A 480px sheet at 768 hides 62% of main, which is more cover than A's 384.

## Acceptance criteria
1-5 met as in A (docked widths identical). 4 additionally met because sheets never restore. 6 as in A.
