# VIS-12: Data room header and row actions

## Problem
Root cause (confirmed in source, with corrections to the register):
- The header (`DataRoom.tsx`) has six controls and Add files is `variant="outline"`, the same weight as both import buttons, so there is no primary action.
- New folder is not in `FilterBar.tsx`. Its only entry is the footer of `FolderTree`, mounted in `hidden @min-[800px]/bd:flex`. Below 800px the folder picker in `FilterBar` navigates but cannot create.
- A failed row's only retry is `ItemMenu` ("..."), reached with a second click; nothing is inline.
- `DriveImportButton` (and Gmail in `ImportSources`) navigate to `/app/integrations/app/google/googledrive` when not connected, with no check that the server offers the app. `AppDetail` then finds no catalog entry and prints "googledrive isn't available on this server."
- `ItemRows.tsx` chooses one of three grids (`ROW_GRID`, `STATUS_GRID`, `PLAIN_GRID`) from the current rows, so the Name column resizes when the last unfinished file settles (DR-10). In the facet grid the Type cell shows "Reading"/"Failed" (DR-06).
- The Date column shows `facets.docDate`, while the default sort is `createdAt` ("Recently added") (DR-07).
- Not a cause: Hide amounts has no visible effect on this page; it is VIS-05's, left alone.
Findings covered: DR-02, DR-03, DR-04, DR-05, DR-06, DR-07, DR-10. DR-09, DR-14, DR-17 (Preview metadata wording) are not re-scoped here; no source evidence for them was available (findings.md was never written), so they stay in the register. DR-08 is VIS-13.

## Options considered
Weighted score, max 60 (weights 3/2/2/2/2/1 on criteria, simplicity, consistency, usability, visual, effort).
| Judge | A Minimal | B Restructure | C Convention |
|-------|-----------|---------------|--------------|
| Usability lens | 50 | 45 | 42 |
| Visual craft lens | 48 | 47 | 42 |
| Engineering lens | 52 | 35 | 38 |
| MUSE Wonder | 52 (winner A) | 45 | 42 |
| Gemini Argon | 56 (winner A) | 34 | 40 |
| Total | 258 | 206 | 204 |

Internal lens scores (criteria/simplicity/consistency/usability/visual/effort): Usability A 4/4/5/4/4/4, B 5/3/3/4/4/2, C 3/4/4/3/4/3. Visual A 4/4/5/3/4/4, B 5/3/3/4/5/2, C 3/4/4/3/4/3. Engineering A 4/5/5/4/4/4, B 4/2/3/3/3/1, C 3/3/4/3/3/2. External scores are in `proposals/VIS-12/external-judges.json`. Proposals: `proposals/VIS-12/{A,B,C}.md`. No judge disqualified a proposal; both external judges chose A.

## Decision
Proposal A, with one graft (Gemini): the Status value renders as the existing `Badge`.
1. `DataRoom.tsx`: the Add files `FileInputButton` uses the default (filled) variant, at every width. It is the only filled control in the header. The Gmail and Drive import buttons stay `outline`.
2. `FilterBar.tsx` / `DataRoom.tsx`: new `onNewFolder` prop. An icon-only outline `Button` (`FolderPlus`, `size="icon-sm"`, `aria-label` and `Tip` "New folder") sits beside the folder picker in the `@min-[800px]/bd:hidden` block. It calls the existing `setCreatingFolder(true)`.
3. `ItemRows.tsx`: a failed row renders an inline `Button variant="outline" size="xs"` "Try again" under the failure reason inside the name cell (visible at all widths, including 375). Click handler stops propagation and calls `o.onAction("retry", item)`. The grid tile for a failed item gets the same button. The "..." menu keeps its Try again item.
4. `ItemRows.tsx`: one grid for every row set. Remove `PLAIN_GRID`, `STATUS_GRID` and the `hasFacets`/`hasStatus` choice. `ROW_GRID` gets a fixed 72px Status column (shown from the 500px list width up; narrower, the existing line under the name carries status). The Status cell renders `Badge` for Reading (neutral) and Failed (destructive). The Type cell shows only a type, "Not tagged" once settled and untagged, blank while reading.
5. Date column header and values follow the active sort: sort `createdAt` gives header "Added" and `createdAt` values; sort `date` gives header "Document date" and `facets.docDate`. The Sort menu label "Date" becomes "Document date". `ListView` and `GridView` take the sort field.
6. `ImportSources` / `DriveImportButton`: read `rpc.connections.catalog({})` next to `connections.list()`. If it has no entry with `connectorId === "google"` and `slug === "googledrive"`, do not render the Drive button; the same for `gmail`. They are never rendered in a state that routes to the dead end. Both empty-state and header use this.

## Why this is the best
- Against B: it meets criteria 1-6 too, but needs a new `LocationBar` with breadcrumb truncation at 375, replaces the folder picker (leaving tablet users unable to enter sub-folders from the bar), moves the view toggle, and removes Hide amounts, which VIS-05 owns. About eight files and most data-room e2e selectors change, for a small visual gain.
- Against C: it puts Add files behind a menu (upload becomes two taps), makes New folder a menu item rather than a visible control (weakens criterion 1) and lifts dialog and file-input state out of the import components.
- Rejected graft (MUSE): showing Drive as a disabled item "Not set up on this server". The only person who can fix that is the server owner, so a founder would see a dead control; hiding is allowed by criterion 4, and a disabled button gives no tooltip without extra work.
- Not adopted: grouping the two imports in one "Import" menu (B, C). Criterion 2 allows "visually secondary"; the menu would change the ImportSources dialog ownership and every import e2e. The six-to-five header count at 375 is VIS-04/VIS-17.
- Norms: one primary action per view; status separate from type; recovery action at the point of failure; do not offer an action that cannot work; column widths stable under state change; a column labelled with the thing the list is sorted by.
- Costs / rules out: a room with no tagged files shows a column of "Not tagged" and an empty Parties column (previously a wider Name); the header still has two secondary import buttons.

## Final acceptance criteria (measurable)
1. At 768x1024 and 375x812 the data room (non-empty) has a visible button named "New folder"; clicking it opens the New folder dialog; its bounding box is inside the viewport and at least 32x32 (44x44 under pointer: coarse is VIS-04's).
2. At 1440, 768 and 375 exactly one header control is a filled primary ("Add files", default variant; computed background not transparent and not the outline style); Gmail and Drive buttons keep the outline style.
3. A failed row at 1440x900 and 375x812 contains a button named "Try again" inside the row (not in a menu); clicking it calls `itemRetry` once and the row shows Reading; clicking it does not open the preview.
4. With a catalog lacking `googledrive`, no element named "Connect Google Drive" or "Import from Google Drive" exists, and no UI path navigates to `/app/integrations/app/google/googledrive`; with it present and unconnected, the button still navigates there. Same for Gmail.
5. The Type cell never contains "Reading" or "Failed"; a Status column holds them as badges (500px list width and up); the list header's column x-positions and widths are identical before and after a Reading file becomes ready (shift 0px, all columns).
6. For each sort (Recently added, Document date) the Date column header and every value come from the field the sort uses; the default view shows header "Added".
7. `pageOverflowX` is 0 at 1440x900, 768x1024 and 375x812; the 375 header controls do not overlap (bounding boxes disjoint).

## Implementation plan
Design system: no new tokens or components (Button default/outline, `xs`, `icon-sm`, `Badge`, `Tip`). Then, in order: `format.ts` (no change expected; add helper for the dated field if useful), `ItemRows.tsx` (grid, Status badge, Try again, sort field), `FilterBar.tsx` (New folder button, Sort label), `ImportFromEmail.tsx` / `ImportFromDrive.tsx` (catalog check), `DataRoom.tsx` (variants, props, pass sort). Update stories (`ItemRows`, `FilterBar`, `ImportFromDrive`) to cover failed row, narrow New folder, Drive unavailable. Run `pnpm --filter @rakazo/web intl:extract` ("Added", "Document date").

## Test plan (failing first)
- `ItemRows.test.tsx`: failed row has an inline "Try again" that fires `onAction("retry")` and not `onToggle`; Type cell excludes status text; the same grid classes for rows with and without facets/status (assert no `PLAIN_GRID` switch); Date header/value follow sort field.
- `FilterBar.test.tsx`: New folder button renders and calls `onNewFolder`.
- `ImportFromDrive.test.tsx` / `ImportFromEmail`: catalog without googledrive renders no Drive button; with it, the old navigate behaviour.
- `apps/web/e2e/data-room.spec.ts` (run as `--spec=e2e/data-room.spec.ts` from the harness root; the file lives under `apps/web/e2e`): at 768 and 375, create a folder from the visible button; failed fixture row shows Try again at 1440 and 375 and retries; measure header cell x/width before and after a processing row settles (shift 0); filled primary count 1.
- Viewport screenshots 1440x900, 768x1024, 375x812 (list, failed row, narrow with folder bar) and `layout-audit` pageOverflowX 0. Run tsc (apps/web), `npx biome ci .`, `pnpm design-system:check`, Storybook build + `node .storybook/smoke.mjs storybook-static` because stories change.

## Files to change
`apps/web/src/pages/DataRoom.tsx`, `apps/web/src/components/data-room/{FilterBar,ItemRows,ImportFromEmail,ImportFromDrive}.tsx` plus their `.test.tsx` and `.stories.tsx`, `apps/web/e2e/data-room.spec.ts`, locale catalogs via `intl:extract`.
