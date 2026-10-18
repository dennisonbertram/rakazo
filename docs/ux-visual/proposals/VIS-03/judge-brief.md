# Judge brief: VIS-03 keyboard path (rakazo, a startup-operations chat app for non-technical founders)

Persona: a first-time founder; also a keyboard-only user. Cluster acceptance criteria:

- Acceptance:
  1. From page load, no more than 8 Tab presses reach the first control in the main area; the skip link is the first stop and moves focus to the composer (chat) or `main` (other pages).
  2. Sidebar is one tab stop per group (roving tabindex with arrow keys), with row actions reachable by a documented key or when the row is focused.
  3. Every focusable element shows a focus indicator with at least 3:1 contrast and at least 2px, including hover-only action buttons (computed style check: outline or box-shadow non-transparent on `:focus-visible`).
  4. After closing any dialog (Esc or Close), `document.activeElement` is the element that opened it.
  5. After a failed form submit, focus is on the first invalid field or the error summary, not BODY.
  6. One shared focus-ring token is used by inputs, buttons and links.
- Files likely touched: `apps/web/src/components/SkipToContent.tsx`, `apps/web/src/components/SidebarPages.tsx`, `SidebarPageLink.tsx`, `apps/web/src/pages/Shell.tsx` (sidebar rows, message action toolbar ~6325), `apps/web/src/pages/CapTable.tsx` (contact dialog), `packages/ui-web/src/components/ui/dialog.tsx`, `button.tsx`, `input.tsx`, `apps/web/src/components/integrations/AppDetail.tsx`.

Measured: 89 tabbable elements; 41 before main; composer is the 86th; 13 hover-revealed row Action buttons; focus ring blends to about 2:1 (fails 3:1); three ring styles.

## Proposal A
# VIS-03 / A Minimal: retarget the skip link, one full-strength ring, take row actions out of the tab order

## Evidence read first (live demo, 1440x900, mock data)
- 89 tabbable elements on /app/:id. 41 come before `main#main-content`, the composer is the 86th, and the transcript holds 41 message-action stops.
- 13 sidebar row/space "Actions" buttons are tab stops. They are opacity 0 until the row is hovered or focused.
- Three focus styles in one viewport: space tabs `outline 2px solid #3b82f6`; roster rows browser `outline: auto 1px` at 50% alpha; ghost `Button` rows `ring-3 ring-ring/50` (box-shadow).
- `--ring` is `#3b82f6` (dark) and `#6c6c70` (light). Every ui-web control draws it at `/50`, which blends to about 2.0:1 against its surface in both themes (my calculation, not a tool reading). That fails the 3:1 criterion.

## Change
1. `SkipToContent`: on activate, focus `document.querySelector("[data-skip-target]") ?? #main-content`. Put `data-skip-target` on the composer textarea (Shell.tsx ~7640). On non-chat pages nothing carries it, so focus lands on `main` as today.
2. Ring: replace `focus-visible:ring-3 focus-visible:ring-ring/50` with `focus-visible:ring-2 focus-visible:ring-ring` in the 13 ui-web components that use it (button, input, textarea, select, native-select, checkbox, switch, toggle, tabs, field, input-group, scroll-area, badge). Add one base rule in `packages/ui-web/src/styles.css` `@layer base`: `:where(a, button, [role="button"], [tabindex]):focus-visible { outline: 2px solid var(--ring); outline-offset: 2px }`, so plain links and the bespoke sidebar rows inherit it.
3. Row actions (`roster-row-actions`, space Actions button): `tabIndex={-1}`. Keyboard route to the menu is the ContextMenu key / Shift+F10 on the focused row (the row already has `onContextMenu`).
4. `DialogContent` (packages/ui-web dialog.tsx): remember `document.activeElement` on mount and pass it as `finalFocus` to `DialogPrimitive.Popup` if it is still connected. One change covers all 29 dialog users.
5. `AuthFrame`: after an error is set, focus the `role="alert"` node (give it `tabIndex={-1}`).

## Before / after
Before: Tab x41 to reach the page, skip link lands on the transcript, ring about 2:1 and different per control, Escape from a dialog may drop to BODY.
After: Tab, Enter reaches the composer; sidebar is 28 stops (41 minus 13 actions); one ring style at about 4-5:1.

## Files / tokens
`SkipToContent.tsx`, `Shell.tsx` (composer attr, 2 action buttons), 13 files in `packages/ui-web/src/components/ui/`, `styles.css`, `dialog.tsx`, `Auth.tsx`. No new token: the ring uses the existing `--ring`.

## Effort / risk
S (about 1 day). Risks: ring change touches every control visually (storybook/e2e screenshots), the ContextMenu key route is undiscoverable, `finalFocus` default could fight Base UI's own trigger return (guard: only supply it when no trigger is registered).

## Acceptance criteria
1. 8 Tab presses: Partial. Tab+Enter via skip link reaches composer; without it the sidebar is still 28 stops.
2. Sidebar one stop per group: NOT met (28 stops, no roving or arrow keys).
3. Ring 3:1 and 2px everywhere: Met (token change plus base rule).
4. Dialog focus return: Met if the opener stays mounted.
5. Failed-submit focus: Met on Auth only.
6. One ring token: Met.

## Proposal B
# VIS-03 / B Restructure: a real keyboard model for the shell

## Change
Treat keyboard navigation as a feature of the shell rather than a patch on each control.
1. New `SidebarNav` component extracted from the roster block of Shell.tsx (lines ~3700-4300): `role="tree"` (bots can nest via `rosterParent`), roving tabindex over every row, page link and space header, Up/Down/Home/End, Left/Right to collapse and expand, Right on a leaf to enter its actions, type-ahead by name, Alt+Up/Down reorder preserved.
2. Transcript becomes `role="feed"`; each message is an `article` with `aria-posinset`/`aria-setsize`; one tab stop into the feed, `j`/`k` or Up/Down between messages, actions appear for the focused message as a `role="toolbar"` (one stop, arrows inside).
3. A `FocusRegions` provider registers sidebar, header, transcript, composer, right panel; F6 / Shift+F6 cycle them and the skip link becomes a menu of regions.
4. A `useFocusReturn` hook plus a `focus-ring` Tailwind utility replace per-component ring strings in all of ui-web and in the 27 apps/web files that use `outline-none`.
5. A `FormErrorSummary` that moves focus on failed submit across all forms (overlaps VIS-06).

## Before / after
Before: 41 sidebar stops, 41 message-action stops. After: sidebar 1 stop, transcript 1 stop, about 8 stops from load to composer without the skip link; Slack/Linear-class keyboard behaviour.

## Files
`Shell.tsx` (large extraction, 8000+ lines file), new `SidebarNav.tsx`, `Feed.tsx`, `FocusRegions.tsx`, all ui-web components, 27 apps/web files, every dialog consumer, every form.

## Effort / risk
L (1-2 weeks). High risk: Shell.tsx is shared with VIS-01, VIS-02 and VIS-04 lanes (merge conflicts), drag-and-drop reorder and the context menu depend on row DOM, ARIA tree roles change screen-reader output for existing users, feed semantics interact with streaming updates and scroll anchoring. Lots of new keyboard shortcuts to document and defend against browser/OS conflicts (F6 is the browser's own region cycle).

## Acceptance criteria
1: Met (about 8 stops, skip link to composer). 2: Met (roving, arrows, actions on Right). 3: Met. 4: Met. 5: Met everywhere. 6: Met. Meets all, at the largest scope and with the most overlap with other clusters.

## Proposal C
# VIS-03 / C Convention: GitHub-style ring, Linear-style single-stop sidebar, Radix/ARIA focus return

## Named patterns
- Focus indicator: GitHub Primer and Google Material 3. One global `:focus-visible` outline, 2px, offset 2px, solid accent, no component-specific variants. Primer's rule is "never remove the outline; restyle it once".
- Sidebar: Linear and Notion. The sidebar is one tab stop (roving tabindex); arrows move between rows; the row's `...` menu opens with the ContextMenu key and is never a separate tab stop.
- Skip link: GitHub and Gmail. First tab stop, goes to the primary working surface (Gmail goes to the message list; here the composer on chat, `main` elsewhere).
- Dialog focus return: WAI-ARIA APG dialog pattern, as implemented by Radix and Base UI (`finalFocus`): focus goes back to the invoking control, or to a named fallback when it was unmounted.
- Form errors: GOV.UK / USWDS error summary pattern: on failed submit focus moves to the summary, which links to the first invalid field.

## Change
Same code as A for the skip link, the ring (one base rule plus `ring-ring` at full strength), dialog `finalFocus` and the row actions, plus:
1. Roving tabindex for the sidebar list through a small `useRovingTabindex(containerRef, "[data-roving]")` hook (about 60 lines, DOM-query based, no markup rewrite). Rows, page links and space headers get `data-roving`; row action buttons get `tabIndex={-1}` and open with ArrowRight, ContextMenu or Shift+F10; Left/Esc returns to the row. The actions button becomes visible whenever its row has `:focus-within`.
2. An error summary component in Auth only (not app-wide), focus moved to it on failed submit.
3. Integrations card: the focus ring moves from the title link to the whole card via `focus-within` on the card (F26).

## Files
A's list, plus a new hook `apps/web/src/lib/useRovingTabindex.ts`, `Shell.tsx` (add `data-roving` at 3 places, container ref), `AppDetail.tsx`/integration card, `Auth.tsx`.

## Effort / risk
M (2-3 days). Risks: the hook queries the DOM, so rows that mount later (collapse/expand, virtualised lists) need a MutationObserver or re-run on render; arrow keys must not clash with the existing Alt+Arrow reorder; screen-reader users get a list with one stop and need the aria-keyshortcuts hint.

## Acceptance criteria
1: Met (skip link: Tab+Enter; sidebar about 10 stops without it). 2: Met. 3: Met. 4: Met. 5: Met on Auth (error summary), other forms fall to VIS-06. 6: Met.

