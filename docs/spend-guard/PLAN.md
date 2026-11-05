# Spend guard

Two protections against surprise bills. The first is built; the second is planned here and not
built yet, because its smallest enforceable version is larger than a small or medium change.

## 1. Budget pause (built)

When the model provider says the owner's own connection is out of credit, routines on that
connection stop firing until the credit is back.

- **Classifying the error.** `isOutOfCredit` (`packages/adapter-kit/src/model-errors.ts`) counts
  HTTP 402 Payment Required and OpenAI's `insufficient_quota` code. It also counts a 400, 402 or
  403 response whose message says the balance is exhausted, reusing `isAccountExhaustion`. Status
  and code come from structured fields when the runtime keeps them. Matching on the message text
  is the documented fallback for runtimes that pass only a message. A 401 never counts.
- **State.** `model_connection_pauses`, one row per space, owner and connection, holds
  `pausedUntil`. Row-level security limits it to that space and owner. Workers write it with one
  insert-or-extend statement, so concurrent refusals leave one row.
- **Pausing.** When any run on the owner's connection fails this way, the executor sets
  `pausedUntil` to one hour from now. The deployment's own key is never paused. A run that a
  backup model finished does not set or clear the pause.
- **Holding routines.** `wakeRoutine` resolves the connection the routine would run on (the
  routine's pin, then the bot's, then the space default). If that connection is paused, the
  occurrence is skipped: no run is created and the schedule moves to the next occurrence.
  The existing per-routine account backoff (`routine-backoff.ts`) still applies to the run that
  failed.
- **Resuming.** Routines run again when the hour passes, or as soon as any run on that
  connection, including a chat run, succeeds. A success deletes the row.
- **What the owner sees.** The run that hit the error fails once and sends the usual failure
  notice. After that, the routine's status line in its list reads "Paused: model connection out
  of credit" until the pause ends, on web and Expo mobile. The native iOS app decodes the new
  reason as unknown and shows nothing extra.
- **Not held.** Other unattended runs (webhook, messaging, bot-to-bot) are single events, not
  schedules. They still meet the provider and fail once each, as before.

## 2. Spend estimate before expensive work (planned, not built)

### What Praci knows about cost today

- `usage_records.costUsd` is recorded per model call: provider-reported or estimated from the pi
  catalog's rates. It is null when the price is unknown.
- **Paid tool calls have no numeric price.** Exa and Tavily reach the agent through generic
  Composio or MCP connectors. Composio returns only a free-text price description
  (`tool.reportedCost.description`), and MCP tools return none. `web_search` is keyless and free.
  No tool cost is recorded.
- The hosted plan's pooled AI allowance and hard stop are only a design
  (`docs/hosted-service/README.md`). No code enforces them yet.
- `/goal` (local branch `feat/agent-goals`) stops a goal at $5 by summing `costUsd` across the
  goal's runs after each run. It checks after the money is spent, so one run can overshoot.
- Approvals: a tool call whose gate decision is `ask` becomes an approval card and replays
  exactly once on approval. The gate already raises `ask` for its own reasons, such as a repeated
  email.
- There is no dollar setting anywhere: no space or user settings model holds money limits.

### Design

The smallest version that can be enforced is a **run spend checkpoint** at the existing tool
approval gate:

1. Before each tool call in a run, the gate sums the run's recorded `costUsd` (the run and its
   helper runs, as `/goal` does). It adds a per-call price for the tool when one is known.
2. If the total would cross the threshold, the gate decision becomes `ask`. The card reads
   "Asked because this run has spent about $X." Approving the card raises the run's allowance by
   one more threshold step, so the owner is not asked again on every call.
3. Below the threshold nothing changes.
4. Default threshold: $2 per run. It is set in the same place as approval rules: one space-wide
   rule with a numeric value, not a new settings page.
5. Prompt guidance asks the agent to estimate the cost of a batch (rows × lookups × price) and
   say so before starting. **Only the gate in steps 1–2 is enforced.** The guidance is advisory.

### Why it is not built in this change

- **There are no numeric tool prices.** Checking a batch before it runs needs a price for each
  paid tool. Praci has none: Composio prices are free text, and MCP and Exa prices are absent.
  Building that means a price table per connector tool, and someone has to maintain it.
- **It needs new state on the run.** The run must remember the spend allowance the owner
  approved, and the approval replay must update it.
- **It needs an unattended policy.** A routine that crosses the threshold has no one to ask.
  The choice is to stop, or to hold the run as approvals already do, and that decision belongs to
  the owner.
- Without numeric tool prices, the checkpoint sees only model spend, which is mostly cheap. It
  would not catch the 140-row paid enrichment, which is the case the owner named.

Size: **L**. Suggested slices: (a) the checkpoint on recorded model spend, (b) numeric prices
for the paid connector tools Praci knows about, (c) the unattended policy and the threshold rule.
