# Pass-2 verifier R2: clusters D (Calendar) and E (mail dialog, Context, Track)

Target: the integration branch on the mock-data demo, 390x844 (spot check 375x812) and 844x390 landscape, desktop 1440x900. Touch emulation: CDP setDeviceMetricsOverride (scale 3, mobile) + setTouchEmulationEnabled + setEmitTouchEventsForMouse; confirmed `pointer: coarse` = true and `hover: none` = true. `click` was done through eval. The machine was slow; latency is not filed. Screenshots (read): cal-default, cal-sched2, cal-filters, cal-3day, cal-day, cal-month, cal-month-tap, cal-routine, s375-cal, land-cal, inbox, mail-open, mail-ctx, mail-next, mail-tracked, mail-tracked2, inbox-after, mail-toast, compose, compose-ctx, land-news, desk-cal, desk-inbox, desk-mail.

## Verdicts

Cluster D (Calendar): MET, with two small residuals (R2-01, R2-02) and one item that could not be exercised live (to-do tap).
Cluster E (mail dialog, Context, Track): MET for all P1s; two P2/P3 partials (W1-09 contact line, W1-12 sheet height) and the To do card alignment not verifiable (no to-dos in the demo now).

## Cluster D

| Id | Verdict | Evidence |
|---|---|---|
| W1-01 Calendar behind the Pages fold | met | Calendar is listed in the default Pages list in the drawer (cal-default drawer view, between Company and "+7 more"). |
| W1-02 / V1-01 Week 672 px grid | met | Default view on a phone is Schedule. The view menu offers Day, 3 days, Month, Schedule (all 44 px). 3 days (`view=week`): 3 columns fit 390 px, scrollWidth 390, hour column visible (cal-3day). |
| W1-03 / V1-07 header unstable | met | Today / prev / next / title / view button sit at y=68, 44 px high, in Schedule, 3 days, Day and Month (measured). Prev/next are `visibility:hidden` in Schedule but keep their space. Residual: R2-02. |
| W1-04 / V1-05 Month chips, day tap | met | Month shows up to 3 dots per day, cells 44x71 px. Tapping 29 Oct showed "Thursday, Oct 29" with 3 routine rows below, each 44 px (cal-month-tap). Tapping an empty day (28) shows "Nothing scheduled". |
| W1-05 routine opens settings | met | Routine rows are links `...?routine=<id>`; tap opened the "Routine" editor for Daily legal scan (cal-routine). |
| W1-06 / V1-08 to-do opens Inbox top | not verified live | The demo has no to-dos with dates, so none appears in Schedule. Code: `Calendar.tsx:387` links to `/app/inbox?mail=<id>` when the to-do has a mail. Needs a live check with a to-do. |
| W1-07 Connect link 18 px | met | Link height 44 px (measured). |
| V1-02 four toolbar rows | met | One row: Today, prev, next, title, view menu, plus a Filters icon in the page header (all 44 px). Grid starts at about y=120 in landscape (was 250). |
| Filters sheet | met | Bottom sheet "Filters" with a Search input, "Kind: All" and "Bot: All" controls (44 px each), no nested Filters button (cal-filters). |
| V1-03 all-day bars 22 px | not verified live | No all-day items in the demo. Same to-do gap as W1-06. |
| V1-04 Day blank, no empty text | met | "Nothing scheduled" line above the Day grid (cal-day). Residual: the first hour label is half-clipped (R2-01). |
| V1-06 landscape toolbar | met | Landscape: header row plus one control row, grid at y=120 of 390 (land-cal). The page does not scroll sideways (scrollWidth 844). |
| FLOW-12 | met | See V1-02. |
| V3-06 BotTodos tick box | not verified live | Code now has `pointer-coarse:min-h-11` rows and a size-6 checkbox (`BotTodos.tsx:64,70`). The 24 px box inside a 44 px row was not measured live. |
| 44 px targets | met | Every measured Calendar button, row and link was 44 px or more. |

Desktop 1440x900 Calendar (desk-cal): unchanged. Inline Search, Kind, Bot, a text view switcher and the 7-day Week grid.

## Cluster E

| Id | Verdict | Evidence |
|---|---|---|
| W1-08 / V1-10 Context reopens | met | Opened Context on one mail, closed it, pressed Next message: the next mail opened with no sheet. A new compose opened clean (compose.png). No `mail-context-open` key in localStorage. |
| W3-15 / FLOW-08 / W1-12 full-screen overlay | partly met | In a read mail Context is a bottom sheet (starts y=340 of 844, mail header and action row stay visible). In compose the sheet covers the lower 60 percent, including the body and the Send bar (compose-ctx). Closing it is one tap. R2-04. |
| W1-09 / V1-11 Context rows 28 px | partly met | Thread and document rows are 44 px. The contact-line link "Halcyon Logistics (Mock) · Customer" is still 16 px tall (199x16); it is a small inline link to the contact page. |
| W1-10 Track not in dialog, no tracked state | met | More menu (4 items, 44 px each): Ask agent, Track, Forward, Mark unread. After Track, the dialog shows an eye icon with "Tracked" next to the date (mail-tracked). Closing the mail shows the eye beside the date on the Inbox row (inbox-after). The menu then reads "Stop tracking". I stopped tracking again to restore the demo data. |
| W1-11 / V1-09 action row | met | One row: Reply, Archive, Context (labelled), "..." , all 44 px (mail-open). Ask agent moved into More. |
| V1-12 date vanishes after a tap | met | After opening Morgan and Robin and closing, both rows still show the date (inbox-after). |
| W1-13 landscape Archive clips the date | met | 844x390 Newsletters: "Oct 27", "Oct 26" sit left of the 44 px action button with clear space (land-news). |
| W1-17 consent card about 270 px | not changed, not in scope | The card is now about 140 px tall and has Allow/Not now (inbox.png). Counted as improved. |
| W1-18 To do card alignment | not verified live | The demo has no To do card now (page text has no "To do"). Code has 44 px coarse targets in `TodoCard.tsx:118-129`. |
| V1-13 | not re-checked | Banner still sits above the list. P3, outside this cluster's fix. |

Desktop 1440x900 mail dialog (desk-mail): unchanged. Wide dialog with the Context side panel (restored open on desktop), inline Reply, Archive, Ask agent, icon Context, "...". The desktop Inbox list shows dates and no row buttons until hover.

## Not-met list
None of the findings is unmet. Partly: W3-15/W1-12 (compose sheet covers the Send bar), W1-09 (16 px contact link). Not verifiable on this demo: W1-06, V1-03, V3-06, W1-18.

## New findings
- R2-01, P3: Day and 3-day grids still open with the first hour label ("11 AM") half hidden under the sticky day header. `apps/web/src/pages/Calendar.tsx` (scroll offset and time label).
- R2-02, P3: In Schedule at 390 and 375 px the title wraps to two lines ("Oct 28 – Nov 26") and the hidden prev/next leave an empty 100 px gap between Today and the title. `apps/web/src/pages/Calendar.tsx:830-839`.
- R2-03, P3: Month weekday labels are left-aligned in their column while the date numbers are centered, so "Sun" is not above its dates. `apps/web/src/pages/Calendar.tsx` (month header).
- R2-04, P3: The Context bottom sheet in a reply or new message is about 60 percent of the screen and hides the body and Send bar; a half-height sheet would let her read and write together. `apps/web/src/components/ComposeEmail.tsx`, `ContextPanel.tsx`.
- R2-05, P3, observed once, not reproduced: right after Track the "Tracking..." toast with Undo was drawn clipped at the right edge of the dialog (two screenshots 2 s apart). It did not appear after "Stop tracking". Could be a slow-machine animation frame. `apps/web/src/components/inbox/InboxMessageDialog.tsx` (toast placement inside the dialog).
