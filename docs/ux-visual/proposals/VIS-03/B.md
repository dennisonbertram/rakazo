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
