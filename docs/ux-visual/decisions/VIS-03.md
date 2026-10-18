# VIS-03: Keyboard path (tab stops, skip target, focus ring, focus return)

## Problem
Measured on the live demo (1440x900, mock data, 2026-10-18) and from the page findings:
- 89 tabbable elements on a chat page. 41 sit before `main#main-content`. The composer is the 86th. The transcript adds 41 message-action stops.
- 13 sidebar "Actions" buttons are separate tab stops (8 roster-row buttons plus 5 space buttons visible in the sample). There is no roving tabindex.
- Three focus styles: space tab buttons `outline 2px solid #3b82f6`, roster rows the browser default `outline: auto 1px` at 50% alpha, ghost buttons `ring-3 ring-ring/50`. Components draw `--ring` at 50%, which blends to about 2.0:1 against the surface in both themes (my calculation from `tokens.css`; not a tool reading). That fails the 3:1 criterion.
- Dialogs: focus lands on BODY after Escape (CT-F04). Auth: focus is on BODY after a failed submit (AO-06).

### Root cause corrections (found by reading the code)
1. The skip link exists and works; it targets `main` (`MAIN_CONTENT_ID`), which on the chat page starts with the transcript. The defect is the target, not a missing link.
2. The original cluster text said hover-only buttons have `outline:none` and a transparent shadow. The row action button does set `focus-visible:opacity-100`, and `Button` does draw a ring on focus. My first measurement read opacity 0 and a transparent shadow because it sampled during the `transition-all` fade; a 1s wait read opacity 1. The real defects are the 2:1 ring strength and three inconsistent styles. The space "Actions" button is always visible, not hover-only.
3. Why focus returns to BODY after a dialog closes is NOT verified. `ContactDialog` renders `<Dialog open>` with no trigger, mounted only while a state is set. Base UI 1.8 supports `finalFocus` on the Popup, so a mount-time capture of the opener is a plausible fix, but the implementer must reproduce the failure in a test first and confirm the cause.

## Options considered
Scores per rubric (1-5): criteria x3, simplicity x2, consistency x2, usability x2, visual x2, effort x1; max 60.

| Option | Idea | Own: Usability / Visual / Engineering | External: MUSE / Argon |
|---|---|---|---|
| A Minimal | Skip link to composer, full-strength ring, actions out of tab order, dialog `finalFocus` | 40 / 44 / 49 | 40 / 43 |
| B Restructure | `SidebarNav` tree, `role=feed` transcript, F6 regions, app-wide error summary | 53 / 48 / 33 | 45 / 45 |
| C Convention | A plus a roving-tabindex hook for the sidebar, named GitHub, Linear and APG patterns | 55 / 53 / 52 | 56 / 60 |

External winners: MUSE C, Argon C (`proposals/VIS-03/external-judges.json`). A fails criterion 2 outright (28 sidebar stops, no roving), so it is disqualified. B passes but at L effort with merge risk against other lanes.

## Decision
Choose C, with one graft from B (both external judges asked for it): the message actions use the same roving hook.

1. **Skip link**: `SkipToContent` focuses `document.querySelector("[data-skip-target]") ?? #main-content`. The composer textarea (Shell.tsx ~7640) gets `data-skip-target`.
2. **Ring token**: `focus-visible:ring-3 focus-visible:ring-ring/50` becomes `focus-visible:ring-2 focus-visible:ring-ring` in the 13 ui-web components. One base rule in `packages/ui-web/src/styles.css`: `:where(a, button, [role="button"], [tabindex]):focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }`. Remove the bespoke `focus-visible:outline...` strings on the space header (Shell ~3857) and the browser-default rows. Check `--ring` against `--sidebar` and `--card` in both themes; light `#6c6c70` and dark `#3b82f6` should both exceed 3:1, and the implementer adjusts the token if a measured pair does not.
3. **Sidebar roving tabindex**: new `apps/web/src/lib/useRovingTabindex.ts` (about 60 lines). Given a container ref and the selector `[data-roving]`, it sets `tabindex="-1"` on all items but the active one, moves with ArrowUp/ArrowDown/Home/End (skipping Alt+Arrow, which stays reorder), and follows `focusin` so a click or programmatic focus updates the active item. Re-run on children change via a `MutationObserver`. `data-roving` goes on page links (`SidebarPageLink`), space headers and roster rows. Row action buttons get `tabIndex={-1}` and `aria-keyshortcuts="ArrowRight"`; ArrowRight on a row focuses its actions button, ArrowLeft or Escape returns; ContextMenu and Shift+F10 still work through the existing `onContextMenu`. The action button is visible when its row has `:focus-within`.
4. **Message actions (graft)**: in the transcript, the React button of each message carries `data-roving`; Reply and More get `tabIndex={-1}` and are reached with ArrowRight. The transcript is one tab stop. Visibility already uses `group-focus-within/message`.
5. **Dialog focus return**: `DialogContent` records `document.activeElement` on mount and passes `finalFocus` to `DialogPrimitive.Popup`, returning it if still connected. Do not override when a Dialog has a registered Trigger. Failing test first (item 3 above).
6. **Auth failed submit**: `AuthFrame` focuses the `role="alert"` node (`tabIndex={-1}`) when an error is set. Field-level `aria-invalid` and an app-wide summary stay with VIS-06.
7. **Integrations card (F26)**: the card gets `focus-within` ring so the indicator matches the click target.

## Why this is the best
- Against A: A leaves 28 sidebar stops and no arrow-key model, so it fails criterion 2 and leaves the 13 row actions reachable only through a key most laptops lack (Argon). C costs one 60-line hook more.
- Against B: B also passes every criterion, but it extracts a section of the 8000-line `Shell.tsx` that VIS-01, VIS-02 and VIS-04 are editing, adds tree and feed roles that change screen-reader output, and binds F6, which the browser already uses. The graft in item 4 delivers B's transcript benefit without a feed rewrite.
- Norms: visual-heuristics I7 (visible focus), H5/consistency (one ring), APG dialog and toolbar patterns, GitHub Primer ring, Linear single-stop sidebar.
- Costs and what it rules out: the roving hook is DOM-query based, so rows that mount late rely on the `MutationObserver`; there is no type-ahead or tree expand/collapse key model; app-wide form error focus waits for VIS-06.

## Implementation plan
1. Tokens and CSS first: `styles.css` base rule; the 13 ui-web components; story/Storybook catalog check (`pnpm design-system:check`).
2. `dialog.tsx` `finalFocus`.
3. `useRovingTabindex.ts` with unit tests; `SidebarPageLink.tsx`, `SkipToContent.tsx`.
4. `Shell.tsx`: `data-skip-target`, `data-roving` and `tabIndex={-1}` on row actions and space actions, message-action buttons, ref on the list container (~3713) and transcript container (~6315).
5. `Auth.tsx`, integrations card.
6. `pnpm --filter @rakazo/web intl:extract` only if a string changes (the `aria-keyshortcuts` value is not translated text).
Files: `apps/web/src/components/SkipToContent.tsx`, `SidebarPageLink.tsx`, `SidebarPages.tsx`, `apps/web/src/lib/useRovingTabindex.ts` (new), `apps/web/src/pages/Shell.tsx`, `apps/web/src/pages/Auth.tsx`, `apps/web/src/components/integrations/AppDetail.tsx`, `packages/ui-web/src/styles.css`, `packages/ui-web/src/components/ui/{button,input,textarea,select,native-select,checkbox,switch,toggle,tabs,field,input-group,scroll-area,badge,dialog}.tsx`.

## Final acceptance criteria (measurable)
1. On `/app/:id` at 1440x900, Tab then Enter on the first stop (skip link) puts `document.activeElement` on the composer textarea. On every other `/app/*` route it lands on `main#main-content`.
2. Without the skip link, the count of tab stops before the first control inside `main` is at most 12 (was 41). The count of tabbable elements outside `main` that are sidebar rows or row/space actions is at most 1 per list (roving), measured by `tabindex >= 0`.
3. In the sidebar, ArrowDown/ArrowUp/Home/End move focus between rows; ArrowRight on a row focuses its Actions button, which is visible (computed opacity 1); ArrowLeft or Escape returns to the row; Alt+Arrow reorder still works.
4. In the transcript there is exactly 1 tabbable message-action button; ArrowRight reaches Reply and More.
5. Every focusable element, when focused by keyboard, has a computed `outline-width` of at least 2px (or an equivalent box-shadow spread) in a colour with at least 3:1 contrast to its immediate background in both light and dark. A sweep of at least 25 stops across chat, Finance, Legal, Cap table, Integrations and Auth finds no failure.
6. `grep -rE "ring-ring/50" packages/ui-web apps/web/src` returns no matches; inputs, buttons and links share one ring definition.
7. After Escape or Close on the cap-table contact dialog, and on 3 other dialogs, `document.activeElement` is the control that opened it (or the named fallback if it unmounted).
8. After a failed sign-in or sign-up submit, `document.activeElement` is the error alert, not BODY.

## Test plan (failing first)
- Vitest: `useRovingTabindex` (one tabbable item, arrows, Home/End, focusin update, late-mounted item). `SkipToContent` focuses `[data-skip-target]` when present. `DialogContent` returns focus to the opener for an `open`-mounted dialog (write this first and confirm it fails; this also verifies root cause 3). `AuthFrame` focuses the alert.
- Playwright e2e (new `e2e/keyboard-path.spec.ts`, run with the harness line from the task): Tab+Enter lands on the composer; stop count before main at most 12; arrow and ArrowRight sidebar behaviour; computed ring on 25 sampled stops via `getComputedStyle`; contact dialog Escape returns focus; failed sign-in focuses the alert.
- Viewports 1440x900 and 375x812 (the drawer sidebar uses the same list). Light and dark.
- Repo checks: `tsc` (apps/web), `npx biome ci .`, `pnpm design-system:check`, Storybook build plus `node .storybook/smoke.mjs storybook-static` because ui-web components and `SkipToContent` stories change.
- Fresh before/after screenshots of a focused sidebar row, button, input and link in both themes.
