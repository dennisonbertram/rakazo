# iOS UX walk: per-story results

Run date 2026-11-04. App built from this branch (`docs/ios-ux-walk`, from origin/main), iOS 26.3 Simulator, iPhone 17 Pro (402 x 874 pt), driven with Maestro and `xcrun simctl io screenshot`. Backend: one demo stack (mock data, scripted agent runtime, no model). Every screenshot named below was opened and inspected; they are kept outside the repo in the session scratchpad under `ios-walk/` (full size `NN-name.png`, and a reduced `small-NN-name.png`).

Result key: Pass, Pass with defects (goal reached, something wrong or rough), Fail (goal not reachable or wrong result), Blocked (needs something this environment lacks), Not walked.

About 35 of the 127 stories were walked, some partly (story numbers for the Meetings, Data room and Business topics are matched by title and may be off by one or two). The rest were not reached in this session, mostly because they need a real model, a real mailbox, a microphone, a real Docker computer, a second device, or a state the demo seed does not contain. See "Not walked" in `latest-report.md`.

## Sign-in and server

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-001 Sign in | Pass with defects | 111, 112, 114. A fresh install shows "Couldn't reach the server. Try again." with only "Retry connection" and "Use a custom server" (default server is loopback). After typing the password with the keyboard down, the lower third of the screen is a different background colour than the upper part (114). The form sits at the top with a large empty area beneath. 8 steps (custom server, address, save, confirm, email, password, sign in) versus 3 ideal. |
| STORY-005 Company server | Not walked | https path needs a reachable https server. |
| STORY-006 Local http server | Pass | 109. The "Use this server? This connection is unencrypted" alert appears with Cancel and Use anyway. The server sheet does show the current host (108, 112), so the second half of code finding 7 is refuted for the sheet (the sign-in screen itself still never shows the host). |
| STORY-009 Sign out | Pass with defects | 107. Sign out happens at once, no confirmation. It exists twice (Settings list in red, Account in black, 59). |
| STORY-010 Cold start with saved session | Pass | 115-cold-1 to 5. White launch screen, then Home with a spinner, then the roster. The Sign in screen never flashed (local server restores fast). A white screen for about 1 s is shown first. |
| STORY-011 Change server while signed in | Fail | 49, 50. Settings has no server entry; only sign out leads to it. |
| STORY-007, 002, 003, 004, 008 | Not walked | Need default server, email delivery, SSO, or an expired session. |

## Home and spaces

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-012 Open the app and reach an agent | Pass | 00-home, 88. One tap from Home to a thread. |
| STORY-013 First launch with no agents | Pass with defects | 93-empty-space. "No agents yet / New agent" is plain text, not styled as a button. Pages (Finance, Legal, Cap table, Data room, Meetings) show in a space with no agents. |
| STORY-013 New agent sheet | Pass with defects | 46, 90. Explainer line "Add a name to create the agent." (repeats the disabled Create button). At the largest text size the colour row is under the keyboard. |
| STORY-015 Create a group | Partly walked | 47. Sheet and member list shown; I did not create one. The list runs under the bottom edge, with "0 selected" cut off. |
| STORY-016 Row menu | Pass with defects | 118, 119, 120, 121. Pin, Rename, Settings, Archive appear on long press. Rename to blank spaces and Save closes with no message (finding 16 confirmed). Pin and Archive failure paths not tried. |
| STORY-017 Crowded roster | Pass | 01, 02, 03, 05, 13. Show more / Show less works; the number changed from 6 to 7 as an agent moved. |
| STORY-018 Switch space | Pass with defects | 92. Menu lists spaces plus New space and Space settings. The title has a small chevron in a circle (not a bare title), so finding 56 (no chevron) is refuted; the menu check mark shows the current space. |
| STORY-019, 020 Create and delete a space | Partly walked | 48. New space sheet shows (Cancel and Create pills; New agent uses an X instead). Not created. |
| STORY-021, 022, 023 | Not walked | Offline, recording bar and hidden pages need other state. |

## Agent thread

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-024 Open a busy thread | Fail | 04, 77. The thread opens at the "New" divider near the top, not at the newest reply. In Investor Relations the pending question card is five screens down; the user has to find "Jump to latest" (79). |
| STORY-025 Unread divider | Pass | 04, 77. "New" divider is drawn. |
| STORY-026 Watch a reply stream | Not walked | Scripted runtime replies at once; no streaming. |
| STORY-027 Scroll up during a stream | Not walked | No streaming. Manual scrolling up and down works (04, 05, 78). |
| STORY-028 Load older messages | Not walked | Seed has no long history. |
| STORY-029 Dismiss the keyboard by dragging | Fail | 06, 07, 07b, 12-thread-tapout. Dragging the transcript scrolls it but the keyboard stays. Tapping the transcript does not dismiss it either. Maestro `hideKeyboard` failed. The Return key does not dismiss it. No way to close the keyboard except sending or leaving. Finding 2 confirmed. |
| STORY-030 to 034 | Not walked | Copy, attach, offline, stop need long-press, photo picker, network control. |
| (Send) | Pass with defects | 08. After Send, the new message is below the visible area while "Jump to latest" shows (the view did not follow the user's own message; I had scrolled up first, so the cause is unproven). The reply came after "Jump to latest" (12b). |
| Thread menu | Pass | 09, 10, 11. Open computer, Artifacts, Agent page, Settings, Archive agent. Agent settings screen is clean. "Agent page" is offered for an agent with no page (116 shows "No page yet"). |

## Approvals

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-039 Pick an option on a choice card | Pass | 79, 80. Tapping an option marks "Answered: Name Bolt Freight" and the agent continues (82). |
| Data-sharing consent card (from STORY-043 area) | Pass with defects | 12b, 79, 82. The card's disclosure text is cut off with "including..." and cannot be expanded before Allow. Allow works ("Allowed"). |
| STORY-035 to 038, 040 to 045 | Not walked | The seed has no tool approval, mail draft, secret request or MCP request. |

## Voice

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-048 Voice call | Pass with defects | 104, 105, 106. Call opens, "Listening", timer runs (00:21 after 20 s). Icon-only buttons, no mic permission prompt in the simulator. "Nothing said yet." sits flush left, not aligned with the centred call layout. |
| STORY-052 Voice settings | Pass with defects | 52. "This device" ticked, Call sounds and Waiting sound on. The play button top right has no label. |
| STORY-046, 047, 049, 051, 053 to 055 | Not walked | Need microphone and speech. |

## Inbox and compose

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-056 Inbox list | Pass with defects | 14, 15, 44. List scrolls by dragging on rows. Section header "Earlier" is overdrawn by rows under the toolbar (15). Opened mail returned as unread after the list reloaded (87), and the Home count stayed at 14. |
| STORY-058 Account filter | Pass with defects | 36, 44. The filter icon is identical for All and Founder mail (finding 40). |
| STORY-059 Search | Pass with defects | 39 to 43. Nothing filters until the Search key is pressed; results are right. While searching, the toolbar (back, filter) is hidden, only an X remains. |
| STORY-060 Read a message | Pass | 16, 21, 23, 24, 86 (dark). Short bodies fit; an expanded thread (23 to 25) scrolls with a drag. A very long HTML mail was not available, so finding 1(a) was not exercised. |
| STORY-063 Archive | Fail | 33, 34, 35. A toast "Archived Undo" shows, the screen stays on the message, and the toast is still visible after 3 s. The list still showed the archived message after returning (35). Finding 28 confirmed. |
| STORY-067 Start a new message | Fail | 14, 37. No way to start one; the toolbar has filter, a speech bubble and a menu with only Cleanup. Finding 5 confirmed. |
| STORY-069 Reply | Pass with defects | 26, 27, 28, 29. Reply and Forward appear (no Reply all for one sender). The body is one text box holding the quote; typing at the centre inserts inside the quoted text ("> Maya,Happy to do..."). The body card is short compared with the free space and shows blank lines on top. |
| STORY-071 Save draft | Pass with defects | 30, 32. Cancel offers Save draft or Discard draft (no "keep editing"). After Save draft there is no confirmation (finding 19 confirmed). |
| Cleanup | Pass | 38. Empty state "Nothing to clean up". |
| Reconnect state | Pass with defects | 94, 95. "Gmail needs to reconnect" with a small black capsule button. Tapping it opens Settings at the top level, not Integrations (finding 27 confirmed). |
| STORY-061 to 066, 068, 070, 072 to 075 | Not walked | Need real mail features (unsubscribe, rules, send failures, etc.). |

## Meetings

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-076 Meetings list | Pass | 69. Empty state "No meetings", search pill, record button. |
| STORY-077 Record | Blocked | 71, 72. The record sheet offers only "Add speech to text"; tapping it shows the Voice settings squeezed into the same short sheet (72), cut off after two rows. Recording needs a speech provider and microphone. |
| STORY-078 to 087 | Not walked | No meetings in seed; recording not possible. |

## Data room and artifacts

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-088 Browse folders | Pass | 65, 66. Folders and counts, floating search pill. |
| STORY-092 AI consent | Fail | 66, 67. "Reading..." stays on files after the consent was never given; no prompt on the Data room itself (consent card only appears in a thread). One file shows "This file isn't a readable PDF." in red (data from the seed). |
| File detail | Pass with defects | 67, 68. Preview card shows the PDF as a tiny page at the top of a large white box. |
| STORY-094 Artifacts list | Pass with defects | 99. Rows run edge to edge with no card inset, unlike every other list. |
| STORY-095 HTML artifact | Pass with defects | 100, 101, 102, 103. The page is blank white for about a second with no loading indicator. Delete asks for confirmation (no Cancel button in the popover, tap outside to cancel). |
| STORY-097 Agent page | Pass | 116, 117. Empty state "No page yet" and "Open chat". |
| STORY-089 to 091, 093, 096, 098 | Not walked | Upload, share and other actions need picker or share sheet. |

## Business pages

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-099 Finance | Pass with defects | 60, 61. Summary, burn chart, accounts and upcoming list scroll fine. Cash is $1,533,221 here but the Chief thread says $1,633,221, and runway is 23 mo here and 24.2 months in the thread (mock data differs between surfaces). |
| STORY-100 to 102 Legal | Pass | 62, 63. Contracts and Deadlines tabs, scan row, grouped contracts scroll. |
| STORY-108 Cap table | Pass with defects | 64. Empty state with a very small "Connect Carta" capsule tight under the heading. |
| STORY-103, 104, 105 to 107 | Not walked | Hide amounts not toggled; Carta not connected. |

## Team computer

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-111 Take control | Fail | 74, 75, 76. "No live screen" (fake computer). Tapping Take control shows red "Stop the bot first" while the screen says "Chief is driving", and there is no Stop control on this screen. Both a back arrow and an X appear (two ways to close). |
| STORY-112 to 115 | Not walked | Need a real computer session. |

## Settings and trust

| Story | Result | Evidence and notes |
| --- | --- | --- |
| STORY-116 Settings shell | Pass | 49, 50. Scrolls; X closes; dragging down on the sheet closes it. |
| STORY-117 Models | Pass with defects | 51, 96, 97. "Connect a model" opens a sheet over the sheet. API key defaults to "Amazon Bedrock". Not connected (no key). |
| STORY-119 Integrations | Pass with defects | 53. Connected accounts show provider names as "Googlecalendar". |
| STORY-120 AI data sharing | Pass with defects | 54. The screen holds a single "Privacy details" row and no state. |
| STORY-121 Allowed without asking | Pass | 55. Rules and switch shown. |
| STORY-122 Notifications | Pass with defects | 56. Three switches; no iOS permission state or Settings link (finding 45 confirmed). |
| STORY-124 Appearance | Partly walked | Dark mode checked through the simulator (83 to 86): Home, thread, inbox, message are clean. |
| Usage | Pass with defects | 57. No time period shown, and "Total tokens" shows a dash while input is 12 and output 40. |
| STORY-125 Archived agents | Pass | 58. |
| STORY-126 Account | Pass with defects | 59. See STORY-009. |
| STORY-118, 123, 127 | Not walked | Disconnect, deep link and delete account were not tried. |

## Dynamic Type and dark mode

- Dark mode: Home (84), thread (83), inbox (85), message (86) are all readable with correct contrast. No defects found.
- Accessibility Extra Large text: Home rows (89) wrap the title to two lines, put the time on its own line, drop the preview to three lines and misalign the avatar and unread dot; the Settings account avatar shows "..." instead of initials (91); the New agent colour row is covered by the keyboard (90).
