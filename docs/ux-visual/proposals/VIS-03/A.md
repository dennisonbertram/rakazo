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
