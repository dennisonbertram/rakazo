# UX walk: Teach a skill by demonstration

Walked 2026-10-25 on the demo stack (synthetic data), branch `feat/unattended-bots`, browser session "unattended-teaching", viewport 1440x900, persona Maya Chen. Screenshots are in the session scratch folder `ux-shots/teaching/` (names below). Stories: `docs/ux-paths/unattended/teaching.md`.

Caveats that limit what this walk proves:
- The demo computer is a black screen from the fake provider. Clicks, typing and scrolling gave no visible reaction, so I could not judge feedback on the desktop itself.
- Other walkers were using the same Chief bot at the same time. Their webhook runs and a pending approval appeared in the thread, which blocked C5 and hid the result of C4.
- The demo desktop's "window title" is the last input text, which exaggerates finding 1. See its note.

## Results

| Story | Result |
| --- | --- |
| TEACHING-C1 Start recording | Pass |
| TEACHING-C2 Demonstrate, protected input | Pass with findings |
| TEACHING-C3 Stop, review, save | Pass with findings |
| TEACHING-C4 Test | Not confirmed (button works, result not observable) |
| TEACHING-C5 Run by name | Not walked (blocked) |
| TEACHING-C6 Add to routine | Pass with findings |
| TEACHING-C7 Interrupted recording | Pass with findings |

## C1 Start recording: pass
Steps taken: 5 (Computer and routines, Open, Teach a task, type goal, Start recording). Ideal: 3. The side panel hop is the extra step.
- Popover is clear: "What result will you demonstrate?", Start recording disabled until text is entered (c1-03-popover.png).
- Recording bar shows goal, "9:57 left - bot is watching, not acting", "Use Protected input for passwords.", Protected input box, Stop teaching (c1-04-recording.png).
- The first screenshot of the computer window (c1-02-computer.png) shows the window covering the whole page, so the thread and the sidebar are not visible while teaching.
Findings:
- P3: no recording indicator (red dot or pulse) in the bar. Only text says it is recording. (c1-04-recording.png)
- P3: the recording bar hides the Browser/Terminal/Files dock without saying why, which matters because only the screen can be taught (see notes).
- P3: starting cancels the bot's active runs with no warning (code-verified, not triggered).

## C2 Demonstrate and protected input: pass with findings
Steps taken: click on screen, type, click Protected input, type, Enter, scroll. All accepted. The box cleared after Enter.
Findings:
- P2: no feedback that anything was recorded. No step counter, no flash, no list of captured steps; the box just empties after "Type without recording". With a real desktop the screen would react, but the bar itself never confirms. (c2-02-after.png)
- P2: typing "maya" with the browser tool produced no step in the draft (draft had click, Tab, protected input only). This may be how the automation sends text (no key events) and is unconfirmed. Re-check with a real keyboard.
- P3: the password-handling instruction is only a one-line hint; typing a password straight on the screen is still recorded in plain text (code-verified).

## C3 Stop, review, save: pass with findings
Steps taken: Stop teaching, read card, edit name, Save. 3 actions plus reading. The card appears in the Chief thread and the computer window closes on stop.
Findings:
- P1: "How to check" read "The final screen should match: fakepass123." That is the exact text I typed into Protected input. In the demo the fake desktop reports the last input as the window title, so a real desktop may not do this, but the stop snapshot title is copied into the skill unredacted, and the Protected input text reached it. Needs a real-desktop check. (c3-01-stopped.png)
- P2: Steps are raw coordinates ("Click left button at (412, 282)."). A founder cannot tell what was clicked or fix it. (c3-01-stopped.png)
- P2: Name is prefilled with the full goal sentence; "When to use" and "Inputs" repeat the same sentence three times. (c3-02-saved.png)
- P2: the card is a tall form of 8 text fields before the Save button; Save is below the fold at 900px height.
- P3: "Saved" turned the button white; Save worked and the status is clear. There is no discard for a draft.
- P3: the card says "Draft skill" and still says Draft after Save (title not updated).

## C4 Test: not confirmed
Clicked Test on the draft card. The sidebar showed "Chief - Working..." and the composer switched to Stop, so a run started. I could not find a reply that belonged to the test run, because other walkers' runs filled the thread (c4-01-test.png, c4-04-up.png).
Findings:
- P2: Test gives no result on the card (no running, passed or failed marker). The user has to find the answer in the thread.
- P2: the test prompt and the bot's tool activity are not shown as a distinct "test of skill X" message, so a run of the skill is not distinguishable from any other message.

## C5 Run by name: not walked
Typed "Run Walker weekly copy" and sent. The composer returned "Answer the pending ask first." because another walker's approval card (a daily 9:00 AM routine) was pending in the same thread. I did not answer it because it was not mine. The path stays code-verified only. (c5-01-run.png)
Finding:
- P3: the pending-approval error is clear and recoverable, but the approval card sits far above the composer and the error is a thin red banner.

## C6 Add to routine: pass with findings
Steps taken: Add to routine, Choose when it runs, Every week, (Monday 9:00 AM default), Save. Result: "Next run Mon, Oct 26, 9:00 AM". 4 actions; ideal 3. I clicked the seeded older card, not my new one, which behaves the same. I deleted the routine afterwards.
Findings:
- P1: the schedule form gives no sign of what the routine will do unattended. The Instruction is a long copy of the whole playbook, and nothing says it can click, type and write files with nobody present or that there is no approval step (code reading in the stories file says approval is not enforced). (c6-01-form.png)
- P2: the "Add a skill" picker lists agent skills (company-map, Cut costs, Meeting notes...) but not the taught skill; the taught skill is only a pasted copy. (c6-01-form.png)
- P2: Name is the long goal sentence, truncated in the field.
- P2: "Add to routine" does not save the skill and edits to the skill later do not reach the routine.
- P3: after "Every week" is chosen, "Choose when it runs" stays as a big button, which invites a second schedule.
- P3: Save keeps the panel on the form with no toast; the button is cut off at the bottom of the panel at 900px. (c6-04-saved.png)
- P3: the schedule menu has no "every Monday" shortcut; weekly defaults to Monday, which happens to fit.

## C7 Interrupted recording: pass with findings
Steps taken: Close computer, reopen with Open, Stop teaching. Recovery worked: the timer kept counting (9:33 to 9:15), the same bar returned, and Stop produced the draft.
Findings:
- P2: while the window is closed there is no Stop control anywhere in the thread or panel. The only sign is a small red line above the composer: "Teaching in progress. Stop teaching before sending a new message." and a disabled composer. (c7-01-closed.png)
- P3: the panel's Open path works but the preview is not visible in the panel screenshot (iframe present in the accessibility tree, nothing painted at 900px height).
- P3: the Routines list changed between screenshots (Cash check, Open work review disappeared, Billing events appeared). Likely other walkers; not attributed.

## Notes for adding "Teach a skill by demonstration (must see the full desktop, not only the browser)"
Where it fits today:
- The surface already is the whole bot desktop (the "Bot screen"), so the full desktop is the right place. The Teach button is in the computer window top bar, next to Take control. Nothing in the UI says that desktop apps, not only the browser, can be demonstrated.
- The dock (Browser, Terminal, Files) is hidden during recording. So a user cannot open a desktop app or a file from the dock to teach with, unless the app is already open on the desktop. This is the main gap for the "must see the full desktop" goal.
- A recording captures pointer, keys, scroll and a window title only. Steps are coordinates, not words, and there is no picture. The review card cannot show what the desktop looked like.
- A sandbox computer view is a single black screen in the demo, so the demo cannot show the full-desktop story. A demo desktop with at least one app on it would be needed to walk the future stories.
What is confusing today:
- The Draft skill card is a form of eight fields; most copy the goal sentence.
- Saved taught skills have no list, no rename, no delete in the UI; Settings > Skills shows another kind of skill.
- Add to routine pastes text; the routine picker does not know taught skills.
- Starting a recording does not warn that it cancels the bot's running work.
- Test shows no result on the card.
- The password hint appears only in the bar; a Protected-input value must not reach any stored field (see C3 P1).
