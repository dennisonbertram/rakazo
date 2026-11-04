# Bulk replies: plan

Status: plan only. Nothing here is built. Addresses and names in the mockup are invented. Code
references are to `origin/main` at 6b355a8f6. "Proposal" marks a choice this plan makes; everything
else was read from the code.

## Why

A Customer Feedback Bot on a support mailbox (firewalled, with the per-agent "Allow changes" grant)
answers several customers about one issue. Today that means one card per email, one at a time.

The agent should instead write a separate reply to each customer, in that customer's own thread. The
owner gets one card listing them all, opens or edits any reply, unticks what they do not want, and
presses Send selected. Nothing goes out before that, so Firewall agents can use it. Not in scope: one
message to a mailing list.

## Mockup

`apps/web/src/components/MailReplyBatchCard.stories.tsx` (Storybook: Chat/MailReplyBatchCard
(mockup)). An open row is the real `MailApprovalCard`. Rendered in `docs/bulk-replies/`:
`mockup-review.png` (flagged rows first and unticked), `mockup-editing.png`, `mockup-large.png`
(ticked rows still hidden), `mockup-partly-sent.png` and `mockup-phone.png`.

## What the code does today

- **Parallel sends do not share a card.** `requestApproval` in `executor.ts`: "Only the first saves
  the turn and shows its card; the others wait for that pause." A paused message answers one pending
  `ask` block (`commitAnswerRunInput`, `run-pauses.ts`).
- **Send record.** `mailSend` claims a `ComposeSend` row (`agent:<idempotencyKey>`) from draft or
  failed to pending. Sent and unknown never send again. Retrying reuses the row's Gmail draft.
- **Edited approvals are the person's own send.** `answerEditedMailApproval` denies the pending call
  with a cautious note, sends through compose, stores the outcome, and then enqueues
  `runContinueJob`. The agent reads the note through `resolveDuplicateEffectGate`.
- **Recovery.** `reconcileMailApprovals` settles claims older than `MAIL_APPROVAL_STALE_MS` (2
  minutes). A failed run closes its cards (`closeApprovalCardsInTransaction`). I found no time limit
  on a direct card left waiting.
- **Firewall.** `firewallToolClass` is a closed list. `firewallDraftIsWithinThread` already works out
  a thread's participants from `cachedMailMessage`. The tags in the firewall plan ("New recipient"
  and others) are not on main: the strings appear nowhere in `apps` or `packages`.

## 1. Tool shape

**Recommendation: a new tool, `mail_reply_batch`.**

```
mail_reply_batch({ account?, replies: [{ replyToId, to, cc?, bcc?, subject, body }] })
```

| Option | Result |
| --- | --- |
| New tool (chosen) | One call, one effect, one pause, one card. Every row is known before the card appears. |
| A run collecting `mail_send` calls | The executor has no signal that the model has finished proposing, and each call has its own effect, turn checkpoint and replay. Parallel calls produce sequential cards today. Changing that alters the replay path of every approval. |
| `mail_draft`, then a card over the drafts | A send of a saved draft shows a locked card with no body, and the Carta and Inbox agents refuse `draftId` for that reason. A draft can also change in Gmail after review, which `sendSavedMailDraft` cannot detect. Discarding leaves clean-up work in Gmail, and one row with a new recipient makes `mail_draft` ask for a firewalled agent, which brings back a card per row. |

- **Replies only.** `replyToId` is required on every row, so the tool cannot start a conversation and
  cannot serve as a mailing list. No attachments, as with `mail_send` today.
- **Limit: 20 rows per call (proposal).** It matches `MAX_EMAIL_CARDS` and
  `MAX_PENDING_PER_CONNECTION`, both 20. `MAX_BULK_ARCHIVE` is 50, but an archive can be undone. Over
  the limit the call is refused with a message to split it. Each row keeps `MAX_COMPOSE_BODY`.
- **One account per call.** A reply goes from the address it came to (`inferMailAccount`), and the
  grant checks (`accountsAllowedNow`, `googleWriteOnAgentConnection`) work on one target account. Two
  mailboxes mean two calls and two cards. The account is the named one, or the one the first
  `replyToId` is in. No account picker on this card.
- **Refused before any card, naming the row:** a `replyToId` not in that account's synced mail; two
  rows in the same thread; a thread outside a firewalled agent's support label (same check as
  `mail_get`); a placeholder or a repeat (`mailSendRefusal`, per row); a subject or body that
  `redactSecrets` would change, because the card would then differ from what is sent.
- **Hidden** when the bot's `mail_send` switch is off, and from email thread agents (one thread).

The new name must join every list that names `mail_send`, each with a test: `MAIL_TOOL_NAMES`,
`GOOGLE_BUILTIN_WRITES`, `APPROVAL_REQUIRED_BUILTIN_TOOLS`, `BUILTIN_MAIL_WRITE_TOOLS`,
`EXPLICIT_APPROVAL_BUILTIN_TOOLS`, the `send_email` action type, `OWNER_PEER_WRITE_TOOLS`,
`FIREWALL_ASK_TOOLS`, `HAND_WRITTEN_TOOLS` and `MAIL_APPROVAL_TOOLS`. Missing
`GOOGLE_BUILTIN_WRITES` would be a hole: `accountAllowedIn` returns true for anything not on it, so a
read-only agent could write.

## 2. Approval safety

**Storage (proposal).** One table, `mail_reply_items`: `effectId`, `position` (unique together, so a
replayed call makes no second set), `spaceId`, `userId`, `connectionId`, `replyToId`,
`providerThreadId`, recipients, `subject`, `body`, `seenMessageId` (newest message in the thread at
review), `approvedHash`, `skipped`, `error`. The `ExternalEffect` stays the batch header. Send state
is read from the row's `ComposeSend`, not copied. The `ask` block carries only
`mailBatch: { count, sent, failed, unknown }`, so bodies do not travel in every thread event.

**What the card shows.** Every To, Cc and Bcc as a bare address, never only a display name (the model
writes the name). The recipient line wraps and is never truncated: the first phone render cut off the
flagged address. Subject and first line on the row; the whole body when opened.

**Exact match, per message.**

1. `threads.mailBatch` returns each row with `hash`: SHA-256 of the account, `replyToId`, recipients,
   subject and body (`stableJsonValue`, as `approvalEffectKey` uses).
2. Send selected posts, for each ticked row, `{ itemId, hash, seenMessageId, edits? }`. Edits use
   `MailEditsSchema` without `account` and `send`, checked by `normalizeMailEdits`.
3. In one transaction with the card's claim, the server compares each hash to the stored row, applies
   edits, stores `approvedHash` from the final text, and marks unticked rows `skipped`. Any mismatch
   rejects the whole press, nothing changes, and the card reloads.
4. The worker recomputes the hash right before each send and refuses the row on a difference.

**No standing permission.** The tool is on `EXPLICIT_APPROVAL_BUILTIN_TOOLS`, so no saved Allow, Auto
Review or background run lifts the ask. The card has one action, `deny` ("Discard"); Send selected is
a separate RPC. So no Always allow can exist for any run, tainted or not, and because
`commitAnswerRunInput` rejects an answer not in `actions`, an older client cannot approve what it cannot show. A saved Block still wins: that check
runs before the gate. Firewalled runs show the existing "Firewall" reason.

**Flags, computed on the server** (tool call, card load and press). A flag informs the owner and does
not block. Rows with an untick flag come first and start unticked, so sending one takes a deliberate
tick. The row shows the most serious flag; the rest show when it is opened.

| Flag | Condition | Starts |
| --- | --- | --- |
| "Not on this thread" | Any To, Cc or Bcc is not a participant, using a helper extracted from `firewallDraftIsWithinThread` (exact address, parsed with `parseRecipients` so one entry cannot hide a second) | Unticked |
| "New message" | Newer inbound message than `seenMessageId` | Unticked |
| "Important sender" | `threadHasProtectedSender`, or a recipient in `protectedSenders` | Unticked |
| "No-reply address" | `replyGuard` says `no_reply_sender` | Unticked |
| "You said no reply needed" | `replyGuard` says `corrected`. A send ends those corrections, so the owner should choose it | Unticked |
| "Has a link" | Any link in the body, the same test as `firewallDraftIsFree`, until the firewall site list exists | Ticked |

So an injected email cannot add a recipient unnoticed: the address is on the row, flagged, and off
unless the owner ticks it. `rarely_answered` gets no flag, because a customer who writes often and has
had no answer yet would match it. Editing recomputes flags.

**Remaining risk.** A harmful sentence late in a long body is easy to miss when rows are read at a
glance, and an owner can still approve a persuasive reply. The single card has the same limit.

## 3. Reliability

**Flow.** Press → one transaction (claim the effect, deny with a cautious note as the edited path
does, store approved rows) → enqueue `mail.reply.batch { effectId, spaceId, userId }` → a worker sends
rows in order → store the summary note and enqueue `runContinueJob`.

A job, not the API request or the run: 20 rows are too long for a request (the edited path sends
inside one), and Retry has to work after the run has ended. A second press cannot claim the effect,
because it is no longer `intended`.

**Per-message send record.** The worker calls the existing `mailSend` once per row with
`idempotencyKey: batch_<itemId>`. That gives one `ComposeSend` per reply with the existing claim and
states, so two workers, a retried job or a restart cannot send a row twice. A row in `pending` makes
`mailSend` answer "may or may not", which the row shows as unknown and never resends.

**Recovery, in `job-reconciler` beside `reconcileMailApprovals`, same 2-minute staleness:**

- Approved row with no `ComposeSend`, or still `draft` (the job was lost): enqueue again.
- `pending` and stale: set `unknown`.
- All rows settled but the effect still has the claim note: store the summary and wake the run.

If the run wakes early, the agent reads the cautious note, as with an edited approval today.

**Partial failure.** Each row ends as sent, failed, unknown or skipped, and one row's error never ends
the job. A failed row keeps its reason in `error`. **Retry failed** (`threads.retryMailBatch`) touches
failed rows only, needs no waiting run, and repeats stale, hash and grant checks; it is answered like
`threads.sendDraft`. Unknown rows are never retried. A failed row cannot be edited, because a retry
reuses its saved Gmail draft; it offers Open in composer, as the single card does.

**Stale threads.** At press, a mismatch with the client's `seenMessageId` rejects the press and the
card reloads with the row flagged and unticked. Ticking it again is the owner's acknowledgement. Just
before each send the worker checks again and fails that row with "New message". This uses synced mail,
so it is only as fresh as the last sync. A deleted thread fails through the provider's `not_found`.

**Scope and authorization.** All reads and writes filter on `spaceId` and `userId`; the RPC goes
through `resolveThreadTarget`, and only `run.userId` may press, as `mailDenial` requires. The table
gets row level security like `external_actions`. Each row re-reads the grant in `beforeWrite`, so
turning off "Allow changes" stops the rows not yet sent; this moves `accountAllowedIn` from the
executor closure to `packages/core/src/connection-access.ts`. Also re-checked: the bot's `mail_send`
switch and `mailWritesDisabled`. All state is in Postgres, so any API or worker process can take any step.

**Repeat guard.** `mailSendRefusal` reads only `mail_send` effects. It must also read batch rows of
the same run, so the agent cannot re-send a sent, unknown or skipped row with `mail_send`.

## 4. UX

Default ticks: clean rows on, flagged rows as in the table above. No select-all: unticking everything
is Discard.

**Large batches.** One line per row, flagged first. Web and Electron follow `useCappedRows` and
`SeeAll` from `apps/web/src/components/CappedList.tsx`, which is on `feat/web-capped-lists` and not
merged. A cap of 8 rows is a proposal, on phone web too (not `PHONE_ROWS`, 3). While ticked rows are
hidden, the main button reads "Review all (N)" and opens the list, and See all is not shown; only then
does it become Send selected. This is a client rule; the server sends only the exact rows posted.

| Surface | Behaviour |
| --- | --- |
| Web, Electron | Inline card in the thread. An open row is `MailApprovalCard`. The mockup shows it unchanged, with a second header and two Done buttons; S3 adds a prop that hides its header and action row. Electron hosts the web UI, so no separate work. |
| iPhone | A compact thread card with count and flags. "Review" opens a native sheet: `List` with checkmark rows, a detail screen with editable text, Send in the toolbar. This adds editing that the single iOS card lacks; `MailAnswerEdits` grows to carry the fields. No cap: the sheet scrolls. |
| Expo | A native sheet with `Switch` rows and readable bodies, no editing. Reason: Expo has no mail editing or mail card today. To change a reply, untick it and tell the agent. |
| Older clients | `text` and a `detail` listing address and subject per row, with Discard only. They cannot send. |

**After sending.** The card stays and shows "5 sent · 1 not sent", with status on each row. The
agent receives per-row outcomes (`replyToId`, sent, failed, unknown, skipped; no bodies) plus: "The
user sees each reply's result on the card. Do not list them; answer in a sentence." The activity line
reads "Sent 5 replies", through `attachToolNotes`. A later Retry updates the card and does not wake the
agent.

### New user-facing copy

| Copy | Where | Why it is needed | Why not remove it or reveal it later |
| --- | --- | --- | --- |
| "{n} replies" | Card title | Says what the card is. | Replaces "Mail"; adds no line. |
| "Send selected ({n})" | Main button | The owner's wording; the count is what will go out. | It is the action. |
| "Review all ({n})" | Main button | Ticked rows are hidden. | Shown only then. |
| "Not on this thread", "New message", "Important sender", "No-reply address", "You said no reply needed", "Has a link" | Row flag | Each points at a reason to look at this row. | Shown only when true. |
| "{n} sent · {m} not sent · {k} unknown" (empty parts dropped) | Card header after sending | The result at a glance. | Replaces "Needs approval". |
| "Skipped" | Row after sending | Tells it apart from a failure. | Shown only for unticked rows. |
| "Retry failed" | Button | The only recovery for those rows. | Shown only with a failed row. |
| "Review" | iPhone card button | Opens the sheet. | The list does not fit in the thread. |
| "Include reply to {address}" | Accessible name of a tick | Screen readers need it. | Not visible. |

Reused: "Needs approval", "Sent", "Not sent", "Unknown" (web), "Not confirmed" (iOS), "Discard",
"Open in composer", "See all ({n})", "Show less", "Firewall".

## 5. Slices (one PR each)

The scripted runtime drives all of them. `inferScript` gains a trigger next to "send email card":
`reply batch card to <id>,<id>,<id> from <account>` proposes one row per id, addressed to a fixed
test address. Adding the words `with stranger` puts an off-thread Cc on the first row. Message ids
come from the demo's synced mail. The demo runs `AGENT_RUNTIME=scripted` when no model keys are set.

**S1. Tool, table and flags.** Migration with row level security; contracts; tool and refusals; all
the lists above; flags; `ask` block with `mailBatch`, `detail` and Discard; scripted trigger.
- Tests: each gate; firewalled and tainted runs get no Always allow; saved Allow does not lift it;
  saved Block refuses; read-only agent refused; each refusal; replay makes one set of rows; each flag,
  including a Cc hidden in a To entry; another user and space see nothing (Postgres).
- Hand check: `pnpm demo:up` on a free `DEMO_SLOT`; run the script; discard the card; nothing sent.

**S2. Send path.** Press and retry RPCs, hash checks, job, reconciler, repeat guard, agent note.
- Tests (Postgres, Gmail emulator's `failNext`): only ticked rows send; an edit is what sends; changed
  hash rejects the press; second press or job sends nothing twice; killed worker leaves `pending` as
  unknown; row 2 failing does not stop row 3; Retry sends only failed rows; revoked grant stops later
  rows; new message fails that row; repeat `mail_send` refused.
- Hand check: real HTTP against the demo: send two of three rows; each reply is in its own thread and
  the skipped thread has nothing.

**S3. Web and Electron card.** Move the mockup into `MailReplyBatchCard.tsx` with stories for each
state, use it in `transcript.tsx`, run `pnpm design-system`. Depends on `feat/web-capped-lists`.
- Tests: ticks, Review all, edits, flags starting unticked; a web E2E opening the card, for the screenshot.
- Hand check: demo stack through agent-browser: review, untick, edit one, send, see per-row status and
  the agent's single sentence. Whole-batch failure in the demo's rate-limited space. One-row failure
  has no demo control (section 6). Electron runs the same UI; the desktop E2E is not for maintainer
  machines and CI is off on the fork, so the PR must say it was not run there.

**S4. Native iPhone.** Compact card, sheet, editing, per-row status, Retry.
- Tests: `RakazoCore` decoding and state tests. Hand check: iOS simulator against the demo stack.

**S5. Expo.** Native sheet, switches, read-only bodies, status. Tests: row logic. Hand check: simulator
or device; the PR says which.

**S6. Agent guidance.** Tool description, and one line in the mail agents' prompts: use
`mail_reply_batch` for two or more replies. Tests: the inbox agent prompt tests. Hand check: with a
model key, ask a firewalled test agent to answer three invented emails on the emulator; expect one card.

## 6. Open questions (recommended default first)

- **TBD: limit per batch.** Default 20; it is one constant.
- **TBD: Gmail send limits.** Whether 20 sends in a row can trigger Gmail's rate limits is not
  verified; the emulator cannot show it. Default: send in order with the provider's existing retry, no
  added delay, and show `rate_limited` rows as failed with Retry. Check on a real mailbox.
- **TBD: "Important sender" in Contacts.** A support mailbox may have many customers in Contacts, and
  then many rows start unticked. Default: keep them unticked, as the safer error. Alternative: only an
  explicit important mark unticks.
- **TBD: time limit on a waiting card.** None found for direct cards today. Default: none, since the
  stale check covers old threads. `EXTERNAL_ACTION_TTL_MS` (24 hours) is the precedent if one is wanted.
- **TBD: freshness at send.** Default: synced mail only. Stronger: run a mail sync for the account
  before the job's first send, at the cost of one more provider pass.
- **TBD: failing one row in the demo.** `failNext` works in tests, but I found no demo control for it.
  Default: tests cover this case and the S3 PR says it was not hand-checked. Alternative: a demo control.
- **TBD: Expo editing.** Default: none. Alternative: the composer screen.
