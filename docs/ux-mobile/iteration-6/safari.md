# Iteration 6: real Mobile Safari (iOS Simulator) check

Scope: Praci web app in Mobile Safari on iPhone 17 Pro (402x874 pt) and iPad Pro 11-inch (834x1210 pt), iOS 26.3, demo stack slot 1 (web 5374). Screenshot names refer to files in the a local screenshot folder working folder of the run; they are not committed.

## Method and limits

- Software keyboard: with the default simulator setting, Safari showed only the form-assist bar (hardware keyboard attached). What worked: `defaults write com.apple.iphonesimulator ConnectHardwareKeyboard -bool false`, then quit and reopen the Simulator app (this reboots the booted devices; Safari tabs and the login survive). After that, tapping a field raised the full on-screen keyboard.
- Tooling caveat: any typing sent with `idb ui text` or maestro `inputText` switches iOS back into hardware-keyboard mode and the soft keyboard stops appearing until the Simulator app is restarted. All keyboard findings below were therefore made by tapping the soft keys (a helper that taps keys by accessibility label), not with `idb ui text`. `idb ui text` also types `@` as `2`; maestro `inputText` types it correctly.
- Host load: the Mac ran at load average above 450 during the iPad pass. Safari showed "server stopped responding" for several iPad loads even though `curl` answered in under 50 ms. Pages that did not finish loading are marked NOT COVERED rather than guessed.
- I sent one test message ("Hello there") in the existing Chief thread, not a new thread (a tap order mistake), and clicked Allow on the AI data-sharing consent card in that thread. This is demo data only. No email was sent; the Priya reply draft was autosaved as a draft and not sent.
- iPad landscape was NOT tested (no rotation command was available through idb or simctl in this setup, and host load made a Simulator-menu approach unreliable).
- The round dark button at the bottom right of every screenshot is the dev-only Agentation toolbar (`apps/web/src/main.tsx`, `import.meta.env.DEV`), not product UI. It covers the Send/mic controls in some states. It is listed as S-10 for test hygiene only; do not file it as a product bug.

## iPhone results

### 1. Chat composer with keyboard: PARTIAL FAIL

- Focusing the composer (tap, keyboard up): the composer was not visible for at least 2 s; the chat list was shown with the composer hidden behind the keyboard (`r4.png`, `r5-composer-kb.png`). After the first typed character the page scrolled and the composer rose above the keyboard (`r6.png`). Finding S-02.
- With text typed, the composer grows into a two-row box (text, then plus at left and send/mic at right) and sits fully above the keyboard. The latest chat message stays reachable above it (`r6.png`). The header ("Chief") scrolls out of view while the keyboard is up.
- Return key on the on-screen keyboard sends the message (my "Hello there" went out when I pressed Return to start a second line; `r8.png`, `r9.png`). A multi-line message cannot be typed on a phone keyboard. Finding S-03.
- Send is a green 48 pt circle; with the dev toolbar it is partly covered (S-10).
- Sending while an AI-sharing consent ask is pending shows "Answer the pending ask first." in red above the composer (`r7-multiline.png`); the text stays in the composer. Acceptable.

### 2. Inbox, open message, Reply: FAIL

- Open message and Reply screens without keyboard: PASS (`s2-msg.png`, `s3-reply.png`). To, Subject, Send, format, attach, delete all visible.
- Tapping the body with the keyboard up: the compose screen scrolls sideways and vertically (`s4-reply-kb.png`, `s5-reply-typed.png`, `t2-kb.png`). The "Reply" header with the Context and Close buttons is scrolled off the top, the From and Subject values are cut at the right edge, Cc/Bcc are cut, and the Send/format/attach/delete bar is hidden under the keyboard. Swiping up did not reveal it (`s6-reply-scroll.png`). The only way to Send is to dismiss the keyboard with the Done check. Findings S-01 (P0) and S-04.
- After Done, the page stays panned: Send is clipped by Safari's bottom bar and a horizontal scrollbar shows (`s7-reply-after-done.png`, `s8.png`). Finding S-04.
- Context sheet opened from the header before the keyboard is up works and sits above the Send bar (`t1-context.png`): PASS. It cannot be opened while writing with the keyboard up because the header is off screen (part of S-01).
- Cancel without sending: closing was possible only by reloading; the draft was autosaved ("Draft saved") and nothing was sent.

### 3. Contacts search and Filters sheet: PASS with notes

- Search field focus with keyboard: field stays at the top, results filter live, nothing covered (`u1-search-kb.png`). No zoom on focus.
- Filters sheet (`u2-filters.png`): chips for Kind and Sort fit with no sideways scroll. The sheet's footer shows "Clear all" and has a large empty band between the Sort chips and the footer. The dev toolbar covers the right of the footer (S-10), so whether a Done/Apply button exists there was not observable. Note S-09.
- The Search field and Filters pill row is not aligned with the content edge: the Filters pill ends about 7 pt left of the list's right edge (`u0.png`). S-08.

### 4. Sign-in fields with keyboard: PASS

- Fields are 16 px or larger (`input.tsx` uses `text-base` below the md breakpoint); Safari did not zoom on focus (`p04-email-kb.png`, `p07-email-softkb.png`, `p08-signin-filled.png`). When the keyboard opens, the page scrolls so the focused field is visible; the form-assist bar overlaps the lower field slightly while open (`p07-email-softkb.png`), which is normal Safari behaviour.

### 5. Safari chrome and safe area: PASS with notes

- Safari 26's compact bottom bar floats over the page; the app viewport ends about 98 pt above the screen bottom (the page background shows a slightly different band behind the bar, `s2-msg.png`, `r2.png`). Fixed bottom UI (composer, approval toast, Send bar) sits above the bar with no overlap in the resting state (`r2.png`, `s3-reply.png`). The home-indicator safe area is therefore not exercised here, because the page does not extend under the bar. Finding S-07 (P3, note).
- The approval toast ("Investors agent needs approval") floats above the composer and sits very close to the "6 new messages" pill and the composer; it covers the last chat line (`r2.png`). With the keyboard up it moves to the top of the visible area and covers a message (`r6.png`). S-06 (P2).

## iPad results (portrait only)

Layout at 834 pt width: the app uses the phone layout (hamburger instead of a sidebar, single column). Content spans full width with 20 pt gutters; no horizontal page scroll was seen on any loaded page.

| Page | Result | Notes |
| --- | --- | --- |
| Home / chat | PASS with note | `i1-home.png`. Message bubbles and the text column stretch to about 800 pt, so lines run 110 characters or more. S-05. |
| Inbox + message | PASS (list) | `ip-inbox.png`. Dense desktop-style rows with checkbox, sender, subject, time, row menu; fits. Open message and reply NOT COVERED on iPad. Row checkboxes are about 14 pt, row menu about 42 pt. |
| Calendar (Week) | PASS | `ip-cal.png`. Seven day columns fit; one all-day event shows a truncated title ("Send Sam the robot..."). Large empty grid is normal for a mostly empty demo week. |
| Contacts | NOT COVERED | Page stayed on loading skeleton, then Safari timed out under host load. |
| Investors | PASS | `ip-investors.png`. Cap table, tabs and action card fit; table has no sideways scroll. Row menus are small (about 20 pt visible). |
| Company tabs | PASS | `ip-company.png`. Tabs fit on one row, header actions aligned. Only the empty Overview state was seen. |
| Legal | PASS | `ip-legal.png`. Filter pills, tabs and the contracts list fit. |
| Finance | NOT COVERED | Loading skeleton only (`ip-finance.png` shows skeleton). |
| Data room, Activity, Settings | NOT COVERED | Safari timed out; no usable screenshot. |

Phone sheet versus desktop pills: on iPad the Inbox and Legal use desktop-style inline filters (pills), while Contacts on iPhone uses a Filters sheet; no mixed state was seen on the pages that loaded.

## Findings

### S-01 (P0) Reply compose: Send and header unreachable while the keyboard is up
Evidence: `s4-reply-kb.png`, `s5-reply-typed.png`, `s6-reply-scroll.png`, `t2-kb.png`. With the keyboard up, the compose dialog is displaced: header (Context, Close) off the top, Send/format/attach/delete bar hidden behind the keyboard, and swiping does not reveal it. The user must dismiss the keyboard to Send.
Suspected file: `apps/web/src/components/ComposeEmail.tsx` line about 614: `max-md:h-dvh max-md:w-screen max-md:inset-0`, a fixed full-screen dialog whose height does not shrink for the iOS keyboard. iOS keyboards overlay the layout viewport, so the dialog's bottom bar sits under the keyboard and Safari pans the page when the body is focused.
Proposed fix: size the phone compose dialog from `window.visualViewport` (set a CSS variable for height and top offset on `resize`/`scroll`), or make the body scroll inside the dialog and pin the Send bar to the visual viewport bottom. Re-test after the keyboard closes (see S-04).

### S-02 (P1) Chat composer sits under the keyboard on focus until the first keystroke
Evidence: `r4.png` and `r5-composer-kb.png` (two shots 2 s apart, composer not visible), then `r6.png` (visible after typing). The user taps the field and sees no field; the caret is hidden.
Suspected file: `apps/web/src/pages/shell/composer.tsx` and the shell layout using the fixed bottom region; same root cause as S-01 (layout viewport does not follow the keyboard).
Proposed fix: on focus, scroll the composer into view using the visual viewport, or pin the composer to the visual viewport bottom.

### S-03 (P2) Return key sends on the phone keyboard, so no multi-line message
Evidence: `r7-multiline.png`, `r8.png`, `r9.png` ("Hello there" was sent by a Return tap meant as a newline). `apps/web/src/pages/shell/composer.tsx` (key handling near lines 1015-1038) treats plain Enter as send; Shift+Enter does not exist on a touch keyboard.
Proposed fix: on touch devices (coarse pointer), Enter inserts a newline and the Send button sends; keep Enter-to-send for hardware keyboards. Set `enterKeyHint="enter"` on touch.

### S-04 (P1) Compose page stays wider than the screen and panned after the keyboard closes
Evidence: `s7-reply-after-done.png` and `s8.png`: horizontal scrollbar, FAB cut at the right edge, Send clipped by Safari's bottom bar, From row cut at the right ("Founder mail <mock-founder@northwind.ex"). In the resting state (`s3-reply.png`) the From value truncates correctly with an ellipsis, so something inside the dialog is wider than the viewport once focus/keyboard changes the zoom or pan; likely the `w-screen` (100vw) dialog plus the From select not shrinking.
Suspected file: `apps/web/src/components/ComposeEmail.tsx` (From select around lines 646-660, `max-md:w-screen`).
Proposed fix: use `w-full`/`inset-x-0` instead of `w-screen`, add `min-w-0 overflow-hidden` to the From trigger, and add `overflow-x-hidden` to the dialog; verify with Safari after focusing the body and pressing Done.

### S-05 (P2) iPad portrait: chat and message text lines run about 800 pt wide
Evidence: `i1-home.png` (bubbles reach 1100 px of 1379 px displayed, lines over 100 characters). Reading comfort drops; bubbles for the assistant stretch across the page.
Suspected file: shell thread container in `apps/web/src/pages/shell/` (message list column has no max width at tablet widths).
Proposed fix: cap the thread column at about 720 pt and center it from the md breakpoint up; keep full width on phones.

### S-06 (P2) Approval toast covers chat content and crowds the composer
Evidence: `r2.png` (toast, "6 new messages" pill and composer stacked within 130 pt), `r6.png` (toast lands over a message while typing), `ip-*` screenshots (toast covers the lower right of every iPad page).
Suspected file: `apps/web/src/components/AppToaster.tsx` and the approval toast component.
Proposed fix: dock the approval prompt in the composer area or collapse to a small badge while the composer is focused; avoid stacking with the jump-to-new pill.

### S-07 (P3) Page does not extend under Safari's bottom bar
Evidence: `s2-msg.png`, `r2.png`: a light band of page background shows between the app bottom and the Safari bar; `env(safe-area-inset-bottom)` is never exercised in Safari. Compose dialog already pads with `env(safe-area-inset-bottom)` (`ComposeEmail.tsx` line about 614). Possibly no action; note for installed-app (standalone) mode, which was not tested.
Proposed fix: none required; add `viewport-fit=cover` only if edge-to-edge is wanted, then re-check bottom bars.

### S-08 (P3) Contacts search row misaligned with the list
Evidence: `u0.png`: Filters pill right edge about 7 pt inside the list's right edge; Search starts 3 pt inside the left edge. Suspected file: the shared list controls (`ListControls`, see `docs/design-system` and `apps/web/src/components/`).
Proposed fix: align the row to the same gutter as the list.

### S-09 (P3) Contacts Filters sheet has a large empty band
Evidence: `u2-filters.png`: about 180 pt of empty space between the Sort chips and the footer. Suspected file: the phone Filters sheet container (`packages/ui-web/src/components/ui/sheet.tsx` uses `max-h-[85dvh]`; footer is bottom-pinned).
Proposed fix: let the sheet size to its content.

### S-10 (P3, test hygiene only) Dev toolbar covers Send/mic and sheet footers
Evidence: round dark button in `r3`-`r10` and `u2-filters.png`. Source: `apps/web/src/main.tsx` (dev-only Agentation). Not a product bug; hide it when running UX walks (it is already skipped for `navigator.webdriver`, but not for a real Safari).

## Summary

- iPhone: 1 FAIL-level problem (S-01 compose keyboard), plus S-02, S-03, S-04 in keyboard handling. Sign-in, Contacts search and Filters, and the resting layouts are fine.
- iPad portrait: layouts for the pages that loaded are sensible, with no sideways scroll; text measure is too wide on the chat (S-05). Contacts, Finance, Data room, Activity, Settings and all landscape checks were not covered (host overload and no rotation command).
