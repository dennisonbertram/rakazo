# Hex meetings, dictation and meeting capture

Status: plan only, no product code. Written 2026-11-01. Praci references were read at `origin/main` (cd894cf50). Hex references were read from `github.com/anomalyco/hex`, branch `dev` at b0e7196c7b, and from the npm README of `@kitlangton/hex@0.3.1`. Mockup: `docs/hex/mockup.html`. Format follows `docs/omi/README.md` and `docs/plans/granola.md`.

## Summary

The owner asked for three things, prompted by Hex (local, MIT-licensed dictation and meeting recorder for macOS):

1. **Import Hex meetings** into Praci meetings, as Granola and the Omi pendant already do.
2. **Dictation** in Praci's composer on every surface where it can work.
3. **Meeting capture**: Praci records a meeting itself, transcribes it, and stores it as a Praci meeting with a summary and to-dos.

All three end in the same place: a `Meeting` row that the existing digest job turns into decisions, follow-ups and Inbox to-dos, and that meeting-source agents read under the existing meeting-taint rules. The plan adds no new speech interface. The existing `TranscriptionProvider` (audio in, text out) covers dictation and long meetings once meetings are cut into short chunks. What is new is where audio is captured (per surface), one optional on-device engine on the desktop, one self-hostable server provider, a small capture API, and a Meetings page.

Audio is not kept. On the desktop with the on-device engine, audio never leaves the computer; only text reaches the API. Everywhere else, audio chunks go to the Praci API, are transcribed by the user's chosen speech-to-text provider, and are deleted as soon as their text is stored.

## User stories

- **Dictate.** "I click the mic in the composer, talk, and the words appear in my draft. I edit and send." On the desktop with Hex installed, nothing I say leaves my Mac.
- **Import.** "I already record calls with Hex. When I open Praci, those calls are in my meetings and the promises I made are in my Inbox."
- **Record.** "A call is starting. I click Record in Praci, everyone has been told, and when I click Stop I get a title, a summary and my to-dos a minute later."
- **Ask.** "What did I promise Dana on Tuesday?" The Meetings agent answers with a citation to the meeting.
- **Control.** "My company decides whether recording is allowed in our space and whether I must confirm consent every time."

## What is confirmed about Hex

Sources are paths in `anomalyco/hex` at b0e7196c7b unless a URL is given. Nothing here was run against a real Hex install.

| Fact | Status | Source |
|---|---|---|
| MIT license; macOS on Apple silicon (macOS 15+) is the main release; Windows and Linux are beta | Confirmed | GitHub repo metadata, `README.md` |
| Meetings are a Labs feature, off by default; recording captures microphone ("You") and system audio ("Them") as separate tracks and transcribes on the Mac | Confirmed | `docs/features/meetings.md` |
| Read-only CLI: `hex meetings list --since <t> --json`, `hex meetings show <id> --json`, plus `chapters` and `search`. Reads never start the app, open the microphone, load a model, make network requests or write files | Confirmed | `docs/transcript-cli.md` |
| JSON contract "version 1": every response has `version: 1`; consumers must ignore unknown fields; incompatible changes bump the version | Confirmed | `docs/transcript-cli.md` |
| `Meeting`: `id`, `title`, `timestamp_ms`, `duration_ms`, `application` (nullable), `status` (`starting`, `recording`, `transcribing`, `complete`, `interrupted`, `failed`), `in_progress`, `transcript_source` (`final`, `rolling`, `missing`), `warnings[]` | Confirmed | `docs/transcript-cli.md` |
| `MeetingShow`: `meeting`, `notes` (`title`, `summary`, `generated_at_ms`, or null), optional `chapters`, `entries[]` with `source` (`microphone` or `system`), `start_ms`, `end_ms` (relative to meeting start), `text`. Remote speakers are not separated | Confirmed | `docs/transcript-cli.md` |
| `meetings list` returns at most 200 per call (default 20); IDs look like `1790000500000-1002` | Confirmed | `docs/transcript-cli.md` |
| No attendee names or emails, no calendar event, no "updated at" field in the meeting JSON | Confirmed by absence in the contract | `docs/transcript-cli.md` |
| Hex keeps new meetings **24 hours by default** (user can choose 7 days, 30 days, Forever); expired meetings are hidden from queries at once | Confirmed | `docs/features/meetings.md`, "Retention" |
| `HEX_APPLICATION_SUPPORT_DIR` overrides the data root, for fixtures | Confirmed | `docs/transcript-cli.md` |
| The transcript CLI reads currently target macOS; Linux and Windows keep their older command surfaces | Confirmed | `docs/transcript-cli.md` |
| Executable path when not on PATH: `/Applications/Hex.app/Contents/MacOS/hex` | Confirmed | `docs/transcript-cli.md` |
| Control CLI (`hex meetings record`, `stop`, `dictation start`) talks to the running app over a bearer-authenticated local API | Confirmed; not used by this plan | `docs/cli.md` |
| `hex mcp`: read-only MCP server over stdio with `list_meetings`, `search_transcripts`, `get_transcript`, `get_meeting_notes` | Confirmed; not used (stdio, local only) | `docs/features/meetings.md`, "Agent Access" |
| `@kitlangton/hex` 0.3.1 (npm): spawns `hex service --embedded` as a child, `create({ command, model, language })` then `transcribe(wav)` returns `{ transcript, durationMs }`; final text only, no partials; ESM, Node ≥ 20.3; the bundled native helper is not published, so the command must point at an installed Hex executable | Confirmed (README) | npm README, `docs/specs/local-transcription-service.md` |
| Embedded service models include `parakeet_unified_en`; `models.list()` is the source of truth | Confirmed (README) | npm README |
| Hex's executable code signature or Team ID | Unknown | — |
| Whether `hex service --embedded` exists in the shipped Hex.app binary (versus a separate `hex-service`) | Unverified; README examples use both names | npm README |
| Exit codes and stderr format of the read-only commands beyond "nonzero on error" | Unverified | — |

## What "done" looks like per surface

| Capability | Web | Electron (macOS) | Electron (Windows, Linux) | Native iOS | Expo (Android, iOS) |
|---|---|---|---|---|---|
| Composer dictation | Mic in the composer; audio goes to the user's speech-to-text provider through the existing `/api/voice/transcribe` | Same, or on-device through Hex when installed (S7) | Server path only | Already shipped: on-device `SFSpeechRecognizer` in the composer (`apps/ios/Sources/Praci/Voice/DictationControl.swift`); no change | No in-app button: the keyboard's own mic already works (`apps/mobile/lib/thread-composer-dictation.test.tsx`). Native-first, so no custom control |
| Hex import | Not possible (Hex is local). The Hex tile shows its last sync, if any, read-only | Yes (S3) | No: Hex's transcript CLI targets macOS only. Tile hidden | No | No |
| Meeting capture | Microphone, plus a shared tab's audio in Chrome and Edge (a browser call). Safari and Firefox: microphone only | Microphone and system audio (S6) | Microphone and system audio on Windows (`loopback`); microphone only on Linux | Microphone only (S8): in-person meetings. Phone and FaceTime call audio cannot be captured by an app | Not in this plan (D10). Meetings are readable; Record is not shown |
| Meetings page | List and detail (S4) | Same | Same | Detail in the native app (S8) | Read-only list and detail (S8b, optional) |

## Architecture

### One speech-to-text interface

`TranscriptionProvider` in `packages/adapter-kit/src/interfaces.ts` already has the right shape: `transcribe({ audio, mimeType, language?, context? }) → { text }`. The plan keeps it.

- **Dictation** is final text after the user stops talking. That is what the existing web `Dictation` class (`apps/web/src/lib/dictation.ts`, used by Call Elio) does in `hold` and `endpoint` mode, and what Hex's SDK offers. No streaming method is added. `ponytail:` add an optional `transcribeStream?` only when a UX needs live partial text.
- **Meetings** are long. The capturing client cuts each track into chunks of about 30–60 seconds at a quiet point (at most 60 s, so a chunk stays under 4 MiB and under every provider's request limit), and each chunk is one `transcribe` call. A chunk carries its track (`microphone` or `system`) and its start and end offsets, which give the transcript its speaker labels and times without diarization.

### Engines (adapters)

| Engine | Where it runs | Used by | Notes |
|---|---|---|---|
| Existing providers (OpenAI, ElevenLabs, Fish Audio) | API and worker, with the user's key from Settings → Voice | Dictation and capture on every surface | `packages/adapters/src/voice-factory.ts`. Unchanged |
| **OpenAI-compatible transcription** (S2) | API and worker | Same | A new catalog entry storing `{ baseUrl, apiKey?, model }` in the user's voice credential secret. Points at any server that speaks `POST /v1/audio/transcriptions` (a self-hosted Whisper or Parakeet server, or a hosted one). This is what makes the server path work with no hosted vendor, and it uses shared connection settings, not a new environment variable |
| **On this device (Hex)** (S7) | Electron main process only | Dictation and capture in the desktop app on Apple silicon Macs with Hex installed | Implements `TranscriptionProvider` in `apps/desktop` (a composition root) with `@kitlangton/hex` spawning the installed `hex service --embedded`. Audio is WAV from the renderer over IPC; only text leaves the main process. The model is prepared once with progress; transcription never downloads |
| Scripted transcription | Tests and demo | Everything | Exists (`packages/adapters/src/scripted-transcription.ts`); the conformance test (`transcription-conformance.test.ts`) gains the two new adapters |
| Browser Web Speech | — | Not used for the composer or capture (D8) | In Chrome it sends audio to the browser vendor's cloud without a Praci setting saying so, and Electron has no key for it. It stays where it is today (Call Elio fallback) |

Engine choice per request: on the desktop, the on-device engine when it is ready and the user picked it in Settings → Voice; otherwise the user's `TranscriptionSelection`. No engine available: the composer mic is hidden and Record is disabled with "Add speech to text" (D7).

### Where audio is captured

- **Web and Electron renderer:** `getUserMedia({ audio: { echoCancellation: true } })` for the microphone. For the other side of a call: on web, `getDisplayMedia({ audio: true })` lets the user share a tab with its audio (Chrome and Edge); on Electron, main answers `setDisplayMediaRequestHandler` with `audio: "loopback"` and no picker. Electron's docs (v44) say `loopback` is "currently only supported on Windows" in the API table, while the macOS caveats say Chromium uses Apple's Core Audio tap for desktop audio from macOS 14.2 and needs `NSAudioCaptureUsageDescription` in `Info.plist`, or the stream is silently dead. P0 settles which is true on Electron 44.3 before S6 builds on it.
- **Two tracks, two recorders.** Microphone and system audio are recorded separately, like Hex, so lines are labelled "You" and "Them" without diarization.
- **Chunk format.** Server path: a fresh `MediaRecorder` per chunk (Opus in WebM; MP4/AAC in Safari), so each chunk decodes alone. Device path: 16 kHz mono PCM from an `AudioWorklet`, encoded as WAV for Hex. `ponytail:` restarting a recorder per chunk can drop a few milliseconds at boundaries; overlap chunks if P0 shows lost words.
- **Native iOS:** `AVAudioEngine` microphone tap, the `audio` background mode while recording, chunks uploaded like the web.
- **Hex import:** no capture; Hex already recorded and transcribed.

### Capture flow (server path)

1. Record → client calls `meetingCaptures.start({ clientId, title?, engine, tracks, consentConfirmed? })`. The API checks the space's recording policy (below) and returns `captureId`.
2. Every chunk: `POST /api/meeting-captures/:id/chunks?track=&seq=&startMs=&endMs=` with the audio bytes (`application/octet-stream`, at most 4 MiB, idempotent on `(captureId, track, seq)` with a SHA-256 check like `omi_uploads`). The blob goes to the existing `ArtifactStore`; job `meetings.capture_transcribe` (3 attempts) transcribes it with the user's provider, stores the text on the chunk, and deletes the blob.
3. Stop → `meetingCaptures.finish({ captureId, endedAt })` queues `meetings.capture_finalize`, which waits until every chunk is `done` or `failed`, orders lines by offset, writes one `Meeting`, and queues the existing `meetings.digest`.
4. A capture with no new chunk for 30 minutes and no `finish` (closed laptop, crash) is finalized by a sweep in the same job, with what arrived.

Device path: the same, except step 2 sends text (`meetingCaptures.appendText({ captureId, track, seq, startMs, endMs, text })`), so no audio reaches the server and no transcribe job runs.

Upload failures: the client keeps unsent chunks in IndexedDB (as the Omi page does) and retries; it deletes a chunk only after a 2xx. Closing the tab while recording shows the browser's leave prompt.

### The stored meeting

`Meeting` already holds everything the result needs. Mapping:

| Field | Native capture (`provider: "praci"`) | Hex import (`provider: "hex"`) |
|---|---|---|
| `externalId` | `captureId` | Hex `id` |
| `connectionId` | null | the user's Hex `Connection` |
| `title` | the title typed at start, or "Meeting 2:30 PM" (local time) | `notes.title`, else `meeting.title` |
| `startedAt` / `endedAt` | capture start and end | `timestamp_ms` and `timestamp_ms + duration_ms` |
| `attendees` | `[{ name, email }]` of the user only (the verified account email) | same |
| `transcript` | lines `"<user name>: …"` for the microphone, `"Them: …"` for system audio, ordered by offset | same mapping from `entries[].source` |
| `summary` | empty; the digest supplies decisions and follow-ups | `notes.summary` (Hex's two-sentence summary), else empty |
| `folders` | `[]` | `[application]` when present |
| `sourceUpdatedAt` | finish time | `max(timestamp_ms + duration_ms, notes.generated_at_ms)` |

Putting the user in `attendees` with their verified account email, and their name on microphone lines, is what lets `isMine` in `packages/adapters/src/meeting-digest.ts` match "I'll send the deck" to the user, so to-dos are created. Today Omi meetings store `attendees: []`, so they never produce to-dos; this plan does not change Omi.

Other people are never turned into attendees: Hex does not know them and the plan does not guess them from speech. `ponytail:` match a calendar event overlapping the capture for its title and attendees when the calendar is stored; today the calendar is read live from Google, so it is left out.

### Hex import (desktop only)

- **Bridge.** Electron main adds `desktop.hex.list(sinceMs)` and `desktop.hex.show(id)` IPC handlers; `preload.cjs` exposes them as `rakazoDesktop.hex`. Main runs the executable with `execFile` (no shell) and a fixed argument list: `meetings list --since <ISO> --json` and `meetings show <id> --json`. `id` must match `^[0-9]+-[0-9]+$`. Timeout 15 s; stdout cap 4 MiB; stderr cap 16 KiB and never shown to the renderer or logged beyond a short reason. Output is parsed with a zod schema of the version-1 contract; `version !== 1` is "Update Hex".
- **Executable.** Only two absolute paths are tried: `/Applications/Hex.app/Contents/MacOS/hex` and `~/Applications/Hex.app/Contents/MacOS/hex`. `PATH` is not searched, so a planted `hex` on PATH is never run. Signature checking waits until Hex's Team ID is known (unknown above).
- **Push, not pull.** The renderer, which holds the user's session, posts mapped meetings to `meetings.importLocal({ connectionId, meetings })` (at most 10 per call, each a `SourceMeeting`). The API validates them with `SourceMeetingSchema`, checks that the connection is the caller's `hex` connection, and calls the existing `upsertMeeting`, which honours `MeetingTombstone` and stale updates. A multi-tenant API never reaches into a user's machine.
- **What is imported.** `status` `complete`, and `interrupted` with a `rolling` transcript. Skipped: `starting`, `recording`, `transcribing`, `failed`, and `transcript_source: "missing"`. A meeting already stored is re-sent only when its `sourceUpdatedAt` grows (notes generated later). `ponytail:` a rename in Hex is not noticed, because the contract has no updated-at field.
- **Cadence.** Hex keeps meetings 24 hours by default, so a sync runs when the desktop app starts, when its window gains focus, and every 5 minutes while it is open. `list` is a local file read that Hex measured at a few milliseconds. The first sync reads back 90 days (`MEETINGS_BACKFILL_DAYS`); Hex will usually only have the last day. The tile says when Praci was last open long enough to sync.
- **Sync state.** `MeetingSyncState` for the Hex connection keeps `syncedThrough` (newest `timestamp_ms` imported) and `lastSyncedAt`; the next pass lists from `syncedThrough` minus `MEETINGS_SYNC_OVERLAP_MS`.
- **Auth.** None. Hex is local and has no account. The `Connection` (`connectorId: "hex"`, `provider: "hex"`, no secret, `privateByDefault: true`, `allAgents: false`) exists so the meetings have an owner record, the tile has a state, and Disconnect works.
- **Failure states on the tile:** not found ("Install Hex"), too old or contract changed ("Update Hex"), Meetings off in Hex (shows as zero meetings; Praci cannot tell them apart), read failed ("Couldn't read Hex", retried on the next pass), upload failed (retried on the next pass; nothing is lost while Hex still has the meeting).
- **Disconnect** stops syncing and keeps imported meetings (like Granola), with "Delete imported meetings too".

### Duplicates between Hex and Praci recordings

A user may record the same call with Hex and Praci. Rule: when a `hex` meeting and a `praci` meeting of the same user overlap by at least half of the shorter one, the one stored first wins. `importLocal` skips the Hex meeting and adds a `MeetingTombstone` so it is not offered again; `capture_finalize` still stores the Praci meeting but the digest's existing to-do de-duplication (same normalized text) prevents double to-dos. `ponytail:` first-stored wins, not best transcript; revisit if users complain. Granola and Omi are not part of this rule.

### Meetings page (D1, needs the owner's OK)

The Granola plan chose "no meetings page"; the Omi mockup drew one. Native capture changes the case: a user who clicks Record needs a place to start it, to see it is still recording, and to read the result. Recommendation: one **Meetings** entry in the sidebar (under Calendar), with:

- A list of the user's meetings, newest first, with source and duration, the existing Delete, and **Record** at the top right (where the surface can record).
- A detail view: title, date and time, duration, source; the digest's decisions and follow-ups; the user's to-dos from that meeting (existing `InboxTodo.meetingId`); the transcript, collapsed. Nothing else, because nothing else is stored.

It replaces `StoredMeetingsList` (today reached from the Granola page), which becomes a link to the Meetings page. New contract: `meetings.get({ meetingId })` returning those fields; `meetings.list` gains `endedAt` and a `recording` flag for in-progress captures.

### Recording indicator

While a capture is running, a pill sits at the top of the app shell on every page: red dot, title, elapsed time, **Stop**. It cannot be hidden. On Electron, the window title and the dock badge also show recording, and quitting asks "Stop recording and quit?". Stopping turns the pill into "Transcribing…" until the meeting is stored, then it disappears and the meeting opens if the user is on the Meetings page.

## Consent and privacy

### Recording other people

Laws on recording conversations differ by place and by whether everyone must agree. This plan gives no legal advice; it gives the space an explicit policy, set by the space's owners and admins, and enforced by the API:

| Policy | Start flow | API check |
|---|---|---|
| **Remind** (recommended default, D2) | The Record popover shows one line: "Tell everyone you're recording." Start is one click | none |
| **Confirm** | The popover has a checkbox "Everyone agreed to be recorded"; Start is disabled until it is ticked | `start` rejects without `consentConfirmed: true`; the time of consent is stored on the capture |
| **Off** | Record is not shown in this space | `start` returns FORBIDDEN |

Policy changes apply to new captures. Hex imports are not governed by it: Hex recorded the call under the user's own Hex settings, outside Praci. That is stated once in the plan, not in the UI.

### What leaves the device and when

| Path | Leaves the device | Goes to |
|---|---|---|
| Desktop, on-device engine | Text only, chunk by chunk while recording | The Praci API |
| Every other capture or dictation | Audio chunks while recording, then text | The Praci API, then the user's chosen speech-to-text provider. Blobs are deleted once their text is stored |
| Hex import | Text only (title, Hex summary, transcript) | The Praci API |
| Summary and to-dos | Transcript text | The user's AI model, through the existing digest job, only with AI-data consent |

`hasVoiceConsent` gates server transcription as it does today; the existing AI-data consent gates the digest and agent reads. Nothing is sent to Anomaly. No audio or transcript appears in logs, job payloads (ids only) or error strings.

### Retention and deletion

- Audio: deleted after its chunk is transcribed (D3). A failed chunk's blob is deleted after its last attempt; its stretch is missing from the transcript and the meeting shows "Part of this meeting could not be transcribed". Discarding a capture deletes every chunk.
- Transcripts and meetings: kept until the user deletes them (D4), like Granola. Hex's own 24-hour default does not carry over; deleting in Praci does not delete in Hex and vice versa.
- Delete a meeting: the existing `meetings.delete` (meeting, to-dos, tombstone). Delete a capture in progress: Discard.
- Account export: `meeting_captures` holds no content once finalized and is not exported; `meetings.json` already exports meetings.

### Meeting taint

Spoken words are untrusted input from anyone in the room. Imported and recorded meetings are ordinary `Meeting` rows, so every existing rule applies unchanged (`docs/plans/granola.md`, "Reading: tools and untrusted text"; `packages/adapters/src/meeting-tools.ts`): meeting-source agents get only `MEETING_AGENT_BUILTIN_TOOLS`, their threads are marked `meetingTaintedAt`, and every tool outside `MEETING_TAINT_FREE_TOOLS` then needs a per-call approval with no saved rule. Transcript text is wrapped as untrusted when returned to a model. The digest is a tool-less model call.

Which agent reads them (D6): recommended one **Meetings** agent, provisioned with `provisionConnectionAgent`-style code on the first Hex connection or first capture, registered with `registerMeetingSourceAgentCheck`. Granola and Omi keep their own agents, which also read these rows (Omi decision D2b).

## Data model and contracts

Migrations (names use the repo's timestamp convention; the timestamp is set when the slice lands):

1. `<ts>_meeting_recording_policy`: `spaces.meeting_recording` text, not null, default `'remind'`, check in (`remind`, `confirm`, `off`).
2. `<ts>_meeting_captures`:
   - `meeting_captures`: `id`, `space_id`, `user_id`, `client_id` (unique per user, makes `start` idempotent), `title`, `engine` (`device` or `server`), `tracks` text[], `status` (`recording`, `finishing`, `done`, `failed`, `discarded`), `started_at`, `ended_at`, `last_chunk_at`, `consent_confirmed_at`, `meeting_id` (nullable, set null on delete), `error` (short reason), timestamps. Index `(space_id, user_id, status)`.
   - `meeting_capture_chunks`: `id`, `capture_id` (cascade), `track` (`microphone` or `system`), `seq`, `start_ms`, `end_ms`, `sha256`, `blob_key` (nullable), `text` (nullable), `status` (`pending`, `done`, `failed`), `attempts`. Unique `(capture_id, track, seq)`.
   - Both added to `ROW_SECURITY_MODELS` (`packages/db/src/row-security.ts`) with the same space policy as `meetings`. Per-user scoping is the app-layer check, as everywhere.
3. No migration for Hex: `connectorId: "hex"` and `provider: "hex"` are strings. Add `HEX_CONNECTOR_ID` to `packages/contracts` and exclude it from the generic app list the way `granola-api` is.

Contracts (`packages/contracts/src/meetings.ts`, `rpc.ts`):

- `meetings.importLocal({ connectionId, meetings: SourceMeeting[] (max 10) }) → { created, updated, skipped }`
- `meetings.connectLocal({ source: "hex" }) → { connectionId }`, `meetings.disconnectLocal({ connectionId, deleteMeetings })`
- `meetings.localStatus() → { connectionId, syncedThrough, lastSyncedAt, count } | null` (the tile)
- `meetings.get({ meetingId })` → `{ id, title, startedAt, endedAt, provider, attendees, summary, decisions, followUps, todos[{ id, text, dueOn, doneAt }], transcript, partial }`. `partial` is true when the meeting came from a capture with a failed chunk (read from `meeting_capture_chunks`, so `meetings` gets no new column)
- `meetingCaptures.start | appendText | finish | discard | active`; `POST /api/meeting-captures/:id/chunks` for audio
- `spaces.setMeetingRecording({ policy })` (owner or admin)
- Voice catalog: `openai-compatible` entry with `transcribe: true`, secret `{ baseUrl, apiKey?, model }`

Jobs (`packages/adapter-kit/src/background-jobs.ts`): `meetings.capture_transcribe` (per chunk, 3 attempts, resolves the provider with `selectTranscriptionTarget` in `packages/adapters/src/voice-target.ts`, as `omi.transcribe` does), `meetings.capture_finalize` (per capture, idempotent: re-running finds `meeting_id` set and stops; also the 30-minute sweep). Payloads carry ids only. Any API or worker process can take any job; nothing is held in process memory or on server disk.

Desktop bridge (`apps/desktop/src/preload.cjs`): `rakazoDesktop.hex.{ available, list, show }` and `rakazoDesktop.speech.{ status, prepare, transcribe }`. The web app feature-detects them.

## Security review points

- **Local process execution (Hex).** Fixed absolute executable paths, `execFile` without a shell, an allowlisted argument list built in main (the renderer passes only `sinceMs` as a number and an id matched by regex), timeouts, output caps, zod-validated output, version check. The renderer never gets a generic "run a command" channel. Same review pattern as `apps/desktop/src/app-control-bridge.ts`.
- **On-device engine.** The SDK spawns the Hex executable as a child bound to `127.0.0.1:0` with a bearer token it prints on stdout; the token stays in main. The child is closed on app quit and on cancel. Model downloads happen only on an explicit "Prepare" in Settings, with progress.
- **Imported data is untrusted.** Validated against `SourceMeetingSchema`, capped at `MEETING_TRANSCRIPT_MAX_BYTES`, and treated as meeting text (taint). A malicious local file can only create meetings for the user who imports them.
- **Audio buffers.** Chunks live in renderer memory and IndexedDB until a 2xx, then are dropped; IndexedDB is cleared on Stop or Discard and on sign-out. Server blobs live in `ArtifactStore` under a key that includes space and user and are deleted after transcription. Upload route: session-authenticated, the capture must belong to the caller and be `recording` or `finishing`, size cap, idempotency by SHA-256.
- **Permissions.** Electron's `setPermissionRequestHandler` already allows audio-only `media` for the app origin (`apps/desktop/src/session-permissions.ts`); `setDisplayMediaRequestHandler` grants loopback only to the app origin, only with a user gesture, and only audio. `Info.plist` gains `NSMicrophoneUsageDescription` and `NSAudioCaptureUsageDescription` through electron-builder `mac.extendInfo`.
- **Secrets.** The OpenAI-compatible base URL and key are stored like other voice credentials (secret store, never returned to the client). The base URL is fetched by the server, so it goes through the existing outbound-URL guard (`packages/adapters/src/web-ssrf.ts`; S2 checks how model connections apply it, so private addresses are refused on the hosted service and allowed when self-hosted).
- **Policy is server-side.** The recording policy is enforced in `start`, not only by hiding the button.

## Slices

Each slice is one PR, testable on `DEMO_SLOT=<n> pnpm demo:up` with the scripted transcription provider and fixtures. Hardware-only checks are listed per slice; each PR says what was not tried.

| # | Slice | Regression tests | Needs real hardware or accounts |
|---|---|---|---|
| **S1** | **Composer dictation on web and Electron, server path.** Mic button in the composer (left of Send when the draft is empty and an engine is available); tap to start, tap or 1.2 s of silence to stop; text inserted at the cursor; reuses `Dictation` from `apps/web/src/lib/dictation.ts` and `/api/voice/transcribe`. Stories: idle, listening, transcribing, error | Composer test: mic hidden without a provider; transcript inserted at the cursor keeps the draft; mention and slash pickers still open; the draft key survives. Dictation unit test for insert-at-cursor | A real microphone in Chrome, Safari and Electron |
| **S2** | **OpenAI-compatible transcription provider.** Catalog entry, base URL and model fields in Settings → Voice, adapter, conformance test against a local fixture server | Conformance test (success, 401, 413, timeout); URL guard test | A real self-hosted Whisper server (optional) |
| **S3** | **Hex import (Electron, macOS).** IPC bridge, mapping, `importLocal`, `connectLocal`, Hex tile and page, 5-minute sync, dedupe rule, Meetings agent provisioning | Bridge tests with a fake `hex` script and fixture JSON written from the version-1 contract (synthetic data): argv allowlist, refused ids, timeout, oversized output, version 2 → "Update Hex". API tests: wrong connection, tombstone respected, overlap skip, status filter, `isMine` creates a to-do for a microphone line | A real Hex install with Meetings on and one recorded call |
| **S4** | **Meetings page** (after the owner's OK on D1). Sidebar entry, list, detail, `meetings.get`; `StoredMeetingsList` folds in | Contract and API tests for `get` (other user's meeting is NOT_FOUND); stories for list, detail, empty; web E2E screenshot | — |
| **P0** | **Electron capture probe** (not merged; findings go into this doc): microphone plus `loopback` on Electron 44.3 on macOS 14.2+ and 15, with and without `NSAudioCaptureUsageDescription`; Windows loopback; echo in the microphone track on speakers; `MediaRecorder` restart gaps | — | A Mac and a Windows machine, a real call |
| **S5** | **Capture backend.** Migrations, policy column, `meetingCaptures.*`, chunk route, both jobs, sweep, finalize into `Meeting`, digest hand-off | Postgres tests: idempotent start and chunk retry; another user's capture rejected; `confirm` policy without consent rejected; `off` rejected; chunk order across tracks; failed chunk makes `partial` true; blob deleted after transcription; sweep finalizes an abandoned capture; finalize re-run is a no-op | — (scripted provider) |
| **S6** | **Capture UI on web and Electron.** Record on the Meetings page, policy popover, recording pill, Stop, Discard, tab audio on web, loopback and `Info.plist` keys on Electron, IndexedDB buffer, space policy setting | Stories for each pill and popover state; unit tests for the chunker (quiet-point cut, 60 s cap) and the buffer (delete after 2xx only); permission handler tests | Real calls on Mac and Windows; the Electron E2E runs in CI only |
| **S7** | **On-device engine (desktop).** `@kitlangton/hex` behind `TranscriptionProvider` in Electron main, Settings → Voice "On this device", model prepare with progress, used by dictation and capture (text chunks) | Conformance test with a fake helper command; cancel closes the helper; app quit closes it; the renderer never sees the token | Apple silicon Mac with Hex installed |
| **S8** | **Native iOS capture and detail.** Record, background audio, chunk upload, meeting detail screen | Swift unit tests for chunking and upload retry; maestro flow on the simulator with a recorded fixture file | A device in a real room |
| **S8b** | Expo read-only Meetings list and detail (optional) | Component tests | — |

S1 is first because it is the smallest useful change: the backend, the provider settings and the `Dictation` class already exist, and only the composer button is new.

## Owner decisions

| # | Question | Recommended default |
|---|---|---|
| D1 | Meetings get a page in the sidebar with list and detail? (Granola said agent-only; native capture makes meetings something the user starts) | **Decided (owner, 2026-11-01): yes.** One Meetings page fed by every recorder (Praci recordings, Hex, Granola, Omi and future sources), each row showing its source |
| D2 | Default recording policy for a space | **Decided (owner): Remind** (one line, no checkbox). Owners and admins can switch to Confirm or Off |
| D3 | Keep meeting audio? | **No.** Deleted after transcription; no "keep audio" switch in v1 |
| D4 | How long are transcripts kept? | **Until the user deletes them**, like Granola. No automatic expiry |
| D5 | On-device engine on the desktop | **Decided (owner): both, Hex first.** Ship the installed-Hex engine through `@kitlangton/hex` (new MIT dependency, pinned); add a bundled Whisper engine as a later slice for users without Hex |
| D6 | Which agent reads Hex and recorded meetings | **One Meetings agent** for both, read-only tools, meeting-tainted |
| D7 | Composer mic when no engine is set up | **Decided (owner): hidden** until an engine is set up; Settings → Voice is where it is turned on |
| D8 | Use browser Web Speech for the composer | **No** (audio goes to the browser vendor without a Praci setting) |
| D9 | Duplicate Hex and Praci recordings of one call | **First stored wins**, by time overlap |
| D10 | Expo capture | **Not now.** Desktop, web and native iOS cover it; Expo shows meetings read-only (S8b) |
| D11 | Hex sync cadence | **On start, on focus and every 5 minutes** while the desktop app is open |

## Costs and risks

- **Hosted STT cost** is the user's own key, per minute of audio; two tracks double it. The self-hosted provider (S2) and the on-device engine (S7) avoid it.
- **Upload size.** Opus chunks are roughly 0.25 MB per minute per track; an hour with two tracks is about 30 MB. WAV is never uploaded.
- **macOS system audio** can fail silently (a dead stream) if `NSAudioCaptureUsageDescription` is missing or the user denies it; the client checks the system track's level in the first 10 seconds and shows "No call audio" on the pill. P0 decides whether `loopback` works on macOS at all in Electron 44; if not, macOS records the microphone only until a native helper exists, and the plan says so in the UI only as a disabled system-audio state.
- **Echo.** On speakers, the microphone hears the other side, so "You" lines can repeat "Them". Hex has echo suppression; Praci relies on browser echo cancellation. P0 measures it; headphones avoid it.
- **Hex's 24-hour retention** means meetings recorded while Praci's desktop app stays closed for a day are never imported. Suggest a longer Hex retention in docs, not in the UI.
- **Hex contract drift.** A version-2 contract stops imports with "Update Hex" until Praci adds it.
- **Hex availability.** macOS only for import; Apple silicon only for the on-device engine; the SDK's bundled helper is unpublished, so S7 depends on the user installing Hex.
- **Prompt injection by voice** is contained by the existing taint rules, not by the wrapper text.
- **Long meetings.** A 3-hour call is about 360 chunks; jobs are per chunk and idempotent, so any worker can take them.
- **Consent law** varies; the policy is a tool for the space owner, not compliance.

## Out of scope

- System-wide dictation into other apps (Hex, Wispr Flow and the OS already do it; `docs/plans/wispr-flow.md`).
- Live in-call transcript display, chapters, speaker diarization and names of remote speakers.
- Call detection, auto-start, calendar reminders, and bots that join calls.
- Importing Hex dictation history; Hex's MCP server (local stdio); starting Hex recordings from Praci through Hex's control CLI.
- Hex import on Windows and Linux.
- Keeping audio, playback, video.
- A streaming transcription interface.
- Calendar matching for titles and attendees (noted as a ponytail above).
- Changes to Omi's or Granola's flows.
