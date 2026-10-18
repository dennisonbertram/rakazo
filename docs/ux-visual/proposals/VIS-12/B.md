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
