# Live pages: Sharing a snapshot

Code facts the stories rely on (read from code, not run):
- Options menu "Share" (bot-page-panel.tsx:709) calls `pages.share` (router.ts:4520), then opens the "Share link" dialog (`ArtifactShareDialog` over `CopyLinkDialog`).
- The page panel passes no `expiresAt` and no `onReplace` (bot-page-panel.tsx:801-809). So the dialog always shows the link, the note "Anyone with this link can view this version until you stop sharing or for 30 days.", and only "Stop sharing" plus "Done". "Replace link" and "Links are shown once. Replacing this one stops the old link." never appear in the page flow. Sharing again makes a new link and revokes the old one of the same snapshot family (page-snapshot.ts, artifact-shares.ts createArtifactShare).
- Snapshot is built at click time (blocks page: static HTML with "Snapshot YYYY-MM-DD HH:MM UTC" footer; html page: its own markup plus current source values, error text removed). Placeholders: "Waiting for approval", "Not approved", "Source not found", "No data yet".
- Public view `/s#token` (SharedArtifact.tsx): "Loading…", then header with the name minus extension (for example "Cash snapshot") and "Shared from Praci", with the snapshot in a sandboxed frame. Unknown, revoked, expired, empty-token or rate-limited (over 60 opens a minute) links all show "This link is not available."

## STORY-SHARE-01: Share the Cash page and copy the link
**Type**: short
**Topic**: Sharing a snapshot
**Persona**: Priya, a seed-stage founder who wants to send her cofounder the current cash picture
**Goal**: Get a link to the Cash page onto the clipboard.
**Preconditions**: Logged in as the demo owner. Finance agent has page "Cash" with data.
**Ideal path**: 4 — open page, options, Share, Copy.
**Alternate paths**: Full-width page `/app/pages/:botId/:pageId` has the same "Page options" menu, so the same 4 steps. Side panel via the chat header "Page" button is the other route.
### Steps
1. Open the Finance agent chat, click "Page" in the header, select the "Cash" tab → Cash page shows metric "Monthly burn" and table "Largest vendors".
2. Click "Page options" (the ... button) → menu lists "Refresh", "Sources", "Share", "Rename", "Delete".
3. Click "Share" → dialog "Share link" opens with a read-only field (aria-label "Link for Cash") holding `{origin}/s#<token>`.
4. Read the note → "Anyone with this link can view this version until you stop sharing or for 30 days."
5. Click "Copy" → button changes to "Copied".
6. Click "Done" → dialog closes, page unchanged.
### Variations
- Click into the link field: its text is selected (onFocus select), so Ctrl/Cmd+C also works.
- Phone width (390px): "Copy" button has a taller tap target (min-h-11).
- Repeat from the full-width route; same dialog.
### Edge Cases
- Clipboard blocked by the browser: "Copy" stays "Copy" with no message (copy error is swallowed, CopyLinkDialog.tsx). Select the field and copy by hand.
- Defect to note: the note says "30 days" but never shows a date; the "until {date}" wording exists but the panel does not pass `expiresAt`.

## STORY-SHARE-02: Open the shared link logged out and see the frozen snapshot
**Type**: medium
**Topic**: Sharing a snapshot
**Persona**: Marcus, an advisor with no Praci account who gets the link in a message
**Goal**: Read the numbers without signing in.
**Preconditions**: A link from STORY-SHARE-01. A fresh private/incognito browser session (no cookies).
**Ideal path**: 1 — open the link.
**Alternate paths**: none found; there is no in-app way to preview the public view as the owner (an owner who is logged in sees the same page at `/s#token`).
### Steps
1. Paste the link into a logged-out browser → brief "Loading…", no login redirect.
2. Wait for load → header "Cash snapshot" with "Shared from Praci" on the right.
3. Read the body → title "Cash", metric "Monthly burn" with its value, table "Largest vendors" with rows, footer "Snapshot YYYY-MM-DD HH:MM UTC".
4. Look for the stale metric "Cash (stale)" → it shows its last value if one was stored, otherwise "No data yet".
5. Look for "Payroll (paused)" and "Never fetched (paused)" → "Payroll (paused)" shows its last value; "Never fetched (paused)" shows "No data yet". "Outside rate (pending)" shows "Waiting for approval".
6. Check for any controls (Retry, warning dots, hover times, Sources, Refresh, edit) → none; the view is read only and has no app sidebar.
7. In the owner session, change nothing, wait for a refresh, then reload the public link → values unchanged (frozen at click time).
### Variations
- Phone width (390px): the frame fills the screen below the header; body column is max 760px and tables scroll sideways inside their section.
- Dark OS theme: snapshot follows `prefers-color-scheme`.
- Open the link in a second tab: works; each open counts against 60 opens per minute.
### Edge Cases
- Link typed without the `#token` (just `/s`): "This link is not available."
- Token with a character cut off in a chat app: "This link is not available."
- Compare surfaces: failure reasons ("Request timed out") and the Retry button seen on the app page do not appear in the snapshot.
- Defect to check: a stale or failed metric looks the same as a healthy one in the snapshot, with only the footer time as a hint.

## STORY-SHARE-03: Stop sharing, then confirm the old link is dead
**Type**: medium
**Topic**: Sharing a snapshot
**Persona**: Priya, who sent the link to the wrong person
**Goal**: Cut off access.
**Preconditions**: A live link from STORY-SHARE-01, still on screen in the "Share link" dialog.
**Ideal path**: 3 — Stop sharing, confirm, check the link.
**Alternate paths**: none found. Closing the dialog first loses the way back: reopening "Share" makes a new link rather than showing the old one, and the dialog opens fresh with `artifactId` of the new snapshot (see STORY-SHARE-05).
### Steps
1. In the "Share link" dialog, click "Stop sharing" → confirmation "Stop sharing this link?" with "Cancel" and "Stop sharing".
2. Click "Cancel" → confirmation closes; the "Share link" dialog is still open with the link.
3. Click "Stop sharing" again, then "Stop sharing" in the confirmation → both dialogs close; the page is as before. No toast.
4. In a logged-out window open the old link → "This link is not available."
5. Reload the app page → no sign that sharing ended or ever existed (no share badge).
### Variations
- Escape on the confirmation closes only the confirmation.
- Keyboard: Tab to "Stop sharing", Enter, Tab to the destructive button, Enter.
### Edge Cases
- Network error during revoke: the red error text appears inside the confirmation and the dialog stays open; "Stop sharing" can be retried. (The same error is hidden in the main dialog while the confirmation is open.)
- Defect to note: no confirmation toast after success, so the owner relies on the dialog disappearing.
- Revoke calls `artifactShares.revoke` and ends every live link of the same snapshot family, not only this token.

## STORY-SHARE-04: Revoked, replaced and expired links
**Type**: short
**Topic**: Sharing a snapshot
**Persona**: Marcus, who bookmarked an old link
**Goal**: Find out why the link no longer works.
**Preconditions**: A link that has been revoked (STORY-SHARE-03) or superseded (STORY-SHARE-05).
**Ideal path**: 1 — open the link.
**Alternate paths**: none found.
### Steps
1. Open the old link logged out → "Loading…" then a centered "This link is not available."
2. Reload → same message.
3. Look for a reason, a sign-in prompt or a way to contact the owner → none.
### Variations
- Phone width: the message is centered on a plain page.
### Edge Cases
- All failure causes (never existed, revoked, replaced, expired after 30 days, rate-limited) show the same copy, so a viewer cannot tell "ask for a new link" from "try again in a minute".
- Opening one link more than 60 times in a minute returns the same message (`openArtifactShare` "limited"). Not worth walking.

## STORY-SHARE-05: Share again, and the earlier link stops working
**Type**: medium
**Topic**: Sharing a snapshot
**Persona**: Priya, who wants fresher numbers in the link
**Goal**: Send an updated link and be sure the old one is gone.
**Preconditions**: Link A from STORY-SHARE-01 already made and closed with "Done".
**Ideal path**: 3 — options, Share, copy new link.
**Alternate paths**: "Replace link" button does not exist in this flow; the code path (`url === null`) is unused by the page panel.
### Steps
1. On the Cash page, click "Page options" then "Share" → a new "Share link" dialog with link B, different from A.
2. Click "Copy", then "Done" → "Copied", dialog closes.
3. Open link A logged out → "This link is not available." (making B ended A.)
4. Open link B logged out → "Cash snapshot" view with a newer footer time.
### Variations
- Share "Spend" afterwards: its snapshot is a different family (name "Spend snapshot"), so the Cash link B should keep working; check this, it depends on the artifact family being per page title.
- Two owner tabs click Share at the same moment: only one link survives (advisory lock in `createArtifactShare`).
### Edge Cases
- Defect to note: Share silently revokes the previous link with no warning. An owner who shared A with two people breaks one person's link without being told.
- The dialog gives no hint that the link already existed.

## STORY-SHARE-06: Share a page with paused, failed and pending blocks
**Type**: medium
**Topic**: Sharing a snapshot
**Persona**: Dana, a controller who wants to share the Cash page as is, problems included
**Goal**: Understand what a viewer sees for blocks that have problems.
**Preconditions**: Seeded Cash page with "Cash (stale)" (two failures, "Request timed out"), "Payroll (paused)", "Never fetched (paused)", "Outside rate (pending)". Source status in the Sources dialog should match.
**Ideal path**: 6 — compare app page and snapshot.
**Alternate paths**: Full-width page for the compare in the app, side panel otherwise.
### Steps
1. On the Cash page note the app view: "Cash (stale)" with the "Source failed" dot, paused blocks with "Paused" or the "Source paused" dot, "Outside rate (pending)" with "Waiting for approval".
2. Click "Page options", "Share" → "Share link" dialog opens with no warning that some blocks are failing or pending.
3. Click "Copy", "Done".
4. Open the link logged out → page renders.
5. Find "Outside rate (pending)" → "Waiting for approval", plain text, not clickable.
6. Find "Never fetched (paused)" → "No data yet" (the app says "Paused").
7. Find "Cash (stale)" → last stored value, no error mark.
### Variations
- Approve "Outside rate" in the chat first (needs seeded approval card), re-share, and compare.
### Edge Cases
- A viewer sees "Waiting for approval" for something they cannot approve and may think the page is broken.
- Source errors, source names' calls, URLs and key names are not in the snapshot (check by viewing page source: no "Request timed out", no URL).

## STORY-SHARE-07: Share the HTML page "Cash HTML"
**Type**: medium
**Topic**: Sharing a snapshot
**Persona**: Priya, sharing a designed one-pager
**Goal**: Share the HTML page and check that data shows in the public view.
**Preconditions**: Seeded html page "Cash HTML" (meta praci-sources cash), reached from the sidebar at `/app/pages/:botId/:pageId`.
**Ideal path**: 4 — open page, options, Share, copy.
**Alternate paths**: none found; the page is not editable, but "Page options" still has "Share".
### Steps
1. Click "Cash HTML" in the sidebar → page renders in a bordered frame.
2. Click "Page options" then "Share" → "Share link" dialog; same note and "Copy".
3. Click "Copy", then "Done".
4. Open the link logged out → header "Cash HTML snapshot" and "Shared from Praci"; the page renders in a sandboxed frame.
5. Look at the `cash` value → it shows the value seen in the app, delivered after the frame's load event.
### Variations
- Phone width (390px): the frame fills the viewport under the header.
- If the frame shows empty values for a moment, wait; data arrives on load.
### Edge Cases
- If the page script reads data before the load event it finds none. If the viewer's browser blocks the sandboxed message, values stay blank with no error text.
- Source errors are stripped from the data, so a failed source shows as no value, not an error.

## STORY-SHARE-08: First-time owner shares from the side panel on a phone, with a mistake
**Type**: long
**Topic**: Sharing a snapshot
**Persona**: Priya, on her phone (390px) before a board call, a bit rushed
**Goal**: Share Cash, then realise she shared too early and fix it.
**Preconditions**: Logged in at 390px width. Finance agent has "Cash" and "Spend". Second logged-out browser available.
**Ideal path**: 12 — two shares plus a revoke across two pages.
**Alternate paths**: Do it on the full-width route to avoid the cramped side panel.
### Steps
1. Open `/app/{botId}` at 390px → chat shown; header has "Page".
2. Tap "Page" → side panel (or full-screen on narrow screens) with the Cash page; tabs "Cash" and "Spend" under aria-label "Pages".
3. Tap "Page options", "Share" → "Share link" dialog.
4. Tap the field → link text is selected.
5. Tap "Copy" → "Copied".
6. Tap "Done" → back at the page.
7. Realise the burn number is wrong; tap "Page options", "Refresh" → blocks shimmer "Refreshing" and then show new values.
8. Tap "Page options", "Share" again → new link, B. Copy it.
9. Open link A in the logged-out browser → "This link is not available." (replaced).
10. Open link B → shows the refreshed numbers and a new footer time.
11. Tap the "Spend" tab, "Page options", "Share" → link C, a different snapshot; "Copy".
12. Open link B again → still works (different family), or does not; record what happens.
13. Back in the app tap "Page options", "Share" on Cash → new dialog; tap "Stop sharing" and confirm.
14. Open links B and C → B: "This link is not available."; C works.
### Variations
- Pressing Escape on a desktop keyboard at step 3 closes the dialog; the link is gone and a new Share is needed.
- Rotate the phone to landscape: dialog still fits.
### Edge Cases
- Closing the dialog by tapping outside before copying loses the link; there is no way to see it again, only to make a new one (which revokes the old).
- Step 13 shows that "Stop sharing" works on a freshly made link, not on an older link: the dialog never shows existing shares.
- If step 12 fails, the "one family per page title" claim in page-snapshot.ts does not hold; file a defect.
