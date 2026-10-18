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
