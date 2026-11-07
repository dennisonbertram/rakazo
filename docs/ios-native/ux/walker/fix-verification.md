# iOS UX fix verification

Build: branch `ios/ux-fixes-integration` (Debug, iPhone 17 Pro simulator, iOS 26.3), against the slot 6 demo stack (scripted runtime, no model). Driven with Maestro plus screenshots. Screenshot files are named below and were kept outside the repository.

Large-text checks used the `accessibility-extra-large` content size.

| Defect | Result | Evidence |
|---|---|---|
| Thread keyboard dismisses on tap | Pass | A02-kb-newline (open), A03-kb-tapdismiss |
| Thread keyboard dismisses on drag | Pass | A04-kb-dragdismiss |
| Return inserts a newline | Pass | A02-kb-newline (two lines in the composer), A05-sent (sent as two lines) |
| Send arrow sends | Pass | A05-sent |
| Thread opens at newest message | Pass | A01-thread (newest at the bottom, no scroll needed) |
| Consent text fully readable | FAIL (inline card) | A05-sent, A06-consent-tap, A07-after-scroll: the consent card in the thread still ends "including..." and tapping the text does nothing. The fix only changed `ConsentSheet`; the thread card uses `AskCardView` with `lineLimit(4)`. The sheet itself was not reachable in this run. |
| Inbox compose button | Pass | A10-inbox, A11-compose |
| From picker | Pass | A12-from-picker (two accounts, check mark on current; long addresses wrap mid-word) |
| Cancel with changes asks Save/Discard | Pass | A13-cancel-compose |
| "Draft saved" toast | Pass | A14-draft-toast |
| Archive from message pops back with Undo | Pass | A24-archive (list shown with "Archived Undo") |
| Undo restores the mail and it stays read | Pass | A25-undo2 (Robin Prospect back in place, no unread dot) |
| Reply quote separated | Pass | A21-reply-tap, A22-reply-nokb: quote is behind a "Show quoted text" row below the body |
| Reply opens in one tap | Pass | A21-reply-tap |
| Long-press Reply shows Reply / Reply all / Forward | Pass | A23-reply-longpress |
| Settings Server row | Pass | A30-settings |
| Sign out asks for confirmation | Pass | A36-signout-confirm (button is in Account) |
| Usage label and total | Pass | A31-usage ("All time in this space", "Total tokens 52") |
| Connect button opens Integrations | Pass | A60-connect-carta (from Cap table). Page reload after connecting not tested (no real Carta login). |
| Connect a model | Pass (opens) | A32-models, A33-connect-model |
| Home blank rename blocked | Pass | A72-blank-name (Save stays disabled) |
| New agent sheet at large text with keyboard | Pass | B03-newagent-large-kb (name field and Create stay visible) |
| Large-text Home rows | Pass with note | B04-home-large: name, time and preview stack; time drops to its own line |
| Large-text account avatar | Pass | V-large-settings (avatar scales, name wraps) |
| Record sheet and Voice settings | Pass | A50-record-sheet, A51-voice-settings (fully visible) |
| Data room "Reading..." | Observed | A40-dataroom-file: file shows "Reading..." with hourglass, no refresh or consent action visible |
| Data room consent row | Not verified | Row did not appear in the seeded demo |
| Unreachable-server message | Not tested | Would need pointing the app at a dead server and re-signing in |
| Error alerts | Not tested | No error path was triggered |
| Team computer "Stop ... and take control" | Not verified | V-computer shows "Not in use" and "Take control"; no bot was using the computer |
| "Meeting saved" bar | Not verified | Recording needs a speech model and microphone in the simulator |

## Other observations during verification

- The thread shows "This content isn't available in this version." at the top of the Investors agent thread (A01-thread) for a message type the app cannot render. It is the first thing a user sees there.
- After sending, the demo stack's consent card appears under the sent message and covers the composer's last row until the user scrolls (A05-sent).
- Load on the host stayed above 25 during the run (other sessions); steps were slow but no step failed because of it, except that one Undo attempt missed the toast timeout and was repeated.
