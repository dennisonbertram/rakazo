# Docs coverage for unattended bots (PRD 4.1 to 4.5)

Pages are under `apps/praci-waitlist/src/content/docs`, images under `apps/praci-waitlist/public/docs`. "None" means the feature has no screenshot on purpose (a notification or a rule with no screen of its own).

| Feature | Page and anchor | Image |
| --- | --- | --- |
| Background runs are read-only | privacy-and-safety, "Bots ask before they send..." | background-approval.webp |
| Outside content makes a run stricter (taint) | privacy-and-safety (added); routines "Routines only read" (added) | None |
| Approvals table, Allow/Ask/Block, More actions | settings "Privacy and approvals"; privacy-and-safety | approvals-table.webp, approvals-more-actions.webp |
| Block refuses and tells the bot | privacy-and-safety; bots-and-agents "Approvals" | approval-blocked.webp |
| Per-bot Approvals override, Same as all bots | bots-and-agents "Approvals" | bot-approvals.webp |
| Reason line on cards, no Always allow in background | privacy-and-safety; bots-and-agents | background-approval.webp |
| Activity shows Needs approval | privacy-and-safety (added) | activity-needs-approval.webp (new) |
| Quiet switch, Nothing to report | routines "Only message me..." | activity-nothing-to-report.webp |
| Status line | routines "The status line" | routines-list.webp |
| From routine source line | routines "Messages from a routine" | routine-message.webp |
| Watch a page, limits, pause | routines "Watch a page" | routine-watch-editor.webp |
| watch_create from chat | routines "Set up a watch from chat" | watch-create-card.webp |
| Check in setting | check-ins "Check in" | check-in-open-work.webp |
| Open work, Done, Reopen, Undo | check-ins "Open work" | check-in-open-work.webp |
| Past-due notification | check-ins "Past-due notification" | None (notification) |
| Credentials findable, disabled Save, https:// | credentials "Add a credential" | credentials.webp |
| Last used, Needs attention | credentials | credentials.webp |
| Command variables, "The bot can read this value." | credentials "Command variables" | command-variable.webp |
| Unattended credential use (GET/HEAD only) | credentials "How a bot uses it" | None |
| Teach: start, recording bar, Cancel, Protected input | teach-a-task "Start teaching", "While it records" | teach-recording-bar.webp (new) |
| Teach: what is recorded, redaction, limits | teach-a-task | None |
| Teach: review card | teach-a-task "Review the draft" | teach-review-card.webp (new) |
| Teach: Save as login / Skip, Fill saved login | teach-a-task "Save as login" | teach-save-login.webp, teach-steps-saved.webp (new) |
| Teach: Test result | teach-a-task "Test it" | teach-test-result.webp (new; only the Stopped result was observed) |
| Taught group in Skills | teach-a-task "Find taught skills again" | teach-taught-group.webp (new) |
| Add to routine, Runs taught skill chip | teach-a-task "Run it on a schedule" | teach-routine-taught-skill.webp (new) |
| Background run of a taught skill asks first | teach-a-task "Background runs ask first" | teach-background-run.webp (new) |
| Tools: drafts, Approve, limits | bots-and-agents "Tools" | tool-draft.webp |
| Share link, Update link, Stop sharing, expiry | artifacts "Share a link" | share-dialog.webp, shared-page.webp |
| Restore this version | artifacts "Versions" | None |

## Not shipped, so not documented
- Watch a connected app (PRD 4.2 Should): the watch spec only has kind `page`.
- Reminder after 4 hours and expiry after 24 hours of a background approval (4.1 Should): no reminder job found in code.
- "Waiting on you" group in Activity (4.2 Should): not found in the web app.
- Mobile credentials list (4.3 Should): `docs/bot-secrets.md` already says mobile has none.
- Everything listed as Later.

## Repo docs check
`docs/bot-secrets.md`, `docs/tools.md`, `docs/routines-and-watches.md` and `docs/computer-runtime.md` match the shipped behavior. `VISION.md` gained one line on taught skills.
