# Live pages: Approving outside sources

Topic: the approval card for mcp and http page sources, and how the owner finds it. Read from code only; nothing was run. Where the code and docs/agent-pages/live-pages.md differ, the code is described.

Facts all stories rely on (with where they come from):
- Card text is `Read {server name or API host} {every 15 minutes | every hour | every 6 hours | every day | every week}?`. Detail lines, in order: `Request: GET {url}` (http) or `Request: {tool} {json args}` (mcp, args omitted when empty); `Key: {secret name}` (http with a secret only); `Page: {page title}` (cut to 100 characters). Buttons "Allow" and "Not now". (packages/adapters/src/page-source-approval.ts, `pageSourceApprovalBlock`)
- After answering: "Allowed" (with a check icon), "Not now" (with a red X icon, destructive colour). A card the server closed itself shows "Replaced by a newer request" (answer `superseded`) or "Expired" (answer `expired`) in muted text. (AskCard.tsx `formatAnsweredState`, `answeredTone`)
- While the answer is in flight the clicked button reads "Sending…". After a click both buttons stay disabled for about 1 second (`SETTLE_MS`) when another card was answered in the last 30 seconds, so a new card cannot be hit by accident.
- Posting the card marks the bot's thread unread and creates a notification: kind `needs_input`, title `{bot name} needs approval`, body = the card question, link `/app/{botId}`. The sticky approval toast uses that title. It is skipped when the owner switched the "help" notification category off. (page-source-approval.ts `postPageSourceApproval`, run-notification.ts, notification-delivery.ts)
- The bot run is not paused. The card exists even after the run ends.
- The answer goes through `threads.answer`. The server re-checks that the source still has the exact call the card shows. Allow sets the source active and refreshes it once at once. Not now sets it denied. (apps/api/src/router.ts:3584-3603)
- A stale or already answered card makes `threads.answer` throw CONFLICT "This prompt is no longer awaiting an answer".
- Full-width page placeholder: "Waiting for approval" is an underlined button only on `/app/pages/:botId/:pageId`; it navigates to `/app/{botId}`. In the chat side panel it is plain text. (PageLiveBlocks.tsx:103, BotPageView.tsx:19)
- Seed: "Outside rate (pending)" is an http source on page "Cash". The seed has no approval card unless a story says it is seeded.

---

## STORY-APPROVE-01: Allow a pending API source from the chat card
**Type**: medium
**Topic**: Approving outside sources
**Persona**: Priya, a seed-stage founder who asked the Finance agent last week to show an exchange rate on her Cash page
**Goal**: Let the page read the API and see the number appear on the page.
**Preconditions**: needs seeded approval card (card for the "Outside rate (pending)" http source, thread of the Finance agent). Card text expected: "Read {host} every hour?" with the detail lines `Request: GET {url}` and `Page: Cash`.
**Ideal path**: 5 — open the bot chat, read the card, click Allow, open the page, see the value.
**Alternate paths**: Click the notification toast "Finance agent needs approval" (it links to `/app/{botId}`) instead of opening the bot from the sidebar. No other place can answer the card: the Sources dialog has Pause/Resume/Remove/Change schedule but no Allow.
### Steps
1. Open `/app/{botId}` for the Finance agent → the chat opens. The card sits in the thread as a bot message with the question "Read {host} every hour?".
2. Read the detail text under the question → three lines: `Request: GET https://…`, optionally `Key: {secret name}`, `Page: Cash`.
3. Click "Allow" → the button reads "Sending…", then the card is replaced by a check icon and "Allowed". Both buttons are gone.
4. Click the "Page" button in the chat header → the side panel opens on the Cash tab.
5. Find the block that uses "Outside rate" → the "Waiting for approval" text is gone. A value shows, or "No data yet" for a moment, then the value after the one-time refresh. Hover or focus shows the fetch time.

### Variations
- Same flow from `/app/pages/{botId}/{pageId}` after clicking the "Waiting for approval" link (see STORY-APPROVE-05).
- Open the page options menu, "Sources": the row for "Outside rate" now shows badge "ok" (or "failed" with the error line if the API call fails; Allow itself still succeeds and the failure is recorded on the source).
- Keyboard: Tab to "Allow" and press Enter; Tab order is Allow, then Not now.
- Phone width 390px: the buttons are full width, left aligned, and wrap long text (`whitespace-normal`). The `Request:` line is shown in full on purpose (up to 500 characters), so a long URL wraps over several lines; check that it does not push the buttons off screen.

### Edge Cases
- The API call fails after Allow (timeout, 401): the card still says "Allowed". The only sign of failure is on the page (warning dot "Source failed" with Retry) and in the Sources dialog. The owner has no hint in the thread.
- Double-click on "Allow": the second click is blocked by the disabled "Sending…" button; a second request would be rejected with CONFLICT.

---

## STORY-APPROVE-02: Decline with "Not now" and see what the page shows
**Type**: short
**Topic**: Approving outside sources
**Persona**: Marcus, a cautious COO who does not recognise the URL on the card
**Goal**: Refuse the request and confirm that nothing is read.
**Preconditions**: needs seeded approval card (pending http source on page "Cash").
**Ideal path**: 3 — read, click "Not now", check the page.
**Alternate paths**: Ignore the card (it stays pending forever; the placeholder keeps saying "Waiting for approval"). Remove the source in the Sources dialog ("Remove", confirm "Remove {name}?") instead of declining.
### Steps
1. Open `/app/{botId}` and read the card → "Read {host} every hour?" with a `Request: GET …` line.
2. Click "Not now" → "Sending…", then a red X and "Not now" replace the buttons.
3. Click the "Page" button, then look at the block that uses the source → the placeholder reads "Not approved". It is no longer a link.
4. Page options menu "…" → "Sources" → the row badge reads "denied".

### Variations
- Full-width page: the same "Not approved" text, plain (not a button).
- Phone width: the card and the sources dialog stack in one column; badge "denied" must stay readable.

### Edge Cases
- After "Not now" there is no button on the card or the dialog to change the decision. Only the bot can ask again, by changing the call (url, secret, accept; or server, tool, args) with `page_source_set`. Calling it with the same call keeps the source denied. The tool tells the bot: "The owner declined this request. Change the request to ask again." The owner sees none of this guidance. A walker should note that "Not now" reads as postponing, but acts as a permanent refusal (code: a denied source stays denied until the call changes).
- Tooltip/label mismatch: "Not now" on the card vs "Not approved" on the page vs "denied" in the dialog. Three words for one state.

---

## STORY-APPROVE-03: Find the approval card when the owner is somewhere else in the app
**Type**: medium
**Topic**: Approving outside sources
**Persona**: Dana, a founder who was in the Inbox when the Finance agent asked
**Goal**: Notice that an approval is waiting and get to the card.
**Preconditions**: needs seeded approval card. The thread must be unread and a notification must exist; if the seed only inserts a message, the toast and the unread dot may not appear (note this to the walker).
**Ideal path**: 2 — click the toast.
**Alternate paths**: Open the bot from the sidebar (the unread marker on the bot row is the cue). Open the Finance agent's thread through the bot list. Open the Page: a pending block reads "Waiting for approval" and on the full-width route it is a link to the chat. There is no approvals page that collects page-source cards (the "approval" toast and notification are the only central signals; `ApprovalRulesSettings.tsx` is about standing rules, not this card).
### Steps
1. Stay on another route (for example the Inbox) when the card arrives → a sticky toast titled "Finance agent needs approval" with the body "Read {host} every hour?" appears (needs_input toasts do not time out).
2. Click the toast → the app opens `/app/{botId}`.
3. Look at the thread → the card is shown. The thread opens at the unread messages; check whether the card is visible without scrolling.
4. Click "Allow" or "Not now" → the card closes as in STORY-APPROVE-01 or -02.

### Variations
- Toast dismissed: open the bot from the sidebar instead; the bot row should show unread. Check that the unread state clears after opening.
- Browser notifications while the tab is in the background: OS notification with the same title, body clipped to 120 characters.
- If "help" notifications are off in notification settings: no toast and no notification; only the unread state on the bot and the placeholder on the page remain.
- Phone width: toast stacks at the top; tapping it should navigate the same way.

### Edge Cases
- The page agent can post several cards in a row (one per source). Several toasts or notifications with the same title "Finance agent needs approval" appear; the body (question) is the only difference. Notification keys are per message, so none are merged.
- The transcript scroll anchor (`answerableAskMessageId`, transcript.tsx:631) covers cards for a waiting run. Page source cards do not wait for a run, so on a long thread the card may sit above the fold. Verify this in the walk.

---

## STORY-APPROVE-04: Bot changes the call, the first card goes stale, a second card appears
**Type**: long
**Topic**: Approving outside sources
**Persona**: Priya again, who allowed the rate source last week; today the bot found a better endpoint
**Goal**: Understand that a changed call needs a new decision and approve only the new one.
**Preconditions**: Precondition: bot action (not walkable without a model) for the call change, plus needs seeded approval cards (card A, still pending, and card B for the same source with a different URL). If the seed can write both cards directly, the stale-card part is walkable.
**Ideal path**: 6 — ignore card A, answer card B, check the page.
**Alternate paths**: Answer card A first (see step 3); there is no way to dismiss it without answering.
### Steps
1. Open `/app/{botId}` → two cards are visible for the same source name: card A (old call, `Request: GET {old url}`) and card B (new call). Both show "Allow" and "Not now". Card A looks exactly as live as card B.
2. Compare the `Request:` lines of A and B → they differ; the `Page:` line is the same.
3. Click "Allow" on card A (the mistake) → the server finds the call hash no longer matches, closes the card as superseded, and returns CONFLICT. The card turns into "Replaced by a newer request" in muted text. The source stays pending. A toast or inline error may also show the conflict message "This prompt is no longer awaiting an answer"; record what appears.
4. Click "Allow" on card B → "Sending…", then "Allowed".
5. Open the page → the old values are gone (the bot's change deleted the old snapshots); the block shows "Waiting for approval" before step 4, and the new value after.
6. Page options "…" → "Sources" → the row shows the new URL in the subline context and badge "ok".

### Variations
- Same call, only the name or schedule changes: no new card appears and the source keeps its status. Card text on the old card still shows the old schedule ("every hour") if the schedule changed while pending, because the card is not rewritten. Approving it then runs the source on the new schedule, not the one shown.
- A denied source, then a changed call: a new card appears, "Not now" can be chosen again.
- Reverse: the call changes back to the exact earlier call while card A is still pending. The hashes match again, so card A can be answered; card B (the in-between request) is replaced.
- Keyboard-only: Tab through four buttons; check that the focus order matches the reading order.

### Edge Cases
- Source removed (via "Remove" in the Sources dialog) while a card is pending: clicking Allow closes the card as "Expired" and the request returns CONFLICT.
- Two browser tabs: answer in tab 1, then click the still-pending card in tab 2: CONFLICT, and the card in tab 2 should update through the `thread.message.updated` event to "Allowed"; verify it updates without a reload.
- The card cannot show the previous request, so the owner cannot tell what changed from the card alone.

---

## STORY-APPROVE-05: Page shows "Waiting for approval", user follows the link to the chat
**Type**: short
**Topic**: Approving outside sources
**Persona**: Tom, a board member who opened the Cash page from the sidebar and sees a gap
**Goal**: Find out why the "Outside rate" block is empty and reach the decision.
**Preconditions**: the seed's "Outside rate (pending)" source. Needs seeded approval card to complete step 3 (the link works without a card but lands on a chat without one).
**Ideal path**: 3 — open the page, click "Waiting for approval", answer in the chat.
**Alternate paths**: In the side panel (chat header "Page" button) the same text is not a link, so the owner is already in the chat. They scroll up to find the card.
### Steps
1. Click "Cash" in the sidebar → the full-width page opens at `/app/pages/{botId}/{pageId}`. The pending block shows the muted underlined text "Waiting for approval".
2. Click "Waiting for approval" → the app navigates to `/app/{botId}`. It does not scroll to the card and does not tell the user which block the link was on.
3. Look for the card in the thread and click "Allow" → "Allowed". Press the browser Back button → the full-width page opens again, and the block now shows data.

### Variations
- Keyboard: the link is a real `button`; Tab to it, Enter activates it, a focus outline appears.
- Phone width: the full-width page is the normal route on a phone; after the click the chat opens on the unread position.
- A paused or denied source: the placeholder reads "Paused" or "Not approved" and is not a link.
- Public share `/s#token`: a pending block in the frozen snapshot has no live data. Check what it shows; it is not interactive.

### Edge Cases
- If the card was already answered "Not now", the placeholder no longer says "Waiting for approval", so there is no link to follow. If the card is missing (for example, the thread was cleared), the link goes to a chat with nothing to answer.
- With several pending blocks the link is identical on each one, with no source name.
- The link text is a state label, not an action. A first-time user may not guess that it is clickable on this route only (see Surprises).

---

## STORY-APPROVE-06: Open an approval card in a thread that no longer allows answers
**Type**: short
**Topic**: Approving outside sources
**Persona**: Leo, a returning user checking an old Finance thread
**Goal**: Check what an old, answered, or stale card shows and whether anything is still actionable.
**Preconditions**: needs seeded approval card in each state: pending, answered "allow", answered "deny", answered "superseded", answered "expired". Without seeding, the walker can only check the states created in stories 01, 02 and 04.
**Ideal path**: 2 — scroll the thread and read the states.
**Alternate paths**: none found.
### Steps
1. Open the thread and scroll to the old cards → answered cards show a single line: "Allowed" with a check; "Not now" with a red X; "Replaced by a newer request" or "Expired" in muted grey. No buttons.
2. Select the text of an answered card → the original question and detail lines stay visible above the result. Check this is true; the detail text comes from the stored block.

### Variations
- Pending cards in a thread whose run is cancelled or finished still show "Allow" and "Not now" (the transcript marks page source cards answerable always; transcript.tsx:2015).
- Phone width: the check or X icon plus the label wrap onto one line.

### Edge Cases
- The label "No longer active" exists in AskCard.tsx:313, but it can only appear for a page-source card if `canAnswer` is false. The transcript passes `canAnswer || Boolean(block.pageSource)`, so the label can not show for these cards on the web. A walker should not expect it. The story brief mentions it; in this code path it is unreachable, so treat a pending page-source card showing "No longer active" as a defect.
- "Allowed" does not show when the allowed source is later paused, removed or failing. The card is a record of the answer only.
- Another user in a shared space: the thread query matches the owner (`thread: { spaceId, userId }`), so a non-owner cannot answer; whether the card is hidden or inert for them was not checked.

---

## STORY-APPROVE-07: Bot asks again after a "Not now" and the owner reconsiders
**Type**: medium
**Topic**: Approving outside sources
**Persona**: Marcus, who declined last week and now sees a new card from the same bot
**Goal**: Decide with the new information.
**Preconditions**: Precondition: bot action (not walkable without a model) to change a denied source's call, plus needs seeded approval card (old card answered "Not now"; new card pending for the same source).
**Ideal path**: 3 — read the new card, compare, answer.
**Alternate paths**: Ignore the new card; the page keeps saying "Waiting for approval" because the source is pending again, not "Not approved".
### Steps
1. Open the thread → the old card shows "Not now" (red X); a new card below it shows the question and buttons.
2. Read the new `Request:` and `Key:` lines → they show the changed URL or key name. The card has no text saying that it replaces a declined request.
3. Click "Allow" → "Allowed". Open the page: the block fills in.

### Variations
- Click "Not now" again: the source returns to denied, and the page reads "Not approved".
- Open the Sources dialog before answering: the badge reads "pending" (not "denied").

### Edge Cases
- The key name on the card is only the secret's name (for example `billing`), never its value. Check that no part of an API key appears in the card, the notification body or the dialog.
- Request line over 100 characters: the `Page:` line is cut at 100 characters but the `Request:` line is never cut (the hash covers every argument), so a very long query string makes the card tall.

---

## STORY-APPROVE-08: Approve an MCP source (tool call) and compare with an API source
**Type**: medium
**Topic**: Approving outside sources
**Persona**: Aisha, an operations lead who connected a Mercury MCP server
**Goal**: Read an MCP card and understand what Allow lets the page do.
**Preconditions**: needs seeded approval card with an mcp source (card text like "Read Mercury every 6 hours?", detail `Request: getAccounts {"limit":5}` then `Page: Finance`). The demo seed has only an http pending source, so this needs extra seeding.
**Ideal path**: 3 — read, Allow, check the page.
**Alternate paths**: none found.
### Steps
1. Open the thread and read the card → question "Read Mercury every 6 hours?"; the detail shows `Request: getAccounts {"limit":5}` (tool name plus JSON args, no `GET`, no `Key:` line) and `Page: Finance`.
2. Click "Allow" → "Sending…", then "Allowed".
3. Open the page's "Sources" dialog → the row subline reads `{server} · {tool} · {schedule}` and the badge "ok" after the one-time refresh.

### Variations
- Schedule "15m", "1h", "6h", "1d", "1w" give "every 15 minutes", "every hour", "every 6 hours", "every day", "every week" in the question. An unknown value would print the raw value.
- A tool call with no args: the `Request:` line is just the tool name.

### Edge Cases
- A card for a tool that writes (the bot picks the tool): the card has no read-only/write label. The product expects the bot to use only read tools, but the card cannot confirm it.
- The question says "Read {server}" for any tool, even if the tool name sounds like a write.

---

## STORY-APPROVE-09: Approval flow on a phone-width screen
**Type**: medium
**Topic**: Approving outside sources
**Persona**: Dana, on her phone browser at 390px between meetings
**Goal**: Get the notification, read the card and answer it with one hand.
**Preconditions**: needs seeded approval card. Browser resized to 390 px wide.
**Ideal path**: 4 — open the app, open the bot, read, tap Allow.
**Alternate paths**: The mobile app (Expo, apps/mobile/app/thread.tsx ~3815) and the iOS app render the same card; those are outside what a browser walker can check.
### Steps
1. Open `/app` at 390 px → the sidebar is collapsed; the Finance agent's row shows an unread marker.
2. Open the bot → the chat fills the screen; the card question is at the top of the card.
3. Read the detail text → a long URL wraps; the card does not scroll sideways.
4. Tap "Allow" → full-width button reads "Sending…", then "Allowed".

### Variations
- Tap the toast if it is still visible.
- Rotate to landscape / resize to 844 px: buttons stay stacked.
- Open the Page from the header: the side panel becomes a full-screen view or a sheet (check which); the block for the source should update without a reload.

### Edge Cases
- The touch targets: each button is tall (`py-3`), above the 44 px target.
- Tapping "Not now" by mistake has no undo (see STORY-APPROVE-02).

---

## STORY-APPROVE-10: Empty and absent states: no card, no pending source
**Type**: short
**Topic**: Approving outside sources
**Persona**: A tester checking what a user sees when nothing is waiting
**Goal**: Confirm the approval UI stays out of the way when it has nothing to show.
**Preconditions**: the base seed only (no approval card in a thread). The "Outside rate (pending)" source exists but its card is missing, which is itself a state worth recording.
**Ideal path**: 3 — open Cash, read the placeholder, open the chat and find nothing to answer.
**Alternate paths**: none found.
### Steps
1. Open Cash full-width → the "Outside rate" block shows "Waiting for approval" as a link.
2. Click it → the chat opens. No approval card is in the thread (the seed did not create one).
3. Look for any other control that could approve the source: the Sources dialog row menu has "Change schedule", "Pause", "Remove" but no "Allow". → There is no way to approve from the UI. The owner can only wait for the bot to post a new card, or remove the source.

### Variations
- The Cash HTML page and the Spend page have no pending sources; no approval UI should appear.
- Keyboard: the link is reachable by Tab on the full-width page, and not offered in the side panel.

### Edge Cases
- The seeded state may be a defect in the walk setup rather than the product: a pending source without a card cannot be approved in the product. In real use the card is created in the same step as the pending source, but if the card is lost (for example, if the thread message fails to post after the source saved), `page_source_set` called again with the same call posts no card (`needsCard` is false when only the schedule changes). The owner is then stuck with "Waiting for approval" and no way forward until the bot changes the call.

---

## Surprises and possible defects (for the report)
1. A pending page-source card can never show "No longer active": transcript.tsx:2015 forces `canAnswer` true when `block.pageSource` is set. Stale cards are only closed after a click, as "Replaced by a newer request" or "Expired", with a CONFLICT error (router.ts:3595). An out-of-date card A looks as live as the current card B until clicked.
2. "Waiting for approval" is a link only on the full-width route (BotPageView.tsx:19, PageLiveBlocks.tsx:103). In the side panel and in the Sources dialog (badge "pending") there is no way to jump to the card. The link goes to `/app/{botId}` with no scroll to the card or highlight.
3. No approval path exists outside the card: a pending source without a card (card lost, or schedule-only change) cannot be approved (page-sources.ts:1131, `needsCard`).
4. A schedule change on a pending source keeps the old card text ("every hour") and approving it applies the new schedule. The card is not rewritten.
5. "Not now" is a permanent refusal (source becomes `denied` and stays denied until the bot changes the call), shown as "Not now" on the card, "Not approved" on the page and "denied" in the Sources dialog.
6. Allow reports success even if the one-time refresh fails; the failure only appears later on the page (warning dot) and in the Sources dialog.
