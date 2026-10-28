# Pass-2 verify R3: clusters F and G

Target: integration branch demo (mock data), 390x844 (spot-check 375x812) with CDP touch emulation (matchMedia pointer: coarse and hover: none both true; confirmed). Desktop 1440x900 checked separately. The machine was slow; latency is not filed. Screenshots are in the walker's temp folder: home.png, undo.png, routines.png, routine-new.png, routine-new-scrolled.png, botset-skills.png, botset-bottom.png, inbox-skills.png, approval.png, activity.png, drawer.png, integrations.png, int375.png, bs375.png, d-int.png, d-bs.png, d-act.png (all opened and read).

Note on the approval toast: another walker's "Investors agent needs approval" toast was already pending, so I used it (left unanswered, not touched) instead of creating one. Its position and persistence are what the checks need.

## Cluster F (toasts): verdict PARTLY MET (blocker fixed, 6 px edge overlap remains)

| Finding | Verdict | Evidence |
|---|---|---|
| V1-14 Undo under approval toast | MET | Sent a mail to an invented .test address with the approval toast pending. Undo button 53x44 at y=780; elementFromPoint at its centre returns Undo. Approval toast lifted above the "Sending..." notice (undo.png). |
| V1-15 Toast covers lower panel content (Inbox agent Skills row) | MET | Panel scrolls; Skills / Add skill row and Credentials scroll clear above the toast (inbox-skills.png). `--toast-panel-reserve` = 198px, scroller padding-bottom 215px. |
| V3-01 Save behind toast in new-routine editor | PARTLY | At default scroll Save (y 585-629 after scrolling to the end; 615-659 before) is under the toast. After scrolling to the end, Save's centre and text are clear (toast card starts about y=623) but its bottom 4-6 px (y 626-629) is still under the toast edge (routine-new-scrolled.png). Scroll range is only 30 px (874 vs 844). Save is greyed (disabled, empty name), which is expected. |
| W1-14 Same, plus "Check every" | PARTLY | Same as V3-01; Save is reachable, edge overlap 4-6 px. I did not open Watch a page. |
| W2-03 Pill hides "Only message me" row | MET | Row at y=543-573 is clear of the toast at the end of scroll (routine-new-scrolled.png). |

Bot settings last row ("Clear conversation") ends at y=629 against the toast top at about 623: text is clear, box edge overlaps about 6 px (botset-bottom.png). Same small shortfall at 375x812 (bs375.png shows it clear visually).

## Cluster G (routines, bot settings, Activity, approvals on touch): verdict MOSTLY MET, 3 findings partly or not met

| Finding | Verdict | Evidence |
|---|---|---|
| V3-05 Active toggle small / hint | PARTLY | Routine editor now uses the shared Switch (RoutineEditor.tsx lines 318, 531, 915 import Switch). Hit area measured by elementFromPoint: Active 46 px tall inside a 82x44 label; "Only message me" 46 px inside a 349x44 label. The hint "Pick when this runs, for example every Monday morning." under "Choose when it runs" is still there (repeats the button; copy, P3). |
| W2-02 Switch hit area | MET | Same measurements; the shared switch has a pointer-coarse ::after of about 60x66 px (switch.tsx line 17). |
| V3-06 BotTodos tick box / Notifications switch | PARTLY | Notifications switch row hit 73 px (label 349x83). I did not measure the Complete checkbox (no open item to tick in Chief; "None yet" shown). |
| V1-18 Bot settings switches (13 skill switches, Read replies aloud) | MET for skills | All 13 skill switches (Built-in skills expanded) hit 44-46 px tall. "Read replies aloud" gave 1 px in my probe (likely off-screen or not in the panel I measured; unverified). |
| V3-16 Account settings Browser notifications switch | NOT VERIFIED | Same shared switch, so expected met; I did not open Account settings. |
| V3-07, V1-17, W2-01 Approvals select clipped | MET | Selects 176x44; value reads "Same as all bots" in full at 390 and 375 (botset-bottom.png, bs375.png); scrollWidth 174 within clientWidth 174. Labels wrap to two lines ("Edit files and run commands") but do not clip. |
| V3-04 Routines panel | MET | Panel is x=0, width 390, height 844 (no sliver). Header has gear and Close only; the hidden hamburger measures 0x0. No explainer line. Routine editor has Back and Close (both 44x44). Row "Morning briefing" 59 px. |
| V3-02, W1-15 Approval card tool name and empty band | MET | The card shows "message bot" with a chevron, a 44 px button with visible text, no empty band, then "Asked because this ran in the background.", Allow once, Deny (approval.png). Card is about 300 px of 390 (77%), still narrower than the screen (V3-03, not in this cluster). |
| V1-16, FLOW-11, W2-04 Activity in the drawer | MET | One scroller (794 content in 673 box), no second scroller. Rows 76 px (Needs you), "Working" and the Finance helper row 44, "Show 2 finished runs" 44, "Back to chats" 44 (activity.png). Working and Show finished runs are reachable without scrolling. Not verified: whether the drawer closes after tapping an Activity row. |
| W1-16 Pinned fold clips a row under "+N more" | NOT MET | In both Activity (+2 more) and the normal drawer fold (+5 more) a half-faded row ("Leadership sync", "Chief") still sits behind the "+N more" bar (activity.png, drawer.png). |
| V3-09 Page agents indent and truncation | PARTLY | Indent is gone (avatar at the left edge; name text starts at x=68 beside a 36 px avatar). "Investors agent", "Chief", "Finance agent" fit. Long names still truncate: "Investor Relations (mock)" is 118 of 167 px, "Finance helper (mock)" 118 of 147, and "Leadership sync (mock)" 132 of 156, because the time and "..." share the row. They are mock names, but real long agent names will behave the same. |
| V3-08, W2-07 Integrations cards compact | PARTLY | 390x844: four cards fully visible (Gmail, Carta, Mercury, Brex) plus a fifth partly; same at 375x812 (integrations.png, int375.png). Gmail and Carta cards are about 82 px tall with the button inline. Mercury, Brex (and Blockscout) are about 126 px because the button wraps to its own row under a single-line description. Heights are inconsistent. |

## Desktop 1440x900 (no phone emulation)

Bot settings (Chief settings docked at right), Activity (drawer list with Needs approval, Working, Show 2 finished runs) and Integrations (three-column grid with Used by and Open buttons) all look like normal desktop layouts with no phone-only styling leaking in (d-bs.png, d-act.png, d-int.png). I had no pass-1 desktop screenshots to diff against, so "unchanged" rests on the layouts being the expected desktop ones.

## Not-met and partly-met list
1. W1-16 NOT MET: row clipped behind the "+N more" bar in the pinned agents fold.
2. V3-01 / W1-14 PARTLY: Save and last panel rows end 4-6 px under the toast edge at the end of scroll.
3. V3-09 PARTLY: long Page agent names still truncate.
4. V3-08 / W2-07 PARTLY: Mercury, Brex, Blockscout cards keep the button on its own row.
5. V3-05 PARTLY: the repeated hint under "Choose when it runs" remains.
6. Unverified: V3-06 Complete checkbox size, V3-16 account switch, "Read replies aloud" hit area, drawer closing after an Activity row tap.

## New findings

| id | severity | one line | file |
|---|---|---|---|
| R3-01 | P3 | The toast reserve for panels is about 6 px short: Save and "Clear conversation" boxes end at y=629 while the toast starts near 623 (text itself is clear). Add a few px to the reserve. | packages/ui-web/src/components/ui/notification-toaster.tsx (the `--toast-panel-reserve` computation) |
| R3-02 | P3 | Integrations cards wrap the action button to its own row when the description is a single long line (Mercury, Brex), so card heights are 82 vs 126 px. Make the button not wrap on max-sm (shrink the head instead) or always place it below. | apps/web/src/components/integrations/IntegrationsHome.tsx (Card flex-wrap) and parts.tsx (CardHead min-w-36) |
| R3-03 | P3 | The "+N more" bar overlays a half-visible agent row in the drawer fold (carried over from W1-16). Reserve the bar's height in the list. | apps/web/src/pages/shell/space-sidebar.tsx |

No P0 or P1 problem was introduced by the fixes. Click under touch emulation still hangs in agent-browser, so I used eval clicks; that is a tool limit, not an app finding.
