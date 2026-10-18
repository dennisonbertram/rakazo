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
