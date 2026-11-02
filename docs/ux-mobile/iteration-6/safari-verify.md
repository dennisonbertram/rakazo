# Mobile Safari keyboard verification (branch mobile6/keyboard)

Real Mobile Safari, iPhone simulator, software keyboard, Vite dev bundle on the demo web. Screenshots stayed local (referred to by file name only).

## 1. Inbox reply: PASS
- Reply opened from message (10.png, 11.png).
- Subject focused (12.png), To focused (13.png), body focused (14.png). In all three the header (Reply, Context icon, Close) is at the top, From label and Subject text are fully visible on the left, and the text size is unchanged (no zoom). The Send bar sits directly above the keyboard. A strip of Safari's own form-assist bar (arrows and checkmark) sits between the Send bar and the keyboard in every focus state; this is Safari chrome, not app layout.
- Keyboard dismissed (15.png): dialog fits the screen width, no horizontal scroll, Send fully visible.
- Cancelled with Close, nothing sent (16.png).

## 2. Chat composer: PASS, with one dev-only note
- Tap composer (2.png): composer and caret are visible above the keyboard immediately.
- Typed "Hi", Return on the soft keyboard (3.png): a new line was inserted, message not sent.
- Send (6.png, 7.png): message sent ("Hi" bubble and reply).
- Note: the Agentation dev toolbar button (dark circle, bottom right) is drawn over the composer Send button on the Vite dev build. My first tap on Send opened that toolbar instead (4.png, 5.png). Only a sliver of the blue Send button was tappable, and tapping it on the left edge worked. This overlay is likely dev-only and not in a production build, but it blocks Send in this environment.

## 3. Contacts search focus: PASS
- 18.png before, 19.png after tap: no zoom, field and header not covered, list stays visible above the keyboard.
