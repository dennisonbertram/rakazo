# Simulator check of the Expo gap list

## How the check ran

Two iOS simulators ran an Expo dev build of main, each signed in as the demo founder against the demo backend (`pnpm demo:up` stack). Simulator A covered the odd-numbered rows and simulator B the even-numbered rows. The check was lightweight: each row was looked for by tapping through the app and taking a screenshot. It did not exercise long-press, swipe, or every settings page. Screenshot file names are listed per row.

Limits that affect many rows:

- Deep links (`rakazo://inbox`, `company`, `data-room` and others) crashed the dev client with a red 'No script URL provided' screen. Relaunching recovered it. Navigation was by tapping only.
- Home has no Company row (gated off), so Company, company fact, routine and calendar-from-Company screens were mostly unreachable. Those rows are `could not check`.
- The demo data has no expired approval, connector-watch routine, mail attachment or company facts.
- Simulator B showed a dev-only yellow-box error toast (a React key warning) on most screens. It is unrelated to the rows.
- The simulators are separate runs, so the screenshot names (for example `h.png`, `m1.png` from B; `homemenu.png`, `msg.png` from A) are per simulator.

## Totals

Simulator status counts: could-not-check 22, degrades-safely 6, missing 31, partial 6, present 5. Disagreements with the gap list: 4. Status changed in items.json: G-12, G-63.

G-21 is counted as present because the item's code reference supports it, but the cadence control was not seen on screen, so its README label is `could not check`.

## All rows

| ID | Feature | Gap list | Simulator | Agrees | What the screen shows | Screenshot |
|---|---|---|---|---|---|---|
| G-01 | Bot to-dos waiting on you, with done checkbox, above the agenda | missing | missing | yes | Home has only Inbox, bell, layers, folder and plus icons and the chat list. No Calendar entry and no waiting-on-you item. | homemenu.png |
| G-02 | Waiting on you in Activity (open items across bots) | missing | missing | yes | Bell opens Activity with only Now and Recent groups. No Waiting on you section, no due dates. | a2.png |
| G-03 | Expiring approval cards (show Expired, hide actions) | missing | could-not-check | yes | No expired approval card is seeded; only question and answered cards seen. Answered cards show an 'Answered: ...' line, so an Expired line would fit the same slot. | fin.png |
| G-04 | Calendar page: Google events plus bot to-dos, check-backs and routines in one time-sorted agenda | missing | missing | yes | No Calendar or Pages entry on Home. The only calendar is the Company calendar, which lists company dates, not Google events or bot items. | h.png |
| G-05 | Send now on agent drafts | missing | missing | yes | Open mail has no Reply, Send or Edit. The Inbox agent preview says a reply is saved as a draft; nothing on the phone sends it. Inbox agent thread not opened. | msg.png |
| G-06 | Undo on send (Sending... Undo) | missing | missing | yes | Open message header has only chat and Ask agent icons. Nothing can be sent, so there is no Undo. | m1.png |
| G-07 | Message actions: single archive, mark read/unread, feedback, search, filters | missing | missing | yes | Inbox has account and category tabs but no search field and no filter menu. Swipe and long-press not tried. | inbox.png |
| G-08 | Approvals table (Allow / Ask / Block per action type, per bot override) | missing | missing | yes | Chat settings show Name, Title, Description, Color, Computer Team/Private, switches, Skills toggles and Advanced. No Approvals or Allow/Ask/Block section. Advanced not opened. | b3.png |
| G-09 | Deadlines: mark done, update date, filters | missing | could-not-check | yes | Company calendar not reachable from the UI (no Home row; deep link crashed the dev client). | - |
| G-10 | Compose, reply, forward, draft save/discard | missing | missing | yes | Message screen shows headers and body only. No Reply, Forward or Compose control. | m1.png |
| G-11 | Legal page: contracts list, group similar, party avatars, due-soon chip | missing | missing | yes | No Legal entry on Home. The Legal agent appears only as a chat row. | homemenu.png |
| G-12 | Finance overview: cash, burn, runway, spend | missing | partial | NO | Finance agent chat has a header strip with Cash and Runway tiles and a refresh button. More than the gap list said, but no burn breakdown, spend or monthly view. Tiles are not tappable. | f1.png |
| G-13 | Google Calendar connection states: Connect prompt, per-account errors | missing | missing | yes | No calendar surface, so no Connect Google Calendar prompt. Home shows 'Mail needs reconnect' rows for mail only. | homemenu.png |
| G-14 | Important contacts: Added by, undo, Mark sender important/noise in mail | partial | missing | NO | No mark-important or noise action on rows or in the open message. Important, Updates and Newsletters tabs filter by server marks. Long-press not tried; contacts 'Added by' and undo are not reachable. | r_inbox.png |
| G-15 | Navigation entry to people pages (Contacts, Investors, Fundraising from sidebar pages) | missing | missing | yes | Home has no Pages section, so no Contacts, Investors or Fundraising row. | homemenu.png |
| G-16 | Track a thread (Chief's Open work) | missing | missing | yes | Open message has no Track control in the header. Row long-press not tried. | m1.png |
| G-17 | Open in Gmail | missing | missing | yes | Message header has only back, chat and Ask agent icons. No Open in Gmail or share link. | msg.png |
| G-18 | Watch a connected app (connector watch kind) | partial | could-not-check | yes | No connector-watch routine in the demo data and no routine id to deep link. Gap rests on code in lib/routine.ts. | - |
| G-19 | Artifact share links (create, revoke) | partial | partial | yes | Artifact header has Share (share sheet) and a red Trash icon. No Create link or Revoke link. | art2.png |
| G-20 | Background runs list in Activity | present | present | yes | Bell toggles Activity mode showing Now and Recent runs with bot name, status text and age. | a2.png |
| G-21 | Bot check-in routine (cadence) | present | present | yes | Chat settings opened; no cadence control seen in the part scrolled. Kept present from the item's code reference (bot-settings.tsx); not observed on screen. | bs2.png |
| G-22 | Search and Source filter on Company lists | missing | missing | yes | Company People view shows only a 'No company facts yet' card. No search, filter or sort; demo has no company data so a populated list was not seen. | r_company_view_people.png |
| G-23 | Company map overview, people, organisations | present | partial | yes | No Company row on Home, matching the gated-off entry. Route could not be opened (deep links crash the dev client), so the map was not observed. | homemenu.png |
| G-24 | Review queue | present | could-not-check | yes | Opened the review view, but the demo company has no facts, so confirm and reject could not be exercised. | r_company_view_review.png |
| G-25 | Fact detail | present | could-not-check | yes | Fact detail is reachable only through Company, which is hidden. Not opened. | - |
| G-26 | Browse, search, open, preview, share | present | present | yes | Data room lists folders then files with status text: Processing..., Failed (red), Ready. No upload control. Search and preview not opened. | r_data_room.png |
| G-27 | Failed count chip and filters/sorts | partial | partial | yes | Data room shows a red Failed label and Processing... but no failed count, no filter or sort menu, only a Search files bar. | dataroom.png |
| G-28 | Chief delegate wait notice and pending/answered state | partial | could-not-check | yes | Chief chat with an unanswered delegation not opened; waiting notice not observed. | - |
| G-29 | Calendar views: Day, 3 days, Month, Schedule; prev/next/Today; month grid with picked-day list | missing | missing | yes | No calendar view of any kind in the app. | homemenu.png |
| G-30 | Contacts list (kind filter, sorts, photos, add/edit/delete) including Investor and Board kinds | missing | missing | yes | No Contacts or People entry on Home. The only People screen is the empty Company list, a different feature. | h.png |
| G-31 | Contact page (related mail, meetings, documents, SAFEs) | missing | missing | yes | Sender is plain text on the message screen, not tappable. No contact page. | msg.png |
| G-32 | Context panel while reading (person facts, summary) | missing | missing | yes | Open message has no person button and no context sheet. | m1.png |
| G-33 | Review with AI for attachments | partial | could-not-check | yes | Opened message has no attachment; header offers only chat and Ask agent. Attachment screen not reached. | - |
| G-34 | Routines that watch a page: edit, quiet, pause/resume, list | partial | could-not-check | yes | No routine id to deep link; read-only routine screen not seen. Finance chat shows an answered approval card about a routine; settings has no routines list. | b3.png |
| G-35 | Routine run history and test run | missing | could-not-check | yes | Routine screen not reached from the UI. Finance thread shows no routine link. | fin.png |
| G-36 | Credentials with last used and needs attention | missing | missing | yes | Finance agent settings (Name to Advanced, incl. Skills) show no credentials list, last-used or attention flag. Advanced not opened. | b3.png |
| G-37 | Privacy controls: erase, export, exclude person, visibility | missing | could-not-check | yes | Company unreachable from the UI; no header menu seen. | - |
| G-38 | Burn breakdown tabs | missing | missing | yes | Finance chat strip has Cash and Runway tiles only; no burn tabs or monthly view. | f1.png |
| G-39 | Transactions: search, filters, sorts, receipt | missing | missing | yes | No Finance screen or route on Home. Agent thread shows Cash and Runway only; no transactions, search or receipts. | fin.png |
| G-40 | Import, upload, rename, move, delete | degrades-safely | degrades-safely | NO | Data room is read-only with no add control, and nothing says to use the web. A dead end rather than a clear fallback. A Failed file has no retry or explanation. | r_data_room.png |
| G-41 | Search, filter and sortable headers across lists | partial | partial | yes | Artifacts has a search bar and bot filter chips; Data room has Search files. No sort control on any list opened. | artifacts.png |
| G-42 | Typed UI blocks in replies (render_ui: table, stats, cards) | degrades-safely | could-not-check | yes | No table requested from a bot, so no render_ui block seen. Finance chat shows plain bubbles and one approval card. | f1.png |
| G-43 | Page agents grouped above chats | degrades-safely | degrades-safely | yes | Page agents sit in the same flat chat list with a small tag chip. No Pages group. | homemenu.png |
| G-44 | GTM page: plan, channels, post queue, approvals | missing | could-not-check | yes | No GTM bot row on the first Home screen; GTM chat not opened. | h.png |
| G-45 | Sign in with a passkey | missing | missing | yes | Sign in offers Email, Password, Forgot password?, Sign up and Use a custom server. No passkey or SSO button. | s0.png |
| G-46 | Calendar filters and search: kind, bot, text | missing | missing | yes | No calendar surface on Home, so no filter or search. Company calendar has only month navigation. | r_company_view_calendar.png |
| G-47 | Context panel while writing | missing | missing | yes | No compose screen, so no recipient context. | msg.png |
| G-48 | To-dos in Inbox: reopen/undo, show more | partial | could-not-check | yes | Important pile shows mail rows only; no to-do cards seen, so reopen and show-more were not observable. | r_inbox.png |
| G-49 | Urgent mail as a table | degrades-safely | degrades-safely | yes | Inbox shows an Important list with unread dots grouped Today and Earlier, plus Updates and Newsletters tabs. No Needs reply section and no table. | inbox.png |
| G-50 | Email chat notes routed to the owning agent | degrades-safely | could-not-check | yes | No Ask-agent note sent. The sparkle icon exists in the message header, so the entry point is present. | m1.png |
| G-51 | Approval toasts | degrades-safely | could-not-check | yes | App asked for notification permission on first launch. Settings notifications screen and an approval notification not tried. | - |
| G-52 | Bot-built tools (artifacts) list and open | present | present | yes | Artifacts lists items with type badge, description, bot and age, with an All bots / per-bot chip row. | r_artifacts.png |
| G-53 | History timeline | present | could-not-check | yes | Company unreachable from the UI; history view not checked. | - |
| G-54 | Company calendar (month agenda) | present | present | yes | Company calendar opens with a month agenda (a legal deadline, 2026-10-23), month previous/next and a toggle. | r_company_view_calendar.png |
| G-55 | Import progress: pause, cancel | present | could-not-check | yes | Company unreachable from the UI; import progress view not checked. | - |
| G-56 | Legal consent and Scan now | missing | missing | yes | No Legal screen or entry on Home. The Legal agent is only a chat row. | h.png |
| G-57 | Per-agent progress in the chief chat | partial | could-not-check | yes | No Chief chat delegating to two agents opened. Chief row on Home shows only a text summary. | homemenu.png |
| G-58 | Sidebar folds and pinned fold header | partial | could-not-check | yes | Home shows a group heading with a more button; heading not tapped, so collapse and pinned group not tested. | h.png |
| G-59 | Message and card layout gap | present | could-not-check | yes | Only question and answered cards seen; spacing between text and a card in one reply not measured. | ir.png |
| G-60 | Integrations brand logos | present | partial | yes | Integrations sheet lists Gmail, Google Calendar, Google Drive, Slack, Notion, GitHub with gray letter tiles, not brand logos. Logos may come from a catalog URL the offline demo does not serve. | r_integrations.png |
| G-61 | Investors: Cap table tab (holdings, Invested per holder) | missing | missing | yes | No Investors or Cap table screen on Home. The Carta agent is only a chat row. | homemenu.png |
| G-62 | Fundraising page (round, pipeline, SAFEs, Mercury refresh) | missing | missing | yes | No Fundraising entry on Home; only a Fundraising folder in the Data room and an Investor Relations chat. | h.png |
| G-63 | Teach a task: saved taught skills list, test run | degrades-safely | missing | NO | Chat settings has a Skills section of plain on/off toggles with raw skill ids. No taught-skills list and no note about teaching on the web: a silent gap, not a clear degrade. | bs2.png |
| G-64 | Tour stops for routines and approvals | degrades-safely | degrades-safely | yes | After sign-in the app went straight to Home with no tour. Only the iOS notification dialog appeared. | s14.png |
| G-65 | Devin sessions page | degrades-safely | could-not-check | yes | No Devin screen or entry on Home. A Devin thread was not opened. | - |
| G-66 | Investors: Updates tab (draft, send, retry, audits) | missing | missing | yes | No Investors page or Updates tab on Home; only the Investors agent and Investor Relations chat rows. | h.png |
| G-67 | Imports: start, consent, scope | degrades-safely | could-not-check | yes | Company unreachable from the UI; empty state not seen. | - |
| G-68 | Spend, Crypto, add account, statement import | missing | missing | yes | No Spend or Crypto screen. Finance chat strip shows only Cash and Runway. | f1.png |
| G-69 | Team health page | degrades-safely | degrades-safely | yes | No Team health route or entry on Home, matching the web-and-desktop-only decision. | homemenu.png |
| G-70 | Projects page and project bot | degrades-safely | degrades-safely | yes | No Projects entry on Home. Plan-only per the gap list. | h.png |

## Disagreements

- G-12 Finance overview: gap list said missing. The Finance chat has a Cash and Runway strip, so the status is now partial. Still no burn breakdown or spend. Updated in items.json and README.
- G-63 Taught skills: gap list said degrades-safely. Chat settings shows only plain skill toggles with no taught-skills list and no web note, so it is a silent gap. Status is now missing. Updated.
- G-14 Important contacts: gap list said partial (the Important pile reflects server marks). The simulator found no mark action and no way to see or undo agent-added contacts. Long-press was not tried, so the status was left partial.
- G-40 Data room writes: gap list said degrades-safely (read only). The simulator found no add control and no pointer to the web, so it is closer to a dead end than a safe fallback. Status left as is; the fix is a one-line pointer to the web.

## Could not check

G-03, G-09, G-18, G-24, G-25, G-28, G-33, G-34, G-35, G-37, G-42, G-44, G-48, G-50, G-51, G-53, G-55, G-57, G-58, G-59, G-65, G-67.

Most are blocked by the hidden Company route or by missing demo data (expired approval, attachment, connector-watch routine, populated company). Their code-based status stands and should be checked once those are seeded and the deep-link crash is fixed.

## Phone UX notes worth fixing

- Deep links crash the dev client when the app is cold or has no script URL (`rakazo://inbox`, `company`, `data-room`). Check whether this is dev-client only.
- Inbox rows clip on the right: the time column runs off screen and subjects or previews cut off (seen on both simulators).
- Activity row subtitles are cut off ('Needs your a...'), so what is being asked is unreadable.
- The message header shows the full sender address wrapped over two lines, and recipient lines wrap awkwardly, using much of the first screen.
- The Company calendar header is garbled: month labels render over the status bar, a toggle has no label, and the 'Refresh' text overlaps the clock. The deadline shown is in the past and is not marked overdue. Company is hidden today, so fix this before enabling the Home row (G-23).
- The artifact Trash icon sits next to Share in the header. It asks to confirm, but it is easy to hit by accident (it happened once during this check).
- Chat settings Skills is a long list of raw skill ids that scrolls under the transparent header and pushes Advanced far down.
- Floating search bars cover the last rows of Artifacts and the Data room until you scroll. The Data room folder list pushes a Failed file below the fold.
- Names and tag chips truncate in the chat list ('Investor Relations (...', 'Fundrai...'). The bot chip row on Artifacts is cut off at the right edge (it scrolls).
- The Finance Cash and Runway tiles are not tappable and scroll away with the chat.
- Integrations: three tiles show the same 'G' letter, and the Granola API key box has no label saying where to get the key. The empty Company People state does not say what fills it.
