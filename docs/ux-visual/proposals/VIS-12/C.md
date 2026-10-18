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
