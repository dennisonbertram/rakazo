# UX walk: Approvals table and read-only unattended runs

Walked 2026-10-25 in the demo stack (synthetic data), session `unattended-approvals`, viewport 1280x900 (first views at 1280x577). Stories: `docs/ux-paths/unattended/approvals.md`. Screenshots are scratch files outside the repo (folder `ux-shots/approvals/`, names below).

## Summary

| Story | Result | Notes |
|---|---|---|
| APPROVALS-C1 | Pass | 4 steps, ideal path. Approvals sit under "Privacy". |
| APPROVALS-C2 | Pass with findings | Switch works both ways. No feedback, no explanation. |
| APPROVALS-C3 | Partial | Walked with a mail approval; the card differs from the story. |
| APPROVALS-C4 | Partial | "Discard" walked on the mail card; the "Deny" card was not seen. |
| APPROVALS-C5 | Not walked | The mail card has no "Always allow this tool" button; no rule exists. |
| APPROVALS-C6 | Not walked | Only the trigger menu was inspected. No webhook run was started. |

## Stories

### APPROVALS-C1: Find where approvals are managed. Pass
- Steps taken (4, ideal 4): user button, "Settings", "Privacy and approvals", read "Action confirmations".
- Seen: Settings opens on "General". "Privacy and approvals" shows "AI data sharing" first, then "Action confirmations" with two switches, both on. No rules list is shown because none exist.
- Findings:
  - P3: At 1280x577 "Action confirmations" is below the fold; the first thing seen under "Privacy and approvals" is data sharing, not approvals. Screenshot `c1-3-privacy.png`.
  - P3: The page title says "approvals" but the section is named "Action confirmations". Two words for one idea.
  - P3: Fully dark, low contrast on the blurred background but the dialog itself is clean. `c1-4-tall.png`.

### APPROVALS-C2: Turn off the purchase confirmation. Pass with findings
- Steps taken: 1 click off, 1 click on (ideal 1 to 2). Both states persisted visually (`c2-1-off.png`, `c2-2-on.png`).
- Findings:
  - P2: Nothing says what "off" means. No text says that payment-named connector tools still ask, or that email sends ask in other ways. A user may think purchases can no longer stop for approval. `c2-1-off.png`.
  - P3: No toast or saved state after the change; the switch is the only feedback.
  - P3: The two switches cover only email and purchases. A user looking for "files", "commands" or "browser" finds nothing.

### APPROVALS-C3: Approve a bot's action once. Partial
- The demo bots held no approval, so I triggered one: told Chief "Send an email to a demo test address". Chief first asked "Share your chats and mail with the AI model that runs your bots?" (Allow / Not now) because "Allow AI models" is off in the demo; I pressed Allow. Chief then messaged the Inbox agent, and a toast said "Inbox agent needs approval. Review before sending email to <address>" with an "Open Inbox agent" button. (`c3-5-trigger.png`, `c3-6-after-consent.png`)
- The approval card is a mail composer in the Inbox agent chat: header "Mail Needs approval", fields From ("Choose an account"), To, body, buttons "Send", "Discard", a "..." menu and Edit. "Send" is disabled until an account is chosen, with a line "Choose an account to send from." It is not the generic "Allow once / Always allow this tool / Deny" card that the story describes. (`c3-7-card.png`)
- Steps taken to reach the card: send message, answer consent, click "Open Inbox agent" (3 steps after the message). The approval did not appear in the chat where Maya asked; it appeared in another bot's chat.
- Findings:
  - P2: The request is answered in a different bot's chat (Inbox agent). Chief's composer says "Waiting for approval" and the Chief row later shows the stale consent text, "Share your chats and mail with the AI m...". Maya has to know to go to the Inbox agent. The toast helps only while visible.
  - P2: The Activity list "Needs you" section showed only the Investor Relations question ("Needs your answer"). The Activity list does not use "Needs approval" wording in the walked states; I did not see the waiting mail send appear there (not checked after the toast closed).
  - P3: "Send" is disabled with the reason in small grey text under the buttons; easy to miss. `c3-7-card.png`.
  - P3: The first-run consent card ("Share your chats and mail...") comes before any approval and uses the verbs "Allow" and "Not now", which the approval card does not. Two different approval vocabularies.

### APPROVALS-C4: Deny an action. Partial
- Pressed "Discard" on the mail card. The card collapsed to one line "Mail Discarded - <address> - Hello" with the time. (`c4-1-discard.png`)
- Steps: 1 click. Ideal 1.
- Findings:
  - P3: "Discard" and "Deny" are different words for the same decision across card types; the user cannot tell from "Discard" that the bot is told not to retry.
  - Not observed: what the bot said afterwards. Chief was still on "Waiting for the model..." about 20 seconds later. (`c4-2-chief.png`)

### APPROVALS-C5: Always allow a tool, then undo it in Settings. Not walked
- The mail card offers no "Always allow this tool", so no rule was created and the Settings list stayed empty. Cannot judge the raw tool id wording.

### APPROVALS-C6: A webhook routine cannot act without her. Not walked
- Inspected only how a webhook routine is created. Routines for Chief (right panel, "Computer and routines" button): "Morning briefing", "Cash check", both schedules. In the editor, "Choose when it runs" lists schedules, then "From another app (advanced)" with "Git event" and "Webhook". (`c6-1-routines.png`, `c6-5-choose.png`, `c6-6-submenu.png`)
- Findings:
  - P2: Nothing in the routine editor says what a background run may or may not do. The only mention of approvals is the free-text "Approval boundaries" field on a drafted skill ("Do not send messages, spend money, publish content, or delete data without explicit user approval."), which is a prompt to the model, not a setting. `c3-1-activity.png`.
  - P3: "Run history" shows "No runs yet" for the routine, so a held run cannot be checked in this demo.
  - P3: Webhook and Git triggers are two levels deep, labelled "advanced"; fine for safety but a user who wants "react to an event" will not find them by that name.

## Notes for adding "Approvals table and read-only unattended runs"
- Where it fits: Settings > "Privacy and approvals" > "Action confirmations" is the one place; it currently holds two switches and sits under "AI data sharing". A table would replace those two switches. It would be the second block on the page; consider whether it should sit first.
- Confusing today:
  - "Approvals" and "Action confirmations" are used for the same thing.
  - Approval cards differ by tool (mail composer with Send/Discard; consent card with Allow/Not now; code says Allow once/Always/Deny). The table's labels (Allow, Ask, Block) should match the words on the cards.
  - Turning "Ask before purchases" off does not mean never ask; the page does not say so.
  - The approval can land in a different bot's chat than the one Maya typed in. A read-only unattended run will make this more common, so the Activity list and the notification need a clear "Needs approval" entry that opens the card directly. I did not confirm that the Activity list shows it.
  - No user-facing place shows what a background run is allowed to do. Routine editor has no such line.
- Risks for the table: the AI-data consent card can stop any run before approvals are reached (it did for the first message), which is a separate gate unattended runs must also handle.
- Unverified: webhook-triggered runs, "Always allow this tool", any Block or per-bot behaviour (none exists), the Activity list label for a held approval, mobile.
- Demo state changed by this walk: "Allow" was pressed on the AI data consent for the demo account, and one mail send was discarded. The "Ask before purchases" switch was turned off and back on.
