# UX flow critique: Bot-built apps (shareable by link, runnable by agents as tools)

Inputs: `docs/ux-paths/unattended/apps.md`, `docs/ux-walker/unattended/apps.md`, and the original PRD section 3 plus the 2026-10-25 user additions. Stance: Praci already has a place for every piece of this. Artifacts holds the thing, `CopyLinkDialog` shares it, the skill Drafts list approves it, and routines run it. The smallest design adds one button, one fixed link rule, and one script file on a skill. It adds no app object, no Apps page and no data store. Components named are in `docs/design-system/components.md`.

## 1. Friction scorecard (current stories)

| Story | Actual | Ideal | Verdict |
|---|---|---|---|
| C1 Open a bot-made dashboard | 2 | 2 | Steps fine. The toolbar offers only Download and Maximize, so the next thing a user wants (send this to someone) has no control. |
| C2 Compare versions, delete | 3 to compare, 2 to delete | 3 | The row says v2 while v1 is shown. There is no restore. Cut the compare idea; add only "Restore this version" (see F5). |
| C3 Ask for a dashboard in chat | 2 (not walked; the demo model never called the tool) | 2 | Each scheduled update also posts a chat card. Updating an existing artifact should not post by default. |
| C4 Bot Page | 2 once a page exists | 2 | The Page button is invisible until a page exists, so users cannot find it. Header icons (checklist, routines) are unlabeled. |
| C5 Pins and list | 1 for refresh | 1 | The refresh icon has no label. An unsourced refresh costs about 40 seconds of model time and answers in chat. There is no "last updated" time. Show it on the strip. |
| C6 Custom connection | 3 plus a cut-off dialog | 3 | Advanced shows Transport, Executor, Auth header jargon. Hide everything but Server URL until a connection fails. This is the only current "give a bot a tool" path and it needs a contractor. |
| C7 Approve a skill draft | 2 | 2 | Fine. This is the approval flow to reuse for tools. The toggle that flipped to "Off in Settings" is a separate bug. |
| C8 Investor outside link | 3 | 3 | The link dialog does not say "shown once" or that Copy link issues a new link. Revoke has no confirm and hides until a link exists. The landing page is a bare "Open" with no sender. Fix these before reusing the pattern. |

## 2. Future stories: simplest version

Principle: an app is an Artifact. A tool is a skill that has a script. Do not create `BotApp`, `BotAppShare`, an app data API, or an Apps screen.

- **F1 Reusable tool.** Lives in `BotSkillsSection` (Drafts, then Approve). Extend `skill_create` with one optional script file and a short list of named inputs. The bot builds and test-runs it once, and the draft appears in the existing Drafts group with two plain lines under it: "Reads: Mercury transactions" and "Writes: nothing". Maya presses the existing "Approve". There is no "Save as tool" button, no tool name step, no tool list page. `task_catalog` already lists skills, so the bot finds it. Do NOT build: input form UI for the user, a separate Tools registry, v1/v2 labels on screen.
- **F2 Scheduled and quiet.** Lives in `RoutineEditor`, the same Instruction field. The routine says "run <skill>". The run reports back only when the output differs from last time. This is the watcher rule in the watchers critique (fold "changed since last run" into one rule); do not add a second "tell me when" menu. A routine that finds nothing new posts nothing.
- **F3 Share by link.** Add one "Share" button to the Artifacts toolbar beside Download and Maximize. It opens `CopyLinkDialog`. Fixed rules, no choices: view-only, expires in 30 days, shows the link once, "Stop sharing" in the same dialog (with the existing `AlertDialog` confirm). Static content only. The viewer sees the rendered artifact in `SandboxedHtmlViewer` on a separate origin with no cookies. Dialog copy: one sentence, "Anyone with this link can view this version until Stop sharing or 30 days." Do NOT build: password, edit links, expiry picker, "Viewed 3 times" counter (the portal shows only "last opened"; reuse that single timestamp), data preview card. Sharing is a human click in the app; the bot gets no `app_share` tool, so there is no approval rule to design.
- **F4 Outside person fills a form.** Cut from this release. It needs a public write API, a data store, rate limits, abuse handling and untrusted-input handling. The existing fallback (a Google Form, or email the bot reads) works. Revisit only if F3 links get used.
- **F5 Safe update with a way back.** A shared link points to the version that was shared. A new version does not reach viewers until Maya presses "Share" again (the button reads "Update link" while a link exists). Add "Restore this version" next to the existing Version select (`Artifacts` page), which just creates a new latest version from the old one. Do NOT build: "Not live" labels, "Publish v3" cards, dependency warnings against schedules.
- **F6 Tool breaks.** No new card. The failed routine run already notifies once (see the check-ins and approvals critiques); the failing skill is named in that message. The bot proposes the fix through `skill_update`, which already needs an "Update" approval. Auto-pause after N failures reuses the routine pause.
- **F7 Another bot uses the tool.** Skills are per bot today. Reuse the existing bot access list pattern: "Copy to another bot" on the skill row, no "Used by" screen, no per-pair grant card. Copying creates a draft in the other bot that needs Approve.
- **F8 Check before it runs unattended.** Cut as a screen. The two-line "Reads / Writes" under the draft is the whole disclosure. Enforcement stays in the platform: unattended runs may call read-only connector calls; a script that needs `shell` or `write_file` follows the user decision (background runs ask first), so it becomes a pending approval card, not a silent run. "Try it now" is just the test run the bot already did when it built the draft; show its output in the draft.
- **F9 Retire an app.** Reuse the existing delete dialog in Artifacts. If a link exists, add one clause: "This also stops its link." No schedule scan; a routine whose skill is gone reports once and pauses.

PRD items that add needless UI, settings or copy, and the smaller version:

| PRD item | Smaller version |
|---|---|
| BotApp + BotAppShare objects, `/a/:token` host, app_create/app_update/app_share/app_data_* tools | Reuse Artifact, add one share-link table keyed by hash like the portal. Zero new bot tools. |
| Per-app JSON data store and data API token | Cut. It forces a network rule the sandbox deliberately lacks. |
| View/edit modes, expiry, password, audit | View-only, 30 days fixed, "last opened" timestamp. |
| Viewer edits emit a thread event with opt-in wake | Cut with F4. |
| "Show data before first share" | The user is already looking at the rendered artifact when they press Share. |
| "Promote to Page / pin" | Cut. Pages are Markdown and pins are numbers; an app fits neither. |
| Running tools as a new kind of object | A skill with a script. |

## 3. Redundancy

- **Three overlapping "things a bot keeps":** Artifacts, the bot Page, and Pins all show a bot's output. Keep all three, but say one rule in the Artifacts empty state only if needed; do not add a fourth "Apps" place.
- **Skills versus tools:** a tool is a skill with a script. One Drafts list, one Approve button.
- **Routines, watchers, check-ins:** a tool run is just a routine. Do not add a "Schedule this tool" screen; the Routine editor already schedules any instruction.
- **Outside links:** the investor portal and artifact share links are both "link shown once, revoke later". Reuse `CopyLinkDialog` and the same hash-only token model. Do not clone the portal landing page; fix its missing sender and context line once and share it.
- **Custom connection versus bot-made tool:** both give a bot a repeatable call. Keep the custom connection for existing remote services and hide its jargon; do not extend it for bot-built tools.
- **Approvals:** `app_share` and a tool-approval concept would duplicate the approvals table. Use the existing Drafts Approve plus the unattended-asks rule.

## 4. Top 5 recommendations (value / effort)

1. Add "Share" to the Artifacts toolbar using `CopyLinkDialog`: view-only, 30 days, show once, Stop sharing. Highest value, one button and one token table.
2. Tools are skills with a script. Reuse Drafts and Approve; add two plain lines ("Reads", "Writes") to the draft. No new screen.
3. Do not post a chat card when an existing artifact gets a new version (C3). Quiet by default for scheduled runs.
4. Fix the portal and link dialog copy and Revoke confirm first (C8), then reuse them: say "shown once", confirm Stop sharing, name the sender on the landing page.
5. Cut F4, the data store, edit links, password and audit from this release. Add "Restore this version" and "Update link" only (F5). Label the pins refresh icon and show last-updated time.
