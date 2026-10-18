# VIS-12 Proposal A (Minimal): promote Add files, add the missing controls, fix the rows

## Code check of the root cause
Mostly right, with two corrections from reading the source:
- "New folder" is not in `FilterBar.tsx`. Its only entry point is the footer button of `FolderTree`, and `DataRoom.tsx` mounts the tree inside `hidden @min-[800px]/bd:flex`. Below 800px the `FilterBar` folder picker (`@min-[800px]/bd:hidden`, ~line 300) is the replacement for navigation only; it has no create action.
- The header (`DataRoom.tsx` ~440-475) has six controls: Hide amounts, List, Grid, Import from email, Connect/Import Drive, Add files. Add files is `variant="outline"`, the same weight as both import buttons, so there is no primary. Hide amounts has no visible effect on this page (it only masks currency inside search snippets); it belongs to VIS-05, not here.
- Date column shows `facets.docDate` while the default sort is `createdAt` ("Recently added"), so the column and the sort already disagree before any click (DR-07).
- Columns shift (DR-10) because `ListView` picks one of three grids (`ROW_GRID`, `STATUS_GRID`, `PLAIN_GRID`) from `hasFacets(rows)` / `hasStatus(rows)`. When the last unfinished file settles, the grid changes and the Name column resizes.

## Change
1. `DataRoom.tsx`: Add files button uses the default (filled) variant. The two import buttons stay outline, so they read as secondary next to one filled button.
2. `FilterBar.tsx` + `DataRoom.tsx`: new optional prop `onNewFolder`. Next to the folder picker (the `@min-[800px]/bd:hidden` block) add `<Tip label="New folder"><Button variant="outline" size="icon-sm" aria-label="New folder"><FolderPlus/></Button></Tip>`. It is visible exactly where the tree is hidden.
3. `ItemRows.tsx` `ItemRow`: for `status === "failed"`, render an inline `<Button variant="outline" size="xs">Try again</Button>` under the failure reason (inside the name cell, so it exists at 375 and 1440). `onClick` calls `event.stopPropagation(); o.onAction("retry", item)`. Same in `GridView` tile meta. The "..." menu keeps Try again.
4. `ItemRows.tsx`: one grid for all rows. `ROW_GRID` gains a fixed 72px Status column; `PLAIN_GRID`/`STATUS_GRID` and the `hasFacets`/`hasStatus` switch are removed. Type cell shows only a type (or "Not tagged" once settled, blank while reading). Status cell shows Reading / Failed. Status column is hidden below 500px (the subline under the name already carries it).
5. Date column header and value follow the active sort: when sort is `createdAt` the header reads "Added" and cells show `createdAt`; when sort is `date` the header reads "Document date" and cells show `facets.docDate`. Sort menu label "Date" becomes "Document date". `ListView` receives `sort.field`.
6. `ImportFromEmail.tsx` `ImportSources` and `ImportFromDrive.tsx` `DriveImportButton`: read `rpc.connections.catalog({})` once next to `connections.list()`. If no entry has `connectorId === "google" && slug === "googledrive"` (the same lookup `AppDetail` uses and fails on), do not render the Drive button at all; same for Gmail. This removes the dead end by never offering it.

## Before / after (1440 header)
```
before: Data room        [eye][list][grid] [Import from email] [Connect Google Drive] [+ Add files]   (all outline)
after : Data room        [eye][list][grid] [Import from email] [Import from Drive]   [+ Add files]    (Add files filled)
768   : toolbar  [Search........] [Folder: All items v] [new-folder icon]   Sort: Added v
```

## Files / tokens
`DataRoom.tsx`, `FilterBar.tsx`, `ItemRows.tsx`, `ImportFromEmail.tsx`, `ImportFromDrive.tsx`, `format.ts` (no change). No new tokens; reuses Button variants `default`/`outline`, size `xs`/`icon-sm`, `Tip`. Tests: `ItemRows.test.tsx`, `FilterBar.test.tsx`, `ImportFromDrive.test.tsx`, `e2e/data-room.spec.ts`. Lingui strings change ("Added", "Document date", "New folder" already exists).

## Effort / risk
Small-medium (about 5 files). Risks: removing the grid switch makes untagged rooms show a column of "Not tagged"; the header at 375 still has six controls (VIS-04 / VIS-17 own touch targets and stacking), and the two import buttons still occupy the header.

## Acceptance
1. New folder at 768/375: yes, icon button beside the folder picker.
2. One primary: yes by variant contrast; imports are not grouped but are visually secondary (criterion allows either).
3. Inline Try again at 1440 and 375: yes.
4. Drive dead end: Drive entry is not rendered when unavailable (no reason text shown).
5. Status own column, Type only type, shift 0px: yes, single fixed grid.
6. Date and sort same field: yes, column follows the sort.
