# New web features missing or partial on Expo

> **Decision (2026-10-30):** on Android these features are reached through the phone-ready web app (Add to Home Screen), which was walked and fixed at phone width in #917, #931 and #942. On iPhone the native SwiftUI app covers them (#945, #960, #961, #967). This list stays as the Expo backlog; nothing here is scheduled.


This compares the web app with the Expo app for features that shipped recently (PRs #850 to #916 and related). The comparison reads code only: it searches `apps/mobile` for matching screens, RPC calls and helpers. A simulator visual check is in `visual.md`; the Visual column says whether each row was visually confirmed or could not be checked. Items marked Verified were re-checked against the code while consolidating. Behavior on a device is not observed here.

Status values: missing (no mobile path), partial (some mobile path), degrades-safely (explicit reason or safe fallback), present.

## All features

| ID | Area | Feature | Expo status | How it behaves on Expo today | Priority | Size | Visual |
|---|---|---|---|---|---|---|---|
| G-01 | Calendar | Bot to-dos waiting on you, with done checkbox, above the agenda | missing | No bot to-do call in apps/mobile (grep confirmed). Only mail to-dos (Inbox TodoCard) can be ticked off. A bot item waiting on the user is invisible on the phone. | P1 | S | visually confirmed |
| G-02 | Unattended | Waiting on you in Activity (open items across bots) | missing | Activity (lib/activity.ts) calls only runs/list. No waitingOnYou call. Blocked items are invisible unless a push mentions them. | P1 | S | visually confirmed |
| G-03 | Unattended | Expiring approval cards (show Expired, hide actions) | missing | No expired outcome label in thread.tsx or McpApprovalCard.tsx (grep for expir/timed finds none). An expired card likely shows live buttons and the tap fails. | P1 | S | could not check |
| G-04 | Calendar | Calendar page: Google events plus bot to-dos, check-backs and routines in one time-sorted agenda | missing | No calendar screen and no calendar/agenda call in apps/mobile (grep confirmed). Nothing on the phone shows Google events, bot check-backs or routine runs in one place. The only workaround is agent chat. docs/mobile-parity/inventory.md marks Calendar N/A, which is now stale. | P1 | M | visually confirmed |
| G-05 | Mail | Send now on agent drafts | missing | No draft card; mail_thread blocks reduce to text. A draft can only be sent by telling the agent in chat. | P1 | M | visually confirmed |
| G-06 | Mail | Undo on send (Sending... Undo) | missing | Nothing to undo because mail cannot be sent. Existing mobile Undo covers cleanup batches only. | P1 | M | visually confirmed |
| G-07 | Mail | Message actions: single archive, mark read/unread, feedback, search, filters | missing | Only sender-group archive and cleanup exist. inventory.md records the same gap. | P1 | M | visually confirmed |
| G-08 | Unattended | Approvals table (Allow / Ask / Block per action type, per bot override) | missing | No approvalRules call in apps/mobile (grep confirmed). Maya can answer a single approval card but cannot see or change what bots may do alone. Safety relevant. | P1 | M | visually confirmed |
| G-09 | Legal | Deadlines: mark done, update date, filters | missing | Not available; Company calendar tells the user to update on web or desktop. | P1 | M | could not check |
| G-10 | Mail | Compose, reply, forward, draft save/discard | missing | No compose screen and no Reply/Forward in inbox-message.tsx. The only route is chatting with the Inbox agent. Agent email cards render as plain text. | P1 | L | visually confirmed |
| G-11 | Legal | Legal page: contracts list, group similar, party avatars, due-soon chip | missing | No Legal screen and no open-on-web text. The Legal agent works as a chat bot. | P1 | L | visually confirmed |
| G-12 | Finance | Finance overview: cash, burn, runway, spend | partial | No Finance screen. Chat cards render as plain text (financeCardText); the Finance chat header has a Cash and Runway strip (seen on simulator), but no burn breakdown or spend. | P1 | L | visually confirmed |
| G-13 | Calendar | Google Calendar connection states: Connect prompt, per-account errors | missing | No calendar screen, so no prompt. Google can be connected in Settings > Integrations but nothing links there from a calendar surface. | P2 | S | visually confirmed |
| G-14 | People | Important contacts: Added by, undo, Mark sender important/noise in mail | partial | Important pile reflects server marks, but no mark action exists in inbox.tsx or lib/api.ts and agent-added contacts cannot be seen or undone. | P2 | S | visually confirmed |
| G-15 | People | Navigation entry to people pages (Contacts, Investors, Fundraising from sidebar pages) | missing | Home has no Pages section, so new people screens would have no entry. | P2 | S | visually confirmed |
| G-16 | Mail | Track a thread (Chief's Open work) | missing | No track call; mail-row-menu.tsx offers Archive only. | P2 | S | visually confirmed |
| G-17 | Mail | Open in Gmail | missing | No link out from the message screen or chat mail cards. | P2 | S | visually confirmed |
| G-18 | Unattended | Watch a connected app (connector watch kind) | partial | lib/routine.ts line 54 calls watchHost(routine.watch.url) for any watch; a connector watch has no url, so the line may be blank or fail. Code confirmed; on-device result unverified. | P2 | S | could not check |
| G-19 | Unattended | Artifact share links (create, revoke) | partial | artifact.tsx Share sends the local file via the share sheet; no revocable link. | P2 | S | visually confirmed |
| G-20 | Unattended | Background runs list in Activity | present | Bell toggles Activity mode; runs/list with status labels, same as web. | P2 | S | visually confirmed |
| G-21 | Unattended | Bot check-in routine (cadence) | present | bot-settings.tsx sets cadence with checkIn/set. | P2 | S | could not check |
| G-22 | Company | Search and Source filter on Company lists | missing | company.tsx has no search, filter or sort. | P2 | S | visually confirmed |
| G-23 | Company | Company map overview, people, organisations | present | company.tsx CompanyMap lists overview and people. The Home Company row is gated by mobileCompanyAvailable(); the company template has available:false in packages/contracts/src/sidebar-pages.ts, so the row is hidden (confirmed from code) while the route works. Decide whether to enable it. | P2 | S | visually confirmed |
| G-24 | Company | Review queue | present | CompanyReviewList and company-fact.tsx handle confirm/reject/match. | P2 | S | could not check |
| G-25 | Company | Fact detail | present | company-fact.tsx shows evidence, edit, confirm, reject. | P2 | S | could not check |
| G-26 | Data room | Browse, search, open, preview, share | present | data-room.tsx and data-room-item.tsx cover folders, search, preview and share. | P2 | S | visually confirmed |
| G-27 | Data room | Failed count chip and filters/sorts | partial | Rows show red status; no failed count, filter or sort. | P2 | S | visually confirmed |
| G-28 | Chat | Chief delegate wait notice and pending/answered state | partial | Sent/received show as centered chips; no waiting notice or pending marker. | P2 | S | could not check |
| G-29 | Calendar | Calendar views: Day, 3 days, Month, Schedule; prev/next/Today; month grid with picked-day list | missing | Not available; no view code in apps/mobile. | P2 | M | visually confirmed |
| G-30 | People | Contacts list (kind filter, sorts, photos, add/edit/delete) including Investor and Board kinds | missing | No contacts route in apps/mobile/app and no contacts call in lib/api.ts (grep confirmed). Contacts exist only as inbox sender names. Agents can add contacts in chat but Maya cannot browse, fix or delete one. | P2 | M | visually confirmed |
| G-31 | People | Contact page (related mail, meetings, documents, SAFEs) | missing | No contact page; sender names in inbox-message are not tappable. | P2 | M | visually confirmed |
| G-32 | Mail | Context panel while reading (person facts, summary) | missing | inbox-message.tsx shows headers and body only. Ask agent is a partial workaround. | P2 | M | visually confirmed |
| G-33 | Mail | Review with AI for attachments | partial | Attachments can be previewed or shared (inbox-attachment.tsx) but there is no review action. | P2 | M | could not check |
| G-34 | Unattended | Routines that watch a page: edit, quiet, pause/resume, list | partial | routine.tsx is read-only (Watches host, Checked/Changed, paused reason). No routine list, create/edit, quiet toggle, pause or test run. | P2 | M | could not check |
| G-35 | Unattended | Routine run history and test run | missing | routine.tsx shows the last-run line only; no history or Run now. | P2 | M | could not check |
| G-36 | Unattended | Credentials with last used and needs attention | missing | bot-settings.tsx has model credentials only; no bot secrets list. | P2 | M | visually confirmed |
| G-37 | Company | Privacy controls: erase, export, exclude person, visibility | missing | No privacy screen in app/company*.tsx. | P2 | M | could not check |
| G-38 | Finance | Burn breakdown tabs | missing | Not available. | P2 | M | visually confirmed |
| G-39 | Finance | Transactions: search, filters, sorts, receipt | missing | Not available. | P2 | M | visually confirmed |
| G-40 | Data room | Import, upload, rename, move, delete | degrades-safely | Mobile is read only; no pointer to web. | P2 | M | visually confirmed |
| G-41 | Lists | Search, filter and sortable headers across lists | partial | Only Artifacts has search and bot filter; Data room has search; no sorts on any mobile list. | P2 | M | visually confirmed |
| G-42 | Chat | Typed UI blocks in replies (render_ui: table, stats, cards) | degrades-safely | Flattened to text via uiBlockText (lib/api.ts), no content lost, structure lost. | P2 | M | could not check |
| G-43 | Chat | Page agents grouped above chats | degrades-safely | Chat list has no Pages group; page agents appear where the roster puts them. | P2 | M | visually confirmed |
| G-44 | GTM | GTM page: plan, channels, post queue, approvals | missing | No screen; approving a queued post needs chat cards or web. | P2 | L | could not check |
| G-45 | Chat | Sign in with a passkey | missing | sign-in.tsx offers password and SSO only; no passkey code (grep confirmed). Passkey-only accounts cannot sign in. | P2 | L | visually confirmed |
| G-46 | Calendar | Calendar filters and search: kind, bot, text | missing | Not available. | P3 | S | visually confirmed |
| G-47 | Mail | Context panel while writing | missing | No compose, so no panel. | P3 | S | visually confirmed |
| G-48 | Mail | To-dos in Inbox: reopen/undo, show more | partial | Mobile lists and completes mail to-dos; no reopen or show-more. | P3 | S | could not check |
| G-49 | Mail | Urgent mail as a table | degrades-safely | Table is a wide layout; the phone shows the Important pile with triage badges. Needs-reply grouping match not verified. | P3 | S | visually confirmed |
| G-50 | Mail | Email chat notes routed to the owning agent | degrades-safely | Routing is server side; mobile uses the same inbox/askAgent entry. Not traced; verify on a simulator. | P3 | S | could not check |
| G-51 | Unattended | Approval toasts | degrades-safely | Toasts are web only; the phone uses push and local notifications that open the thread. | P3 | S | could not check |
| G-52 | Unattended | Bot-built tools (artifacts) list and open | present | artifacts.tsx and artifact.tsx list and render artifacts; no table sort or filter. | P3 | S | visually confirmed |
| G-53 | Company | History timeline | present | company.tsx view=history. | P3 | S | could not check |
| G-54 | Company | Company calendar (month agenda) | present | CompanyAgenda with month navigation; legal rows show an open-on-web alert. | P3 | S | visually confirmed |
| G-55 | Company | Import progress: pause, cancel | present | CompanyProgress supports pause and cancel with confirmation. | P3 | S | could not check |
| G-56 | Legal | Legal consent and Scan now | missing | No consent or scan on mobile. | P3 | S | visually confirmed |
| G-57 | Chat | Per-agent progress in the chief chat | partial | One indicator; not broken out per delegate. | P3 | S | could not check |
| G-58 | Chat | Sidebar folds and pinned fold header | partial | Folder headings collapse; pinned heading collapse not verified; '+N more' irrelevant on phone. | P3 | S | could not check |
| G-59 | Chat | Message and card layout gap | present | Cards are separate native views; spacing equality unchecked. | P3 | S | could not check |
| G-60 | Chat | Integrations brand logos | present | connector-icon.tsx uses catalog logo URL, letter fallback; web uses bundled marks, so a minor mismatch. | P3 | S | visually confirmed |
| G-61 | People | Investors: Cap table tab (holdings, Invested per holder) | missing | No screen; cap table cards in chat show as text only. inventory.md already lists it as missing. | P3 | M | visually confirmed |
| G-62 | People | Fundraising page (round, pipeline, SAFEs, Mercury refresh) | missing | No screen; nothing shows the round, stages or SAFEs. | P3 | M | visually confirmed |
| G-63 | Unattended | Teach a task: saved taught skills list, test run | missing | Recording needs a desktop pointer and keyboard, but there is no list of taught skills and no note pointing to the web: a silent gap (seen on simulator). | P3 | M | visually confirmed |
| G-64 | Unattended | Tour stops for routines and approvals | degrades-safely | No tour on mobile; the tour anchors desktop sidebar elements. | P3 | M | visually confirmed |
| G-65 | Devin | Devin sessions page | degrades-safely | No screen by design (docs/devin/ux-flow/round-2.md); a Devin push opens the session link. | P3 | M | could not check |
| G-66 | People | Investors: Updates tab (draft, send, retry, audits) | missing | No screen; updates can only be written or sent on web or desktop, or via the Investors agent in chat. | P3 | L | visually confirmed |
| G-67 | Company | Imports: start, consent, scope | degrades-safely | Empty states say to start an import on web or desktop. | P3 | L | could not check |
| G-68 | Finance | Spend, Crypto, add account, statement import | missing | Not available. | P3 | L | visually confirmed |
| G-69 | Team health | Team health page | degrades-safely | Web and desktop only by explicit decision (available:false). | P3 | L | visually confirmed |
| G-70 | Projects | Projects page and project bot | degrades-safely | Plan only; no web page in this checkout either. | P3 | L | visually confirmed |

## P1 gaps

### G-01 Bot to-dos waiting on you, with done checkbox, above the agenda (Calendar, missing, size S)

- On Expo today: No bot to-do call in apps/mobile (grep confirmed). Only mail to-dos (Inbox TodoCard) can be ticked off. A bot item waiting on the user is invisible on the phone.
- Phone story: Maya sees a 'Waiting on you' card with three bot to-dos, ticks one, taps another title to open that bot's thread.
- Native pattern: First section of the Calendar screen, reusing the Inbox TodoCard layout (44pt target, due tone from lib/mail-inbox.ts). Optimistic removal with rollback. Omit when empty. Hide items whose due date is already in the visible range.
- API: rpc scratchpad.waitingOnYou({}); scratchpad.update({itemId,status:'done'}).
- Visual check path: rakazo://inbox To do card is the nearest checkbox list; the bot section does not exist.
- PRs: #899 #902

### G-02 Waiting on you in Activity (open items across bots) (Unattended, missing, size S)

- On Expo today: Activity (lib/activity.ts) calls only runs/list. No waitingOnYou call. Blocked items are invisible unless a push mentions them.
- Phone story: Maya opens Activity and sees everything bots wait on her for.
- Native pattern: 'Waiting on you' section above Active in the Activity list: title, bot, waiting-on, due date (overdue tinted); tap opens the bot thread; swipe Mark done.
- API: scratchpad.waitingOnYou({}); scratchpad.update.
- Visual check path: rakazo:// bell (Activity): no such section.
- PRs: #864
- Verified: lib/activity.ts has only runs/list calls.

### G-03 Expiring approval cards (show Expired, hide actions) (Unattended, missing, size S)

- On Expo today: No expired outcome label in thread.tsx or McpApprovalCard.tsx (grep for expir/timed finds none). An expired card likely shows live buttons and the tap fails.
- Phone story: Maya opens a thread next morning; the expired card should read Expired with no Allow button.
- Native pattern: Branch on expired outcome: hide actions, muted 'Expired' line in the formatApprovalAnswer slot.
- API: Card block outcome in packages/core/src/action-approval.ts; no new RPC.
- Visual check path: Demo seed with an expired card, rakazo://thread?botId=<id>.
- PRs: #865
- Verified: no expiry handling in thread.tsx.

### G-04 Calendar page: Google events plus bot to-dos, check-backs and routines in one time-sorted agenda (Calendar, missing, size M)

- On Expo today: No calendar screen and no calendar/agenda call in apps/mobile (grep confirmed). Nothing on the phone shows Google events, bot check-backs or routine runs in one place. The only workaround is agent chat. docs/mobile-parity/inventory.md marks Calendar N/A, which is now stale.
- Phone story: Maya, between meetings, wants today and tomorrow in one list (Google events, the 3pm check-back, tonight's routine) and taps an item to act on it.
- Native pattern: New Expo Router screen app/calendar.tsx with glass header. Schedule list (SectionList with day headers), kind icon, title, time, bot name. Tap: Google event opens href; routine pushes /routine; other bot item pushes /thread; inbox to-do pushes /inbox-message or /inbox. Header Today button, pull to refresh. Fetch local and google in two calls so slow Google never blocks bot items. Home row 'Calendar' next to the Mail and Company rows; register the screen in _layout.tsx. Move date helpers (localDay, addDays, visibleRange) from the web page into packages/core.
- API: rpc calendar.agenda({from,to,sources:'local'|'google'}) -> {items,errors,googleConnected}; max range 93 days. Add a wrapper in apps/mobile/lib/api.ts (rpc('calendar/agenda',...)).
- Visual check path: Home (rakazo://) has no Calendar row. Nearest: rakazo://company then the Calendar segment (different feature), and rakazo://inbox To do card.
- PRs: #897 #899 #902 #907
- Verified: no calendar/agenda, scratchpad or waitingOnYou call in apps/mobile; no calendar route in app/.

### G-05 Send now on agent drafts (Mail, missing, size M)

- On Expo today: No draft card; mail_thread blocks reduce to text. A draft can only be sent by telling the agent in chat.
- Phone story: Maya reads the Inbox agent's draft and taps Send now.
- Native pattern: Native card for mail_thread/draft blocks with Send now and Edit (opens compose); native Alert before external send.
- API: inbox/compose/send, prefill.
- Visual check path: rakazo://thread in the Inbox agent chat: draft is plain text.
- PRs: #871

### G-06 Undo on send (Sending... Undo) (Mail, missing, size M)

- On Expo today: Nothing to undo because mail cannot be sent. Existing mobile Undo covers cleanup batches only.
- Phone story: Maya sees a typo after Send and taps Undo within the delay.
- Native pattern: After Send, dismiss the modal and show a banner with Undo that reopens compose with restored fields.
- API: inbox/compose/send, discard, draftSave; timing per web lib/outbox.ts.
- Visual check path: Not reachable until compose exists.
- PRs: #881

### G-07 Message actions: single archive, mark read/unread, feedback, search, filters (Mail, missing, size M)

- On Expo today: Only sender-group archive and cleanup exist. inventory.md records the same gap.
- Phone story: Maya triages 20 mails on the train: swipe archive, mark read, search a sender.
- Native pattern: Native swipe actions, context menu, searchable header, filter menu.
- API: inbox/archive, unarchive, markRead, feedback; inbox/list query params.
- Visual check path: rakazo://inbox, long-press and swipe a row.
- PRs: epic #82

### G-08 Approvals table (Allow / Ask / Block per action type, per bot override) (Unattended, missing, size M)

- On Expo today: No approvalRules call in apps/mobile (grep confirmed). Maya can answer a single approval card but cannot see or change what bots may do alone. Safety relevant.
- Phone story: Maya, traveling, sets 'Send email' to Allow, or 'Spend money' to Block for one bot.
- Native pattern: Settings > Approvals grouped list with a native menu picker (Allow, Ask, Block) per action type; an Approvals row in bot-settings.tsx with 'Same as all bots'.
- API: rpc approvalRules.table({botId?}); approvalRules.setActionType({actionType,botId?,effect}).
- Visual check path: rakazo:// Settings and a bot's bot-settings: no Approvals row.
- PRs: #855
- Verified: no approvalRules reference in apps/mobile.

### G-09 Deadlines: mark done, update date, filters (Legal, missing, size M)

- On Expo today: Not available; Company calendar tells the user to update on web or desktop.
- Phone story: A renewal is due in 5 days; Maya marks it done or moves the date.
- Native pattern: Swipe to mark done, date picker sheet, filter menu.
- API: legal/doneDeadlines, updateDeadline.
- Visual check path: rakazo://company?view=calendar, tap a Legal row.
- PRs: #884

### G-10 Compose, reply, forward, draft save/discard (Mail, missing, size L)

- On Expo today: No compose screen and no Reply/Forward in inbox-message.tsx. The only route is chatting with the Inbox agent. Agent email cards render as plain text.
- Phone story: Maya reads a customer question on the train and replies from her iPhone.
- Native pattern: Full-screen modal route /compose with native Cancel/Send, TextInput body, recipient token field, account picker; reply/reply-all/forward in a header menu.
- API: inbox/compose/prefill, draftSave, send, discard (ComposeFieldsSchema).
- Visual check path: rakazo://inbox, open a message, look for Reply (absent).
- PRs: pre-epic; #82
- Verified: no inbox/compose call in apps/mobile.

### G-11 Legal page: contracts list, group similar, party avatars, due-soon chip (Legal, missing, size L)

- On Expo today: No Legal screen and no open-on-web text. The Legal agent works as a chat bot.
- Phone story: Maya checks which contracts renew soon and who the counterparty is.
- Native pattern: Grouped list with group-similar switch, due-soon chips, detail screen, Contracts/Deadlines segments.
- API: legal/overview, legal/graph.
- Visual check path: No route; Home > Legal agent chat.
- PRs: #878 #884

### G-12 Finance overview: cash, burn, runway, spend (Finance, partial, size L)

- On Expo today: No Finance screen; chat cards render as plain text (financeCardText).
- Phone story: Maya checks cash and runway before telling the board.
- Native pattern: Native KPI list then grouped rows; hide-amounts switch exists.
- API: finance/overview, runway, burn, month.
- Visual check path: Home > Finance agent chat.
- PRs: #867


## P2 gaps

### G-13 Google Calendar connection states: Connect prompt, per-account errors (Calendar, missing, size S)

- On Expo today: No calendar screen, so no prompt. Google can be connected in Settings > Integrations but nothing links there from a calendar surface.
- Phone story: Maya has not connected Google on the phone; the calendar shows bot items and one 'Connect Google Calendar' row that opens Integrations. A failing account is named instead of silently missing events.
- Native pattern: Inline row at the end of the Schedule list opening the integrations route; footer text listing agenda.errors; request-id guards on the two parallel loads.
- API: calendar.agenda googleConnected and errors fields.
- Visual check path: rakazo://integrations shows the existing connect flow.
- PRs: #897 #907

### G-14 Important contacts: Added by, undo, Mark sender important/noise in mail (People, partial, size S)

- On Expo today: Important pile reflects server marks, but no mark action exists in inbox.tsx or lib/api.ts and agent-added contacts cannot be seen or undone.
- Phone story: Maya long-presses her lawyer's mail to mark the sender important and undoes a contact an agent added by mistake.
- Native pattern: Native context menu on inbox rows (Important / Noise / Clear); contact undo via swipe delete with 'Added by' as secondary text.
- API: inbox mark RPC (InboxMarkSchema in packages/contracts/src/inbox.ts); contacts.delete/linked.
- Visual check path: rakazo://inbox Important tab, long-press a row: no mark menu.
- PRs: #465 #496

### G-15 Navigation entry to people pages (Contacts, Investors, Fundraising from sidebar pages) (People, missing, size S)

- On Expo today: Home has no Pages section, so new people screens would have no entry.
- Phone story: Maya expects the pages she pinned on her laptop to appear on her phone.
- Native pattern: 'Pages' section on Home driven by sidebarPages.list, rows pushing Expo Router routes.
- API: rpc sidebarPages.list
- Visual check path: rakazo:// Home: no Contacts, Investors or Fundraising rows.
- PRs: #877 #874

### G-16 Track a thread (Chief's Open work) (Mail, missing, size S)

- On Expo today: No track call; mail-row-menu.tsx offers Archive only.
- Phone story: Maya flags a thread she is waiting on so the Chief keeps it in Open work.
- Native pattern: Row context menu and toolbar toggle Track/Untrack, badge on tracked rows.
- API: inbox/track, inbox/untrack {messageId}; needs a tracked flag in list data.
- Visual check path: rakazo://inbox, long-press a row.
- PRs: #868

### G-17 Open in Gmail (Mail, missing, size S)

- On Expo today: No link out from the message screen or chat mail cards.
- Phone story: Maya opens the thread in the Gmail app for labels or long attachments.
- Native pattern: Header/context item using Linking.openURL (googlegmail:// with https fallback); also on the chat mail thread card.
- API: No RPC; build URL from thread ids.
- Visual check path: rakazo://inbox, open a message.
- PRs: #883

### G-18 Watch a connected app (connector watch kind) (Unattended, partial, size S)

- On Expo today: lib/routine.ts line 54 calls watchHost(routine.watch.url) for any watch; a connector watch has no url, so the line may be blank or fail. Code confirmed; on-device result unverified.
- Phone story: Maya's bot watches Mercury; she expects 'Watches Mercury'.
- Native pattern: Branch on watch.kind; show connector name. Creation stays in chat.
- API: WatchSpecSchema (page | connector).
- Visual check path: rakazo://routine for a connector-watch routine.
- PRs: #866
- Verified in lib/routine.ts.

### G-19 Artifact share links (create, revoke) (Unattended, partial, size S)

- On Expo today: artifact.tsx Share sends the local file via the share sheet; no revocable link.
- Phone story: Maya links a client to a report and revokes it later.
- Native pattern: Header menu 'Create link' (copy and share sheet) and 'Revoke link' with Alert.
- API: artifactShares.get/create/revoke.
- Visual check path: rakazo://artifact header Share.
- PRs: #857

### G-22 Search and Source filter on Company lists (Company, missing, size S)

- On Expo today: company.tsx has no search, filter or sort.
- Phone story: Maya finds one of 80 people by typing part of the name.
- Native pattern: headerSearchBarOptions plus header menu (Source, Sort); move company-list.ts to packages/core.
- API: Client side on company/page.
- Visual check path: rakazo://company?view=people.
- PRs: #886

### G-27 Failed count chip and filters/sorts (Data room, partial, size S)

- On Expo today: Rows show red status; no failed count, filter or sort.
- Phone story: Maya jumps to failed files and retries.
- Native pattern: Header menu (Status, Type, Source, Sort) and an 'N failed' pill.
- API: dataRoom/items/list (confirm schema).
- Visual check path: rakazo://data-room.
- PRs: #916 #882

### G-28 Chief delegate wait notice and pending/answered state (Chat, partial, size S)

- On Expo today: Sent/received show as centered chips; no waiting notice or pending marker.
- Phone story: Maya wants 'Waiting on Finance, 2 min'.
- Native pattern: Status row in the footer beside WorkingIndicator; move delegate-wait.ts into packages/core.
- API: Derived from thread messages.
- Visual check path: Chief chat with an unanswered delegation.
- PRs: #914

### G-29 Calendar views: Day, 3 days, Month, Schedule; prev/next/Today; month grid with picked-day list (Calendar, missing, size M)

- On Expo today: Not available; no view code in apps/mobile.
- Phone story: Maya wants to glance at the month to find a free afternoon, then tap a day to see its items.
- Native pattern: Native segmented control (Schedule default, Day, 3 days, Month) on the Calendar screen. Month grid with dots for days with items; tapping a day lists it below. Keep view and date in router params.
- API: Same calendar.agenda; only the from/to range changes (add one day of slack each side, as web does).
- Visual check path: Once built: rakazo://calendar?view=month. Today: rakazo://company Calendar segment.
- PRs: #897 #899 #902

### G-30 Contacts list (kind filter, sorts, photos, add/edit/delete) including Investor and Board kinds (People, missing, size M)

- On Expo today: No contacts route in apps/mobile/app and no contacts call in lib/api.ts (grep confirmed). Contacts exist only as inbox sender names. Agents can add contacts in chat but Maya cannot browse, fix or delete one.
- Phone story: Maya, walking into a meeting, finds the investor, checks email and organization, fixes a typo, taps to email.
- Native pattern: Screen 'contacts': large title, headerSearchBarOptions, kind filter, sort menu, swipe delete with native alert, '+' item opening a native form sheet. The Investors and Board tabs are this list with kind preset.
- API: rpc contacts.list({kind?}), contacts.save, contacts.delete, contacts.linked; ContactSchema in packages/contracts/src/contacts.ts.
- Visual check path: No contacts entry in Home or Settings. Nearest list: rakazo://data-room.
- PRs: #877 #885 #887 #874 #465 #496

### G-31 Contact page (related mail, meetings, documents, SAFEs) (People, missing, size M)

- On Expo today: No contact page; sender names in inbox-message are not tappable.
- Phone story: Maya taps an investor and sees recent mail, meetings, documents and any SAFE.
- Native pattern: Pushed 'contact' screen with grouped sections linking to inbox-message and data-room-item; Edit opens the form sheet; make the inbox sender a link when the email matches.
- API: contacts.detail({id}) -> ContactDetailSchema.
- Visual check path: rakazo://inbox, open a message, check the sender is not tappable.
- PRs: #877

### G-32 Context panel while reading (person facts, summary) (Mail, missing, size M)

- On Expo today: inbox-message.tsx shows headers and body only. Ask agent is a partial workaround.
- Phone story: Maya opens a mail from an unfamiliar investor and wants to see who they are before replying.
- Native pattern: Native formSheet (medium/large detent) from a header person button: contact, recent mail, meetings, to-dos, then an AI summary that loads after the facts.
- API: inbox/personContext, inbox/personSummary.
- Visual check path: rakazo://inbox, open a message: no person button.
- PRs: #911

### G-33 Review with AI for attachments (Mail, partial, size M)

- On Expo today: Attachments can be previewed or shared (inbox-attachment.tsx) but there is no review action.
- Phone story: Maya wants an AI review of a 30-page contract PDF without downloading it.
- Native pattern: 'Review with AI' action in the attachment header opening a sheet with shimmer then result text.
- API: inbox/reviewAttachment (nothing stored).
- Visual check path: rakazo://inbox, open a message with an attachment.
- PRs: #880

### G-34 Routines that watch a page: edit, quiet, pause/resume, list (Unattended, partial, size M)

- On Expo today: routine.tsx is read-only (Watches host, Checked/Changed, paused reason). No routine list, create/edit, quiet toggle, pause or test run.
- Phone story: A watch routine paused for flapping; Maya wants to see why and resume it.
- Native pattern: Native Switch rows (Active, Quiet), Remove via Alert, Run now; routines list in bot-settings; form sheet for create/edit.
- API: routines.list/update/testRun/history/create/remove.
- Visual check path: rakazo://routine?botId=<id>&routineId=<id>: no toggles.
- PRs: #859

### G-35 Routine run history and test run (Unattended, missing, size M)

- On Expo today: routine.tsx shows the last-run line only; no history or Run now.
- Phone story: A quiet watch ran overnight; Maya wants to see what it decided.
- Native pattern: History section (cursor paged) with status symbols; nav button 'Run now'.
- API: routines.history({routineId,before?}); routines.testRun.
- Visual check path: rakazo://routine, scroll below Prompt.

### G-36 Credentials with last used and needs attention (Unattended, missing, size M)

- On Expo today: bot-settings.tsx has model credentials only; no bot secrets list.
- Phone story: A push says a vendor login needs attention; Maya sees the flag and removes the credential.
- Native pattern: Credentials grouped list: site, 'Last used 2d ago', warning when needsAttentionAt; Remove with Alert; adding a secret stays on web.
- API: botSecrets.list/put/remove.
- Visual check path: rakazo://bot-settings?botId=<id>.
- PRs: #856

### G-37 Privacy controls: erase, export, exclude person, visibility (Company, missing, size M)

- On Expo today: No privacy screen in app/company*.tsx.
- Phone story: Maya excludes an ex-employee from Company on her phone.
- Native pattern: Header action menu opening a grouped settings screen with switches, exclude-person row, destructive Erase with Alert, Export via share sheet.
- API: company/privacy, excludePerson, visibility, erase, export.
- Visual check path: rakazo://company: no header menu.
- PRs: #852

### G-38 Burn breakdown tabs (Finance, missing, size M)

- On Expo today: Not available.
- Phone story: 
- Native pattern: Segmented control over a grouped list.
- API: finance/burn, month
- Visual check path: No route.
- PRs: #867

### G-39 Transactions: search, filters, sorts, receipt (Finance, missing, size M)

- On Expo today: Not available.
- Phone story: Maya finds a charge and opens its receipt.
- Native pattern: List with search, filter and sort menus; receipt via download and share sheet.
- API: finance/accounts, account, transaction, receiptUrl
- Visual check path: No route.
- PRs: #888

### G-41 Search, filter and sortable headers across lists (Lists, partial, size M)

- On Expo today: Only Artifacts has search and bot filter; Data room has search; no sorts on any mobile list.
- Phone story: Maya wants one way to search, filter and sort long lists.
- Native pattern: Header search plus header menu via menu-picker.tsx; move company-list.ts, contract-list.ts, session-list.ts into packages/core.
- API: Client side or existing paged RPCs.
- Visual check path: rakazo://artifacts vs rakazo://company?view=people.
- PRs: #884-#889

### G-44 GTM page: plan, channels, post queue, approvals (GTM, missing, size L)

- On Expo today: No screen; approving a queued post needs chat cards or web.
- Phone story: Maya approves tomorrow's posts from her phone.
- Native pattern: Segments Plan / Queue / Channels; queue with swipe Approve/Reject.
- API: gtm/overview, gtm/queue
- Visual check path: Home > GTM agent chat.
- PRs: #288-#300

### G-45 Sign in with a passkey (Chat, missing, size L)

- On Expo today: sign-in.tsx offers password and SSO only; no passkey code (grep confirmed). Passkey-only accounts cannot sign in.
- Phone story: Maya taps Sign in with a passkey and approves with Face ID.
- Native pattern: Native button using the system passkey sheet; gate on the server passkey capability; needs webcredentials entitlement.
- API: Better Auth passkey plugin; capabilities flag passkey.
- Visual check path: rakazo://sign-in.
- PRs: #910
- Verified: no passkey reference in apps/mobile.

### G-63 Teach a task: saved taught skills list, test run (Unattended, missing, size M)

- On Expo today: Recording needs a desktop pointer and keyboard, but chat settings shows only plain skill toggles. There is no taught-skills list and no note pointing to the web (seen on simulator).
- Phone story: Maya sees which taught tasks a bot knows and when each last ran.
- PRs: 


## Degrades safely

- G-40 Import, upload, rename, move, delete (P2): Mobile is read only; no pointer to web.
- G-42 Typed UI blocks in replies (render_ui: table, stats, cards) (P2): Flattened to text via uiBlockText (lib/api.ts), no content lost, structure lost.
- G-43 Page agents grouped above chats (P2): Chat list has no Pages group; page agents appear where the roster puts them.
- G-49 Urgent mail as a table (P3): Table is a wide layout; the phone shows the Important pile with triage badges. Needs-reply grouping match not verified.
- G-50 Email chat notes routed to the owning agent (P3): Routing is server side; mobile uses the same inbox/askAgent entry. Not traced; verify on a simulator.
- G-51 Approval toasts (P3): Toasts are web only; the phone uses push and local notifications that open the thread.
- G-64 Tour stops for routines and approvals (P3): No tour on mobile; the tour anchors desktop sidebar elements.
- G-65 Devin sessions page (P3): No screen by design (docs/devin/ux-flow/round-2.md); a Devin push opens the session link.
- G-67 Imports: start, consent, scope (P3): Empty states say to start an import on web or desktop.
- G-69 Team health page (P3): Web and desktop only by explicit decision (available:false).
- G-70 Projects page and project bot (P3): Plan only; no web page in this checkout either.

## Present

- G-20 Background runs list in Activity: Bell toggles Activity mode; runs/list with status labels, same as web. Verified: lib/activity.ts.
- G-21 Bot check-in routine (cadence): bot-settings.tsx sets cadence with checkIn/set. Verified: bot-settings.tsx line 115.
- G-23 Company map overview, people, organisations: company.tsx CompanyMap lists overview and people. The Home Company row is gated by mobileCompanyAvailable(); the company template has available:false in packages/contracts/src/sidebar-pages.ts, so the row is hidden (confirmed from code) while the route works. Decide whether to enable it. Verified: lib/company.ts and sidebar-pages.ts.
- G-24 Review queue: CompanyReviewList and company-fact.tsx handle confirm/reject/match. 
- G-25 Fact detail: company-fact.tsx shows evidence, edit, confirm, reject. 
- G-26 Browse, search, open, preview, share: data-room.tsx and data-room-item.tsx cover folders, search, preview and share. Verified: files exist.
- G-52 Bot-built tools (artifacts) list and open: artifacts.tsx and artifact.tsx list and render artifacts; no table sort or filter. Verified: files exist.
- G-53 History timeline: company.tsx view=history. 
- G-54 Company calendar (month agenda): CompanyAgenda with month navigation; legal rows show an open-on-web alert. 
- G-55 Import progress: pause, cancel: CompanyProgress supports pause and cancel with confirmation. 
- G-59 Message and card layout gap: Cards are separate native views; spacing equality unchecked. 
- G-60 Integrations brand logos: connector-icon.tsx uses catalog logo URL, letter fallback; web uses bundled marks, so a minor mismatch. 
