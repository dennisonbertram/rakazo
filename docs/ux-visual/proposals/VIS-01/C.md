# VIS-01 Proposal C (Convention): drawer + side sheet, the Linear / Slack / Notion / Gmail pattern

## Convention being copied
- Linear, Notion, Gmail, Slack: persistent left navigation docks on laptop widths (>= 1024) and becomes a
  hamburger drawer on tablets. Nobody docks 316px of nav on an iPad portrait.
- Slack thread pane, Notion side peek, Linear issue peek, Gmail side panel: the secondary pane docks beside
  the main view only when there is room; on narrower screens it becomes a full-height sheet over the main view
  with a scrim, a close button and Escape to close.
We do not copy any brand asset, only the behavior.

## Change
Same breakpoints as A (sidebar docks at 1024, panel docks at 1280, `MIN_CHAT_WIDTH` 480, Models stacks under
900) plus:
1. Below 1280 the right panel is a **sheet**: `w-full max-w-[480px]`, `shadow-xl`, a scrim button (reusing the
   sidebar's `bg-overlay` scrim pattern), and Escape closes it (and returns focus to the control that opened it).
2. A panel that is open at load below 1280 starts closed (sheets are never restored open) so a reload never
   covers the page the user came to see.
3. Header toggle buttons (Computer / Settings / Routines) show a pressed state so the sheet is reachable again.

## Before / after
```
768: [main 768 + hamburger]   tap Computer -> [dim scrim][ sheet 480 ]   Esc or scrim closes
1280+: [sidebar 316][main][panel 320..]  (docked, resizable)
```

## Files and tokens
Everything in A, plus Shell.tsx (scrim + Escape + restore rule, near `restoredPanelKey` ~3088),
ResizableSidePanel.tsx (`mode` prop), existing `bg-overlay` token. Possibly a story for the sheet.

## Effort / risk
M. Escape handling and focus return overlap VIS-03 (keyboard path) and risk merge conflicts with that
lane. Not restoring an open panel changes existing behavior that some e2e specs rely on (`restoredPanelKey`).
A 480px sheet at 768 hides 62% of main, which is more cover than A's 384.

## Acceptance criteria
1-5 met as in A (docked widths identical). 4 additionally met because sheets never restore. 6 as in A.
