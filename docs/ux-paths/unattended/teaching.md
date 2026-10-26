## Area: Teach a skill by demonstration (TEACHING-nnn)

Generated: 2026-10-25
Branch: `feat/unattended-bots`. Everything in "Current state" was read from this checkout. The demo stack (synthetic data, web on port 5377) was used to walk the Teach flow once: open the computer, Teach a task, Start recording, one click on the screen, Stop teaching, Save, Add to routine, Test. Steps that I read in code but did not observe are marked "code-verified".
Persona for current stories: Maya Chen, founder of Northwind Robotics (mock demo data).
Persona for future stories: a startup founder using Praci, with no technical background, who has one repeated chore that lives in a website or a desktop app.

## 1. Current state

### 1.1 What the recording captures today

Short answer: teaching already operates on the whole bot desktop, not only the browser. It does not record what happens on that desktop in any meaningful form. It records raw pointer coordinates, typed keys, scrolls and pasted text, plus a window title at the start and at the stop.

What is real:

- **The surface is the full sandbox display.** The recording happens over the same live screen as "Take control": an iframe titled "Bot screen" (`apps/web/src/pages/Shell.tsx:6256-6264`) with a transparent capture layer on top (`apps/web/src/components/teach/TeachCaptureOverlay.tsx`, `data-testid="teach-capture-overlay"`). The framebuffer is the whole Linux desktop of the bot's computer (`docs/computer-runtime.md:11-13`, "Each active Team bot gets its own X display and Chrome process"), so any app on it can be demonstrated, not just Chrome.
- **Events captured** (`packages/core/src/teach-playbook.ts:1-12`, `packages/contracts/src/domain.ts:603-615`): `pointer` (move, down, up, click, left or right button, x and y), `key` (printable characters and only Enter, Tab, Backspace, Escape, Delete, Home, End and the arrow keys, `packages/core/src/teach-recording.ts:8-28`), `clipboard` (used by the Protected input box), `scroll` and `snapshot`. Ctrl, Alt and Meta shortcuts are dropped (`teachCaptureKey`, `teach-recording.ts:21`).
- **Every demonstrated input is also applied to the real desktop** (`applyTeachingDesktopInput`, `packages/adapters/src/teaching-session.ts:430-461`, called from `apps/api/src/router.ts:3672-3677` and from `recordTeachingInputEvent`, `teaching-session.ts:~525`), so the screen reacts while the user teaches.
- **Snapshots are only a window title.** `observeStopSnapshot` (`teaching-session.ts:169-196`) calls `sandbox.observe` and keeps `activeWindow.title`, or the literal text "screen captured". It runs once when recording starts (`apps/api/src/taught-skills.ts:394`) and once at stop (`taught-skills.ts:316-319`). The web app never calls `skills.snapshot` or `skills.appendEvent`. No image is stored. In the demo stack the title was "pointer", so the generated "How to check" read "The final screen should match: pointer."
- **Screen size is fixed**: 1280 by 800, or 1920 by 1080 for Box computers (`teach-recording.ts:50-58`). Coordinates are stored in that space.
- **Recording length**: 10 minutes by default (`DEFAULT_TEACH_RECORDING_TTL_MS`, `teach-recording.ts:1`; env `TEACH_RECORDING_TTL_MS`). At expiry a background job (`skillTeachingExpireJob`, `packages/adapter-kit/src/background-jobs.ts:248`) finalizes the recording as a draft, same as Stop.
- **Not captured**: anything done in the Terminal or Files windows (the dock is hidden while recording, `Shell.tsx:6250` `dock={!recordingSkill}`), shell commands, files written, apps launched, clipboard contents the user did not paste through Protected input, the DOM or page text of the browser, and any screenshot. The browser tools (`browser_snapshot`, `browser_act`) are blocked during teaching (`packages/adapters/src/executor.ts:5602-5606`, and `computer_observe` / `computer_act` at 4691-4708): "Teaching is in progress. Stop teaching before using the computer."
- **Refused for the user's own computer**: teaching needs a graphical sandbox computer, "not a desktop host" (`apps/api/src/taught-skills.ts:139-141`, `181-185`). The Teach button is hidden for `kind === "desktop"` (`TeachComputerOverlay.tsx:96`) and the computer window shows `DesktopKindEmptyState`.
- **Starting a recording cancels the bot's active runs** (`cancelActiveRuns`, `taught-skills.ts:110-132`, called at `taught-skills.ts:357`) without asking.

### 1.2 From recording to playbook

`buildPlaybookFromRecording` (`teach-playbook.ts:78-180`) turns events into plain strings with fixed templates. Examples seen in the demo: "Click left button at (212, 306)." Typed characters are joined into `Type "..."`. A press, move and release that moved 8 pixels or more become "Drag left button from (x, y) to (x, y)." Seven fields result (`SkillPlaybookSchema`, `domain.ts:589-597`): `whenToUse`, `inputs`, `steps`, `howToCheck`, `whatToReturn`, `approvalBoundaries`, `failureHandling`.

- `whenToUse` and `inputs` are both just the goal text typed at the start (`teach-playbook.ts:189-190`). In the demo both fields showed "Export the weekly pipeline list and save it to the shared folder".
- `approvalBoundaries` and `failureHandling` are fixed defaults (`DEFAULT_APPROVAL`, `DEFAULT_FAILURE`, `teach-playbook.ts:38-41`). They are prompt text only. Nothing enforces them.
- **Redaction**: text typed through the Protected input box is stored with `sensitive: true` and its text and key are deleted before storage (`sanitizeTeachRecordingEvent`, `teach-playbook.ts:14-19`); the playbook shows `Type "[redacted input]"`. Ordinary typed keys are stored in the recording and the playbook as plain text. `redactSensitiveText` (`teach-playbook.ts:68-72`) only replaces a typed string when that string itself contains the words password, secret, token or api key, so a typed password is stored unless the user used Protected input.
- The raw recording (all events, in a JSON column) is kept with the skill and is returned to the browser in `TaughtSkill.recording` (`domain.ts:628-642`). It is deleted only when the skill row is deleted.

### 1.3 Screens, labels and routes

There is no route for teaching. It lives in the bot thread (`/app/<botId>`, for example `/app/cmvnzselk0005yh9kga709kf9` in the demo) and the computer overlay.

| Step | Where | Exact label or test id |
| --- | --- | --- |
| Open the computer | Bot header button "Computer and routines" opens the side panel (Routines list plus a small "Bot screen preview"), then "Open" (`computer-preview-open`) | "Open" |
| Start | Computer chrome bar | button "Teach a task" (`teach-start-button`, `TeachComputerOverlay.tsx`); Popover with label "What result will you demonstrate?", placeholder "Export this week's list from the CRM and drop it in the shared folder", buttons "Start recording" and "Cancel" |
| Recording | Chrome bar replaced by `TeachRecordingChrome` (variant overlay) | "Recording: <goal>", "9:56 left · bot is watching, not acting", "Use Protected input for passwords.", text box "Protected input" with button "Type without recording", button "Stop teaching" (`teach-stop-overlay`); the composer shows "Teaching in progress. Stop teaching before sending a new message." (`Shell.tsx:4412`) and is disabled |
| Stop | "Stop teaching" | A bot message with a `skill_draft` block titled "Draft skill" appears in the thread (`transcript.tsx:1950`, `SkillDraftCard.tsx`) |
| Review | Draft skill card, fields "Name", "When to use", "Inputs", "Steps", "How to check", "What to return", "Approval boundaries", "Failure handling" (all editable), buttons "Save" (then "Saved"), "Test", "Add to routine" | |
| Use | Chat: ask for the skill by name; or "Add to routine"; or "Test" | see below |
| Recovery | Popover "Recording started. Refresh the view to continue." with "Refresh view" and "Dismiss"; error "Could not start teaching", "Could not check teaching status. Refresh the view to continue." | |

Storybook stories exist for every teach component (`apps/web/src/components/teach/*.stories.tsx`) and there is an E2E spec (`apps/web/e2e/teach-task.spec.ts`).

### 1.4 Saved skills and how they are used

- **Storage**: `TaughtSkill` (`packages/db/prisma/schema.prisma:988-1011`): `id`, `spaceId`, `botId`, `userId`, `name`, `goal`, `status` (`recording`, `drafting`, `draft`, `saved`; `drafting` is accepted by code but never set), `playbook`, `recording`, `startedAt`, `expiresAt` (the end of the recording window, not an expiry of the skill), `stoppedAt`. One recording per bot at a time (partial unique index). There is no version, run count, last run time, success or failure count, or last failure field, and no version table.
- **Per bot, owner only**: every query filters by space and user (`taught-skills.ts:98-108`). A skill belongs to one bot. Nothing copies it to another bot.
- **No list and no delete in the UI.** `rpc.skills.list` is called only to detect an active recording (`Shell.tsx:1502`, `TeachComputerOverlay.tsx:58`). `rpc.skills.remove` exists (`router.ts:4694`) and is never called by the web app. Mobile only prints the draft as text (`apps/mobile/lib/api.ts:1118`); iOS decodes the block (`MessageBlock.swift`); neither can teach. The Skills section in bot settings (`apps/web/src/pages/shell/BotSkillsSection.tsx`) lists the other kind of skill (`agentSkills`, SKILL.md recipes shared across bots) and does not show taught skills. The demo seeds two saved taught skills ("Month-end close", "Monthly investor update", `packages/testkit/src/cli/demo/data.ts:2422`), and they are not visible anywhere in the UI.
- **Ways a saved skill runs**:
  1. In chat, if the message contains an invocation verb (run, use, do, repeat, perform, execute) and the whole skill name (`promptInvokesSkill`, `teach-playbook.ts:213-220`); the executor then prepends the full playbook to the task (`executor.ts:7043-7054`). The agent is also told the names and "when to use" of up to 20 saved skills (`executor.ts:7014-7025`). Code-verified, not walked (needs a model).
  2. "Test" runs the draft or saved skill with trigger `skill` and the prefix "This is a safe test run. Do not send, spend, delete, or publish anything." (`taught-skills.ts:testRun`, `teach-playbook.ts:222-226`). That sentence is advice to the model, not a block. Walked: the Chief thread showed "Working…" and a Stop button. The card gives no other feedback.
  3. "Add to routine" opens the routine form (panel "Routine") with the name and a copy of the whole playbook as the Instruction ("Run taught skill: <name> / When to use: ... / Steps: 1. Click left button at (212, 306). ..."). It is a copy, not a link: later edits to the skill do not reach the routine, and "Add to routine" does not save the skill. The routine's "Add a skill" picker lists agent skills (SKILL.md), not taught skills.
- **Run history**: a `Run` has `trigger` only; no field links it to a taught skill (`schema.prisma:769`).

### 1.5 The bot computer, takeover and the screen proxy

- Docker, E2B, Daytona and Box run the same Linux desktop with noVNC; the browser reaches it through an encrypted capability proxy with separate view and control websockets (`docs/computer-runtime.md:13-15`, "Screen connection diagnostics").
- "Take control" gives the user an exclusive lease; it is refused while the bot has an active run unless the run is `waiting_takeover` (`computer-runtime.md:40`). Teaching grants that lease itself on Start (`grantTakeover`, `taught-skills.ts:189`) for the length of the recording.
- The dock below the screen has "Browser", "Terminal" and "Files" (Terminal needs control). The Activity feed records the bot's own shell and file commands as `computer.command` events (`computer-runtime.md:48-56`). None of that feeds teaching.
- The agent's own tools on this desktop: `computer_observe`, `computer_act` (batched pointer, key, scroll, launch, focus, open), `browser_navigate`, `browser_snapshot`, `browser_act` (with `fill_secret`), `shell`, `write_file`, `launch_app`, `open_path`, `request_takeover`.

### 1.6 What a taught skill does when nobody watches

`computer_act`, `browser_act`, `shell`, `write_file`, `launch_app` and `open_path` are on the approval-exempt list (`packages/core/src/action-approval.ts:3-24`). `unattendedTriggerToolRequiresApproval` returns false for every trigger except `webhook` (`action-approval.ts:140-150`). So a taught skill added to a scheduled routine replays its clicks and typing on the desktop with no approval. A webhook-triggered routine instead stops at `computer_act` because only `computer_observe` and `browser_snapshot` are on the unattended-safe list (`action-approval.ts:59-84`). The "Approval boundaries" text has no effect on either.

### 1.7 Real versus missing, in one list

Real: recording on the full desktop; Protected input; editable seven-field review card; Save; Test; Add to routine; run by name in chat; 10-minute limit with auto-finish; one recording per bot; owner-only access; stories and E2E.
Missing: a list of saved skills; delete, rename or copy a saved skill; Cancel for a recording; per-step meaning (element names, screenshots); shell, file and app events in the recording; password detection and the offer to save it as a secret; versioning; run history and success counts; re-teach a step; enforcement of approval boundaries; linking routines to skills; teaching on host desktops; any mobile surface.

## 2. Current stories

All current stories use the demo stack: web `http://127.0.0.1:5377`, sign in with the demo account, open the bot Chief at `/app/<botId>`. The demo desktop is a black screen from the fake provider, which is enough to record clicks.

## TEACHING-C1: Start recording from the computer window

**Type**: short
**Topic**: Teach by demonstration
**Persona**: Maya Chen, founder, first time teaching
**Goal**: Show the bot a chore once, on its computer.
**Preconditions**: Signed in; a bot with a Team Computer; no active run on that bot (an active run is cancelled when recording starts, see Edge Cases).
**Ideal path**: 3 steps (open the computer, write the goal, start). Today it is 4 because the computer has to be opened from the side panel first.
**Alternate paths**: none found. The Teach button exists only in the computer window (`Shell.tsx:6208-6215`); the composer menu has no Teach item.

### Steps
1. Open `/app/<botId>` and click "Computer and routines" in the bot header → side panel shows "Routines" and a small "Bot screen preview".
2. Click "Open" on the preview → computer window opens with "Team Computer", "Take control", "Teach a task", "More computer actions", "Close computer".
3. Click "Teach a task" → popover "What result will you demonstrate?" with the CRM example as placeholder; "Start recording" is disabled until text is entered.
4. Type "Export the weekly pipeline list and save it to the shared folder" and click "Start recording" → the chrome bar becomes "Recording: <goal>", "9:56 left · bot is watching, not acting", "Use Protected input for passwords.", the Protected input box and "Stop teaching". The composer is disabled with "Teaching in progress. Stop teaching before sending a new message."

### Variations
- Click "Cancel" in the popover: popover closes, nothing is created.
- Click "Take control" first: the lease already exists, Start reuses it (`extendActiveComputerControl`).

### Edge Cases
- The bot has a run in progress: Start cancels it without a warning (`taught-skills.ts:357`).
- Computer asleep: Start boots it first (`rpc.computer.boot`, then `rpc.skills.start`).
- Two tabs: the second Start fails with "A teaching session is already active"; the popover switches to the recovery text.
- Host desktop computer: the Teach button is not shown.

## TEACHING-C2: Demonstrate on the screen and type a password without recording it

**Type**: medium
**Topic**: Teach by demonstration
**Persona**: Maya Chen
**Goal**: Do the chore once, including a login, without leaving the password in the skill.
**Preconditions**: C1 done; recording active.
**Ideal path**: 1 action per real step; the password typed once in a protected box. Today that is how it works, but only if she remembers to use the box.
**Alternate paths**: typing the password straight on the screen (works, and is recorded as plain text).

### Steps
1. Click on the screen where the login field is → pointer down, up and click are sent to the desktop and recorded (the capture layer shows a crosshair cursor).
2. Type the username with the keyboard → keys are applied to the desktop and recorded; only printable keys and Enter, Tab, Backspace, Escape, Delete, Home, End and arrows are captured.
3. Click in the "Protected input" box, type the password, press Enter or the "Type without recording" button → the text is pasted on the desktop; the recording stores a `sensitive` clipboard event with no text.
4. Scroll with the mouse wheel → a scroll event (up to 20 notches) is recorded and applied.
5. Watch the timer count down from 10:00.

### Variations
- Drag across the screen: pointer down, move, up become one "Drag left button from ... to ..." step.
- Right click: recorded as the right button; the browser's own context menu is suppressed.

### Edge Cases
- Typing in the Protected input box when the screen focus is not on a password field pastes into whatever has focus.
- Ctrl+C, Ctrl+V and other shortcuts are ignored by the capture.
- Keys pressed while focus is on a button or text field in the web app are not captured (`TeachCaptureOverlay.tsx` ignores keys aimed at those elements).
- Typed password on the screen is stored in the recording unredacted.

## TEACHING-C3: Stop, review and save the draft skill

**Type**: medium
**Topic**: Teach by demonstration
**Persona**: Maya Chen
**Goal**: Check what the bot understood and keep it.
**Preconditions**: C1 or C2 done.
**Ideal path**: 3 steps (stop, fix the name, save). Today 3 plus editing the steps, which are coordinates.
**Alternate paths**: the 10-minute timer ends the recording and produces the same card.

### Steps
1. Click "Stop teaching" → recording ends; the chrome bar returns to normal.
2. Open the Chief thread → a bot message "Draft skill" shows the goal and eight labelled fields: Name (prefilled with the goal), When to use, Inputs, Steps, How to check, What to return, Approval boundaries, Failure handling.
3. Read "Steps" → lines like "Click left button at (212, 306)."; "How to check" reads "The final screen should match: <window title>."
4. Edit the Name to "Weekly pipeline export" and one line of Steps.
5. Click "Save" → button shows "Saving…" then "Saved"; the card status becomes saved and the thread gets a `skill.saved` event.

### Variations
- Edit after "Saved": the button still reads "Saved" and changes are written only when Save or Test is clicked again.
- Reload the page: the card reloads from the stored message block.

### Edge Cases
- A recording with no events produces the single step "Repeat the demonstrated workflow using the same navigation pattern."
- Stop pressed twice: the second returns the existing draft, no duplicate card (guarded in `emitSkillDraftMessages`).
- There is no way to discard a draft from the card, and no place to find it again except by scrolling the thread.

## TEACHING-C4: Test a skill

**Type**: short
**Topic**: Teach by demonstration
**Persona**: Maya Chen
**Goal**: See the bot try the skill before trusting it.
**Preconditions**: A draft or saved skill card is visible.
**Ideal path**: 1 click.
**Alternate paths**: the routine form's "Test run" button runs the same prompt without the "safe test" sentence.

### Steps
1. Click "Test" on the Draft skill card → card saves the edited playbook, a run starts with trigger `skill`; the Chief thread shows "Working…" and the composer shows "Stop".
2. Watch the thread → the bot's tool calls and final reply appear as normal messages.
3. Click "Stop" if needed.

### Variations
- Test before Save: allowed (status draft is accepted).

### Edge Cases
- The "safe test" instruction is only a sentence to the model; a model that clicks "Send" would not be blocked.
- No on-card result or pass/fail marker; the user reads the thread.
- Code-verified: the run does not check that a recording is not active, nor that the computer is awake.

## TEACHING-C5: Run a saved skill by name

**Type**: short
**Topic**: Teach by demonstration
**Persona**: Maya Chen
**Goal**: Repeat the chore with one sentence.
**Preconditions**: A saved skill named "Weekly pipeline export" on this bot. The model must support computer tools.
**Ideal path**: 1 message.
**Alternate paths**: "Add to routine" (C6).

### Steps
1. In the composer type "Run Weekly pipeline export" and send → the executor matches the whole name plus the verb "run" and adds the full playbook to the task (`executor.ts:7043-7054`).
2. The bot works on its computer; Maya may click "Open" to watch.
3. Bot posts a summary as described in "What to return".

### Variations
- "Please use the Weekly pipeline export skill now": also matches (verbs run, use, do, repeat, perform, execute).
- A name shorter than 3 characters never matches.

### Edge Cases
- "export the notes to markdown" does not trigger a skill named "Export".
- A message that starts with "Run taught skill:" is treated as already expanded.
- Only the first 20 saved skills are listed to the model.
- Not walked: needs a live model.

## TEACHING-C6: Put a skill on a schedule with "Add to routine"

**Type**: medium
**Topic**: Teach by demonstration, routines
**Persona**: Maya Chen
**Goal**: Have the chore done every Monday without asking.
**Preconditions**: A draft or saved skill card.
**Ideal path**: 3 (pick the skill, choose when, confirm). Today 4 plus the copy problem.
**Alternate paths**: "Create a routine" in the side panel and paste the text; the picker "Add a skill" in the form lists agent skills, not taught ones.

### Steps
1. Click "Add to routine" → side panel opens "Routine" with Active on, Name = skill name, Instruction = "Run taught skill: <name>" followed by the whole playbook.
2. Click "Choose when it runs" → schedule picker.
3. Click "Save" → routine appears under "Routines" in the side panel.
4. Click "Test run" in the routine → one run now.

### Variations
- Use Add to routine without Save on the card: the skill is not saved, only the text is copied.

### Edge Cases
- Editing the skill later does not change the routine.
- The routine runs trigger `routine`; `computer_act`, `shell` and `write_file` run with no approval (see 1.6).
- If the computer is held by a user takeover, the run reports it is held.

## TEACHING-C7: Recover from an interrupted recording

**Type**: medium
**Topic**: Teach by demonstration
**Persona**: Maya Chen
**Goal**: Get unstuck after closing the window or losing the connection mid-recording.
**Preconditions**: A recording is active.
**Ideal path**: 1 (Stop teaching). Today the stop control disappears if the computer window is closed.
**Alternate paths**: wait up to 10 minutes for auto-finish.

### Steps
1. Click "Close computer" (X) during recording → window closes; the recording continues server-side; the composer stays disabled with "Teaching in progress. Stop teaching before sending a new message."
2. Reopen the computer with "Open" → chrome bar again shows "Recording: <goal>" and "Stop teaching".
3. If the popover says "Recording started. Refresh the view to continue.", click "Refresh view" → the view loads skills again; "Dismiss" closes it.
4. Click "Stop teaching" → the draft card appears.

### Variations
- Sending a message through the API during recording returns CONFLICT "Stop teaching first" (`taught-skills.ts:assertTeachingSendAllowed`).
- After 10:00 the job finishes the recording and the card appears without a click.

### Edge Cases
- Skills list fails to load: Start stays locked and the popover says "Could not check teaching status. Refresh the view to continue."
- A second window shows the recording banner within a refresh; Start is blocked by the unique recording index.

## 3. Future stories

These describe the experience the unattended-bots PRD should produce. They reuse the Teach button, the recording bar, the Draft skill card, Settings > Skills, the routine form and the approval card. "Today" lines say what exists.

## TEACHING-F1: Teach a chore that spans the browser, a desktop app and files

**Type**: long
**Topic**: Teach by demonstration, full desktop
**Persona**: Priya, founder of a 6-person hardware startup. Every Friday she downloads a CSV from a supplier portal in Chrome, opens it in a spreadsheet app, deletes two columns, saves it to the shared folder and runs a small script.
**Goal**: Teach all of that once, so the bot repeats it.
**Why the user cares**: She teaches the whole chore as she actually does it, instead of describing it or only the browser part.
**Preconditions**: A Team Computer with the spreadsheet app installed. Today it records coordinates on the full desktop but not file or terminal work.
**Ideal path**: 4 (Teach a task, do the chore, Stop, Save).
**Alternate paths**: today she can only teach the clicks; the terminal and files windows are hidden while recording.

### Steps
1. Click "Teach a task", write "Weekly supplier CSV into the shared folder", "Start recording" → recording bar shows what is being captured: "Screen, apps, files and commands".
2. Download the CSV in Chrome → the recording notes "Opened supplier portal page, clicked Download" with the page title and the downloaded file name.
3. Open the file in the spreadsheet app and delete two columns → the recording notes the app name, window title and menu actions.
4. Open the Terminal from the dock and run the script → the command is recorded with output tail (the Activity feed already stores this for the bot).
5. Save the file in the shared folder → the recording notes the path.
6. Click "Stop teaching" → review card lists the chore as steps in words.

### Variations
- Teach in two sessions: a second recording appends to the same skill.
- Skip the terminal: skill has no command step.

### Edge Cases
- **Noise**: five minutes of mouse movement. Keep only meaningful actions (clicks, key combos, window changes, commands, file writes).
- **Safety**: a window with another customer's data or a password manager is visible. The recording stores window titles and short text, never raw frames by default.
- **Cost**: long recordings stored as raw events. Cap events and size, compress at Stop.
- **Limit**: the 10-minute window may be too short; show the time left and offer "Add 10 minutes".

## TEACHING-F2: Review steps written in words, each with a small picture

**Type**: medium
**Topic**: Teach by demonstration, review
**Persona**: Marcus, a founder who reviews quickly on his phone-sized laptop window between meetings.
**Goal**: Confirm the bot understood the chore without decoding "(212, 306)".
**Why the user cares**: He can check the skill in 30 seconds and fix a wrong step by reading, not by guessing what a coordinate means.
**Preconditions**: A recording just stopped. Today steps are coordinates and `How to check` is a window title.
**Ideal path**: 3 (read steps, fix one, Save).
**Alternate paths**: Today he can only edit the raw text.

### Steps
1. Click "Stop teaching" → the Draft skill card opens in the thread (same card, same eight fields).
2. Each line under "Steps" reads "Click 'Export' in the CRM toolbar" with a small crop of the screen at that moment.
3. Click a line → it expands to the screenshot and the exact coordinates as a fallback.
4. Edit a line, click "Save" → "Saved".

### Variations
- Steps the model cannot name stay as "Click at (212, 306)" and are marked "Check this step".
- "How to check" shows a screenshot of the final screen, not only a window title.

### Edge Cases
- **Noise**: 60 steps. Group them ("Log in to the CRM", 4 steps).
- **Safety**: a screenshot may contain a name or amount. Store them with the skill only, delete them with the skill, and blur any region typed through Protected input.
- **Cost**: one model call to name steps at Stop; if it fails, the card still opens with coordinates.

## TEACHING-F3: A password is offered as a saved secret

**Type**: medium
**Topic**: Teach by demonstration, secrets
**Persona**: Dana, founder teaching the bot to log in to the supplier portal.
**Goal**: Let the bot log in on every run without the password being stored in the skill or seen by the model.
**Why the user cares**: She never has to retype the password, and it never appears in the skill text.
**Preconditions**: Recording active. Today the user must remember Protected input; typed passwords are stored in plain text.
**Ideal path**: 2 (type into the password field, confirm "Save as secret").
**Alternate paths**: the existing `request_secret` card and `browser_act fill_secret` already do the safe part for the bot's own runs.

### Steps
1. Click on a password field on the screen and start typing → the recording bar shows "Password field detected. Keep it private?" with "Save as secret" and "Don't record".
2. Click "Save as secret" and enter a name "Supplier portal login" → value is stored in the bot's secrets with the page's origin; nothing is stored in the recording.
3. Finish the chore, "Stop teaching" → the step reads "Fill the saved secret 'Supplier portal login' on supplier.example".

### Variations
- She ignores the prompt and types anyway: the characters are replaced by `[redacted input]` as soon as a password field is the target.
- A token pasted from the clipboard is treated the same way.

### Edge Cases
- **Safety**: field detection can miss non-standard fields; the review card must warn when a step typed text longer than 8 characters near a login page.
- Origin mismatch on replay: the secret is not filled and the run asks for takeover.
- **Cost**: none.

## TEACHING-F4: "Try it now" with live view and a stop at every risky step

**Type**: medium
**Topic**: Teach by demonstration, attended run
**Persona**: Priya.
**Goal**: Watch the bot do the chore once before scheduling it.
**Why the user cares**: She sees the bot get it right, or sees where it goes wrong, before it runs alone.
**Preconditions**: Saved skill. Today "Test" starts a run and she must open the computer herself and read the thread.
**Ideal path**: 2 (click Test, watch).
**Alternate paths**: Add to routine, then "Test run" in the routine form.

### Steps
1. Click "Test" on the skill → the computer window opens by itself on the live screen and the bar reads "Trying: Weekly supplier CSV" with "Step 3 of 9" and "Stop".
2. The bot reaches a step that sends, posts, spends, deletes or writes a file outside the shared folder → the run pauses with the existing approval card showing the step and the screen.
3. Click "Not now" → the run ends with "Stopped at step 7: save file".
4. At the end the bar reads "Done. 9 of 9 steps" and the thread has the summary from "What to return".

### Variations
- She takes control mid-run with "Take control" and fixes a screen, then clicks "Resume".
- Run on a copy of the workspace (future option).

### Edge Cases
- **Safety**: the "safe test" sentence is not enforced today; test runs must go through the same approval gate as routines and ask for any write.
- **Noise**: do not post chat messages per step; one bar, one final summary.
- **Cost**: a test run uses model tokens at attended speed; show "about 4 minutes" from the previous run when known.

## TEACHING-F5: Find, rename, copy and delete taught skills in one list

**Type**: medium
**Topic**: Teach by demonstration, skills list
**Persona**: Marcus, founder with three bots (Finance, Sales, Chief).
**Goal**: See every skill he taught, which bot owns it, and when it last worked.
**Why the user cares**: He can tidy, reuse and trust skills without scrolling old chat threads.
**Preconditions**: Several saved skills. Today there is no list; the demo's two seeded skills are invisible.
**Ideal path**: 2 (open the bot's Skills, pick the skill).
**Alternate paths**: none; Settings > Skills lists SKILL.md recipes only.

### Steps
1. Open the bot panel and click "Show settings" then "Skills" → the existing Skills section gets a "Taught" group below the agent skills, one row per skill (name, "Taught Oct 25", last run, "8 of 9 runs worked").
2. Click a row → the same Draft skill card in a side view with "Save", "Test", "Add to routine".
3. Open the row menu, pick "Copy to another bot" → choose Finance helper, confirm.
4. Pick "Delete" → confirmation names the skill and says its recording is deleted too.

### Variations
- A skill used by a routine shows "Used by 1 routine" and Delete warns about it.
- Search by name from the sidebar search.

### Edge Cases
- **Safety**: copying a skill that uses a saved secret does not copy the secret; the new bot shows "Needs secret: Supplier portal login".
- **Noise**: one row per skill, no per-run rows here.
- **Cost**: reads existing rows plus counts; the missing run fields need new storage.

## TEACHING-F6: A taught skill runs on a schedule and tells her only when it matters

**Type**: long
**Topic**: Teach by demonstration, unattended
**Persona**: Priya, asleep when the Monday 6:00 routine runs.
**Goal**: Have the chore finished each Monday and hear about it only if something needs her.
**Why the user cares**: She gets the finished file or one clear problem, not a stream of updates, and nothing is sent or deleted behind her back.
**Preconditions**: A saved, tested skill linked to a routine (a link, not a pasted copy).
**Ideal path**: 3 (pick the skill in the routine, set the time, Save).
**Alternate paths**: today she pastes the playbook text through "Add to routine".

### Steps
1. In the routine form, "Add a skill" lists "Weekly supplier CSV" under "Taught skills" → the routine stores a reference to the skill.
2. Click "Choose when it runs", pick Mondays 6:00, "Save".
3. At 6:00 the run starts as unattended: read steps run; writing to the shared folder, running the script, or anything outside it creates a pending approval.
4. Priya wakes up to one notification: "Weekly supplier CSV is waiting for your OK to save to /shared/reports" with "Approve" and "Not now".
5. She approves → the run continues, finishes, and a short summary lands in the Chief thread; the skill row shows "Last run Monday, worked".

### Variations
- Everything succeeds and the skill's "What to return" is posted; with a setting "Only tell me if something needs me" the run ends silently.
- The portal changed and step 4 fails: see F8.

### Edge Cases
- **Safety**: `computer_act`, `shell` and `write_file` are approval-exempt today (`action-approval.ts:3-24`); the PRD's "ask before write_file and shell" must apply to taught skills first. The skill's "Approval boundaries" can only add asks.
- **Noise**: one notification per run at most; approvals reminded at 4 hours and expire at 24 hours.
- **Cost**: scheduled runs use a cheaper background model; the screen is observed with images only when a step fails.
- If the user holds the computer (takeover) at 6:00, the run waits and says so.

## TEACHING-F7: Teach once more and keep the earlier version

**Type**: medium
**Topic**: Teach by demonstration, versions
**Persona**: Dana, whose supplier portal changed its layout.
**Goal**: Update the skill without losing the one that worked last month.
**Why the user cares**: She can fix the skill in minutes and roll back if the new version is worse.
**Preconditions**: A saved skill that failed on its last run. Today there are no versions; "Save" overwrites.
**Ideal path**: 3 (open the skill, "Re-teach from step 4", Stop).
**Alternate paths**: teach a new skill with the same name (today possible; the name match then picks the first saved one).

### Steps
1. Open the skill from F5 → the failing step 4 is marked "Failed on Oct 20: button not found".
2. Click "Re-teach from step 4" → the bot runs steps 1 to 3 on its screen and hands control to her at step 4 with the recording bar.
3. She does the new steps and clicks "Stop teaching" → the card shows version 2 with only steps 4 onward changed, highlighted.
4. Click "Save" → "Version 2 saved"; "Versions" lists version 1 with "Restore".

### Variations
- "Teach again from the start" replaces all steps.
- Restore version 1 from the list.

### Edge Cases
- **Safety**: replaying steps 1 to 3 during re-teach is a live run; it asks before any write like F6.
- **Noise**: keep the last 5 versions; delete older ones.
- **Cost**: storing screenshots per version; share unchanged steps between versions.

## TEACHING-F8: When the skill breaks, say which step and ask, never guess

**Type**: medium
**Topic**: Teach by demonstration, failure
**Persona**: Marcus.
**Goal**: Understand quickly why a run stopped and what to do.
**Why the user cares**: He sees "Stopped at step 4: the Export button is not on the screen", with a picture, instead of a confusing silent miss or a bot clicking the wrong thing.
**Preconditions**: An unattended run where the expected screen is missing. Today the default failure text says "stop and ask the user before retrying", and there is no recorded failure.
**Ideal path**: 2 (read the notice, click "Open computer" or "Re-teach").
**Alternate paths**: reading the Chief thread.

### Steps
1. A notification arrives: "Weekly supplier CSV stopped at step 4 of 9" → tapping it opens the Chief thread to a failure card (same card style as other run cards) with the last screenshot.
2. Click "Open computer" → the screen shows exactly where the bot stopped; the bot holds still.
3. Click "Re-teach from step 4" (F7) or "Skip this run".
4. The skill's row records the failure with date and step; the success count does not rise.

### Variations
- Two failures in a row pause the routine and say so.
- Failure because the computer was asleep or busy shows a different line ("Computer was busy").

### Edge Cases
- **Safety**: the bot must not retry a step that may already have sent or saved something; a failed action reports "outcome uncertain" (existing rule in `docs/computer-runtime.md:34`).
- **Noise**: one notice per failure; no repeat after auto-pause.
- **Cost**: the failure screenshot is kept 30 days, then deleted.

## TEACHING-F9: Cancel a recording and keep nothing

**Type**: short
**Topic**: Teach by demonstration, privacy
**Persona**: Dana, who realises mid-recording that a customer's private page is on screen.
**Goal**: Throw the recording away completely.
**Why the user cares**: She can demonstrate freely because a mistake does not leave private screens or keystrokes behind.
**Preconditions**: Recording active. Today there is only "Stop teaching", which keeps everything and builds a draft; the delete RPC exists but has no button.
**Ideal path**: 1 click.
**Alternate paths**: Stop, then delete the draft (no button today).

### Steps
1. Click "Cancel" next to "Stop teaching" (a new button) → confirmation "Discard this recording?" with "Discard" and "Keep recording".
2. Click "Discard" → the recording, its events and snapshots are deleted, the control lease is released, the composer is enabled, no draft card appears.

### Variations
- After Save, the raw recording is shortened to steps and thumbnails; "Delete recording" in the skill view removes the thumbnails but keeps the steps.

### Edge Cases
- **Safety**: discard must also remove protected input events and stop the expire job (today `remove` does cancel the job, `taught-skills.ts:539-548`).
- **Noise**: no confirmation toast in the thread.
- **Cost**: none.
- If the 10-minute timer runs out while she is deciding, the recording finishes as a draft; the card then offers "Delete draft".

## 4. PRD corrections

Line numbers are from this checkout. "PRD" means the original draft; text quoted from it.

1. **Status "Exists v1" is true but hides what is missing.** The record exists, but there is no saved-skill list, no delete button, no run history and no enforcement. See 1.4 and 1.7. The PRD should say "Partial".
2. **"Teach-by-demo must see the full desktop, not only the browser" (User additions)**: it already does. The recording runs on the whole sandbox X display (`Shell.tsx:6263-6282`, `computer-runtime.md:11-13`), not on the browser. What is missing is meaning: only coordinates, keys, scrolls and window titles are kept (`teaching-session.ts:169-196`, `teach-playbook.ts:1-12`); no screenshots, no shell or file or app events, no terminal or Files during recording (`Shell.tsx:6250`), and no teaching on host `desktop` computers (`taught-skills.ts:139-141`). The requirement should be reworded to "record desktop events with names and pictures, and include shell and file steps".
3. **"UX: composer + menu > Teach a task"** is wrong. The entry is the "Teach a task" button in the computer chrome bar (`Shell.tsx:6208-6215`, `TeachComputerOverlay.tsx`), reachable after "Computer and routines" then "Open". There is no composer item.
4. **"bot settings > Skills"** is the wrong place to extend. `BotSkillsSection.tsx` lists agent skills (SKILL.md, `agentSkills.*`), a different model (`schema.prisma` "Claude Agent Skills", not per bot). Taught skills do not appear there. Decide whether to add a "Taught" group or merge the two (they are separate concepts with separate RPCs: `rpc.skills.*` vs `rpc.agentSkills.*`).
5. **"recording bar Stop, Cancel, Mark as sensitive"**: the real bar has "Stop teaching" and a "Protected input" box with "Type without recording" (`TeachRecordingChrome.tsx`). There is no Cancel. "Mark as sensitive" is not a button; sensitivity is set by typing in the Protected input box, and nothing marks screen input afterwards.
6. **"review step showing generated SkillPlaybook ... editable before save"** already exists as the "Draft skill" card with all seven fields editable (`SkillDraftCard.tsx:75-135`), plus "Save", "Test", "Add to routine". It sits in the chat thread, not in a separate review screen. The PRD should list what is new: readable steps, screenshots, redaction warnings.
7. **"Try it now attended run before scheduling"** already exists as "Test" (`SkillDraftCard.tsx:145`, `taught-skills.ts:testRun`) and the routine form's "Test run". The safe-run sentence is not enforced (`teach-playbook.ts:222-226`). The PRD gap is live view, step progress and approval pausing, not the button.
8. **"sensitive input redacted, passwords offered as secrets"**: redaction exists only for Protected input (`teach-playbook.ts:14-19`); a typed password is stored in plain text (`teach-playbook.ts:68-72` only matches words inside the typed string). The offer to save as a secret does not exist. The PRD's secrets section should link to `request_secret` and `browser_act fill_secret` (`executor.ts:6343`).
9. **"TaughtSkill (recording, playbook, status, expiresAt)"**: `expiresAt` is the end of the 10-minute recording window (`taught-skills.ts:360`), not a skill expiry. `status` values are `recording`, `drafting`, `draft`, `saved`, and `drafting` is never written (`domain.ts:586`).
10. **Data model "TaughtSkill version, lastRunAt, successCount, failureCount, lastFailure; TaughtSkillVersion"**: none exist. `Run` has no skill link (`schema.prisma:769`), so counts cannot be derived today. Counting needs either a `taughtSkillId` on the run or a new table; name that choice in the PRD.
11. **`expandSkillReferencesInPrompt` is the wrong function for taught skills.** It expands agent skills (`router.ts:192`, `executor.ts:7037`, `router.ts:4377` for routine test runs). Taught skills use `promptInvokesSkill` (`teach-playbook.ts:213`) and `formatSkillRunPrompt` (`teach-playbook.ts:222`), wired at `executor.ts:7043-7054`, and `taughtSkillsLine` at `executor.ts:7014-7025`.
12. **Missing files in the PRD list**: `packages/core/src/teach-recording.ts` (TTL, key mapping, pointer mapping, screen size), `apps/web/src/components/teach/*` (five components with stories), `packages/adapters/src/computer-control.ts` (takeover lease for teaching), `apps/api/src/router.ts:3627-3690` (`computer.input` applies and records each event), and `packages/adapter-kit/src/background-jobs.ts:195,248` (the job definition for `skillTeachingExpireJob`).
13. **"approvalBoundaries only add asks"** cannot hold today: the field is prompt text and nothing reads it at tool time (`teach-playbook.ts:222-240`). The related PRD claim that `unattendedTriggerToolRequiresApproval` limits only `webhook` is right (`action-approval.ts:140-150`), and it matters here: scheduled routines that run a taught skill have `computer_act`, `browser_act`, `shell`, `write_file`, `launch_app` and `open_path` approval-exempt (`action-approval.ts:3-24`). Taught skills are the first thing the "ask before write_file and shell" decision changes.
14. **"recordings retention, deleted with skill"**: deletion with the skill is already true (`taught-skills.ts:remove` deletes the row), but no retention limit exists and the raw recording is returned to the browser inside `TaughtSkill.recording` (`domain.ts:628-642`). Decide whether to shorten it after Save.
15. **Missing constraint: starting to teach cancels the bot's active runs** (`taught-skills.ts:110-132, 357`). With unattended runs this can cancel a scheduled routine mid-run without a warning.
16. **Missing constraint: browser tools are blocked during teaching** (`executor.ts:5602`), so no DOM-based recording exists. Page-level naming of steps needs a new capture path that reads the page without acting on it, or a model pass over screenshots.
17. **Missing constraint: surfaces.** The PRD's "same behavior on web, Electron and mobile" does not apply to teaching. Teaching is web and Electron only (Electron hosts the web UI); mobile and iOS only show the draft as text (`apps/mobile/lib/api.ts:1118`). The PRD already puts skill editing on mobile out of scope; say that teaching is also out.
18. **"copy skills between bots"** is correctly a "Should": taught skills are bot-scoped (`schema.prisma:988-1011`, `executor.ts:1586` filters by `botId`).
19. **Routines do not link to skills.** "Add to routine" pastes the full playbook as text (`SkillDraftCard.tsx:150-152`); the routine "Add a skill" picker is for agent skills. The PRD's use of taught skills in routines should add a reference field, or editing a skill will not affect its schedule.
20. **Inputs are not real parameters.** `inputs` is a copy of the goal text (`teach-playbook.ts:190`). The PRD list of "inputs" in the review step needs a design for named parameters (date, file name) or it stays decorative.
21. **Demo and docs gap**: the demo seeds two saved taught skills (`packages/testkit/src/cli/demo/data.ts:2422`) but nothing in the UI shows them, so the seed cannot be demonstrated until the list from F5 exists. No doc under `docs/` describes teaching (`docs/computer-runtime.md` only mentions the teaching guard).

## 5. Open questions for the PRD owner

- Should recording keep screenshots at all, given they can show private data? Recommended: keep small crops per step inside the skill, delete with the skill, blur Protected input.
- Should teaching on the user's own Mac (host `desktop` computer) ever be allowed? Today it is refused. Recommended: keep refused in v1.
- Should taught skills and agent skills be one list with two kinds? Recommended: one list in Settings > Skills with a "Taught" group.
