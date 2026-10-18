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
