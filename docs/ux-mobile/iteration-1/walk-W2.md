# Walk W2: unattended bots, chat, shell, passkey (phone)

Walked as Maya on the mock-data demo stack at 390x844, device scale 3. Touch emulation was added through the browser's remote protocol (`Emulation.setTouchEmulationEnabled`), and `matchMedia('(pointer: coarse)')` and `(hover: none)` both returned true, so touch-target measurements are valid. The agent-browser `set device` preset alone left `pointer: coarse` false. The 375x812 spot-check was not run separately. The geometry audit ran on the key screens. It reported 0 px page horizontal overflow everywhere. Its uneven-row and overflow-spill hits were all the drawer chat rows (title vs time columns) and chat bubble wrappers, which are intentional layouts. Console showed no errors. Screenshots are kept outside the repo.

The mock model is scripted and the demo has little seeded bot state, so several stories could only check layout.

## Verdicts

| Story | Verdict | Taps actual/ideal | Notes |
|---|---|---|---|
| MOB-UNA-01 Waiting on you in Activity | BLOCKED (layout PASS) | 2/2 to open Activity | No "Waiting on you" items seeded. The Activity list opens inside the drawer ("Back to chats", Activity, Filter) with the "Needs you" rows (76 px tall, status and detail lines readable, no overflow). Tapping the Investors agent row opened its chat. The "Waiting on you" rows (`ActivityList.tsx:480-531`) could not be seen. |
| MOB-UNA-02 Expiring approval card | PARTLY BLOCKED (layout PASS) | 1/2 | Opened the seeded Q3 investor update mail approval. Card fits 390 px. Send, Discard and "..." are 44 px tall, Edit 44, Show more 44. No expiry line or countdown is seeded, and I did not press Approve or Decline on shared cards. |
| MOB-UNA-03 Approvals table in Settings | PASS with finding | 4/3 | Settings is under the account menu then a section picker ("Privacy and approvals"). Selects are 86x44 and one-handed. "More actions" is a 97x44 summary. Per-bot variant: "Same as all bots" is clipped (W2-01). |
| MOB-UNA-04 Routines watch, quiet, check in | PASS with findings | 4/3 | Routines (header button) -> row -> editor. Fits 390 px. The "Only message me if something needs me" switch is 32x18 and the Active switch 40x22 (W2-02). Run history expands, "No runs yet" (no last-run line to check). Editor header scrolls away under the panel. |
| MOB-UNA-05 Create a watch routine | PASS | 3/5 | "Choose when it runs" menu fits, items 44 px. Watch a page adds a "Page address" field and a "Check every" select, both full width and 44 px tall. Not saved (would add data to a shared bot). URL field under the keyboard not testable headless. |
| MOB-UNA-06 Credentials | PARTLY BLOCKED (layout PASS) | 2/2 | The bot has no credentials, so the last-used and needs-attention lines were not seen. "Add credential" form (Site, Type, Value) fits; Save and Cancel are 44 px. |
| MOB-UNA-07 Teach a task | BLOCKED | n/a | No Computer on the demo bots, no Teach entry. |
| MOB-UNA-08 Bot-built tool and share link | PASS | 3/3 | Artifacts list -> Cash Dashboard -> Share. The dialog is readable, link field plus Copy 44 px, Done and Stop sharing full width and 44 px, with a confirmation. The link field shows the end of the URL selected, which is fine. Copy not exercised (headless clipboard). I stopped sharing again to leave the data as found. |
| MOB-UNA-09 Tour stops | PASS with finding | 11/10 | The tour has 10 stops. Popover card stays on screen at the bottom. Routines stop (8/10) and Account stop (10/10, mentions Approvals) show, and the drawer scrolls so the target is highlighted. Skip tour and Back/Next are 44 px. Card height differs per stop, with empty space at short copy (W2-06). |
| MOB-CHT-01 Typed UI blocks | BLOCKED | n/a | The scripted model did not produce a render_ui block, and none was seeded. Table scrolling not checked. |
| MOB-CHT-02 Chief delegate status | PASS | 3/1 | After one consent card (Allow), Chief showed "Asking Investors agent..." and "Asking Finance agent..." as tappable 44 px pills with a short reply. Fit on one line each. The consent card is an extra step: send, Allow (first time only). |
| MOB-CHT-03 Email chat notes | PASS (layout) | 4/4 | Drawer "Email chats" group lists mail chats with the sender-colour avatar. Opening one showed an "Email thread - 1 message" chip, the mail approval card and composer. |
| MOB-SHL-01 Page agents, +N more | PASS | 2/2 | The "+6 more" fold bar is 44 px, expanding reveals the six page agents above chats. Row 52 px, actions button 44. |
| MOB-SHL-02 Page list and hide menu | PASS | 3/3 | Pages "..." (44 px) opens "Show in sidebar", rows 44 px with check marks. |
| MOB-SHL-03 Integrations logos | PASS | 2/2 | Brand logos crisp; "Open Inbox/Investors/Finance" buttons 44 px with 12 px spacing. Cards are full width, so the list is long (see W2-07). |
| MOB-SHL-04 Command palette | PASS with finding | 4/3 | The Search field in the drawer opens the palette. "cal" listed Calendar (44 px) and navigated to /app/calendar. A wrongly doubled text I saw was caused by my test typing twice, not by the app. No visible Contacts check beyond the list. The palette is a top sheet that is replaced by the keyboard on a phone. |
| MOB-AUT-01 Passkey | BLOCKED | n/a | The sign-in screen at 390 px shows email, password, Show password, Forgot password, Sign in, Sign up, with no passkey button (the demo server does not report passkeys). The General settings has no Passkeys section either. Sign-in layout itself fits with 0 px overflow. |

Counts: PASS 11, PARTLY BLOCKED 2 (UNA-02, UNA-06), BLOCKED 4 (UNA-01, UNA-07, CHT-01, AUT-01), FAIL 0, SKIPPED 0.

## Already excellent

- Touch targets: every drawer, header, dialog, menu and tour button measured 44 px or more under coarse pointer.
- Settings uses a section picker instead of a side tab column, with native selects at 44 px.
- Routine editor, watch-a-page form, share dialog and credential form stack to one column with no sideways scroll.
- Approval pills ("2 need approval") persist above the composer as decided.

## Findings

| ID | Story / page | Sev | Cat | What happened vs expected | Evidence | Suspected code | Proposed fix |
|---|---|---|---|---|---|---|---|
| W2-01 | MOB-UNA-03, bot settings Approvals | P2 | visual | Observed: the per-bot Approvals selects show "Same as all bot" with the last letter cut off by the chevron; the value is only partly readable. Expected the full value or a shorter label. | Screenshot of the bot settings panel (`cr2`); select 157x44 px | `apps/web/src/components/ApprovalActionsTable.tsx:79-104` | Shorten to "Same as all" or let the label column shrink and the select take 45% width. |
| W2-02 | MOB-UNA-04, routine editor | P2 | a11y | Observed: custom switches measure 40x22 (Active) and 32x18 (Only message me ...); the app-wide Switch is 32x18 too. Tap area is only the thumb track, below 44 px. Expected 44 px hit area. | switch sizes measured with coarse pointer | `apps/web/src/pages/RoutineEditor.tsx:533`, shared Switch in `packages/ui-web/src/components/ui/switch.tsx` | Make the whole row a label that toggles, or add a `pointer-coarse` min hit area. |
| W2-03 | MOB-UNA-04, routine editor | P3 | visual | Observed: the "2 need approval" pill sits over the editor content ("Next run" line, the switch row) at the bottom, hiding the "Only message me" row until it is dismissed. This is the owner-decided position but there is no bottom padding in the editor, so the lower fields are hidden until scrolled. | `rt5` screenshot | `RoutineEditor.tsx` scroll container, approval toast | Add bottom padding equal to the toast height while the toast is shown. |
| W2-04 | MOB-UNA-01 | P2 | flow | Observed: Activity opens inside the drawer, replacing the chat list, with a small "Back to chats" link; to leave Activity after opening a row, the drawer stays open on some paths. Expected a clear single step. UNVERIFIED for Waiting on you rows since none seeded. | `actf` screenshot | `apps/web/src/pages/shell/space-sidebar.tsx` | Verify the drawer closes after tapping an Activity row. |
| W2-05 | MOB-UNA-02 | P3 | flow | Observed: the mail approval card has "Show more" and no expiry line or countdown in the seeded state, so the expiring card state could not be judged. | `mail1`, `mail2` | `components/MailApprovalCard.tsx` | Seed an expiring card for the next phone pass. |
| W2-06 | MOB-UNA-09 | P3 | visual | Observed: the tour card keeps a fixed height, leaving a large empty gap between short copy and the buttons (stops 1 to 7), while long stops (8, 10) fill it. Owner decided a fixed card spot, so only the empty gap is noted. | `tour1`, `tour8`, `tour10` | `components/tour/TourPopover.tsx` | Keep the position, but shrink the card to its content height. |
| W2-07 | MOB-SHL-03 | P3 | visual | Observed: Integrations "Connected" cards are about 180 px tall each, with a right-aligned outlined button on its own row, so only 2 to 3 integrations show per screen. | `int1` | `apps/web/src/components/integrations/` | Put the action in the card header row on phones (button beside the title). |
| W2-08 | MOB-CHT-02 | P3 | flow | Observed: a first Chief request shows the "Share your chats and mail with the AI model" consent card before anything happens, and the composer placeholder changes to "Needs your answer". Works, but the card text is long on a phone. | `cht1` | consent card in `pages/shell/message-cards.tsx` | None needed unless copy is cut; noted only. |
| W2-09 | MOB-AUT-01 | P3 | bug | Observed: no passkey UI anywhere on the demo (sign-in and Settings General), so Settings `PasskeySettings.tsx` layout and the sign-in passkey button could not be checked. BLOCKED, not a defect. | `signin`, `pk1` | `components/PasskeySettings.tsx`, `pages/Auth.tsx:414` | Enable passkeys in the demo server config to cover this story. |
| W2-10 | Test setup | P3 | flow | Observed: the stock device preset ("iPhone 15") does not set `pointer: coarse`; without CDP touch emulation, touch-target checks would be wrong. | matchMedia result | n/a | Document the CDP step in the walker setup. |
