# Agent goals (`/goal`)

Status: plan, not built. Base: `main` at `15295fb03`. Research checked on 2026-11-05.

The owner types `/goal <text>` in a bot's chat. The bot keeps working, run after run, until a separate check finds proof that the goal is met, decides the bot is blocked, or a limit is reached. Writes still ask. The owner sees one line above the composer while the goal runs, and one short report when it ends.

## 1. Research

Every claim has a source. **UNCONFIRMED** marks what the sources did not settle.

### 1.1 Claude Code `/goal`

Source: the official page https://code.claude.com/docs/en/goal (abbreviated GOAL) and the hooks guide https://code.claude.com/docs/en/hooks-guide (HG).

- **Set, show, clear.** `/goal <condition>` sets the goal. The condition can be up to 4,000 characters. Setting a goal replaces the old one and starts a turn at once. A bare `/goal` shows the condition, elapsed time, turns evaluated, tokens spent and the evaluator's latest reason. `/goal clear` (also `stop`, `off`, `reset`, `none`, `cancel`) removes it, and so does `/clear`. There is no edit command (GOAL).
- **Who decides "done".** A separate model decides, not the model doing the work. `/goal` is "a wrapper around a session-scoped prompt-based Stop hook". After each turn the condition and the conversation go to the configured small fast model. That model has no tools, so it judges only what is already in the transcript. The docs tell users to write conditions that Claude's own output can prove, for example "all tests in `test/auth` pass" (GOAL).
- **Verdicts.** The evaluator returns one of three verdicts, each with a reason: not met (the reason becomes the next instruction), met (the goal clears), or impossible (the goal clears with a failed entry) (GOAL, HG). The exact text of the continuation message is **UNCONFIRMED**.
- **No-progress stop.** If Claude answers the evaluator with no tool use for "several" turns in a row, the loop stops, the goal stays set, and evaluation resumes on the user's next prompt (GOAL). The underlying Stop-hook cap is 8 consecutive blocks with no tool call (HG).
- **Background work.** If a subagent or background shell is running when a turn ends, evaluation is skipped until a turn ends with no background work. While the session waits, check-ins come due at 30 minutes, 1 hour, then every 2 hours. At most 3 idle check-ins run per goal until the user prompts again (GOAL).
- **Budgets.** There is no built-in limit on turns, tokens or time. The user is told to write the limit into the condition ("or stop after 20 turns") (GOAL).
- **Errors.** Unrecoverable errors (bad credentials, no credit, unrecoverable context overflow, model unavailable) clear the goal. Overload or a dropped connection retries up to 3 times, then pauses. Rate limits and usage limits pause the goal (GOAL).
- **Permissions.** A goal does not change the permission mode. Tool prompts still appear. The docs pair it with auto mode for unattended work (GOAL).
- **Resume.** A resumed session restores the goal but resets the turn count, timer and token baseline (GOAL).
- **Related features.**
  - Self-paced `/loop` lets Claude pick a delay of 1 minute to 1 hour through a `ScheduleWakeup` tool. It falls back to one wakeup after about 20 minutes if Claude forgets to reschedule, and recurring tasks expire after 7 days (https://code.claude.com/docs/en/scheduled-tasks).
  - Stop hooks can return `decision: "block"` with a `reason`, and they receive `stop_hook_active` so they can avoid looping. Prompt hooks (`type: "prompt"`) return `{"ok": false, "reason": …}` and may add `"impossible": true` (HG, https://code.claude.com/docs/en/hooks).
  - Plan mode blocks edits until the user approves a plan (https://code.claude.com/docs/en/permission-modes).

### 1.2 Other harnesses

| Harness | How the goal is stated | Who judges completion | What continues the loop | Guards | Approvals and questions | Progress and stopping |
|---|---|---|---|---|---|---|
| **OpenAI Codex CLI** | `/goal <objective>`, stored by the app server (`ThreadGoal*` schemas) | The same model, under a strict audit prompt. It must find evidence for each requirement and call `update_goal` with `complete` or `blocked` | The runtime injects `continuation.md` at each turn boundary | Token budget (a soft stop, `budget_limit.md`). The model classifies each turn as progress, verified wait or no progress. It may say `blocked` only after the same blocker repeats for 3 turns | Sandbox modes and approval policies are unchanged. A run pauses on any action that needs approval | `/goal`, `pause`, `resume`, `clear` |
| **Ralph loop** (Huntley) | `PROMPT.md` plus a plan file | Nobody. It relies on tests and type checks as "back pressure" | A shell `while` loop with fresh context each time | None | None | Kill the loop |
| **Ralph plugin** (Anthropic) | `/ralph-loop "<prompt>" --completion-promise DONE --max-iterations N` | The model's own `<promise>` string, matched exactly | A Stop hook re-feeds the prompt | `--max-iterations`, unlimited by default. The README calls it the main safety mechanism | Unchanged | `/cancel-ralph` |
| **Goose** | Recipe `instructions` or `prompt` | Shell commands in `retry.checks` | A failed check runs `on_failure`, resets history and restarts | `max_retries` is required. Checks time out at 300 s by default. Subagents have `max_turns` (default 1000) | **UNCONFIRMED** | **UNCONFIRMED** |
| **Aider** | The chat message | Lint and test commands (`--auto-lint` is on by default; `--auto-test` with `--test-cmd`) | A failure is fed back as a "reflection" | 3 reflections, set in code and not documented | Confirms shell commands (details **UNCONFIRMED**) | Ctrl-C |
| **OpenCode** | A prompt or a custom command | The model stops when it stops calling tools | None found | A per-agent `steps` cap. At the cap the agent is told to summarize and list what remains | `ask`, `allow` or `deny` per tool | Interrupt |
| **Roo Code / Cline** | A prompt. Roo's Orchestrator splits work into subtasks | The model's `attempt_completion` claim, approved by the user unless auto-approved | User feedback. The Orchestrator reads only each subtask's summary | Roo has a "Max Requests" input (behavior at the cap **UNCONFIRMED**). Cline removed its limit | Per-tool auto-approve. Roo auto-answers questions after 60 s if enabled | Cancel in the UI |
| **Cursor cloud agents** | A prompt. The agent opens a PR | The agent. A person reviews the PR | Single run | Spend limit set at first use | **UNCONFIRMED** | **UNCONFIRMED** |
| **Devin** | A prompt. The docs advise concrete success criteria | The agent | Single session. Idle sessions sleep and a message wakes them | ACU budgets. No ACUs are used while waiting or asleep | Asks the user for CAPTCHAs, MFA and OAuth. How it signals "blocked" is **UNCONFIRMED** | Progress tab. The user can take over |
| **Amp** | A prompt. The Oracle subagent advises and Task does the work | The agent | Single run. Runs continue on remote "Orbs" | **UNCONFIRMED** | No approvals by default. Policy plugins can add them | **UNCONFIRMED** |

Sources:

- Codex: https://github.com/openai/codex/tree/main/codex-rs/ext/goal/templates/goals (I read `continuation.md` directly) and https://learn.chatgpt.com/docs/agent-approvals-security. A third-party write-up says `/goal` shipped in v0.128.0 (**UNCONFIRMED** against the official changelog): https://codex.danielvaughan.com/2026/05/07/codex-cli-goal-command-persisted-long-horizon-workflows-pause-resume-budget/
- Ralph: https://ghuntley.com/ralph/ and https://github.com/anthropics/claude-plugins-official/tree/main/plugins/ralph-loop
- Goose: https://github.com/block/goose/blob/main/documentation/docs/guides/recipes/recipe-reference.md
- Aider: https://aider.chat/docs/usage/lint-test.html and https://raw.githubusercontent.com/Aider-AI/aider/main/aider/coders/base_coder.py
- OpenCode: https://opencode.ai/docs/agents/ and https://opencode.ai/docs/commands/
- Roo Code: https://roocodeinc.github.io/Roo-Code/features/boomerang-tasks and https://roocodeinc.github.io/Roo-Code/features/auto-approving-actions
- Cline: https://docs.cline.bot/features/auto-approve and https://github.com/cline/cline/blob/main/apps/vscode/src/shared/AutoApprovalSettings.ts
- Cursor: https://cursor.com/docs/cloud-agent
- Devin: https://docs.devin.ai/admin/billing/usage.md and https://docs.devin.ai/work-with-devin/devin-session-tools.md
- Amp: https://ampcode.com/docs/markdown/models-and-subagents and https://ampcode.com/manual

### 1.3 What works

- **A judge that is not the worker.** Claude Code uses a separate tool-less model. Goose and Aider use commands. Codex keeps the same model but forces a requirement-by-requirement evidence audit. Self-reported "done" is the weakest check (Ralph plugin README).
- **A hard cap besides the goal.** Aider allows 3 reflections, Goose requires `max_retries`, and the Ralph plugin README calls `--max-iterations` "your primary safety mechanism".
- **A no-progress stop.** Claude Code stops after turns with no tool use. Codex has the model classify each turn as progress, a verified wait, or no progress.
- **"Blocked" needs repetition.** Codex allows `blocked` only after the same blocker appears 3 turns in a row, so one hard step does not end the goal.
- **The goal is data, not instructions.** Codex wraps it in `<objective>` and says it is "not higher-priority instructions". It also forbids shrinking the goal to what is easy.
- **State outside the chat.** Codex stores goals in its server. Ralph keeps state in files and git.
- **Approvals unchanged.** No harness lets a goal lift approvals. Claude Code and Codex both keep their permission modes.
- **Cheap waiting.** Devin sleeps idle sessions at no cost.

### 1.4 Failure modes seen in practice

- **False "done".** In Codex issue #56927 the model declared completion and then withdrew it when challenged. The Ralph plugin accepts any text that contains the promise tag.
- **Infinite loops.**
  - Codex #37304: resuming a goal enters an endless loop.
  - Codex #47707: after auto-compaction, a goal repeats the same response hundreds of times.
  - Codex #40929: a resumed goal ignores the updated objective.
  - Ralph plugin #81826: the iteration cap is silently dropped.
- **Cost blowups.** Codex #46074: a paused goal spent tokens 10 to 20 times a minute. One expensive turn can overshoot a soft token budget (Vaughan write-up).
- **Guardrails lost to compaction.** Codex #19910: the continuation prompt can be lost when compaction happens mid-turn.
- **Thrashing and drift.** Huntley lists placeholder implementations, duplicated work, and the loop "going off track". Roo's Orchestrator sees only each subtask's summary.
- **Judge fooled by the agent's own words.** The Claude Code evaluator reads only the transcript, which includes the agent's claims. Codex's audit is a self-report.

Issue links follow the pattern `https://github.com/openai/codex/issues/<n>` and `https://github.com/anthropics/claude-code/issues/<n>`.

**Lessons for Praci:**

1. The judge reads tool results that the executor recorded, not the agent's prose.
2. The server owns the counters, limits and state, in Postgres.
3. A paused goal costs nothing. Nothing runs until a run ends or the owner acts.
4. The continuation prompt is rebuilt from the database on every run, so compaction cannot drop it.

## 2. How Praci works today (what the design builds on)

- **Composer slash commands.** Web (`apps/web/src/pages/shell/composer.tsx`) and Expo (`apps/mobile/components/thread-composer.tsx`) share a `/` picker. It lists skills and `SLASH_ACTIONS` (`packages/core/src/composer-slash.ts`), which today are only two settings shortcuts.
  - An action clears the draft and dispatches an id, so it cannot take an argument.
  - A typed `/goal x` today is sent as plain text. At run time it would be looked up as a skill name (`extractForcedSkillName`, `packages/core/src/agent-skill.ts`).
  - The native iOS composer (`apps/ios/Sources/Praci/Thread/Composer/`) has no slash support.
  - The Expo `runSlashAction` (`apps/mobile/app/thread.tsx`) sends any unknown action to Account settings, so a new action would go to the wrong place.
- **Sending.** `threads.send`, then `sendThreadMessage` (`apps/api/src/thread-target.ts`), runs one serializable transaction.
  - It writes the message.
  - It answers a pending question, or skips pending approval cards. It never approves them.
  - It steers an active run, or creates a `Task` and a `queued` `Run`.
  - After commit it enqueues `run.continue`.
  - The API does not parse commands.
- **Worker.** Jobs run on graphile-worker over Postgres (`packages/adapters/src/wakeup.ts`). Job names and payloads are in `packages/adapter-kit/src/background-jobs.ts`, and handlers are in `packages/adapters/src/background-job-handlers.ts`.
  - Runs are claimed with a fenced lease (`claimRunLease` in `executor.ts`).
  - A leader-elected reconciler (`job-reconciler.ts`) re-enqueues lost work every 30 s.
- **Run end.** `finalizeRun` (`executor.ts` near line 10475; `packages/db/src/run-finalize.ts`) takes the thread row lock. In the same transaction it can create a follow-up run for unclaimed steering messages (`createPendingSteeringRun`, `packages/db/src/steering.ts`), which is the pattern a goal continuation copies. The finish push is skipped when a continuation exists.
- **Run mode.**
  - `Run.unattended` and `Run.externalTaint` are set at creation (`packages/core/src/run-mode.ts`), and `run-create-sites.test.ts` enforces this.
  - In an unattended run only reads and Praci-internal writes run without asking (`packages/core/src/action-approval.ts`). Every other tool raises a card, Auto Review never decides, and the card has no "Always allow" button.
  - A tainted run asks for everything outside the taint-safe list.
- **Pauses.** An approval card or a question moves the run to `waiting_input` (`packages/db/src/run-pauses.ts`) and sends a "help" notification. The run has not ended, so nothing fires after it. After 4 h a reminder is sent, and after 24 h the run is cancelled (`stuck-work.ts`).
- **Work list.** `ScratchpadItem` is per bot. The `scratchpad_*` tools manage it. Up to 40 open items go into the system prompt. `WORK_LIST_GUIDANCE` and `TRUTHFULNESS_GUIDANCE` (`executor.ts`, PRs #1141 and #1145) already tell the agent to track rows and claim only what tool results show.
- **Proactivity.** `Bot.proactivity` is `low`, `medium` or `high`. It shapes `tenacityGuidance`. The level is `limited` for firewalled, tainted, restricted or check-in runs. Even at `high`, the bot never sends, spends or deletes without being asked.
- **Tool results are not kept in messages.** Bot messages keep a `steps` block: executor-written labels, one-line summaries and per-call lines, with failures marked. Full tool results exist only inside the running attempt and its paused-turn checkpoint.
- **Usage.** `UsageRecord` stores `costUsd` (which may be null), `runId`, `parentRunId` and `operationKind`. The hosted plan's pooled allowance and hard stop are **not built** (`docs/hosted-service/README.md`: "Status: plan, not implemented").
- **Separate model calls.** Auto Review (`packages/adapters/src/auto-review.ts`) is a one-shot, tool-less, strict-JSON call. It has a scripted provider for tests and records usage as `operationKind: "setup"`.
  - History compaction checks `AiDataConsent` before it sends transcript text.
  - There is no "small model" role. Calls use the bot's resolved connection (`executor.resolveModel`).
- **Notifications.** `notifyRun` sends `completion`, `failure`, `help` and `takeover`. Delivery goes through an outbox to Expo push, APNs and in-app.

## 3. Design

### 3.1 Summary

1. `/goal <text>` is parsed **on the server** in `sendThreadMessage`, so every surface works the day the server ships, including native iOS and the API. Clients add a picker entry and a status line on top.
2. One `ThreadGoal` row per bot thread, in Postgres. While a goal is active, every run on that thread carries `goalId`.
3. When a goal run ends (completed or failed), the worker enqueues `goal.check`. A separate tool-less model call (the **goal check**) reads the goal, the work list, and an **evidence log** of tool results that the executor recorded. It returns `met`, `continue` or `blocked` and cites evidence ids. The server rejects `met` if any cited id does not exist.
4. On `continue`, the server creates the next run in one transaction under the thread lock, with a server-written continuation prompt. The run gets the same mode as a run started by the owner's message: the bot's allow rules apply, and anything they do not allow raises an approval card, which pauses the goal. Auto Review never decides in a goal run.
5. A pending card or question pauses the loop by itself, because the run has not ended. Answering it resumes the run, and the check runs when the run ends.
6. Limits are enforced by the server: 25 continuations, 4 hours and $5 per goal. The **stall counter** counts runs with no tool calls, failed runs and `blocked` verdicts, and resets on a run that makes progress. At 3 the goal ends as blocked.
7. Stop pauses the goal. The owner's next message resumes it with fresh limits. `/goal clear` ends it.
8. Goal runs send no per-run finish push. The end sends one notification and posts one short `goal` block in the transcript.
9. A goal run adds one prompt section that ties the goal to the work list: plan the requirements as rows, update rows from results, reply in one line, ask only when blocked.
10. A scripted goal check lets tests and `pnpm demo:up` exercise the loop offline. Judge quality and agent tenacity are checked on a real model in the last slice.

### 3.2 Commands

| Owner types | Result |
|---|---|
| `/goal <text>` (1 to 2,000 characters) | Sets the thread's goal, replacing any active or paused one, and starts a run at once. The message stays in the transcript as typed. |
| `/goal` | No message or run. The server answers through the send error that every composer already shows: `Goal: {text}` (with ` (paused)` when paused) or `No goal set.` Clients that intercept the command (S3 to S5) show the goal line instead. |
| `/goal clear` | Ends the goal as cleared, with no message or run, and answers `Goal cleared.` through the same send error. A goal run that is still working is left to finish. It is not judged afterwards, and no new run starts. New clients call `threads.clearGoal` instead. |
| Stop button | Cancels runs as it does today and **pauses** the goal in the same transaction. |
| Any other message | Behaves as today: it steers, answers, skips cards or starts a run. If the goal is paused, the message resumes it with fresh limits. |
| Clear thread | Ends the goal as cleared. |

Rules:

- The command is recognized only at the start of an owner message (`trigger: "user"`), only in a bot's own thread, and only when the text is not wrapped in a quote or reply.
- `extractForcedSkillName` gets `goal` as a reserved name, as it already has for "chat settings", so a skill named "goal" cannot shadow the command.
- In group threads the server rejects `/goal` with an error (see copy). This degrades safely and on purpose: a group has several bots and no single worker to judge.

### 3.3 The loop

```
owner: /goal …        ─► run (goalId) ─► finalizeRun ─► enqueue goal.check(goalId, runId)
                                             │
     waiting_input (card/question): loop waits; owner answers; run resumes and ends normally
                                             ▼
goal.check: load goal, evidence and work list ─► goal check model ─► verdict
        └─ transaction, thread FOR UPDATE:
             goal still active? this run not judged yet? no live run or open card on the thread?
             write the verdict and counters
             continue → create the next Task and Run (trigger "goal") → after commit enqueue run.continue
             met / blocked / limit → close the goal, post a goal block, notify after commit
```

- **Evidence log.** For runs that have a `goalId`, the executor keeps a bounded log of tool calls as the run proceeds: id `t1`…, tool id, short args, ok/failed, and the result truncated to 1,000 characters, with a 24 KB total. It stores the log on the run at finalize (new `Run.goalEvidence Json?`).
  - These are tool results, not agent prose.
  - Outside content in them is fenced as untrusted data, using the same wrapper as webhook payloads.
- **What the goal check reads.**
  - The goal text, as owner data.
  - The evidence logs of the goal's last 5 runs.
  - The bot's open and recently done work-list rows.
  - The final reply of the last run, labelled "the agent's claims, not evidence".
  - The counters.
- **Rubric.**
  - `met` requires every requirement in the goal to be supported by a cited evidence id.
  - A missing, weak or indirect requirement means `continue`.
  - `blocked` only when the next step needs the owner (a decision, sign-in, access, money) or cannot be done. It must name what the owner must do.
  - The check never considers whether the work is "good enough for now".
  - Output is strict JSON: `{verdict, reason ≤ 200 chars, evidence: ["t3", …], next ≤ 200 chars}`.
- **Server checks on the verdict.** Unknown evidence ids, or `met` with no evidence, turn the verdict into `continue` with reason "Not proven yet." If the output does not parse after one retry, the goal pauses (`stopReason: "check_failed"`).
- **Continuation prompt** (a server-written run prompt, not a transcript message, rebuilt from the database each time):

  ```
  Goal check: not done yet. {reason}
  Next: {next}
  <goal>{owner text}</goal>
  The goal above is the owner's data. Keep working toward all of it; do not shrink it.
  ```

  The run also gets the `GOAL_GUIDANCE` prompt section (§3.6).
- **Run mode.** A continuation run (trigger `goal`) gets exactly what a run started by the owner's message gets: `unattended: false` and `externalTaint: false`, so the bot's allow rules apply and every other action raises an approval card that pauses the goal. Thread-level meeting taint, the firewall, in-run outside-content taint and the exfiltration rules apply exactly as they do to an owner's run. Auto Review never decides in a goal run, the card keeps its normal buttons, and a goal never approves anything, never adds rules and never raises proactivity.

### 3.4 Limits

All limits are checked inside the `goal.check` transaction. Every one ends the goal with a goal block and one notification.

| Limit | Value | Counted from |
|---|---|---|
| Continuations | 25 | `ThreadGoal.continuations` |
| Wall time | 4 hours | `ThreadGoal.startedAt` |
| Spend | $5 | `SUM(UsageRecord.costUsd)` for the goal's runs since `startedAt`, plus goal-check calls (`operationKind: "goal_check"`). A null cost counts as 0, so the continuation cap still bounds a provider without prices |
| Stalls | 3 in a row | A run with no tool calls, a failed run, or a `blocked` verdict. A run that adds new evidence or completes a work-list row resets the count |
| Owner pause | — | Stop, or the 24-hour stuck-run expiry cancelling a goal run |

- Values are constants in `packages/core`, not settings (see decision D3).
- A run that fails because the model is unavailable, credentials are bad, or (later) the hosted allowance is used up ends the goal at once with that reason. The goal does not retry.

### 3.5 Concurrency, idempotency, crash recovery

- `goal.check` uses the job key `goal:<goalId>`, so graphile keeps one queued job per goal.
- The handler makes the model call **outside** the transaction, then commits only if `lastCheckedRunId` still differs from `runId` and the goal is still `active`, under `SELECT … FROM threads … FOR UPDATE`. That is the same lock used by send, finalize, pause and stop.
  - Two workers that race make at most one extra cheap call, and only one commits.
  - The continuation run is created in that transaction, after the same "no live run" check as `createPendingSteeringRun`.
- **Crash after finalize, before enqueue:** the reconciler finds active goals whose newest goal run is terminal, not yet checked, and has no live run on the thread, and enqueues `goal.check`.
- **Crash after commit, before `run.continue`:** the reconciler already re-enqueues every `queued` run.
- **Owner message and goal check at the same moment:** the thread lock orders them. If the owner's run exists first, the check finds a live run and exits. That run is judged when it ends.

### 3.6 Tenacity and the work list

`GOAL_GUIDANCE` is added to `userTurnInstructions` for runs with a `goalId`, after `WORK_LIST_GUIDANCE`. It is not added when the tenacity level is `limited`; the goal still runs but the guidance is not added. Draft:

> You are working toward the owner's goal across several runs. A separate check decides when it is met by reading your tool results, not your replies. At the start, add one work-list row per requirement. Update rows from tool results as you go. Each reply is one line saying what changed. If you need the owner, ask once and stop.

- The goal run's tenacity floor is `medium`, even for a `low` bot. A goal is an explicit request to keep going.
- `high` adds nothing that a goal unlocks.

### 3.7 What the owner sees

- **Goal line** above the composer, built on the `DelegateWaitNotice` pattern. It shows the goal text on one line, then a status word only when the goal is not working, then a clear button. It is gone once the goal ends.
- **Transcript.** Each goal run's one-line reply shows as a normal message. When the goal ends, a new `goal` message block shows the outcome and the goal check's reason. For `met` the cited evidence is behind a chevron, using the `steps`-line style.
- **Notification.** One notification when the goal ends: `completion` for met, `help` for blocked or a limit. Per-run finish pushes are off for goal runs. Cards and questions keep their existing `help` push.

### 3.8 Data model and migration

The migrations are `20261231000059_thread_goals` and `20261231000060_run_goal_evidence`.

```prisma
model ThreadGoal {
  id               String    @id @default(cuid())
  spaceId          String
  userId           String
  threadId         String
  botId            String
  text             String
  status           String    // active | paused | met | blocked | stopped | cleared
  stopReason       String?   // runs | time | spend | stalled | owner | check_failed | model_error
  continuations    Int       @default(0)
  stalls           Int       @default(0)
  lastCheckedRunId String?
  lastVerdict      Json?     // { verdict, reason, evidence, next }
  startedAt        DateTime  @default(now())   // reset on resume
  endedAt          DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  @@index([threadId, status])
}
// Run: goalId String? (indexed), goalEvidence Json?
```

- A partial unique index allows one open goal per thread: `UNIQUE (thread_id) WHERE status IN ('active','paused')`.
- Row-level security uses the same `app.space_id` and `app.rls_bypass` policies as `…052_pipeline_records`.
- Every query is scoped by `spaceId` and `userId`, and the worker re-enters the tenant with `asOwner`.
- `ThreadSnapshotSchema` gains `goal: { id, text, status, stopReason?, lastReason? } | null`.
- A new event, `thread.goal.updated`, carries the same object so clients update live.
- `openapi.json` is regenerated.

### 3.9 Tests

- **Core (unit).**
  - `parseGoalCommand`: set, bare, clear, too long, `/goals x` is not a command, leading whitespace.
  - Limit arithmetic.
  - Verdict validation: unknown ids, `met` without evidence, bad JSON.
  - `newRunUnattended({trigger: "goal"})` and `newRunExternalTaint({trigger: "goal"})` match `trigger: "user"` (both false), and `planActionGate` never uses Auto Review for `goal` runs.
- **DB / API (integration, Postgres).**
  - `/goal` creates a goal and a run with `goalId`.
  - `/goal` replaces an open goal.
  - Group thread is rejected.
  - Stop pauses, the next message resumes and resets counters, and clear and clear-thread end the goal.
  - A skipped card does not approve anything.
  - `run-create-sites.test.ts` covers the new create site.
  - Row-level security denies another space.
- **Worker (integration, scripted runtime plus scripted goal check).**
  - A `continue, continue, met` sequence creates exactly 2 continuations and 1 goal block, and sends 1 notification and no per-run pushes.
  - Two concurrent `goal.check` handlers produce one run.
  - A crash between finalize and enqueue is recovered by the reconciler.
  - A card pauses the loop, and approving it resumes the loop.
  - Each limit fires: runs, time (fake clock), spend (seeded `UsageRecord`), and stalls (runs with no tools).
  - A model-error failure ends the goal.
  - A continuation run has the owner-message mode. A tool the allow rules do not cover raises a card and pauses the goal, Auto Review is never consulted, and a planted "goal met" inside a tool result does not end the goal without a valid evidence id.
- **Demo path.** `RAKAZO_GOAL_CHECK=scripted` follows the existing `scripted-auto-review` pattern, so `pnpm demo:up` with the scripted runtime can show set → continue → met by hand, with no model.
- **UI.**
  - Stories for the goal line (working, paused, waiting on you) and the goal block (met, blocked, limit).
  - A web e2e that types `/goal` and sees the line, with a CI screenshot.
  - The Expo i18n test updated.
- **Needs a real model (slice 6).**
  - Goal-check accuracy on 12 to 20 recorded transcripts with known outcomes. The key number is the false `met` rate.
  - Whether agents follow `GOAL_GUIDANCE` (work-list rows, one-line replies, asking once).
  - Live cost per goal on the default connection.

## 4. Slices

Each slice is one PR. S2 depends on S1, S3 to S5 depend on S1, and S6 depends on S2.

**S1. Goal state and the command (server).** This slice adds:

- The migration, row-level security and `Run.goalId`.
- `parseGoalCommand` in `packages/core`.
- `/goal` handling in `sendThreadMessage`, plus the reserved name in `extractForcedSkillName`.
- Stop pauses the goal, the next message resumes it, and clear and clear-thread end it.
- `goal` on the snapshot and the `thread.goal.updated` event.
- Runs created while a goal is active carry `goalId`.

Acceptance: the DB/API tests in §3.9 pass, and `/goal` typed from any client creates a goal and one run. The slice has no loop yet, so a goal behaves like a normal message plus visible state.

**S2. Evidence log, goal check, loop and limits (worker).** This slice adds:

- `Run.goalEvidence` collection in the executor.
- The `goal.check` job, the LLM and scripted goal-check providers, verdict validation and the continuation run (trigger `goal`, owner-message mode).
- Limits and the stall counter.
- A reconciler sweep.
- The `goal` message block and the end notification, with per-run finish pushes suppressed.
- `GOAL_GUIDANCE`.
- The `AiDataConsent` check, as history compaction does it: without consent, the goal pauses with `check_failed`.

Acceptance: the worker tests in §3.9 pass, and a hand test in `pnpm demo:up` with the scripted check shows the loop end to end.

**S3. Web and Electron UI.** This slice adds:

- A "Goal" picker entry, which inserts `/goal ` into the draft. Today's actions only dispatch an id, so this needs an "insert" kind.
- The goal line with a clear button.
- The `goal` block renderer.
- Stories, a `pnpm design-system` regeneration, and an e2e test with a screenshot.

**S4. Expo mobile.** The same picker entry, goal line (native, using `lib/native` chrome) and block renderer. It also fixes the `runSlashAction` fallthrough and updates i18n.

**S5. Native iOS.** This slice decodes `goal` on `ThreadSnapshot` and the event, adds a goal line in SwiftUI with a native clear button, and renders the `goal` block. The typed command already works after S1. Older iOS builds are safe before S5: the Swift decoder maps an unknown block kind to `.unknown`, and `ThreadMessageView` draws an unknown block's `text` field as a footnote (`apps/ios/Packages/RakazoAPI/Sources/RakazoAPI/MessageBlock.swift`, `apps/ios/Sources/Praci/Thread/ThreadMessageView.swift`). The `goal` block therefore always carries a plain `text` field, such as "Goal met. Found 3 suppliers."

**S6. Real-model check and tuning.** This slice adds an eval set under `docs/evals/` and runs it on the default connection. It tunes the rubric and `GOAL_GUIDANCE` and records the measured false-`met` rate and cost per goal. The limits change only if the measurements give a reason.

## 5. Copy

Every visible word, and why it is needed.

| Where | Text | Why it is needed and why it cannot be removed |
|---|---|---|
| Slash picker | `Goal` | The picker's label. The command cannot be found without it. Every other entry is one word or a name. |
| Goal line | `{goal text}` | It shows what the bot is working toward, which is the only thing the owner needs while it runs. |
| Goal line status, shown only when not working | `Paused` / `Waiting on you` | Without it, a goal that is quietly stopped looks the same as one making progress. "Waiting on you" points to the card above. |
| Goal line button (accessible name, icon only) | `Clear goal` | A screen reader needs the name. The icon has no visible text. |
| Goal block | `Goal met` / `Goal blocked` / `Goal stopped` | The outcome, in one word after "Goal". |
| Goal block, second line | `{reason}` from the goal check; for limits, `After 25 runs.` / `After 4 hours.` / `At $5 spend.` / `No progress in 3 runs.` / `The model connection is unavailable.` | It says why the goal ended. For a limit, the owner needs to know which one to decide whether to resume. |
| Push title | `{Bot} met the goal` / `{Bot} is blocked on the goal` / `{Bot} stopped the goal` | One push, with the bot's name, so the owner knows which chat to open. |
| Push body | `{reason}` | The same reason as the block. |
| Error in a group | `Goals work in a bot's own chat.` | Without it, `/goal` in a group would look like it was ignored. |
| Error, text too long | `Keep the goal under 2,000 characters.` | The owner needs to know the limit to fix the message. |
| Composer error after `/goal` or `/goal clear` | `Goal: {text}` / `No goal set.` / `Goal cleared.` | Older clients and native iOS have no goal line yet. The composer error is the only place they can show the answer. |

There is no explainer text, no counters on the line, and no settings.

## 6. Decisions (made by the owner, 2026-11-05)

| # | Decision |
|---|---|
| D1 | Continuation runs follow the bot's own rules. They get what a run started by the owner's message gets: allow rules apply, and anything not allowed raises an approval card that pauses the goal. Firewall, taint, external-content and exfiltration rules are unchanged. Nothing is ever auto-approved, so Auto Review does not decide in goal runs. |
| D2 | The bot's own connection (`executor.resolveModel`) runs the goal check, against the evidence log. |
| D3 | Fixed limits: 25 continuations, 4 hours, $5 and 3 stalls, reset on resume. |
| D4 | The owner's next message resumes a paused goal. There is no `/goal resume`. |
| D5 | Goals work only in a bot's own thread in v1. `/goal` in a group returns an error. |
| D6 | Each goal run replies in one line. |

## 7. Cut from v1

- **Waiting for background work.** Claude Code defers its check while background work runs and wakes on a backoff schedule. Add this when goals regularly wait on cloud agents or Devin. Until then the agent can poll, and the stall counter bounds the polling.
- **Limits written in the goal text, or per-goal settings.**
- **Edit goal.** Setting a new goal replaces the old one.
- **Linking work-list rows to a goal.** Rows stay per bot. Add a `goalId` on `ScratchpadItem` only if several goals on one bot get mixed up.
- **A dedicated cheap judge model** (D2).
- **Goal history list or Activity entries.** The transcript block is the record.
- **Judging with tools**, such as rerunning a check command. The evidence log covers this without tool access for the judge.
- **Hosted allowance enforcement.** It is not built. When it is, a billing-blocked run already ends the goal through the model-error rule.
- **Aliases** (`stop`, `off`, `reset`, `cancel`) for `/goal clear`.
