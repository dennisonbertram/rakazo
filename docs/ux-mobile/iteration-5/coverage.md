# Iteration 5, coverage walk C (phone features earlier passes could not reach)

Session mob5-C, mock-data demo built from origin/main. Phone 390x844 at device scale 3 (375x812 not separately re-run; the layouts used the same breakpoints), tablet 768x1024 and 1024x768. Touch emulation held open over CDP: `matchMedia('(pointer: coarse)')` and `(hover: none)` both true, confirmed. Clicks were made through script `click()` because the real click path hangs. Screenshots are named below (file names only; they live outside the repo).

Method notes: invented fixture rows were inserted into the throwaway demo database (6 scratchpad items, 4 inbox to-dos, 1 chat message with typed blocks). Triage deletes untouched inbox to-dos, so those rows needed `touchedAt` set. Google Calendar and Drive data are out of scope (need a real Google account) and were not walked. Full page loads in this stack took more than 7 s before data appeared, so screenshots needed 13 s waits.

## Verdicts

| # | Item | Verdict |
|---|---|---|
| 1 | Passkeys | Works end to end on a phone. Needs `localhost`, not `127.0.0.1`. Layout fine, 44 px targets. Two small findings (C-01, C-10, C-11). |
| 2 | Waiting on you / open items | Works. Activity rows, Calendar rows and mail opening are good. Several undersized targets and one large block (C-03, C-04, C-05, C-09). |
| 3 | Attachment Review with AI | Works. Consent, then a readable review. Minor (C-12). PDF preview itself rendered blank in headless Chrome (no PDF plugin), so the preview is unverified. |
| 4 | Typed UI blocks | Render well (stats, summary, callout, sections, cards). Table and card link issues (C-06, C-07). |
| 5 | Tablet | No sideways page scroll on any page at either size (scrollWidth equals width). 768 uses the phone drawer pattern, 1024 the desktop sidebar; not a broken mix. Week view and some chips are too small (C-08, C-14). Activity at 768 stayed on its loading skeleton for over 15 s (C-13, unconfirmed). |
| 6 | On-screen keyboard (390x500 approximation) | Pass. Composer, Send, compose-email Send, mail search field all stay visible. Filter menu fits as a popover. Nothing stuck under a fixed element. |

## What was done and seen

### 1. Passkeys (observed)
- The passkey buttons never appear on `127.0.0.1` because WebAuthn rejects IP hosts (`passkeysAvailable`). On `localhost:5379` with a CDP virtual authenticator (ctap2, internal, resident key, user verification) everything worked.
- Settings, General, Passkeys: "Add passkey" 98x44, row "Passkey 10/28/2026", "Remove" 70x44 (pk1.png, pk2.png, pk9.png). Layout is clean, no overflow.
- Sign-in screen with a passkey present shows a second 44 px button "Sign in with passkey" below "Sign in" (pk8.png). Tapping it signed in and landed in Chief. With the virtual authenticator's auto-presence on, the browser-autofill ceremony signs the user straight back in after Log out; a real device would wait for a tap on the email field, so this is a test artifact, not a finding.
- Remove deleted the passkey at once, no confirmation or undo.
- After Log out, the "Investors agent needs approval" toast from the signed-in session was still on the sign-in screen (pk8.png).

### 2. Waiting on you / open items (observed)
Fixtures: scratchpad items waiting on "you" (overdue, due Wed, due Fri with a very long title, due Sun, no date) plus one waiting on someone else; inbox to-dos linked to demo mail (today, overdue, tomorrow, long title).
- Activity (sidebar panel): "Waiting on you" section lists the five owner items, overdue one in red ("due Mon"), someone else's item correctly absent, rows 295x59, one-line titles truncated (act1.png). Tapping a row opens that bot's settings with "Open work" (act2.png, act3.png).
- Calendar Schedule: to-dos appear as all-day rows and timed rows; tapping "Review the Q3 board deck and send comments" opened that mail full screen (cal1.png, cal2.png). Month view shows dots plus a day agenda and the block hides items already drawn in the grid (cal4.png). Day/3-day views show clipped all-day chips (cal5.png).
- BotTodos tick box: 24x24 on touch, title link 18 px high (cal1.png, inb1.png).
- Inbox: "Waiting on you" block with five items is about 400 px tall and sits above "To do" and the mail list, so the first mail row is below the fold (inb1.png). Expanded "To do" card: rows 44 px, but two-line titles overlap their grey detail line (inb3.png).

### 3. Attachment Review with AI (observed)
Opened "Q3 board deck (PDF attached)" from the Calendar to-do. Attachment chip (with "..." menu) opens a preview with four 44x44 icon buttons (Review with AI, Add to Data room, Download, Close). Review with AI first shows a consent card ("The file's text is sent to the AI model that runs your bots", Allow 55x44), then a readable review with bold lead-ins (What it is, Needs action, Security) (att1.png to att3.png). The composer ("Ask about this file", 44 px, 16 px font) has no visible placeholder, and the document preview is hidden while reviewing, with only Close to go back.

### 4. Typed UI blocks (observed)
No scripted prompt produces `render_ui`, so a fixture bot message with stats, table, callout, summary, cards and sections was inserted into the Chief thread. Rendering: stats two-up grid, callout, summary and sections look good (ui1.png, ui2.png, ui3.png, ui4.png). The table block is 720 px wide in a 301 px container and scrolls sideways inside its card, with later columns cut off and no cue. All blocks are 301 px wide while the viewport leaves 358 px. Card links are only the title text (125x18).

### 5. Tablet (mostly measured, partly seen)
All of Calendar, Inbox, Contacts, Investors, Company, Legal, Finance and Data room were loaded at 768x1024 and 1024x768 with an audit script (page scrollWidth, elements past the right edge, visible targets under 44 px). No page scrolled sideways. I looked at screenshots of Calendar and Inbox at 768 (tab768-calendar.png, tab768-inbox.png), the mail dialog at 768 (tab768-mail.png, two panes: message and Context, sensible) and Inbox at 1024 (tab1024-inbox.png). Contacts, Investors, Company, Legal, Finance and Data room were checked by measurement only, not by reading their screenshots. Activity and bot settings at 768 were not verified because Activity stayed on its skeleton (tab768-activity.png).

### 6. Keyboard approximation (observed)
Viewport 390x500 with focus in the composer (field 430-474, Send at 474, kb1.png), compose email (From, To, Subject, Message, Send pinned at the bottom, kb2.png), mail search (kb3.png) and the Filter popover (fits, kb4.png). All stayed visible. A real keyboard also shrinks the visual viewport, which this does not reproduce.

## Findings

| id | sev | cat | summary | where | evidence |
|---|---|---|---|---|---|
| C-01 | P2 | bug | The approval toast of the signed-in session stays on the public sign-in screen after Log out. | toast host mounted outside the auth gate (suspected; apps/web/src/pages/shell/space-sidebar.tsx logout handler clears tour/cache but not toasts) | pk8.png |
| C-02 | P1 | bug | Inbox "To do" card: two-line titles collide with the detail line on touch. | apps/web/src/components/inbox/TodoCard.tsx:129 (`pointer-coarse:min-h-11` with `pointer-coarse:-my-3`, suspected cause) | inb3.png |
| C-03 | P2 | a11y | Bot settings "Open work" Complete checkbox is 16x16 on touch, no coarse-pointer size. | apps/web/src/pages/ScratchpadSection.tsx:182 | act3.png, measured 16x16 |
| C-04 | P2 | a11y | "Waiting on you" tick box is 24x24 and the title link is 18 px high on phone (row is 44 px, but only the box and text tap). | apps/web/src/components/BotTodos.tsx | cal1.png, inb1.png |
| C-05 | P2 | visual | Inbox "Waiting on you" has no cap or fold; five items take about 400 px and push mail below the fold. Propose collapsing to a count row like "To do". | apps/web/src/components/BotTodos.tsx | inb1.png |
| C-06 | P2 | a11y | Cards block with `href`: only the title is the link (125x18), no chevron or card-wide tap. | apps/web/src/components/UiBlockView.tsx | ui3.png, measured |
| C-07 | P2 | visual | Table block is 720 px in a 301 px box; columns cut off with no scroll cue, no sticky first column. Propose a card list on touch. | apps/web/src/components/UiBlockView.tsx | ui1.png, ui2.png |
| C-08 | P2 | visual | Calendar Week at 768 and 3-days at 390 show chips such as "[MOCK] ..." and "Send Sa...", unreadable. | calendar week/3-day grid component | cal5.png, tab768-calendar.png |
| C-09 | P3 | flow | In Day/3-day, the grid scrolls to the current hour inside the same container as "Waiting on you", leaving the block scrolled off above (measured top y=-587). | calendar page scroll container | DOM measurement |
| C-10 | P3 | flow | Passkey Remove acts at once (no confirm, no undo), and every passkey is named "Passkey". | apps/web/src/components/PasskeySettings.tsx:78 | pk9.png |
| C-11 | P3 | flow | `pnpm demo:up` prints a 127.0.0.1 URL, where passkey UI can never show. Print or note a `localhost` URL. | packages/testkit/src/cli/demo.ts | pk7 sign-in without button |
| C-12 | P3 | visual | Review with AI: composer has no placeholder; Close sits tight against the consent card; no way back to the document. | apps/web/src/components/inbox/AttachmentReviewDialog.tsx:137 | att2.png, att3.png |
| C-13 | P2 | perf | Full page loads show skeletons for more than 7 s on this stack; Activity at 768 still showed a skeleton after 15 s. Suspected load from other walkers on the shared stack; not confirmed. | n/a | tab768-activity.png |
| C-14 | P3 | a11y | Tablet touch audit: Week view routine chips 92x24 and Finance burn rows 700x32 are under 44 px. | calendar chips; Finance burn breakdown rows | audit output (first 768 run) |
| C-15 | P3 | visual | The approval toast covers content on top of bot settings and the Open work list (owner decision keeps toasts persistent; the cover on a sheet may still be worth a bottom inset). | toast host | act2.png |

Already excellent: passkey add and sign-in flow and its 44 px buttons; Activity "Waiting on you" rows with red overdue; Calendar to-do rows opening their mail; Month view agenda; mail dialog on a tablet; typed blocks stats/callout/summary/sections; keyboard-height layouts of composer, compose email and search.

Not done: Google Calendar and Drive data; real on-screen keyboard; real PDF preview.
