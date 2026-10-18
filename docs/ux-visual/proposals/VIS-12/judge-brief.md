# Judge brief: VIS-12 Data room header and row actions
App: Rakazo (workspace for a first-time startup founder). Page: Data room (file list with folder tree, filters, import from email and Google Drive). Persona: non-technical founder, mostly laptop, sometimes phone.
Problem: header has six equal-weight controls and no primary; "New folder" exists only in the folder tree, which is hidden below 800px; a failed file has retry only inside the "..." menu; "Connect Google Drive" navigates to a dead-end page saying the app isn't available on this server; Type column mixes status (Reading/Failed) with types; the table switches between three grids as files finish (columns shift); Date column shows document date while default sort is "Recently added".
Acceptance: 1 folder creatable at 768 and 375 from a visible control. 2 header has one primary action (Add files), other imports grouped in one menu or visually secondary. 3 failed row has inline "Try again" at 1440 and 375. 4 when Drive is unavailable its entry is disabled with a reason or hidden, never routing to the dead end. 5 status in its own column/badge, Type only a type, max column shift 0px during processing. 6 Date column and sort use the same date field.
Rubric: score each proposal 1-5 on: meets criteria (x3), simplicity (x2), consistency with system (x2), usability (x2), visual quality (x2), effort/risk (x1, 5 = small and safe). Name a winner, an optional graft, and a defense. Stay inside the existing design system.

## Proposal A
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

## Proposal B
# VIS-12 Proposal B (Restructure): two-tier header with a breadcrumb bar

## Change
Split the page chrome into two tiers, as the folder tree and the files are different jobs.
- Tier 1 (page header): title + company name on the left; on the right only `[Import v]` (outline dropdown: Email, Google Drive) and `[+ Add files]` (filled). View toggles and Hide amounts leave the header.
- Tier 2 (new "location bar", between filters and list): breadcrumb of the open folder (`Legal / Contracts`, each segment clickable, replacing the 768 folder picker), then right-aligned `[New folder]` text button (icon + label above 640px, icon only below), then the List/Grid toggle. The tree's footer New folder button is removed (one place at all widths).
- Rows: failed rows get a full-width inline strip under the name: reason text, `Try again`, `Delete`. Status becomes a `Badge` (existing `ui/badge.tsx`) in its own column; Type is plain text.
- Drive: `Import` menu item "Google Drive" is disabled with a one-line reason ("Not set up on this server") when the catalog has no googledrive entry, or "Connect Google Drive" when available but not linked.
- Hide amounts is dropped from this page (no amounts on screen); VIS-05 decides its global home.

## Before / after
```
before: [title]            [eye][list][grid][Import email][Connect Drive][+ Add files]
after : [title]                                          [Import v][+ Add files]
        search / filters / sort
        Legal / Contracts                       [+ New folder] [list|grid]
        ----------------------------------------------------------------
        Name            Type      Date     Status
        NDA.pdf         ...                [Failed]
          Could not read this file.  [Try again] [Delete]
```

## Files / tokens
`DataRoom.tsx` (header, new `LocationBar`), new `components/data-room/LocationBar.tsx` (+ story + test), `FilterBar.tsx` (folder picker removed), `FolderTree.tsx` (New folder footer removed), `ImportFromEmail.tsx`, `ImportFromDrive.tsx`, `ItemRows.tsx`, `ui/badge.tsx` (reuse), `HideAmountsToggle` usage removed from this page. Storybook story for the new component is required.

## Effort / risk
Large (new component, 8 files, rewrite of e2e selectors for Import buttons, tree footer, folder picker, breadcrumb keyboard behaviour). Risks: breadcrumb at 375 with deep paths needs truncation logic; moving the view toggle changes a known position; removing Hide amounts overlaps VIS-05 and needs sign-off; more surface for regressions in a 686-line page.

## Acceptance
1. New folder at 768/375: yes, location bar. 2. One primary: yes, plus one Import menu. 3. Inline Try again: yes, with Delete. 4. Drive: disabled with reason. 5. Status badge column, zero shift with a fixed column: yes. 6. Date/sort: header follows sort (same as A item 5).

## Proposal C
# VIS-12 Proposal C (Convention): one "New" menu, as in Google Drive, Dropbox and Box

## Pattern
Google Drive ("+ New"), Dropbox ("Create" / "Upload or drop"), Box ("Upload" menu) and Notion all give a file manager one primary creation control that opens a menu: upload, new folder, then import sources. Upload progress and failures show as per-item status with a "Retry" link on the item (Drive's upload panel, Dropbox's "Try again"). Status is a badge or its own column, never mixed into Type.

## Change
- Header: `[eye][list][grid]` stay; the three buttons (Gmail, Drive, Add files) become one filled `[+ New v]` dropdown (`DropdownMenu`): Upload files, New folder, separator, Import from email (or Connect Gmail), Import from Google Drive (or Connect Google Drive). When the catalog lacks Drive the Drive item is rendered disabled with the description "Not set up on this server" (`DropdownMenuItem disabled` + muted line).
- Empty state (non-compact) keeps "Choose files" + import buttons, with the same Drive rule.
- Rows: as A items 3-5 (inline `Try again` link-button on failed rows; fixed Status column; Type only a type; one grid). No badges, no location bar.
- Date column header follows the sort (as A item 5).

## Before / after
```
before: [eye][list][grid] [Import from email] [Connect Google Drive] [+ Add files]
after : [eye][list][grid] [+ New v]
          Upload files / New folder / ---- / Import from email / Import from Google Drive (disabled: Not set up)
```

## Files / tokens
`DataRoom.tsx`, `ImportFromEmail.tsx` (`ImportSources` split: dialogs lifted so a menu item can open them), `ImportFromDrive.tsx`, `FilterBar.tsx` (drop ToolbarTip/TOOLBAR_* exports once unused), `ItemRows.tsx`. Reuses `DropdownMenu*`, Button default, no new tokens.

## Effort / risk
Medium. The email and Drive pickers are opened from buttons that own their dialog state; moving the trigger into a menu means lifting that state into the page (or a small context). Risks: Upload now takes two clicks instead of one (the most common action); the hidden file input must be clicked from a menu item (needs the input outside the closing menu); every e2e that clicks "Add files" or "Import from email" changes; New folder at 768/375 is a menu item, not an always-visible control, which weakens criterion 1.

## Acceptance
1. New folder: yes, in the New menu (two taps). 2. One primary: yes, the only filled control. 3. Inline Try again: yes. 4. Drive: disabled with reason. 5. Status column, zero shift: yes. 6. Date/sort: yes.

