# Omi cloud sync: pull conversations and memories with a Developer API key

Status: plan only, no product code. File references were read at `origin/main`. This extends `docs/omi/README.md` (the pendant plan), which lists Omi's cloud routes under "Omi's cloud routes (D1 B and C)" and left them for later. The owner approved "plan, then build" for the developer-API route. Format follows `docs/omi/README.md` and `docs/plans/granola.md`.

## Outcome

The user pastes an Omi Developer API key (`omi_dev_…`, created in the Omi app under Settings → Developer → Create Key) into the Omi integration. A scheduled worker job then pulls the user's Omi conversations with their transcripts, and their Omi memories. It only reads from Omi. The results appear where Omi pendant data already lands: conversations in Meetings, memories in the private Omi folder of the Data room.

## What is known about the Omi Developer API

Source: docs.omi.me, read 2026-11-05. Nothing was called against the real API.

| Fact | Status |
|---|---|
| Base URL `https://api.omi.me`; header `Authorization: Bearer omi_dev_…` | Documented |
| Scopes are chosen when the key is created; `conversations:read` and `memories:read` exist | Documented |
| `GET /v1/dev/user/conversations` (list) and `GET /v1/dev/user/memories` | Documented |
| A `200` with header `X-Omi-List-Truncated: true` means the list is incomplete | Documented |
| Hourly limits that overlap: conversation reads 60 (shared), list 60, detail 60, transcript 25 | Documented |
| `429` carries `Retry-After` in seconds | Documented |
| `omi_mcp_` keys get `401` on REST | Documented |
| Memory calls can return `403 developer_memory_access_not_ready` (an account state, not a bad key) | Documented |
| No audio download. Webhooks need a public URL and are out of scope | Documented |
| Paths of the conversation detail and transcript endpoints | Unverified |
| List query parameters (date filter, page size, cursor) and ordering | Unverified |
| Field names of a conversation (id, times, title, overview, a "discarded" flag, speakers) | Unverified |
| Whether the detail response already includes the transcript | Unverified |
| Error body shape for a missing scope | Unverified |
| Whether any rate-limit headers other than `Retry-After` are sent | Unverified |

S0 below settles the unverified rows before the adapter is final.

## Decisions

Recommendations are in the last column. The owner decides only D1 to D3; the rest follow from the code and are listed so they can be overruled.

| # | Question | Recommendation |
|---|---|---|
| D1 | Do cloud conversations become `Meeting` rows, go through the Omi agent's Meeting/Note/Trash sorting, or something else? | **Meeting rows, through the meeting-source registry, with a cheap filter and no model sort.** See "Conversations". |
| D2 | Where do memories go: Data room note, agent memory, or skipped? | **One Data room note in the private "Omi/Memories" folder.** Not agent memory. See "Memories". |
| D3 | How far back does the first import go? | **90 days** (the existing `MEETINGS_BACKFILL_DAYS`). A longer history is a one-line change later; at 25 transcripts an hour, a year of busy days takes days. |
| D4 | Does a pendant recording win over the same stretch from the cloud? | **Yes.** It has our own transcript and audio backup. See "Both routes at once". |
| D5 | Same Omi connection as the pendant, or a second one? | **A second `Connection` (`connectorId: "omi-cloud"`).** See "Connection and key". |

## Design

### Connection and key

The key is stored exactly as the Granola key is: `connectGranola` in `apps/api/src/meetings.ts` calls `secrets.put`, then `persistPreparedSecret` around a transaction that creates a `Secret` row (kind `connection`) and the `Connection` with `secretId`, under an advisory lock so a user has one connection. A new `connectOmiCloud` in `apps/api/src/omi-cloud.ts` copies that shape. On a repeat connect it replaces the secret, clears the sync state's `error`, and deletes the old secret. Before storing, it checks the key with one `list` call, the way `checkKey` does for Granola.

A second connection is used because the pendant's `Connection` (`connectorId: "omi"`, `apps/api/src/omi.ts`) has no secret and its status drives the pendant page. The sync job sets `status = needs_reconnect` when a key is rejected. On a shared row, one rejected cloud key would make the pendant page look disconnected. A separate row keeps the two routes independent, and `meeting_sync_states.connectionId` is unique per connection, which fits.

The connection is private (`allAgents: false`, `privateByDefault: true`). It does not get a second agent: `agentBotId` points at the Omi agent that the pendant plan already provisions, and the cloud connection provisions it through `provisionConnectionAgent` only when the user has no pendant. Whether `provisionConnectionAgent` can attach a second connection to an existing agent is unverified and is the first check in S2.

### Conversations

**Recommendation: `Meeting` rows via the registry, with a deterministic noise filter, and no sort call.**

- The registry (`packages/adapters/src/meeting-source-registry.ts`) is built for this: one entry, one `MeetingSource`, no new job. `runMeetingSyncJob` already handles the claim, the 5-minute reconcile, key rejection, `Rate limited until`, and chained passes. A new `omi-cloud-meeting-source.ts` is modeled on `granola-meeting-source.ts` (throttle, `Retry-After`, zod-parsed responses, `MeetingSourceError`).
- Provider string `omi_cloud`, external id = Omi's conversation id. The pendant uses provider `omi` with ids like `<audioItemId>:<start>`, so the unique key `(spaceId, userId, provider, externalId)` never collides, and deleting a cloud meeting tombstones only the cloud one. The `MeetingSourceRegistry` entry sets `connectorId: "omi-cloud"`, so no other connection's secret can reach this source.
- Why not the Omi agent's sort: `omi.sort` writes `OmiSegment` rows that require an `audioItemId` (`packages/db/prisma/schema.prisma`, model `OmiSegment`), and its Note and Trash outcomes are built around an audio backup that cloud data does not have. Reusing it means a nullable `audioItemId`, a new migration and changes to the move and re-sort code. That is a bigger change than this feature, and Omi has already segmented its conversations.
- Noise: Omi records all day, and every `Meeting` costs one `meetings.digest` model call. The source skips (a) conversations Omi marks as discarded, (b) conversations with no transcript or under 2 minutes of speech, and (c) deleted ones (`deleted: true`, which the sync pass already honours). The field names behind (a) and (b) are unverified; S0 fixes them. Anything that passes the filter is an ordinary meeting the user can delete (tombstone keeps it deleted). If this is still noisy in use, a Note/Trash model sort is a follow-up, not v1.
- Digest, Inbox to-dos, meeting taint and agent reading are unchanged: they act on `Meeting` rows. The Omi agent and the Granola agent read cloud meetings under the existing rules (pendant D2b).
- Transcript lines: Omi's speaker labels go in `speaker` if present, else plain text. `attendees: []` (names are not turned into people), as for the pendant.

### Memories

**Recommendation: one markdown item "Omi memories" in the private "Omi/Memories" Data room folder, rewritten on each sync.**

- A memory is a short fact Omi inferred, often from overheard speech. Writing it into agent memory (`MemoryDocument`, `packages/db/prisma/schema.prisma`) would let third-party speech persist as something the user's agents later treat as their own. A Data room item keeps it labelled as Omi data: `source: "omi"`, `sourceConnectionId` = the cloud connection. The pendant plan's rules then apply without new code: hidden from agents without a `BotConnectionAccess` grant (`deniedConnectionIds` in `packages/core/src/connection-access.ts`), readable by the Omi agent's Omi-only Data room tools, and an agent that reads it becomes meeting-tainted.
- It is one item, not one per memory, because the list is a mirror: the job reads all memories, renders a dated list, and replaces the item through `createFileDataRoomItem` (`packages/adapters/src/data-room-files.ts`) with a fixed external id (`omi-cloud-memories`). A memory deleted in Omi disappears at the next sync. The text is capped (1 MiB); beyond that the oldest are cut. `ponytail:` one item; split by month if lists get large.
- A separate job `omi.memories` (not the meeting sync, because `MeetingSource` has no memory notion). It runs daily per connected cloud connection from the same reconcile pass, and once on connect. Its state is a small object in `Connection.metadata` (`memories: { syncedAt, state }`), because `meeting_sync_states` is per source and holds meeting cursors.
- If the account answers `403 developer_memory_access_not_ready`, the job stores `state: "not_ready"`, writes nothing, and tries again at the next daily run.

### Staying inside the rate limits

The shared bucket is 60 conversation reads an hour, and transcripts are limited to 25 an hour. If the detail response does not include the transcript, each conversation costs one detail read and one transcript read, so a first import runs at about 25 conversations an hour; if it does, about 55. A year of 8 conversations a day is roughly 3,000 conversations, which is five days at 25 an hour. The plan accepts that, and D3 starts with 90 days (about 700, one day).

- **Cursor.** `runMeetingSyncPass` (`packages/adapters/src/meeting-sync.ts`) already keeps a persisted pass cursor (`PassCursor`: next page, `createdAfter`, `startedAt`) saved after each finished page, skips conversations already stored (`alreadyHave`), and moves `syncedThrough` only after a full pass. A long import that stops resumes from the saved page; at worst one list read is repeated.
- **No in-memory counters.** Several workers run, so a per-process budget would be wrong. The source does not count requests. It stops on `429`: like Granola's source, it reads `Retry-After` and throws `MeetingSourceError("rate_limit", …, retryAfterMs)`. `runMeetingSyncJob` stores `Rate limited until <time>`, releases the claim, and enqueues itself at that time (at least 60 seconds). The state survives restarts because it is in `meeting_sync_states`.
- **Pace so 429 stays rare.** Add an optional `chainDelayMs` to a registry entry (today `CHAIN_DELAY_MS` is 1 second for every provider). Omi uses 2 minutes, and `pagesPerRun` limits each run to a few conversations, which is about 20 an hour while a backfill is in progress. Incremental runs after the first pass read only new items, far under the limits.
- **Truncated list.** If a list answers `X-Omi-List-Truncated: true` and there is no way to continue (no cursor), the source throws `MeetingSourceError("unavailable", "Omi returned a partial list")`. The checkpoint does not move, so nothing is skipped silently. Whether a date window can be halved to recover is S0's question.
- **Pacing sync requests from agents.** `requestMeetingSync` already refuses while a rate-limit time is in the future.

### Both routes at once

A user can use the pendant through Praci and also run the Omi phone app, so the same talk can arrive twice. Only the Meeting level matters; memories have no pendant counterpart.

- Rule: a cloud conversation is skipped if a pendant meeting (provider `omi`) of the same user overlaps at least half of its time range; the pendant version wins (D4).
- Where: a small shared helper in `packages/adapters` that finds overlapping meetings of the other provider. It is called (a) by the sync pass before storing a cloud conversation, through a new optional `skip(meeting)` dependency on `MeetingSyncDeps`; the skipped id gets a `MeetingTombstone` so it is not fetched and judged again; and (b) in `omi-sort.ts` where a pendant meeting is created (`upsertOmiMeeting`): if a cloud meeting overlaps, that cloud meeting is deleted through `deleteMeetingsWithTodos` and tombstoned. Order of arrival then does not matter.
- Check in S3 that `upsertMeeting` returns `tombstoned` for the skipped id (`packages/db/src/meetings.ts` shows it does for a tombstoned key) and that `alreadyHave` does not re-read it.
- Overlap is computed from `startedAt`/`endedAt`. Pendant times can be approximate (`rtc_valid` false), so the match window is padded by 2 minutes. A mismatch leaves two meetings, which the user can delete; this is the accepted failure.

### Errors shown

Everything uses the existing key-card states from the Granola page; rate limiting is silent as there.

| Case | Detection | Shown |
|---|---|---|
| Bad key | `401` on connect, or on a sync (`MeetingSourceError("auth")`, which sets `needs_reconnect`) | On connect: "Omi rejected this key." On a later sync: the existing Reconnect state. |
| MCP key | Key starts with `omi_mcp_`, checked before any request; a `401` would follow on REST | "This is an MCP key. Create a Developer key in the Omi app." |
| Missing scope | `403` that is not `developer_memory_access_not_ready` on the connect check of the list (conversations) or the memories call. Body shape unverified (S0). | Conversations: "This key needs the conversations scope." Memories: shown only as "Memories are off for this key." and conversations still sync. |
| Memory not ready | `403 developer_memory_access_not_ready` | A quiet line "Memories are not available on this Omi account yet." No error state; retried daily. |
| Rate limited | `429` | Nothing. The sync waits and resumes; the page keeps showing the last sync time. |
| Omi unreachable | network error, `5xx` | Existing "unavailable" handling; the next reconcile retries. |

New visible copy, quoted for the PR description. Each line appears only when the condition occurs; none is explanatory chrome:

- Field label "Omi developer key", button "Connect": needed to enter a key. The Omi page already says "Connect pendant", so the cloud action is labelled separately.
- The four messages in the table above: each tells the user the one action that fixes the problem, and removing them leaves a generic "failed".
- "Memories are not available on this Omi account yet.": an account state the user cannot see otherwise. Revealed only when the state is `not_ready`.

### Surfaces

| Surface | Change |
|---|---|
| API (`apps/api`) | New `omi-cloud.ts` and routes for connect, status, disconnect. |
| Worker / adapters | New source, emulator, `omi.memories` job, reconcile extension, dedupe helper. |
| Web, Omi page (`apps/web/src/components/integrations/OmiPage.tsx`) | A key section: field, status line (last sync, memories state), Remove. Hidden behind a quiet "Use an Omi key" link until used, so users without a key see no new chrome. |
| Electron | None. It hosts the web page. Key entry works there, and sync runs on the server. |
| Expo mobile | No new screen and no key entry. Cloud meetings and the Omi folder in the Data room show up through the existing read-only meetings and Data room screens, if those lists exist. The pendant plan already states mobile has no Omi code (`docs/omi/README.md`). |
| Native iOS (`apps/ios`) | Same as Expo: read-only through meetings and Data room access. |

## Slices (one PR each)

Hand test for each: `DEMO_SLOT=<n> pnpm demo:up` from the task worktree, never the live stack. The demo runs the Omi cloud emulator with invented conversations and a fake key printed by `demo:up` (like `DEMO_GRANOLA_KEY`). The real Omi API is not tried by any slice except S0 and an owner-run check.

| Slice | Scope | Files touched | Tests | Demo check |
|---|---|---|---|---|
| **S0 Read-only probe** | A throwaway local script (not merged; findings go into this doc) that the owner runs with a real key: lists conversations, reads one detail and transcript, lists memories, prints status codes and field names, never the content. Settles the unverified table rows (paths, list params and order, field names, transcript location, scope-error body, rate-limit headers). | none merged | none | Owner runs it once against the real account. |
| **S1 Source and emulator** | Contract and `OMI_CLOUD_CONNECTOR_ID`; `createOmiCloudMeetingSource` (throttle, `Retry-After`, truncation, noise filter); `OmiCloudApiEmulator` with invented data (conversations, one discarded, one too short, memories, a 429 mode, a `403 not ready` mode, an `omi_mcp_` rejection); registry entry with `chainDelayMs`. | `packages/contracts/src/omi.ts` (new constants and schemas), `packages/adapters/src/omi-cloud-meeting-source.ts`, `omi-cloud-api-emulator.ts`, `meeting-source-registry.ts`, `meeting-sync-job.ts` (`chainDelayMs`), `packages/adapters/src/index.ts`, `packages/testkit` demo fixtures | Offline unit tests of the source against the emulator: paging, 429 with `Retry-After`, 401, truncated list, filter rules, zod mapping errors. A sync-job test (Postgres) that a rate-limited run resumes from the saved cursor. | `demo:up` stays green; nothing visible yet. |
| **S2 Connect and scheduled sync** | `connectOmiCloud` (MCP prefix check, key check, secret store as Granola, one connection per user), status and disconnect, agent attach, and `reconcileMeetingSyncs` extended to the `omi-cloud` connector. Disconnect keeps stored meetings, as Granola does, and offers delete. | `apps/api/src/omi-cloud.ts`, the router file that mounts `connectGranola`, `packages/contracts/src/omi.ts`, `packages/adapters/src/meeting-sync-job.ts`, `background-job-handlers.ts` | Postgres API tests modelled on `apps/api/src/meetings.postgres.test.ts`: bad key, MCP key, missing scope, reconnect clears error, one connection per user, another user's connection untouched. Reconcile test. | Paste the demo key via the API, see the three emulator conversations become meetings in the Meetings list; paste a bad key and see the rejection. |
| **S3 No duplicates with the pendant** | Overlap helper, `skip` dependency in the sync pass, hook in `omi-sort.ts`, tombstone for skipped ids. | `packages/adapters/src/meeting-sync.ts`, `omi-sort.ts`, a new helper file, `packages/db/src/meetings.ts` only if needed | Postgres tests: cloud first then pendant, pendant first then cloud, partial overlap under half, padding for approximate times, other users' meetings untouched, tombstoned id not re-fetched. | Seed a pendant meeting in the demo that overlaps one emulator conversation; the sync shows only one meeting for that time. |
| **S4 Memories** | `omi.memories` job, "Omi/Memories" item, `not_ready` state in `Connection.metadata`, daily scheduling, rewrite and removal. | `packages/adapter-kit/src/background-jobs.ts`, `packages/adapters/src/background-job-handlers.ts`, new `omi-memories.ts`, `omi-cloud-meeting-source.ts` (client shared with S1) | Offline tests: item created, rewritten, a removed memory disappears, `403 not ready` writes nothing and sets the state, oversize cut, item hidden from an agent without a grant. | The folder holds one item with the emulator's memories; switch the emulator to `not ready` and see the state line, with conversations still syncing. |
| **S5 Web page** | Key section on the Omi page, status line, errors from the table, Remove (with "Delete synced data too"), Storybook states, i18n catalog. | `apps/web/src/components/integrations/OmiPage.tsx`, `OmiPage.stories.tsx`, `OmiPage.test.tsx`, `OmiPageData.test.tsx`, `omi-fixtures.ts`, locale catalogs, `docs/design-system/` via `pnpm design-system` | Component tests for each state; `node .storybook/smoke.mjs`; E2E screenshot of the page with a connected key, linked in the PR. | Use the page in the browser: connect, see meetings and memories, trigger each error from the emulator, remove. |

## Owner decisions (2026-11-05)

The owner chose the recommendation for all three: 90 days of history, the simple filter with no model sort, and running the S0 probe with their own key before S1 merges.

### Original questions

1. **D3, how far back.** Recommend 90 days. If you want all history, say so; the first import then takes days at the 25-an-hour transcript limit and runs unattended.
2. **Noise.** Recommend the deterministic filter (discarded and under 2 minutes) with no model sort in v1. If your Omi records all day and Meetings fill up, the alternative is sorting each conversation into Meeting, Note or Trash, which needs `OmiSegment.audioItemId` to become optional.
3. **Run S0 with your real key?** Recommend yes before S1 merges, so the adapter matches the real API; otherwise S1 ships against an emulator built from the docs and the first real sync is the test. The probe prints no content.

## Not built

- Writing anything back to Omi. The key can be created read-only.
- Webhooks, which need a public URL.
- Omi action items and audio (no audio download exists).
- Writing Omi memories into agent memory.
- Mobile key entry.
