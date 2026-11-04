# CRM pipeline: plan

Status: plan, stories and images only. Nothing here is built. Every name, address, amount and date in
the mockup is invented. Code references are to `origin/main` at e32a35fa2. Three reviews and a visual audit in `docs/crm-pipeline/ux/`
changed this version; "Rejected review findings" lists what was not taken.

## Why

A founder who is raising works from a long call list, and the Fundraising page cannot hold it: a row
has a stage, a check size and a next step, with no calls, follow-up date or referrer. This plan makes a
small CRM: firms on a list, linked to contacts, each with a status, a follow-up date and one timeline.

## Mockup

`apps/web/src/pages/CrmPipeline.stories.tsx` (Storybook: Fundraising/CRM pipeline mockup) uses real
`Table`, `useListParams`, `Dialog`, `Sheet`, `Popover`, `Command`, `RoundCard`, `AttentionStrip` and
`SafeList`. Rendered in `docs/crm-pipeline/` at 1440, 1100 inside a shell, 768, 375 and dark at 1440:
`crm-*.png`, each named for its screen.

## Words

- **Prospect:** anyone on the pipeline. Column, search, page, card: "Add 96 prospects".
- **Investor:** only someone with a stake: the Investors page, kind `investor`, the party on a SAFE.
  The Investors agent keeps its name.
- **Firm** stays out of the interface. **Contact** is a person in Contacts. GTM rows are **Leads**.
- Existing copy to change: "Add the investor's email first." becomes "Add an email first."

## What the code does today

- **The pipeline is contact columns.** `stage`, `checkSizeCents`, `nextStep`, `roundId` and
  `mercurySentAt` sit on `contacts`. The overview and `saveProspect` only see `kind: "prospect"`.
- **An investor contact cannot be on the pipeline.** Changing `kind` away from `investor` ends portal
  access and deletes shares (`writeContact`), so nothing here may change `kind`.
- **`importProspects` (merged) has three gaps.** It matches names only against prospects, so a saved
  investor with no email is duplicated; it skips an email match on another kind, so that investor never
  arrives; and `matchKnown` takes the first name match, which is a guess when several contacts share it.
- **Two writers.** `ContactDialog.tsx:185` sends `stage`, `checkSizeCents` and `nextStep` on every save of
  a prospect, so fixing an email could overwrite pipeline fields.
- **Agents cannot change a stage today.** `contact-tools.ts:79`: "the founder's to change".
- **Calendar can invite, from agents only.** `calendar_create_event` takes `attendees`, `sendUpdates`
  (default `none`, so attendees hear nothing unless set) and `addMeet`. It always asks, even though
  `calendar_changes` defaults to allow. `account` is required with several connections. A replay with one
  key gets a 409 and `alreadyCreated`. No RPC writes to Calendar. `CalendarApiEmulator` runs in the demo.
- **GTM has no people list.** `GtmPlan` and `GtmChannels` show tasks. Legal has its own tables.
- **Fundraising is web only.** Neither `apps/ios` nor `apps/mobile` has a screen for it.
- **Real lists are messy.** One was checked read-only; nothing from it is in this repository. Each row
  is a firm; one free-text cell names several people, rarely with an email; check size is a free-text
  range; the intro path is free text, often repeated across rows; few rows match saved contacts exactly.

## 1. Data model

**Recommendation: one row per firm, as a new record that links to zero or more contacts.**

```
pipeline_records
  id, spaceId, userId, pipeline ("fundraising"), name, normalizedName
  status, statusBeforePassed, interest (in|maybe|out|null)
  referredByContactId (set null on delete)
  amountCents, nextStep, nextCallAt, nextCallHasTime, waitingSince, roundId
  details Json   [{label, value, source: list|agent|owner, url?, at}]
  group, listOrder
  unique (spaceId, userId, pipeline, normalizedName)

pipeline_record_people
  recordId, contactId, pipeline, isPrimary
  unique (spaceId, userId, pipeline, contactId); at most one primary per record

pipeline_events
  id, recordId, kind (call|note|status|interest|invite|import), actor (user|botId), at, payload Json

pipeline_imports
  id, spaceId, userId, pipeline, rows Json, status, cardMessageId
```

Contact references use the composite `(id, spaceId, userId)` key `company_entities` uses. All tables get
the tenant RLS policies of `contacts`. State is in Postgres and every query is scoped to space and user.

- **`pipeline_record_people` still fits records with no people.** Zero rows means no named person, so
  the table needs no change for that. It also fixes a review finding: a contact can sit in one record per
  pipeline, so `toContact` has one answer; the review card asks when a match is already in another record.
- **A firm with no named person is a record with no contact.** No contact is invented for it. Add person
  creates the first contact, who becomes primary. Deleting the last contact leaves the record.
- **Kind.** New people on a list are `prospect`, which keeps them off the Investors page. A matched contact
  keeps its `kind`, portal access and shares.
- **Rejected:** a `firms` table; more contact columns; and `company_entities`.
- **Referred by** links to a contact's page.
- **Possible amount** is a number the owner sets. It is not in the import, because it feeds Pending.
- **Fund details** are per field with a source. `agent` requires a `url`, or the server refuses it. The
  table shows "Stage and check" when that field exists; a filter on source uses that field.
- **Priority.** A list's priority column gets no column. Decided: its tiers go in `group`
  (Wave, a filter), and its row order goes in `listOrder`, which breaks ties when sorting. Nothing
  else is stored.

### One writer

`savePipelineRecord` is the only code that writes pipeline fields.

- Remove Stage, Check size and Next step from `ContactDialog` and `ContactDetail`. This ends the clobbering
  at `ContactDialog.tsx:185`. The contact page shows one link: "Fundraising: Sample Street Capital · Intro
  made". The Stage filter leaves the Investors contact tab.
- Any write that leaves a contact as kind `prospect` with no fundraising record creates a one-person
  record: the Contacts page, `contacts_add` and Add prospect. Add prospect uses the import's match function
  and opens the existing record on a conflict.
- `toContact` keeps returning `stage`, `checkSizeCents`, `nextStep` and `roundId` from the record until S11
  removes them. No Swift code reads them. Stage is an internal roll-up, never displayed or written.
- Backfill: one record per prospect. Stage maps to the first status in its group. Contact notes become one
  `note` event and stay on the contact. A "Wave n" `nextStep`, which the merged Investors agent prompt tells it to
  write, moves to `group`, and S1 removes that instruction. S5 removes `amountUsd` from what the agent passes.

**Agent changes need approval (decided, reverses `contact-tools.ts:79`).** `pipeline_record_save` is a
deliberate change: today agents cannot touch a stage. Every agent change asks and cannot become always-allow,
because Committed changes Pending. Saving everything but Committed was considered and rejected: it would
add a second rule for a small gain, since the card already shows the change.

## 2. SAFEs (before S1)

The current page's SAFE behaviour stays, and every SAFE path assumes one contact of kind `prospect`. These
rules must hold before records replace that assumption. Story: `SafeStates`.

**What stays on the page:** the Mercury line, Ask Investors agent, the Attention strip, the round card
and the SAFEs section (`AttentionStrip` and `SafeList`, unchanged).

**On a row**
- Committed shows Send SAFE in the row's action slot, the row's only solid fill.
- It opens `SafeDialog` for the primary person, with a person picker when the firm has several. With no
  email the error is "Add an email first."; with no person it opens Add person.
- Waiting replaces the row's person line with "Waiting for Mercury · Nov 2", and the action menu holds Open
  Mercury and Not sent. It moves to the record as `waitingSince`, since the row is the firm.

**Active SAFE: per round and per record.** A record has an active SAFE when any of its people has one in
that round. A SAFE with no round counts only when created after the record.
- `saveSafe` and `markWaiting` refuse on that rule, not on any SAFE the contact has ever had. An existing
  investor with a funded SAFE from an old round can join the list and get a new one.
- `prospectOf` stops requiring kind `prospect`; it accepts a contact on a fundraising record.
- Mercury's sync (raw SQL at `safes.ts:266`) and `assignSafe` (`safes.ts:361`) match any person on a
  fundraising record, read the round from the record, and clear `waitingSince`.

**Hidden rows.** A record leaves the default list when it is Passed or has an active SAFE in the open round;
it returns if every SAFE is canceled or expired. "Passed · n" at the list's end opens Passed.

**Pending.** Committed records in the open round count at their amount, except those with an active SAFE,
which count at the SAFE's amount and status. Required test: a two-person firm, Committed, whose SAFE attaches
to the second person, counts once. A record with no people counts at its amount.

**Undo.** Undo after Out from a Committed row keeps today's condition: it is withheld when restoring would
attach the row to a different round (`Fundraising.tsx:158`).

**The prospect page** lists SAFEs of its people.

## 3. Import and contacts

**One import, one card, one approval.** `pipeline_import_stage` adds up to 60 rows per call to one import; the
total per import is capped at 1,000. `pipeline_import_review` posts the card. Reviewing again replaces the open
card. A row has a fixed schema with no kind, id, round or amount: firm, people (name, email), group,
order, next step, details, intro path.

**Matching,** for each person, stopping at the first rule that decides:

| Rule | Result |
| --- | --- |
| Same email, any kind | That contact. Its kind stays |
| Same normalized name and organization, exactly one | That contact |
| Same normalized name, other organization, or several matches | Ask |
| Match is already in another record of this pipeline | Ask |
| No email, and the firm has other saved people, name differs | New contact |
| Nothing | New contact |

**Referrers** use the same rules, once per distinct name. The intro path is a staged field. The agent extracts a
referrer name only when one is clear; the free text stays in Fund details as "Intro path".

**Card** (`crm-reconcile-card.png`, `crm-reconcile-result.png`)
- Title "Add 96 prospects to Fundraising" and "Saved contacts are not overwritten."
- Questions are stated: "Which contact is this?" and "Who made these introductions?" Nothing is pre-answered.
  The button stays disabled, with "2 left to choose" beside it.
- One noun per count: "84 new contacts", "23 contacts already saved", "7 prospects with no person yet".
  Each list expands.
- Result: "Added 95 prospects to Fundraising", any failed rows and "View in Pipeline".
- Re-running adds nobody and overwrites nothing.

**Picker** (`crm-referred-by-picker.png`, `crm-referred-by-create.png`). Matches first; Create only when none
match, so Enter cannot create a duplicate. The same picker is on the table, the phone sheet and the prospect page.

## 4. Pipeline table

**Default columns:** Prospect, Status, Interest, Last call, Next step, Next call, and an unlabelled action
slot. Columns adds Referred by, Possible amount and Fund details. Decided: remember the choice in
`localStorage`, like the hide-amounts preference's local copy, since it is a per-viewer convenience.

**Filter and sort reach every column, behind one Filter control**, with Sort by at its top. Column headers
sort what is shown. All of it uses `useListParams`, so a link or a reload shows the same list.

| Column | Sort | Filter (URL param) |
| --- | --- | --- |
| Prospect | Name | Search, plus Wave (`wave`) |
| Status | Status order | `status` |
| Interest | In, Maybe, Out | `interest`: each option, or Not set |
| Last call | Date | `last`: Never, Past 7 days, Older |
| Next step | Text | `step`: Has a next step, None |
| Next call | Date | `next`: Overdue, Today, Next 7 days, Later, Not set |
| Referred by | Name | `by`: each contact, or Nobody |
| Possible amount | Amount | `amount`: Not set, Under $100K, $100K–$500K, Over $500K |
| Fund details | Text | `details`: From your list, Researched, Empty |

**Due now** sits outside Filter: one list merging overdue and today, oldest first (`due=1`).

**Table recipe** (from `HoldingsTable`)
- Container queries on `@container/bd`, never the viewport. The list layout is below 760 px; Last call shows
  from 900, Next step from 1040 and optional columns from 1240.
- Row height at most 52 px (target 44), with no reserved empty second line. Sticky header.
- "No matches" with "Clear filters".
- One blank-cell rule: a muted dash. On hover or focus, an editable blank shows its action ("Set date", "Add").
- Right-aligned amounts; `title` on truncated text.
- A word beside overdue dates ("Overdue"); today reads "Today".
- At most one solid fill per row. Interest uses a mark and a border, not a fill: In is green with a check, Out
  is grey with a cross, so they differ without reading.
- Phone controls at least 44 px.

**Statuses:** Not reached, Intro requested, Intro made, Meeting booked, Met, Diligence, Committed, Passed.
Spoke, Left message and No answer are outcomes on a logged call, shown under Last call: "Left message Nov 4".

**Events move status forward only, never backward.** A prospect stays at Not reached through any number of call
attempts until the owner actually speaks. Logging Spoke moves anything before Met to Met. Left message and No answer
leave status alone. Sending an invite moves anything before Meeting booked to
Meeting booked. A past meeting with a record person moves it to Met. Manual choice stays available.

### Interest

In, Maybe and Out are the investor's stance, set in the cell. Interest never touches money.

- Out moves to Passed and clears the next call in one write, with one toast naming both changes: "Sample
  Street Capital: Interest set to Out, status moved to Passed", and "Undo", which restores all of it.
- Passed sets Out; Committed sets In. Leaving Passed clears Out. Untoggling Out, or pressing In or Maybe on a
  Passed row, returns to `statusBeforePassed`.

| Input | How it works |
| --- | --- |
| Mouse, keyboard, wide touch | Three toggles always in the cell; each is a tab stop |
| Phone web | A pill on the row ("Maybe", or "Set interest"); the "⋯" sheet has the toggles too |
| iPhone | `.swipeActions` for interest, native menu for status |

### Log call

**The one entry point after a call** (`crm-log-call.png`, `crm-log-call-phone.png`). "Log" appears on row hover
or focus, always on touch. On a phone it is the row sheet's primary action; on the prospect page it is the
header's. It holds outcome buttons, an optional note, quick next-call choices and Save.

"Left a message, try again Thursday" takes four actions: Log, Left message, Thu, Save.

- Choices: the next three working days by name, Next week, Pick date, None.
- **Log must not drop a row off the due list.** The default is "Keep Nov 3": the old date stays, so the row
  stays due until the founder picks a date or chooses None. The earlier rule that logging clears the date is
  removed. With no date the default is None.
- It writes one `call` event and Last call, moves status per the rule above, and shows one toast with Undo.
- A logged call and a recording of the same person on the same day read as one timeline entry, with the outcome
  and the recording link.

### Next call and Send invite

Next call opens a popover with native date and time inputs. "Send invite" needs a date. It is in the popover,
the phone sheet and the prospect page, and the dialog starts with that date.

**Recommendation: a new RPC, `pipeline.invite`, behind a dialog. Agents get no invite tool.** The click and the
confirm are the approval. The dialog edits title (default "Call: {prospect}"), date, time, length, attendees and
the Meet switch, with "From" when there are several accounts. The button names the count.

- **Server.** Attendees must be emails of the record's people; a typed address saves to that contact first. It
  calls `calendarToolFromTool("calendar_create_event", …)` with `sendUpdates: "all"`, the chosen `account` and
  an `idempotencyKey` from a client id, so a double click gives one event.
- **Invited** means an invite exists for this exact next call date. Changing the date removes the word and offers
  the invite again. Updating the existing event can wait.
- **No calendar.** The dialog says "Connect Google Calendar to send an invite. The next call stays on this row."
- **No email.** That person cannot be ticked until a valid address is typed. An address is never guessed. A
  researched one shows "Researched" and starts unticked.
- **Failure.** A clean failure keeps the dialog open. "Outcome is unclear" logs "Invite may have gone out. Check
  your calendar." and does not retry.

## 5. Prospect page

Route `/app/fundraising/:id` (S7 adds it; routes are exact today). Header: name, Log call, Ask agent, with no
unlabelled Edit. Status, Interest, Possible amount, Referred by and Send invite are edited in place.

- **Top:** last call with its note, then next step and next call.
- **People:** each links to the contact page, whose Back returns here. Add person. "No people yet" when empty.
- **Timeline:** calls, meetings, mail, notes, changes, invites, newest first. Calls show "Open recording". Mail and
  meetings are read live through the `contactDetail` queries, so a deleted email leaves too.
- "Follow-up: You" is removed; records are per user, so it has one possible value.

### Left out on purpose

Deal scoring; automations; a custom fields UI; editable statuses; a board view; team assignment; email from the
row; reports; contact merging; overdue notifications; bulk edit; a phone number field; wave progress counts. Each
can come later without changing these tables.

## 6. Reuse

**Decision: no `PIPELINES` config.** One caller with one configuration is a constant, and the first draft's shape
was already wrong for GTM. Fundraising uses plain constants and `t` strings.

**Kept, because adding them later costs a migration:** the neutral table names and the `pipeline` column, which
also carries the agent's scope rule. `GtmLeads` passes story-only words to the mock table; it is an example, not a
proof.

**S10 decides GTM with a real case:** whether Last call fits email-first outreach, whether Source and Referred
by overlap, and any config then needed. Fit is the founder's view and never changes status: No fit does not
mean Lost. Leads get kind `other`, not `customer`, and not `prospect`, which would create a Fundraising record.

**Surfaces.** Web and Electron get everything. Native iPhone (S9) gets the list, swipe actions, native date picker,
confirm sheet and timeline. Expo gets no screen: Fundraising is not there today and the native app replaces it
(`docs/ios-native`).

**Agents.** The server picks the pipeline from the agent's spawn key, never from model input.

| Tool | Does | Approval |
| --- | --- | --- |
| `pipeline_read` | Records with filters; replaces the prospect part of `fundraising_read` | None |
| `pipeline_import_stage` | Holds rows, changes nothing else | None |
| `pipeline_import_review` | Posts or replaces the review card | Asks, one card per import |
| `pipeline_record_save` | Status, interest, next step, next call | Always asks |
| `pipeline_details_save` | Researched fund details, `url` required | Asks, one card per call |
| `pipeline_log` | Adds a call or a note | Asks |

## 7. Slices

Each is one PR, hand-checked in `pnpm demo:up`.

| # | Scope | Regression test | Hand check |
| --- | --- | --- | --- |
| S1 | Tables, RLS, backfill, `toContact` from records; one writer; record on any prospect save; `ContactDialog` and contact page changes | Totals match after backfill; backfill twice adds nothing; email edit leaves status; prospect saved from Contacts appears; cross-user refused; a contact in two records refused | Page and totals unchanged; edit a contact's email |
| S2 | SAFE rules: per round and record, Mercury gates, `waitingSince`, hidden rows | Two-person Pending counts once; old-round investor can get a new SAFE; sync matches a second person; no-person record counts | Send SAFE, Mercury mock, row leaves and returns |
| S3 | Table: columns, Columns menu, Filter, Due now, interest, Undo, next call, picker, recipe | URL round trip; Out and Undo restore all; `overlaps` empty at 640, 768, 900, 1100, 1440 in a shell; row height at most 52; header stays when scrolled | Same widths; keyboard; phone |
| S4 | Log call panel and status rule | Forward only; Keep leaves the row due; None clears; Undo | "Left a message, try again Thursday" in four actions |
| S5 | Reconcile: stage, match, referrers, one card, result | Each match rule; replaces card; kind and shares unchanged; re-run adds nobody; amount refused | Invented sheet to the agent, answer, re-run |
| S6 | `pipeline.invite` and dialog | `sendUpdates: "all"`; replay gives one event; no calendar; no email cannot tick; unclear not retried; outsider attendee refused | `CalendarApiEmulator`; event and timeline entry |
| S7 | Prospect page, route, timeline, Add note | Merge order; recording and logged call merge; other user's mail never appears | Open a row; follow a recording; contact Back |
| S8 | Agent tools, prompt, researched details | Always asks; `url` required; pipeline fixed by spawn key | Agent researches a prospect |
| S9 | Native iPhone | Portable package tests | Simulator |
| S10 | GTM Leads, with the decisions in section 6 | Fundraising unchanged; Fit moves nothing | Add a lead, send an invite |
| S11 | Drop old contact columns and contract fields, after one release | Sync's raw SQL has no old column | Page unchanged |

S4, S5, S6 and S7 can run in parallel after S3. A check the demo cannot provide, such as a real Google invite reaching an
attendee, is stated in the PR.

## New strings

Hover, focus or click reveals most. The resting table adds column names and values.

- Table: "Prospect", "Search prospects", "Interest", "In", "Maybe", "Out", "Not set", "Last call", "Next step",
  "Next call", "—", "Log", "Add", "Invited", "Set date", "Overdue", "Today", "Due now · {n}", "Filter", "Filter · {n}",
  "Columns", "Sort by", "Any", "No matches", "Clear filters", "Passed · {n}", "Waiting for Mercury · {date}",
  "Send SAFE", "Open Mercury", "Not sent", "Referred by", "Possible amount", "Fund details", "From your list",
  "Researched", "Empty", "Set interest", "Spoke", "Left message", "No answer", "Overdue: {date}", "Next call {date}".
- Statuses: as listed in section 4. Filter options: section 4.
- Toasts: "{prospect}: Interest set to Out, status moved to Passed", "Call logged", "Call logged. {prospect} moved to
  Met", "Undo".
- Accessible names: "Interest: {prospect}", "Interest of {prospect}: {value}", "Status of {prospect}: {value}", "Add who
  referred {prospect}", "Log a call with {prospect}", "Next call with {prospect}", "Actions for {prospect}", "Invite
  {person}", "{person} has no email", "Email for {person}", "Note", "Next call date", "Attendee email", "Actions".
- Log call: "Log call", "Log call: {prospect}", "Outcome", "Note", "Keep {date}", "Next week", "Pick date", "None",
  "Save", day names.
- Next call and picker: "Time", "Clear", "Search contacts", "No contact found", "Create “{name}”".
- Invite: "Send invite", "Title", "Date", "Length", "30 min", "1 hour", "Attendees", "No email: add one", "Add a person's
  email", "From", "Google Meet link", "Cancel", "Send invite to {n} people", "Send invite to 1 person", "Call: {prospect}",
  "Connect Google Calendar", "Connect Google Calendar to send an invite. The next call stays on this row.", "Invite may
  have gone out. Check your calendar."
- Prospect page: "Next", "People", "No people yet", "Add person", "No email", "Stage and check", "Researched {date} ·
  {site}", "Timeline", "Add note", "Open recording", "Send a new invite", "Invite sent: {title}", "Status: {a} → {b}",
  "Interest: {value}", "Added from your list", "{person} matched a saved contact by email", "No person named", "From this call", "{agent}, approved by you",
  "Logged by you", "You", "Spoke with {person}", "Fundraising: {prospect} · {status}".
- Review card: "Add {n} prospects to Fundraising", "Saved contacts are not overwritten.", "Which contact is this?", "Who
  made these introductions?", "referred {n} prospects", "New contact", "Skip this row", "Leave Referred by empty", "{n} new
  contacts", "{n} contacts already saved", "{n} prospects with no person yet", "and more", "{n} left to choose", "Add {n}
  prospects", "Added {n} prospects to Fundraising", "{n} rows failed", "Could not save:", "Nothing else changed.", "View in
  Pipeline".
- Copy changed: "Add an email first."
- GTM (S10): "Leads", "Lead", "Search leads", "Add lead", "Fit", "Set fit", "Good fit", "No fit", "Deal value", "Company
  details", "Source", "Inbound", "Outbound", "Referral", and its statuses.

## Rejected review findings

| Finding | Why not |
| --- | --- |
| Seven statuses with "Contacting" (daily) | Owner chose eight, starting at Not reached |
| Rename In and Out to Likely and Pass (daily) | Owner's words; marks and the header carry the meaning |
| Hide Interest on Passed and Committed rows (daily) | Inconsistent control; Passed rows leave the default list anyway |
| Hide field changes in the timeline by default (daily) | Eight mixed entries read fine; the Type filter was also dropped until timelines grow |
| Collapse the round card on a phone (daily) | The first rows are on screen at 375 x 812, see `crm-pipeline-phone.png`; the card is existing and shared |
| Bulk edit, wave progress count, phone number (daily) | Left out for now; contacts have no phone field to show |
| Show time only after a date (daily) | The popover stays small either way |
| Offer Log only when no meeting exists that day (redundancy DP3) | Blocks the one entry point; the two merge at read instead |
| Save everything but Committed without asking (OF3) | Second rule for little gain; all agent changes ask |
| Leads as kind `prospect` (OF2) | Would create a Fundraising record through the one-writer rule; `other` instead |
| Ask only in accessible text on the card (import) | The lead decided the card states its question |
| Change the round dialog (import) | It is existing, and import does not depend on it |
| V16 header hit size, V18 row frame, V19 left edge, V21 spacing | Shared `TableHead`, `TableRow` and `Card` styling; a separate change for all tables |
| Next step and Next call are one idea (daily) | One says what, the other when; both are needed |
| "Invited" should say who and whether accepted (daily) | The timeline says who; acceptance needs calendar sync, left out |
| Last call should cover mail (daily) | The label matches the rule: calls and meetings only |
| V20 no back arrow at wide widths | Matches `PageHeader` across the app |
| V23 popover covers the next row; native date format | A popover covers something; native inputs follow the locale |
| V24 chips shift | No chips remain; filters sit behind one control |

## Decided by the owner

- The first status is Not reached. Spoke moves to Met; Left message and No answer leave status alone.
- A SAFE goes to the primary person, with a picker in the dialog when the firm has several people.
- A SAFE with no round hides a record only if created after the record.
- Columns are remembered per browser. Priority tiers go to Wave and row order is a tie-break, with no column.
- Firm contacts left over from before stay as they are.
- Long Fit labels truncate lead names at 768 (`crm-gtm-768.png`); S10 decides.

## Checked in the mockup

In Storybook with invented data, in a shell with the real sidebar width at 640, 768, 900, 1100 and 1440: no overlaps,
clipped controls or horizontal scroll; rows 49 px; the list takes over below 760; the sticky header stays put with 139
rows open; phone controls at least 44 px at 375. By script: Columns survives a reload; a person with no email cannot
be ticked until an address is typed; Log with Keep leaves the row due; Out removes the row and Undo restores it.

## Not verified

- The mockup runs in Storybook with invented data; no server code exists.
- The width checks used a stand-in shell, not the real app. Dark mode was looked at, not measured for contrast.
- No live invite was sent. The connector requests `calendar.events`; a real attendee receiving it is untested.
- Last call computed on read was not measured. If it is slow, store `lastCallAt` on the record.
