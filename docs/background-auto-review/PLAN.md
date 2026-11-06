# Fewer approval cards from background runs

Status: plan only, no product code. File references were read at `origin/main`.

## Problem

Over 7 days on the owner's live app, about 52 approval cards were answered and none was denied. About half asked only because the run was unattended ("Asked because this ran in the background."): `message_bot`, `show_emails`, `search_history`, `read_history`, `my_tools`, `message_user`, `finance_overview`. Others came from the run being marked as holding outside text. One card said "Requested by an external bot" when the owner's own Chief agent had messaged the owner's own Inbox agent, and Inbox's reply (it reads email) marked Chief's run. The card named no bot and showed no arguments, so the owner could not judge it.

Cards the owner always approves teach them to approve without reading, which weakens the cards that matter (sending mail, paying, posting).

## What exists

- `unattendedToolRequiresApproval` (`packages/core/src/action-approval.ts`): an unattended run asks for every built-in tool not in `UNATTENDED_SAFE_BUILTIN_TOOLS`.
- Auto Review (`packages/adapters/src/auto-review.ts`, `jev-auto-review.ts`, `auto-review-factory.ts`): a judge that turns an "ask" into "allow" or keeps it. It sees the owner's words, the tool and its arguments, never tool results or inbound messages, so injected text cannot argue its case. It times out in 1.5 s and fails closed on consequential tools. Provider via `RAKAZO_AUTO_REVIEW_PROVIDER` (`jev` with a TypeSafe key, otherwise an LLM on the deployment's model connection, for example OpenRouter). Off unless `RAKAZO_AUTO_REVIEW` or the owner's preference turns it on; the owner's live app has it off.
- `planActionGate`: never judges in an unattended run or a goal run, except reads in `ROUTINE_AUTO_REVIEW_READ_TOOLS` in a clean, non-webhook routine run.

## Proposal, in three layers

### L1. Deterministic: actions that stay inside Praci never ask in the background

Add to `UNATTENDED_SAFE_BUILTIN_TOOLS`:

- `message_user`, `show_emails` (in progress on `fix/background-display-tools`): they only display to the owner.
- `message_bot` and `message_agent` **when the target is one of the owner's own internal agents in the same space**. The receiving agent's run has its own gates; the message cannot reach anyone outside. A message to an external bot, or to another space's agent, still asks.
- `my_tools`: lists the bot's own tools.
- Check why `search_history` / `read_history` asked although they are on the safe list (probably cards from before that change; confirm against the deployed commit).

These are deterministic, cost nothing, and need no model.

### L2. Cards say who asked and what will happen

- The marked-run reason names the source: "Asked because Inbox agent's reply may hold text from your email." instead of "Requested by an external bot". The chain already knows the sender (`externalChainOf`, `fromBotName` on `bot_message_received`). Keep "Requested by an external bot" only for a real external bot.
- Every card shows a one-line plain summary of the arguments the reviewer needs (for `calendar_agenda`: the date range; for `message_bot`: recipient and the first line). Most of this exists in the card's collapsed "show" section; make the summary line visible without expanding.

### L3. Auto Review for background runs, on a cheap decision model

Extend `planActionGate` so an unattended run may judge, under these limits:

- **Scope:** reads and Praci-internal writes only: `ROUTINE_AUTO_REVIEW_READ_TOOLS`, read-only connector calls, and Praci-internal writes (pages, pins, schedules, scratchpad). Never sends, payments, posts, calendar changes, mail changes or any `requiresMandatoryApproval` tool: those always ask, whatever the judge says.
- **Inputs:** the routine's prompt as written by the owner (the owner's words), the bot's role, tool name and arguments. Never tool results, inbound messages or page text.
- **Marked runs:** a run holding outside text is judged only for reads whose arguments the owner's words already explain; a read that would send newly chosen data to a connector still asks (existing `connectorReadRequiresApproval`).
- **Model:** the existing LLM provider through the space's model connection (OpenRouter today). No new environment variable per model. Default the reviewer to the space's default model (Luna now, about $0.02 per job in the earlier comparison), with the existing timeout and fail-closed rule.
- **Switch:** the existing Auto Review preference, plus one new setting "Background runs" (off by default for new spaces). The owner turns it on.
- **Record:** every judge decision is already stored on `ExternalEffect` (`reviewDecision`, `reviewReason`, `reviewModel`). Show passed calls in the run's step list as "Checked by Auto Review", so the owner can audit after the fact.

## Slices

| Slice | Scope | Test |
|---|---|---|
| S1 | L1 safe-list additions with the internal-agent condition for `message_bot` | Unit tests in `packages/core`; executor test that a routine messaging the owner's own agent does not ask and messaging an external bot does |
| S2 | L2 reason naming the source, and the visible argument summary | Executor test for the reason text; AskCard story and test for the summary line |
| S3 | L3 judge in unattended runs, setting, step-list label | Gate unit tests for every excluded category; executor test with the scripted reviewer: pass allows, ask keeps the card, timeout keeps the card; demo check with the scripted reviewer |

## Open decisions for the owner

1. L3 scope: reads and Praci-internal writes only (recommended), or also let the judge pass outside writes such as sending mail? Recommendation: never for outside writes.
2. Reviewer model: the space default model (recommended, cheap), or a fixed stronger model through the same connection.

## Not in this plan

- Learning from the owner's past answers. The 7-day data supports the deterministic list; a learned policy can come later.
- Any change to cards in runs the owner started.

## Revised after the Opus review and owner decisions (2026-11-06)

The review found L3 as written unsafe or already covered. Owner decisions: Auto Review may judge background runs that read no outside content (yes), and `finance_*` reads join the unattended safe list (yes).

- **L1 (build).** Add `message_user`, `show_emails` (merged, #1158). `message_bot` to the owner's own bot is free in an unattended run only after `readOutsideContent` is carried to chained runs (`chainedRunMode`, the `run.create` in `bot-messages.ts`, and seeding `outsideContentSeen` from `run.readOutsideContent`), so a relay can never launder outside text into a clean run. Drop `message_agent` (always external) and `my_tools` (not a built-in; find its connector). Add `finance_overview`, `finance_breakdown`, `finance_transactions`, `finance_recurring`, `finance_crypto` to the unattended safe list. Taint-safe lists stay unchanged.
- **L2 (build).** Card reasons come from the run's real origin: `EXTERNAL_REQUEST_REASON` only when `externalChain` is defined; webhook/messaging/mcp triggers say they started outside Praci; a `bot_message` run names the sender; otherwise an inherited reason. Find why the Chief run was marked before writing the text. Add per-tool argument summaries in `packages/adapters/src/approval-ask.ts` (`message_bot`: recipient and first line; calendar reads: from and to).
- **L3 replaced.** A Settings switch for Auto Review in background runs. It judges only runs with no taint, no outside content and no meeting text, compares only against the owner's words (`loadOwnerWords()`, no judge when empty), never judges schedules, skills or memory, and keeps every outside write asking. Calls it passed are listed from the stored review fields. This reverses `docs/unattended-bots/PRD.md` "Auto Review never runs on unattended runs" by owner decision.
- **Also found.** A routine run waiting on a card for hours resumes with a stale report and duplicates a newer run's report; fixed separately (`fix/routine-supersede`).
