# Phone UX story catalog, pass 1

Scope: features in the "New since pass 23" table of `docs/ux-mobile/scope.md`. Viewport 390x844, touch (coarse pointer, no hover). Web app only.
Persona: Maya, first-time founder of Northwind Robotics, using Praci on her iPhone.
Evidence: written from code at `origin/main` 4ee112806. Nothing here was walked in a browser. Items the code cannot settle are marked UNVERIFIED.
Existing desktop stories live in `docs/ux-paths/`; this file only adds stories where the phone path differs or no story exists. Where a desktop story covers the same flow, it is named in "Related".

Story format: id, title, type (short 1-5 steps, medium 6-12, long 13+), entry, preconditions (mock demo stack), steps (what Maya taps), expected, Ideal path (minimum taps), Phone risks (with repo-relative paths).

## Demo data and blockers (read first)

- Demo stack has emulated Gmail, mock finance, Carta and data room data, and a Granola emulator. It has NO Google Calendar and NO Google Drive data.
- Calendar stories: Google events cannot appear. Bot to-dos, check-backs and routine runs come from local data. A story marked PARTLY BLOCKED can still check the empty state, layout of every view, controls, and any bot to-do the walker creates (ask a bot to "remind me Friday", or seed via a routine).
- Drive import and Google contact photos cannot be seen. Fall back to initials avatars.
- Passkey sign-in needs a browser authenticator. The button only appears when the server reports passkeys and the browser supports WebAuthn (`apps/web/src/pages/Auth.tsx:143`). Mobile emulation in a desktop browser may hide it. Mark UNVERIFIED if absent.
- Touch emulation matters. Button sizes grow to 44 px only under `pointer-coarse` (`packages/ui-web/src/components/ui/button.tsx:30-37`). A plain 390 px window with a mouse will show small targets and hover behaviour that real phones lack. Walk with device emulation and touch on.
- Approvals, watchers and credentials stories need a bot with a routine; the mock model may not call tools such as `request_secret` or `create_ui_artifact`. Pending states may need seeding.

Seeded names used below (invent or reuse the demo seed, never real data): Maya Okafor (MOCK), Northwind Robotics, investor "Dana Whitfield (Harbor Ventures)", contact "Sam Ortiz", mail M1..Mn from the Inbox seed.

## Story counts

| Area | Prefix | short | medium | long | Total |
|---|---|---|---|---|---|
| Calendar | MOB-CAL | 4 | 3 | 0 | 7 |
| Contacts | MOB-CON | 3 | 2 | 0 | 5 |
| Investors | MOB-INV | 3 | 2 | 0 | 5 |
| Inbox / Mail | MOB-MAIL | 7 | 4 | 0 | 11 |
| Unattended bots | MOB-UNA | 5 | 4 | 0 | 9 |
| Company | MOB-COM | 2 | 2 | 0 | 4 |
| Devin | MOB-DEV | 1 | 0 | 0 | 1 |
| Tables and filters | MOB-TBL | 2 | 1 | 0 | 3 |
| Legal | MOB-LEG | 2 | 0 | 0 | 2 |
| Chat | MOB-CHT | 2 | 1 | 0 | 3 |
| Data room | MOB-DRM | 3 | 1 | 0 | 4 |
| Finance | MOB-FIN | 2 | 0 | 0 | 2 |
| Shell | MOB-SHL | 3 | 1 | 0 | 4 |
| Auth | MOB-AUT | 1 | 0 | 0 | 1 |
| Journeys | MOB-JRN | 0 | 0 | 4 | 4 |
| **Total** | | **40** | **21** | **4** | **65** |

---

## Calendar (`/app/calendar`)

Code: `apps/web/src/pages/Calendar.tsx`, `apps/web/src/components/BotTodos.tsx`. Related: none in `docs/ux-paths/` (new page).

### MOB-CAL-01: Open Calendar from the drawer
- Type: short. Entry: sidebar drawer, then Calendar. Preconditions: demo stack, no Google Calendar connected (PARTLY BLOCKED for events).
- Steps: 1. Tap the menu button to open the sidebar drawer. 2. Tap Calendar.
- Expected: drawer closes, page opens on the current view with today highlighted. With no Google account, the page still loads and shows local items or an empty list, with no error banner about Google.
- Ideal path: 2 taps.
- Phone risks: header row (Today, prev, next, title, four view buttons) sits in one `flex-wrap` row at `Calendar.tsx:629-665`; title is `truncate` and may shrink to nothing next to four text buttons. Page header meta hidden with `max-sm:` (`Calendar.tsx:615`), fine.

### MOB-CAL-02: Switch between Day, Week, Month and Schedule
- Type: short. Entry: `/app/calendar`. Preconditions: same as CAL-01; at least one bot to-do or routine item for content.
- Steps: 1. Tap Day. 2. Tap Week. 3. Tap Month. 4. Tap Schedule. 5. Tap Today.
- Expected: each view renders; the chosen button shows pressed state; Today returns to the current date; the URL keeps `view` and `date` so Back works.
- Ideal path: 1 tap per view.
- Phone risks: Week uses `min-w-[40rem]` (`Calendar.tsx:527`) so it scrolls sideways inside the page; the 3rem time gutter plus 7 columns is about 80 px each. Month cells are `h-20` with `p-1` and truncated chips (`Calendar.tsx:450`), so several items collapse into "+N" or hide. Four view buttons are `size="sm"`, which only reach 44 px under touch emulation. Prev/next are `icon-sm`.

### MOB-CAL-03: Week view horizontal scroll
- Type: short. Entry: `/app/calendar?view=week`. Preconditions: items on at least two days.
- Steps: 1. Open Week. 2. Swipe sideways to see later days. 3. Swipe vertically through the hours.
- Expected: sticky day header and time gutter stay readable; horizontal scroll does not move the whole page or fight the drawer swipe.
- Ideal path: 0 taps, 2 swipes.
- Phone risks: `Calendar.tsx:527-531` sticky header inside a `min-w-[40rem]` box; nested scroll with vertical scroller at `Calendar.tsx:713`. Day names in `p-1 text-xs` may truncate.

### MOB-CAL-04: Open an item and see its bot
- Type: short. Entry: Schedule view. Preconditions: one bot to-do (can be seeded by asking a bot to remind her).
- Steps: 1. Open Schedule. 2. Tap an item row. 3. Go back.
- Expected: the item opens its source (bot chat or mail) in one tap; Back returns to the same Calendar view and scroll position.
- Ideal path: 1 tap.
- Phone risks: row has fixed `w-16` time column and a bot label capped `max-w-[30%]` (`Calendar.tsx:371,378`); long titles truncate with `title=` tooltips that touch cannot show, so full text is not reachable on the list.

### MOB-CAL-05: To-dos waiting on you
- Type: medium. Entry: `/app/calendar`. Preconditions: at least one open bot to-do (seeded), PARTLY BLOCKED if no calendar items.
- Steps: 1. Open Calendar. 2. Find the "waiting on you" block above the grid. 3. Tick one to-do. 4. Tap another to-do's text. 5. Return.
- Expected: ticked to-do is struck through or removed; tapping text opens the bot chat. Block does not push the grid off-screen.
- Ideal path: 2 taps.
- Phone risks: `BotTodos` renders above the scroller (`Calendar.tsx:711`) inside page gutter, not inside the scroller, so a long list steals vertical space from the grid on an 844 px screen. Checkbox hit area: `BotTodos.tsx:62-67` has no `pointer-coarse` enlargement (compare `TodoCard.tsx:118`, which has one).

### MOB-CAL-06: Filter by kind and bot, then search
- Type: medium. Entry: `/app/calendar`. Preconditions: at least two kinds of item.
- Steps: 1. Tap the Search field and type a word. 2. Tap Kind, choose one. 3. Tap Bot, choose one. 4. Clear each by choosing All. 5. Reload and confirm filters persist in the URL.
- Expected: list narrows; empty result shows a "no matches" state; filters survive reload.
- Ideal path: 3 taps plus typing.
- Phone risks: three controls wrap in a `flex-wrap` row (`Calendar.tsx:667-690`), taking two or three lines. Dropdown content width `min(24rem, 100vw-2rem)` (`apps/web/src/components/ListControls.tsx:135`) is fine, but the filter `sm` button is small without touch emulation. Mobile-only UI candidate: one "Filters" sheet.

### MOB-CAL-07: Google error and empty state
- Type: medium. Entry: `/app/calendar`. Preconditions: PARTLY BLOCKED. Break a Google account on the demo (revoked token) or simply have none.
- Steps: 1. Open Calendar. 2. Read the status lines. 3. Tap "Try again" on any local error. 4. Open Month, Week, Schedule and confirm an empty state exists in each.
- Expected: "Couldn't load {account}" appears as plain text; no blank page; Schedule shows an explanatory empty state.
- Ideal path: 1 tap.
- Phone risks: error lines use the page gutter only (`Calendar.tsx:700-710`) and the Try again button is `size="sm"`. Empty Week grid still renders 7 columns at `min-w-[40rem]`.

---

## Contacts (`/app/contacts`, `/app/contacts/:id`)

Code: `apps/web/src/pages/Contacts.tsx`, `apps/web/src/pages/ContactDetail.tsx`, `apps/web/src/components/ListControls.tsx`. Related: `docs/ux-paths/contacts/catalog.md`.

### MOB-CON-01: Contact list at phone width
- Type: short. Entry: sidebar, Contacts. Preconditions: demo contacts of several kinds.
- Steps: 1. Open Contacts. 2. Scroll the list. 3. Read name and kind columns.
- Expected: Name and Kind visible; Email and Org columns hidden by container query and shown as secondary text if the design allows it.
- Ideal path: 2 taps.
- Phone risks: `table-fixed` with `hidden @md:table-cell` columns (`Contacts.tsx:195-213`); Kind `w-28` is 7 percent of nothing at 390 minus gutters, so Name gets about 220 px. Email may not be shown at all, hiding the only thing Maya recognises some contacts by.

### MOB-CON-02: Sort by tapping headers
- Type: short. Entry: `/app/contacts`. Preconditions: 5+ contacts.
- Steps: 1. Tap the Name header. 2. Tap it again. 3. Tap Kind.
- Expected: order flips; URL gets sort params; arrow indicator visible.
- Ideal path: 1 tap per sort.
- Phone risks: sortable `TableHead` hit area is the header cell text only; email/org sort headers are hidden at phone width (`Contacts.tsx:201,205`), so sorting by email is impossible on a phone. Header cells are about 28 px tall (`Table compact`).

### MOB-CON-03: Search and filter by kind
- Type: short. Entry: `/app/contacts`. Steps: 1. Tap Search, type "sam". 2. Tap the Kind filter, choose Investor. 3. Clear.
- Expected: list narrows, empty state with Clear action when nothing matches.
- Ideal path: 2 taps plus typing.
- Phone risks: `Contacts.tsx:158-170` search `w-full @md:w-72`, filter beside it wraps; keyboard covers the dropdown on iOS.

### MOB-CON-04: Open a contact page and read it
- Type: medium. Entry: `/app/contacts`. Preconditions: Sam Ortiz with related mail, a meeting (Granola emulator) and a document.
- Steps: 1. Tap Sam Ortiz. 2. Read the details block. 3. Scroll to related mail. 4. Tap a mail. 5. Back. 6. Scroll to meetings and documents, tap one. 7. Back.
- Expected: page shows photo or initials, details, related mail, meetings, documents; each row opens its target; Back returns to the contact.
- Ideal path: 2 taps to the first related mail.
- Phone risks: details use `grid-cols-[max-content_1fr]` (`ContactDetail.tsx:143`); a long email or title in the first column cannot shrink and squeezes the value column. Related rows `flex justify-between` with fixed-gap (`ContactDetail.tsx:45,160`). Back from a mail opened as a dialog may land on Inbox, not the contact (UNVERIFIED).

### MOB-CON-05: Edit or add a contact on a phone
- Type: medium. Entry: `/app/contacts`, plus button. Steps: 1. Tap add. 2. Fill name, email, kind. 3. Save. 4. Open the new contact. 5. Edit a field.
- Expected: dialog fits the screen, Save reachable above the keyboard.
- Ideal path: 4 taps plus typing.
- Phone risks: `apps/web/src/components/ContactDialog.tsx` has no `max-sm`/`dvh` handling in this grep scan (UNVERIFIED; check dialog height with the keyboard open). Google contact photo cannot be tested (no Google data); initials fall-back only.

---

## Investors (`/app/investors`)

Code: `apps/web/src/pages/Investors.tsx`, `apps/web/src/components/cap-table/HoldingsTable.tsx`. Related: `docs/ux-paths/captable/catalog.md`.

### MOB-INV-01: Switch Cap table, Updates, Contacts tabs
- Type: short. Entry: sidebar, Investors. Preconditions: demo Carta/cap table data.
- Steps: 1. Open Investors. 2. Tap Updates. 3. Tap Contacts. 4. Tap Cap table.
- Expected: each section replaces the last; selected tab is clear; URL reflects section.
- Ideal path: 2 taps from the drawer plus 1 per tab.
- Phone risks: section `TabsList` has `max-w-full` but no scroll (`Investors.tsx:1272`); the base `tabsListVariants` is `inline-flex w-fit` (`packages/ui-web/src/components/ui/tabs.tsx:18`), so long translated labels clip.

### MOB-INV-02: Holdings table with Invested and sortable headers
- Type: short. Entry: `/app/investors`, Cap table. Steps: 1. Scroll holdings. 2. Tap Diluted header to sort. 3. Tap a holder.
- Expected: Name and Diluted visible; Shares and Invested hidden on a phone, with a secondary line under the name; sort works.
- Ideal path: 1 tap to sort.
- Phone risks: Shares and Invested columns are `hidden @lg:table-cell` (`HoldingsTable.tsx:150-160`), so the new per-holder Invested value can only be seen if the secondary line includes it (`HoldingsTable.tsx:196`, UNVERIFIED). Sorting by Invested from the hidden header is impossible on a phone.

### MOB-INV-03: Investor Updates tab
- Type: short. Entry: `/app/investors`, Updates. Steps: 1. Tap Updates. 2. Open an update or action item. 3. Back.
- Expected: list readable; action items fit.
- Ideal path: 2 taps.
- Phone risks: `components/investors/ActionItems.tsx` has 4 breakpoints so it is likely fine; update cards not audited.

### MOB-INV-04: Contacts tab: kind tabs, search, stage, sort
- Type: medium. Entry: `/app/investors?section=contacts` (UNVERIFIED param name; use the tab). Preconditions: investor and board contacts.
- Steps: 1. Tap Contacts. 2. Tap Board kind tab. 3. Tap Message the board. 4. Cancel. 5. Back to Investor. 6. Search "dana". 7. Choose Stage. 8. Choose Sort.
- Expected: filters stack without covering the list; sort and stage dropdowns open fully on screen.
- Ideal path: 2 taps plus typing to find a person.
- Phone risks: kind `TabsList` + button + search + stage + sort all in one `flex-wrap` row (`Investors.tsx:1489-1560`); on 390 px it is about three rows and pushes the list below the fold. Kind tabs use `h-7` triggers (`Investors.tsx:1500`) with no touch enlargement. Mobile-only UI candidate: single Filters sheet.

### MOB-INV-05: Open an investor contact from the Contacts tab
- Type: medium. Entry: `/app/investors`, Contacts. Steps: 1. Tap Dana Whitfield. 2. Read her page. 3. Tap related mail. 4. Back twice.
- Expected: lands on `/app/contacts/:id`, Back returns to the Investors Contacts tab with kind and search kept.
- Ideal path: 2 taps.
- Phone risks: Back target unclear; URL params for tab and search live on the Investors page (`Investors.tsx:602`) so returning should restore them. See also MOB-JRN-02.

---

## Inbox and Mail (`/app/inbox`)

Code: `apps/web/src/pages/Inbox.tsx`, `apps/web/src/components/inbox/*`, `apps/web/src/components/ComposeEmail.tsx`. Related: `docs/ux-paths/inbox/catalog.md` (INB-031 phone Inbox, INB-101..121).

### MOB-MAIL-01: Open a mail full screen
- Type: short. Entry: `/app/inbox`. Steps: 1. Tap a row. 2. Read. 3. Tap close.
- Expected: dialog fills the screen (safe areas respected), subject up to three lines, Context panel closed on a phone by default.
- Ideal path: 1 tap.
- Phone risks: dialog is already full-screen below `md` (`InboxMessageDialog.tsx:152`). Row hover actions are replaced by an overflow menu under `pointer-coarse` (`InboxRow.tsx:442-514`); verify Archive/Mark noise are reachable with one extra tap.

### MOB-MAIL-02: Open and close the Context panel
- Type: short. Entry: open mail. Steps: 1. Tap the Context button. 2. Scroll the panel. 3. Tap a related contact. 4. Close the panel.
- Expected: panel covers the mail (full width), has a visible close X (`EmailSidePanel.tsx:73`), and reopening remembers the choice.
- Ideal path: 2 taps.
- Phone risks: panel is `absolute inset-y-0 end-0 w-full max-w-[384px]` (`InboxMessageDialog.tsx:698`), so on 390 px it nearly hides the mail and its close is a small icon button. `useContextPanelOpen` remembers open across mails, so Maya may open the next mail already covered by the panel (`apps/web/src/lib/mail-context-panel.ts`, UNVERIFIED). `ContextPanel.tsx` rows use `py-1` (about 28 px) with no touch size (`ContextPanel.tsx:31`).

### MOB-MAIL-03: Track a thread
- Type: short. Entry: open mail. Steps: 1. Tap Track. 2. Read the confirmation. 3. Close mail. 4. Find the tracking line in the Inbox. 5. Tap Stop tracking.
- Expected: toast or status "Tracking ...", row shows tracked state, Stop works.
- Ideal path: 2 taps.
- Phone risks: Track is an icon or overflow item on the row and in the dialog; its label may be hidden under `hidden sm:inline` (`MailAttachments.tsx:263,351` pattern). A toast on a phone may sit under the bottom safe area (UNVERIFIED). Status text at `Inbox.tsx:1333`.

### MOB-MAIL-04: Review with AI for an attachment
- Type: short. Entry: open mail with attachment. Preconditions: seeded mail with a PDF or sheet. Steps: 1. Tap the attachment chip. 2. Tap Review with AI. 3. Read the reply. 4. Close.
- Expected: full-screen review dialog, text selectable, Back/close works.
- Ideal path: 2 taps.
- Phone risks: button label hidden below `sm` leaves an icon-only button (`MailAttachments.tsx:347-351`, has `aria-label`). Dialog full-screen (`AttachmentReviewDialog.tsx:85`). Needs a model reply; mock model may not support file review (PARTLY BLOCKED).

### MOB-MAIL-05: Urgent mail as a table
- Type: short. Entry: `/app/inbox`, Important or the urgent group. Preconditions: mail classified urgent (INB seed).
- Steps: 1. Open the urgent list. 2. Scan columns. 3. Tap a row.
- Expected: readable rows, no sideways scroll.
- Ideal path: 2 taps.
- Phone risks: this is the new table form of urgent mail; `InboxRow.tsx` uses `@md` container query to hide columns (`InboxRow.tsx:389-421`). Sender-group variant at `InboxSenderGroup.tsx` has 5 breakpoints. UNVERIFIED which component draws the urgent table.

### MOB-MAIL-06: To-dos in Inbox
- Type: short. Entry: `/app/inbox`, Important pile. Steps: 1. Read the to-do card. 2. Expand it. 3. Tick one. 4. Tap another's text to open its mail.
- Expected: collapsible, ticks have 44 px targets, open count shown.
- Ideal path: 1 tap.
- Phone risks: `TodoCard.tsx:118` already enlarges ticks for touch. Second card `BotTodos` (`Inbox.tsx:1812`) does not (see CAL-05 risk). Two to-do blocks can stack at top of Important.

### MOB-MAIL-07: Compose, send and undo
- Type: medium. Entry: `/app/inbox`, compose button. Steps: 1. Tap compose. 2. Type a recipient, subject, body. 3. Tap Send. 4. See the undo toast and tap Undo. 5. Send again and let it go. 6. Confirm the dialog closed.
- Expected: dialog closes on send; undo toast appears and can be tapped; mail appears in Sent.
- Ideal path: 5 taps plus typing.
- Phone risks: dialog is `max-md:inset-0` full-screen (`ComposeEmail.tsx:616`). Context panel is `w-80` that becomes a full-width overlay below `md` (`ComposeEmail.tsx:950`) and hides the editor. Toast duration vs thumb reach. Rich text toolbar `RichTextEditor.tsx` has no breakpoints (361 lines); toolbar may overflow.

### MOB-MAIL-08: Context panel while writing
- Type: medium. Entry: reply to a mail. Steps: 1. Tap Reply. 2. Tap Context. 3. Copy a detail into the body. 4. Close Context. 5. Send.
- Expected: panel does not lose the draft; Close returns to the editor with the keyboard state intact.
- Ideal path: 3 taps.
- Phone risks: overlay `max-md:absolute max-md:inset-0 z-10` (`ComposeEmail.tsx:950`) means no side-by-side reading and writing, defeating the feature; Maya cannot copy by looking. Mobile-only UI candidate: bottom sheet at half height.

### MOB-MAIL-09: Send now on a draft
- Type: medium. Entry: Drafts or an agent draft card. Steps: 1. Open a draft. 2. Tap Send now. 3. Confirm. 4. See toast.
- Expected: sends once, closes, no double send on double tap.
- Ideal path: 2 taps.
- Phone risks: `MailApprovalCard.tsx` (656 lines, 4 breakpoints) buttons rely on text width; label "Send now" may wrap.

### MOB-MAIL-10: Open in Gmail
- Type: short. Entry: open mail. Steps: 1. Open the overflow menu. 2. Tap Open in Gmail.
- Expected: opens Gmail in a new tab or the Gmail app.
- Ideal path: 2 taps.
- Phone risks: on iOS a `target=_blank` link may open a Universal Link to the Gmail app or fail to leave a standalone PWA. Demo has no real Gmail so the target 404s (PARTLY BLOCKED; only check the button exists and is reachable).

### MOB-MAIL-11: Wider dialog on a phone
- Type: medium. Entry: open a long newsletter mail. Steps: 1. Open it. 2. Pinch or scroll sideways. 3. Rotate to landscape (844x390). 4. Close.
- Expected: no horizontal page scroll in portrait; landscape still shows a close button.
- Ideal path: 1 tap.
- Phone risks: wide HTML mail inside the dialog (`InboxMessageDialog.tsx:152-159`); iframe/body sandbox width untested. Landscape `h-dvh` with `pt-[max(1rem,env(safe-area-inset-top))]` leaves very little height.

---

## Unattended bots

Code: `apps/web/src/pages/ActivityList.tsx`, `apps/web/src/components/ApprovalActionsTable.tsx`, `apps/web/src/components/ApprovalRulesSettings.tsx`, `apps/web/src/pages/RoutineEditor.tsx`, `apps/web/src/pages/RoutineRunHistory.tsx`, `apps/web/src/pages/shell/bot-credentials.tsx`, `apps/web/src/components/teach/`, `apps/web/src/components/ArtifactShareDialog.tsx`, `apps/web/src/components/UiArtifactView.tsx`, `apps/web/src/components/tour/`. Related: `docs/ux-paths/unattended/`. Most need seeded bot state; mock model rarely calls the tools, so seed rather than drive.

### MOB-UNA-01: Waiting on you in Activity
- Type: short. Entry: sidebar, Activity (or bell). Preconditions: one approval or open item pending (seed).
- Steps: 1. Open Activity. 2. Read "Waiting on you". 3. Tap an item. 4. Return.
- Expected: section is first; item opens the related chat or card.
- Ideal path: 2 taps.
- Phone risks: `ActivityList.tsx:265` section and rows at `:480-531` (`max-w-[40%]` bot label, no breakpoints at all in the 574-line file). Rows have `py-[9px]` (about 36 px, under 44).

### MOB-UNA-02: Approve or decline an expiring approval card
- Type: short. Entry: bot chat with a pending approval. Preconditions: seeded mail approval.
- Steps: 1. Open the chat. 2. Read the card and its expiry line. 3. Tap Approve. 4. Tap Decline on another.
- Expected: state changes to "Approved/Not sent"; an expired card shows its expired state with no buttons.
- Ideal path: 2 taps.
- Phone risks: `MailApprovalCard.tsx` is the largest card; its action row may wrap under 390 px; countdown text. Accidental double tap.

### MOB-UNA-03: Approvals table in settings
- Type: short. Entry: Settings, then Approvals (also per bot panel). Steps: 1. Open settings. 2. Find Approvals. 3. Change one row to Ask via the select. 4. Open "More actions". 5. Change another.
- Expected: native iOS select picker opens; value saved; "More actions" expands.
- Ideal path: 3 taps.
- Phone risks: `ApprovalActionsTable.tsx:79-104` uses `NativeSelect size="sm"` in a right-aligned cell with no breakpoints; native selects on iOS give the system picker so this is likely fine. Label column long wording may wrap and push the select. Per-bot variant has the longer option "Same as all bots" that can overflow its cell.

### MOB-UNA-04: Routines that watch, stay quiet and check in
- Type: medium. Entry: bot panel, Computer and routines. Preconditions: a bot with one routine, one watch routine (seed).
- Steps: 1. Open the bot panel. 2. Tap the routine row. 3. Read trigger text and "only message me if something needs me" toggle. 4. Toggle it. 5. Open run history. 6. Close.
- Expected: row shows last-run line; toggle changes; history lists runs with "Nothing to report".
- Ideal path: 3 taps.
- Phone risks: `RoutineEditor.tsx:533` custom toggle is 40x22 px, below 44; the file (1192 lines) has no `sm:`/`md:` classes; `RoutineSchedule.tsx:234` input `min-w-[120px]`; `RoutineRunHistory.tsx` has none. Panel is a drawer or sheet whose width is UNVERIFIED.

### MOB-UNA-05: Create a watch routine
- Type: medium. Entry: Routine editor, "Choose when it runs". Steps: 1. Pick Watch. 2. Enter a page URL. 3. Pick check frequency. 4. Save. 5. See it in the list.
- Expected: form fits, URL field not covered by keyboard, Save visible.
- Ideal path: 5 taps plus typing.
- Phone risks: `Popover` and `NativeSelect` mix (`RoutineEditor.tsx:32-37,624`); popover width may exceed screen.

### MOB-UNA-06: Credentials: last used and needs attention
- Type: short. Entry: bot panel, Credentials. Preconditions: one credential with a failed login (seed).
- Steps: 1. Open credentials. 2. Read the status lines. 3. Tap Update on the one that needs attention. 4. Cancel.
- Expected: card shows last used and an attention line; update form fits.
- Ideal path: 2 taps.
- Phone risks: `bot-credentials.tsx:263-385` fixed small text (12-13 px) and small action buttons `-ms-2.5` outdent, no touch size; `break-all` is good for long names.

### MOB-UNA-07: Teach a task
- Type: medium. Entry: bot panel or a "Teach" entry. Preconditions: a bot with a Computer (desktop sandbox); demo may not offer one. PARTLY BLOCKED.
- Steps: 1. Start teaching. 2. See the recording chrome. 3. Stop. 4. Review the draft skill card. 5. Approve or discard.
- Expected: on a phone, the feature either degrades with a clear reason or lets Maya review the draft.
- Ideal path: 3 taps.
- Phone risks: `TeachRecordingChrome.tsx`, `TeachCaptureOverlay.tsx` (crosshair over a remote screen) and `TeachComputerOverlay.tsx:213` are made for pointer input on a computer view; recording by touch is unlikely to work. `SkillDraftCard.tsx:330,343` uses `w-160 max-w-full`, fine. Expected result may be "desktop only" (UNVERIFIED).

### MOB-UNA-08: Bot-built tool and artifact share link
- Type: medium. Entry: `/app/artifacts`. Preconditions: one artifact (seed). Steps: 1. Open the artifact. 2. Tap Share. 3. Create the link. 4. Copy. 5. Stop sharing.
- Expected: dialog readable, link copy works with one tap, "shown once" text clear.
- Ideal path: 3 taps.
- Phone risks: `ArtifactShareDialog.tsx` (72 lines) has no breakpoints; `CopyLinkDialog.tsx` has the actual field; a long URL needs `break-all` or a copy-only control. `UiArtifactView.tsx` has `overflow-x-auto` tables (`:117`) and responsive columns (`:217`).

### MOB-UNA-09: Tour stops for routines and approvals
- Type: short. Entry: Settings, Take the tour. Steps: 1. Start the tour. 2. Advance to the routines stop. 3. Advance to the approvals stop. 4. Finish.
- Expected: popovers stay on screen and point to the right control; Skip is reachable.
- Ideal path: 1 tap per stop.
- Phone risks: `tour/TourPopover.tsx` has 2 breakpoints but the targets (routine and approvals controls) may be inside a closed drawer or panel on a phone, so the pointer lands on nothing.

---

## Company (`/app/company`)

Code: `apps/web/src/pages/Company.tsx` and `Company*.tsx`. Related: none in `docs/ux-paths/`.

### MOB-COM-01: Company tabs
- Type: short. Entry: sidebar, Company. Steps: 1. Open Company. 2. Tap through Overview, People, Organisations, History, Calendar, Review.
- Expected: every tab reachable without sideways swipe fighting the page.
- Ideal path: 1 tap per tab.
- Phone risks: six triggers in a `w-fit inline-flex` `TabsList` (`Company.tsx:261-281`) is about 560 px wide on a 390 px screen, so it overflows with no scroll container or wrap; some tabs may be unreachable. Strong candidate for a select or scrollable tab strip.

### MOB-COM-02: People table with search, filter and sort
- Type: short. Entry: `/app/company?view=people`. Steps: 1. Search. 2. Filter. 3. Tap a header. 4. Tap a row.
- Expected: four columns (Name, Role, Since, Evidence) readable.
- Ideal path: 2 taps.
- Phone risks: plain `Table` with four columns and no hidden-column rules (`Company.tsx:163-207`); wraps names and dates. Search/filter at `Company.tsx:129-137`.

### MOB-COM-03: Consent-gated import and review
- Type: medium. Entry: `/app/company?view=review` and the import flow. Preconditions: seeded import scope and review items. Steps: 1. Open import. 2. Read the consent scope. 3. Accept or decline. 4. Open Review. 5. Accept one item and reject one.
- Expected: consent text readable; Accept/Reject big enough; counts update in the Review tab label.
- Ideal path: 4 taps.
- Phone risks: `CompanyImport.tsx` (750 lines), `CompanyReview.tsx`, `CompanyHistory.tsx`, `CompanyPrivacy.tsx`, `CompanyRefresh.tsx` have no breakpoints; `CompanyImport.tsx:298` `min-w-40` rows. Scope picker `CompanyImportScope.tsx` has one breakpoint.

### MOB-COM-04: Company history and calendar tabs
- Type: medium. Entry: Company, History then Calendar. Steps: 1. Open History. 2. Open a fact. 3. Back. 4. Open the Calendar tab. 5. Change month.
- Expected: no sideways scroll; fact detail fits.
- Ideal path: 3 taps.
- Phone risks: `CompanyHistory.tsx`, `CompanyFactDetail.tsx` (1 bp), `CompanyCalendar.tsx` (4 bp). Company Calendar is separate from `/app/calendar`; two calendars share a name, which may confuse Maya (flow issue).

---

## Devin (`/app/devin`)

### MOB-DEV-01: Sessions list with search, filters and sort
- Type: short. Entry: sidebar, Devin. Preconditions: demo Devin sessions. Steps: 1. Open Devin. 2. Search. 3. Pick two filters. 4. Sort. 5. Open a session.
- Expected: compact list at phone width, the title is the row link, stats readable.
- Ideal path: 2 taps.
- Phone risks: `devin/DevinSessions.tsx` collapses to a compact row at `@2xl` (comment at line 15) so phone gets the compact form; filter row has search, two `PickFilter`s and sort (`:171-193`), likely three wrapped lines. Stat grid `grid-cols-2` (`Devin.tsx:154`).

---

## Tables and filters (cross-page)

Code: `apps/web/src/components/ListControls.tsx`, `apps/web/src/lib/list-params.ts`.

### MOB-TBL-01: Filters survive Back
- Type: short. Entry: any table page. Steps: 1. Apply a filter and a sort on Legal. 2. Open a row. 3. Back.
- Expected: filter and sort still applied (URL params).
- Ideal path: 2 taps.
- Phone risks: iOS edge-swipe back. Dialog routes may not push history (UNVERIFIED).

### MOB-TBL-02: Sort control on a phone
- Type: short. Entry: any page with `SortControl` (Contacts, Devin, Investors). Steps: 1. Tap "Sort: field". 2. Pick another field. 3. Tap the direction arrow.
- Expected: menu fits, direction arrow is a real target.
- Ideal path: 3 taps.
- Phone risks: direction button is `icon-sm` (`ListControls.tsx:160,215`), 44 px only under touch emulation; menu `min-w-40`.

### MOB-TBL-03: Tables without a phone layout
- Type: medium. Entry: Activity, Artifacts, Finance transactions, Company, Legal, Devin. Steps: 1. Open each page. 2. Look for horizontal page scroll. 3. Check that every column a user needs is visible or reachable.
- Expected: no horizontal page scroll; hidden columns have a replacement.
- Ideal path: 1 tap per page.
- Phone risks: see Mobile code audit. Hidden columns remove sort handles for those columns.

---

## Legal (`/app/legal`)

Code: `apps/web/src/pages/Legal.tsx`, `apps/web/src/pages/legal/LegalContracts.tsx`, `apps/web/src/pages/legal/DueSoonChip.tsx`. Related: `docs/ux-paths/legal/catalog.md`.

### MOB-LEG-01: Group similar contracts
- Type: short. Entry: `/app/legal`. Preconditions: demo contracts with near-duplicate names. Steps: 1. Tap Group similar. 2. Expand a group. 3. Tap Group similar again to turn it off (`group=off`).
- Expected: groups show a count and expand in place.
- Ideal path: 2 taps.
- Phone risks: button sits at the end of the toolbar (`Legal.tsx:552`, `LegalContracts.tsx:172`) and may wrap; avatar stacks `ContactAvatarGroup` (`LegalContracts.tsx:313,428`) inside narrow columns may crowd the title.

### MOB-LEG-02: Due soon chip
- Type: short. Entry: `/app/legal`. Steps: 1. Tap the "# due soon" chip. 2. Read the filtered list. 3. Tap again to clear.
- Expected: filters to due-soon deadlines, clear one tap.
- Ideal path: 1 tap.
- Phone risks: `DueSoonChip.tsx` chip height; chip in toolbar row with others at `LegalDeadlines.tsx:194`.

---

## Chat

Code: `apps/web/src/pages/shell/transcript.tsx`, `apps/web/src/pages/shell/message-cards.tsx`, `apps/web/src/components/UiBlockView.tsx`, `apps/web/src/pages/shell/DelegateWaitNotice.tsx`.

### MOB-CHT-01: Typed UI blocks in a bot reply
- Type: short. Entry: a chat where the bot used `render_ui` (seed or script). Preconditions: mock model may not call it; use a seeded message (PARTLY BLOCKED). Steps: 1. Open the chat. 2. Scroll to the block. 3. Scroll a wide table sideways.
- Expected: table scrolls inside its own container; cards fit.
- Ideal path: 1 swipe.
- Phone risks: `UiBlockView.tsx:55` wraps tables in `overflow-x-auto px-4`; nested horizontal scroll in a vertical chat.

### MOB-CHT-02: Chief delegate status
- Type: short. Entry: chat with Chief after a task that delegates. Steps: 1. Send a task. 2. Read the delegate status and per-agent progress. 3. Wait for completion.
- Expected: status line fits on one or two lines; progress per agent readable.
- Ideal path: 1 send.
- Phone risks: `DelegateWaitNotice.tsx` 40 lines, no breakpoints; centered `px-6` text with many agent names may wrap long.

### MOB-CHT-03: Email chat notes routed to the owning agent
- Type: medium. Entry: Inbox, Ask on a mail. Steps: 1. Open a mail. 2. Tap Ask or write a chat note. 3. Open the owning agent's chat. 4. Find the note. 5. Return to the mail.
- Expected: the note shows in the right agent's chat, labelled with the mail.
- Ideal path: 4 taps.
- Phone risks: phone has one pane at a time, so seeing the mail and the chat together is impossible; context lost on switching (see MOB-MAIL-08).

---

## Data room (`/app/data-room`)

Code: `apps/web/src/pages/DataRoom.tsx`, `apps/web/src/components/data-room/`. Related: `docs/ux-paths/dataroom/catalog.md`.

### MOB-DRM-01: Failed chip in the filter row
- Type: short. Entry: `/app/data-room`. Preconditions: at least one failed file in the demo. Steps: 1. Open Data room. 2. Tap "# failed". 3. Read the filtered list.
- Expected: chip visible without scrolling; tap shows failed files.
- Ideal path: 2 taps.
- Phone risks: `FailedChip.tsx` is `h-7`; filter row hides pills under `@max-[639px]/bd` (`FilterBar.tsx:393`), chip sits among them, so verify it stays reachable.

### MOB-DRM-02: Tile and row menu without hover
- Type: short. Entry: `/app/data-room`. Steps: 1. Look at a file row/tile. 2. Tap its menu button. 3. Choose Rename or Move.
- Expected: the menu button is always visible on touch (it must not need hover).
- Ideal path: 2 taps.
- Phone risks: `ItemRows.tsx:193,483` use `opacity-0 group-hover` with a `pointer-coarse:opacity-100` / `[@media(hover:none)]` override; `FolderTree.tsx:106` has `pointer-coarse:opacity-100`; `DriveRow.tsx:50` has the media query. This was fixed in #873 but confirm on a device profile whose pointer is not reported as coarse (iPad Safari desktop mode).

### MOB-DRM-03: Folder tree width
- Type: short. Entry: `/app/data-room`. Steps: 1. Open Data room. 2. Look at the folder column and the files column. 3. Try to drag the divider with a finger.
- Expected: files remain usable, folders can be hidden.
- Ideal path: 0 taps.
- Phone risks: `ResizableFolders.tsx:6,74` min width 180 px, default 35 percent, applied at all widths (`DataRoom.tsx:849`), so the folder tree takes at least 180 of 390 px, leaving about 190 for files. Divider handle is 7 px wide (`:85`). No `useIsMobile` fallback (drawer or breadcrumb).

### MOB-DRM-04: Open a document preview
- Type: medium. Entry: `/app/data-room`. Steps: 1. Tap a PDF. 2. Zoom. 3. Use Preview actions. 4. Close. 5. Tap Send to agent.
- Expected: preview full-width with actions reachable.
- Ideal path: 2 taps.
- Phone risks: `Preview.tsx` (460 lines) has no breakpoints; `PreviewActions.tsx` has 6. `PdfViewer.tsx` scale on a small screen.

---

## Finance (`/app/finance`)

Code: `apps/web/src/components/finance/ui.tsx`, `apps/web/src/pages/finance/`. Related: `docs/ux-paths/finance/catalog.md`.

### MOB-FIN-01: KPI cards and Burn breakdown tabs
- Type: short. Entry: `/app/finance`. Preconditions: mock finance. Steps: 1. Read KPI cards. 2. Tap the Burn card. 3. Switch breakdown tabs.
- Expected: equal-height cards with outlines; tabs fit.
- Ideal path: 2 taps.
- Phone risks: `finance/ui.tsx` has 15 breakpoints so it is likely adapted; breakdown tab list not audited. `charts.tsx` has 1 breakpoint across 928 lines; SVG chart labels may collide.

### MOB-FIN-02: Transactions search, filters and sorts
- Type: short. Entry: Finance, Transactions. Steps: 1. Search. 2. Filter. 3. Sort. 4. Open a transaction.
- Expected: results narrow; table shows date, merchant, amount.
- Ideal path: 3 taps.
- Phone risks: transaction table columns; Phone Finance was checked in earlier passes but not the new filter row.

---

## Shell

Code: `apps/web/src/pages/shell/space-sidebar.tsx`, `apps/web/src/components/PageAgentsRow.tsx`, `apps/web/src/components/SidebarPagesGroup.tsx`, `apps/web/src/components/integrations/`.

### MOB-SHL-01: Drawer: Page agents above chats and +N more
- Type: short. Entry: menu button. Steps: 1. Open the drawer. 2. Find Page agents. 3. Tap the +N more bar. 4. Open a chat.
- Expected: more rows reveal; the pinned fold header stays visible at scroll.
- Ideal path: 2 taps.
- Phone risks: `PageAgentsRow.tsx:35-44` "data-roster-fold" scroll-into-view; sticky header and "+N more" bar overlap with iOS bottom safe area (UNVERIFIED).

### MOB-SHL-02: Drawer page list and hide menu
- Type: short. Entry: drawer. Steps: 1. Scroll the pages. 2. Tap the "..." menu on the Pages header. 3. Hide one page.
- Expected: menu reachable; row hidden.
- Ideal path: 3 taps.
- Phone risks: `SidebarPagesGroup.tsx` and `SidebarPages.tsx:` hover-only row affordances (`SidebarPages.tsx` hov=1).

### MOB-SHL-03: Brand-coloured Integrations logos
- Type: short. Entry: Integrations. Steps: 1. Open Integrations. 2. Read the logo grid. 3. Tap one.
- Expected: logos crisp, tap targets large.
- Ideal path: 2 taps.
- Phone risks: `apps/web/src/components/integrations/` not audited for width.

### MOB-SHL-04: Command palette and navigation by search
- Type: medium. Entry: any page. Steps: 1. Open search. 2. Type "calendar". 3. Pick Calendar. 4. Repeat for Contacts.
- Expected: new pages (Calendar, Contacts) appear in results.
- Ideal path: 3 taps.
- Phone risks: `command-palette.tsx` has 4 breakpoints; entry point on phone UNVERIFIED (no keyboard shortcut).

---

## Auth (`/sign-in`)

### MOB-AUT-01: Sign in with a passkey
- Type: short. Entry: `/sign-in`. Preconditions: server reports passkeys; a registered passkey exists. PARTLY BLOCKED on the demo and in desktop emulation.
- Steps: 1. Open sign-in. 2. Tap "Sign in with passkey". 3. Approve with Face ID (or cancel). 4. Land in the app.
- Expected: button is under the main submit, full width; cancel leaves the form usable.
- Ideal path: 2 taps.
- Phone risks: `Auth.tsx:414` is `size="lg"` full-width; autofill from the email field (`:165-174`) pops the iOS passkey suggestion above the keyboard. Registering a passkey is in Settings (`components/PasskeySettings.tsx`, no breakpoints).

---

## Long cross-feature journeys

### MOB-JRN-01: Maya's morning on her phone
- Type: long. Entry: `/app` (home screen shortcut). Preconditions: one bot to-do waiting on her, one mail with a Context panel entry (a known contact), one pending approval from a background routine (seeded).
- Steps:
  1. Open Praci, tap the menu, tap Calendar.
  2. Read the "waiting on you" to-dos above the grid. Tick one.
  3. Tap another to-do's text: it opens its mail.
  4. In the mail, tap Context. Read related contact and documents.
  5. Close Context. Tap Track.
  6. Tap close. Tap the menu, tap Activity.
  7. Under "Waiting on you", tap the background approval.
  8. Read the card and tap Approve.
  9. Go back to Activity and confirm the item is gone.
  10. Open the drawer, tap a page agent under "Page agents" and ask "Anything else today?".
- Expected: each hop works with one hand, Back lands where Maya expects, and Track and Approve states are visible afterwards.
- Ideal path: about 12 taps.
- Phone risks: CAL-05 (to-do block), MAIL-02/03 (Context cover, Track label), UNA-01/02 (Activity rows, card actions), SHL-01. Back from a mail dialog may not return to Calendar.

### MOB-JRN-02: Investor check before a call
- Type: long. Entry: sidebar, Investors. Preconditions: Dana Whitfield as an investor contact with related mail and a Granola meeting.
- Steps:
  1. Open Investors, tap the Contacts tab.
  2. Search "dana".
  3. Tap Dana Whitfield. Read her page.
  4. Tap her latest related mail. Read it.
  5. Tap Context. Tap Track.
  6. Close mail and Back to the contact page.
  7. Tap a meeting, read the Granola notes. Back.
  8. Back to Investors. Tap Cap table. Find Harbor Ventures in Holdings, read Invested and Diluted.
  9. Tap Updates and read the action items.
- Expected: search term and Contacts tab are still set after Back; Invested value is visible for the holder.
- Ideal path: about 11 taps.
- Phone risks: INV-02/04/05, CON-04, MAIL-02; hidden Shares and Invested columns; returning to Investors restores the tab from the URL (`Investors.tsx:602`).

### MOB-JRN-03: Reply to an urgent mail with context, then let a bot watch
- Type: long. Entry: `/app/inbox`. Preconditions: an urgent mail from a known contact, a bot with routines.
- Steps:
  1. Open Inbox, read the urgent table, tap the top row.
  2. Tap Ask on the mail, ask for a draft. See the bot's card.
  3. Tap Send now on the draft (or Open in composer).
  4. In the composer, tap Context, read, close it, edit one line.
  5. Tap Send. Tap Undo on the toast, then Send again.
  6. Open the bot panel for the bot. Tap its routines. Create a Watch routine for a vendor pricing page.
  7. Turn on "only message me if something needs me". Save.
  8. Open Calendar, Schedule view, and find the next check-in.
- Expected: mail sends once; the watch routine appears with a trigger line; the Calendar shows the check-in.
- Ideal path: about 16 taps.
- Phone risks: MAIL-05/07/08/09, UNA-04/05, CAL-02. Composer Context overlay hides the editor; routine editor has no breakpoints; Calendar check-in needs real routine data.

### MOB-JRN-04: Tidy the company record and data room
- Type: long. Entry: sidebar, Company. Preconditions: seeded import and review items, failed data room files.
- Steps:
  1. Open Company, tap the Review tab (may need sideways scroll in tabs).
  2. Accept one item, reject one.
  3. Tap the People tab, search a name, tap a person.
  4. Open Data room. Tap "# failed".
  5. Open a file's menu, choose Retry or Remove.
  6. Open Contacts, tap the contact for that document's owner.
  7. Read related documents on the contact page.
- Expected: no step needs hover; Company tabs are all reachable; Failed chip and file menu usable.
- Ideal path: about 14 taps.
- Phone risks: COM-01 tab overflow, COM-03, DRM-01/02/03, CON-04.

---

## Mobile code audit

New or changed components with no phone-specific handling. "bp" = no `sm:`/`md:`/`lg:`, container-query (`@md`), `max-sm`, `pointer-coarse`, or `useIsMobile` in the file unless noted. Line numbers are on `origin/main` 4ee112806. Paths are under `apps/web/src/` unless noted. Container-query classes (`@md`, `@lg`) were counted as handling; the first grep missed them, so files marked "partial" have some but not for the cited element. Behaviour at 390 px is UNVERIFIED for all.

Highest risk (layout can break or content is unreachable):
1. `pages/Company.tsx:261-281` six-tab `TabsList`, `w-fit inline-flex` (`packages/ui-web/src/components/ui/tabs.tsx:18`), about 560 px wide, no scroll or wrap.
2. `pages/Company.tsx:163-207` four-column `Table`, no column hiding.
3. `components/data-room/ResizableFolders.tsx:6,74` and `pages/DataRoom.tsx:849` folder column min 180 px at every width, no mobile layout; drag handle 7 px (`ResizableFolders.tsx:85`).
4. `pages/Calendar.tsx:527` Week view `min-w-[40rem]`; `:450` Month cells `h-20`; `:629-665` header row with four view buttons and truncating title.
5. `components/ComposeEmail.tsx:950` Context panel is a full-screen overlay below `md`, so reading and writing cannot happen together; `components/inbox/InboxMessageDialog.tsx:698` panel `w-full max-w-[384px]` covers the mail.
6. `pages/Investors.tsx:1489-1560` Contacts tab: kind tabs, search, stage and sort wrap to three lines (kind trigger `h-7`, `:1500`). `components/cap-table/HoldingsTable.tsx:150-160` Shares and Invested hidden below `@lg`, so sort by Invested is impossible on a phone.
7. `pages/Contacts.tsx:201,205` email and org sort headers hidden at phone width.

No breakpoints at all:
8. `pages/ActivityList.tsx:265,480-531` Waiting on you section and rows, `max-w-[40%]` bot label, `py-[9px]` rows under 44 px (whole 574-line file).
9. `components/BotTodos.tsx:62-67` tick box has no `pointer-coarse` size (the sibling `components/inbox/TodoCard.tsx:118` does).
10. `components/ApprovalActionsTable.tsx:79-104` Allow/Ask/Block select in a right-aligned cell, longer "Same as all bots" option.
11. `pages/RoutineEditor.tsx:533` custom 40x22 toggle; `:624` NativeSelect and `Popover` at `:32-37`; the 1192-line file has no breakpoints. `pages/RoutineSchedule.tsx:234` `min-w-[120px]` input. `pages/RoutineRunHistory.tsx` (298 lines) none.
12. `pages/shell/bot-credentials.tsx:263-385` 12-13 px text and small action buttons, no touch sizing (573 lines, none).
13. `components/ArtifactShareDialog.tsx:20-72` and `components/PasskeySettings.tsx:48-97` dialog and row layout without breakpoints.
14. `components/teach/TeachRecordingChrome.tsx`, `TeachCaptureOverlay.tsx:170` (crosshair capture), `TeachComputerOverlay.tsx:213` are pointer-driven recording UI; no phone behaviour (probably desktop-only by design).
15. `pages/CompanyImport.tsx:298` (`min-w-40`), `CompanyReview.tsx`, `CompanyHistory.tsx`, `CompanyPrivacy.tsx`, `CompanyRefresh.tsx` zero breakpoints.
16. `components/inbox/ContextPanel.tsx:31` rows `py-1`, `-mx-2`, hover-based styling only (259 lines, none).
17. `components/compose/RichTextEditor.tsx` (361 lines) and `components/compose/RecipientField.tsx` no breakpoints; toolbar may overflow.
18. `pages/shell/DelegateWaitNotice.tsx:27` centered `px-6` single-line notice that can wrap badly.
19. `components/MailApprovalCard.tsx:656-line` file, 4 breakpoints but action row for Send now / Approve not verified; `components/MailOutbox.tsx` (57) none.
20. `pages/legal/LegalContracts.tsx:313,428` avatar stacks in narrow columns; `components/legal/LegalGraph.tsx` (317 lines) none.
21. `components/ListControls.tsx:78,123,160,196,215` `size="sm"` / `icon-xs` controls; fine only under touch emulation (button sizes in `packages/ui-web/src/components/ui/button.tsx:30-37`).
22. `components/data-room/FilterBar.tsx:167,177` fixed `w-40` inputs; `FailedChip.tsx:12` `h-7` chip.
23. `components/data-room/DataRoomStats.tsx:162` hover-only bar highlight (no information loss).
24. `components/tour/TourPopover.tsx` targets may be inside closed drawers on a phone.

Hover-only affordances (all have a touch fallback in code, verify with an actual coarse pointer and on iPad desktop-mode Safari where `pointer: coarse` can be false):
- `components/data-room/ItemRows.tsx:193,377,483`, `components/data-room/FolderTree.tsx:106`, `components/data-room/DriveRow.tsx:50`.
- `components/inbox/InboxRow.tsx:342,421,448,514` (hover actions swapped for an overflow menu under `pointer-coarse`).
- `pages/shell/bot-page-panel.tsx:45` delete-chart button `opacity-0 group-hover` in a bot page editor with no touch fallback (page chart editing).

Already handled (lower priority for walkers): `components/inbox/InboxMessageDialog.tsx:152-159`, `components/ComposeEmail.tsx:616`, `components/inbox/AttachmentReviewDialog.tsx:85` (full-screen dialogs), `components/cap-table/HoldingsTable.tsx` (container queries), `components/finance/ui.tsx` (15 breakpoints), `components/inbox/TodoCard.tsx:118`, `components/ListControls.tsx:135` (menu width clamp).
