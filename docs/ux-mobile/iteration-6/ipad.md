# Iteration 6: iPad check in real Mobile Safari (portrait and landscape)

Scope: Praci web app, demo stack slot 1 (web 5374, API 3301) serving origin/main, iOS 26.3 Simulator. Two devices: iPad Pro 11-inch (834x1210 pt, "Safari-iPad") and iPad Pro 13-inch M5 (1032x1376 pt, "Safari-iPad13", created for this check). Screenshot names refer to files in a local working folder; they are not committed. Follows `safari.md`, which covered iPad portrait only partly.

## Method and limits

- Driven with idb taps, maestro `inputText` for typing, `xcrun simctl io screenshot`. Every screenshot named below was opened and read.
- The host was heavily loaded during the run (load average 145 to 250). Many pages took 15 to 60 s to leave their loading skeleton, and several stayed on a skeleton for the whole wait. Those are marked NOT SEEN LOADED, not guessed. `curl` answered the web server in under 20 ms throughout, so the delay is in the app's data requests, not the web server.
- The Agentation dev toolbar (round dark button, bottom right of each screenshot) is dev-only, not product UI.
- Landscape: route (a), the System Events keystroke (Cmd+Right and Cmd+Left), worked on both simulators. Rotating needed no maestro or Chrome fallback. Routes (b) and (c) were not used. Landscape screenshots are saved rotated 90 degrees by the simulator, so they were re-rotated before reading. Tap coordinates in landscape need a manual mapping, which cost time. Both simulators were returned to portrait at the end (verified by screenshot width).
- The simulator's global defaults (ConnectHardwareKeyboard) were not changed. Software-keyboard behaviour was not part of this pass.
- A password-save prompt from Safari appeared after sign-in on the 13-inch device and was dismissed with "Not Now".
- Coverage gap, stated plainly: the first portrait screens I captured on the 11-inch device (home, inbox list, open message, Reply, Calendar Week, Contacts search and Filters, Investors, Company, Legal, Activity) were not recorded in enough detail to report here, because my notes on them were lost when the session was trimmed. They are listed as NOT RECORDED below rather than marked pass. Re-run them if needed.

## PASS / FAIL list

Portrait, iPad Pro 11-inch (834 pt wide):

| Area | Result | Evidence |
| --- | --- | --- |
| Data room folder tree, list, and file preview | PARTIAL FAIL | `r3.png`, `r4.png`, `r6.png`. Layout fits and has no sideways scroll. Opening a file shows a preview pane; the preview image area stayed an empty grey block (734-byte demo file, so possibly expected). The toast covers the bottom list row (I-04). Row checkboxes about 17 pt, row menus about 20 pt wide (I-05). |
| Finance | PASS with notes | `r8.png`, `r16.png`. Cards, chart, Category/Vendor tabs, and Upcoming table fit in one column with no sideways scroll. Header wraps awkwardly: space name sits above the title and the "1 non-USD transaction not counted" note wraps to two lines next to the buttons (I-06). The toast covers the lower rows (I-04). |
| Settings (opened from account menu) | PASS (landscape only) | See landscape. |
| Home / chat with 720 px cap | NOT RECORDED on 11-inch; see 13-inch | |
| Inbox list, message, Reply | NOT RECORDED | |
| Calendar Week | NOT RECORDED | |
| Contacts, Investors, Company, Legal | NOT SEEN LOADED / NOT RECORDED | Skeleton only in the screenshots I could read. |
| Activity (sidebar history view) | FAIL | Stuck on "Still loading…" (I-01). `H1.png`, `r10.png`. |

Portrait, iPad Pro 13-inch (1032 pt wide):

| Area | Result | Evidence |
| --- | --- | --- |
| Home / chat | PASS with notes | `s13-2.png`. Persistent sidebar (about 315 pt) plus chat. Chat text column about 660 pt, under the 720 pt cap; long lines read comfortably. The approval toast sits above the composer and the "2 new messages" pill, with about 20 pt between toast and pill; it covers no message text but crowds the pill (I-04). |
| Sidebar | FAIL (empty band) | `s13-2.png`: about 150 pt of empty space between "Archived" and "Integrations" (I-02). |
| Activity history view | PASS | `s13-hist.png`. Loaded with Needs approval, Working and finished-runs rows. Shows the same view that stuck on the 11-inch (I-01 is load-dependent). |

Landscape, iPad Pro 11-inch (1210x834 pt):

| Area | Result | Evidence |
| --- | --- | --- |
| Sidebar plus content layout | PASS | `l3.png`, `L-inbox.png`. Persistent sidebar (about 315 pt) with content to its right, no phone-style hamburger. Good pattern change from portrait. |
| Finance | PASS | `l3.png`. Five metric cards, period tabs and chart fit; the page scrolls inside its panel; toast sits bottom right over empty space, not over content. |
| Calendar Week | PASS | `L-cal.png`. Seven columns, toolbar in one row, loading spinner shown. Rows visible to 8 AM; scrolls. |
| Inbox | NOT SEEN LOADED | `L-inbox.png`: "Reading your mail…" skeleton; search field and Ask in the header look right. |
| Contacts, Investors | NOT SEEN LOADED | `M-contacts.png`, `M-investors.png`: header and tabs right, content skeletons only. |
| Settings (General) | PASS | `L-contacts.png` (the capture was taken while the Settings dialog was open). Two-column dialog, about 1190 pt wide, fits; "Delete account" is clipped at the bottom edge of the dialog but the dialog scrolls (it fades at the edge). |
| Settings Connections | NOT SEEN LOADED | `L-legal.png`: skeleton block only. |
| Company, Legal, Data room, Activity | NOT RECORDED in landscape | |
| Active-page sidebar | FAIL (empty band) | `l3.png`: the page list is clipped to nine rows ("+7 more") while about 100 pt of space sits above "Integrations" (I-02). |

Landscape, iPad Pro 13-inch (1376x1032 pt):

| Area | Result | Evidence |
| --- | --- | --- |
| Home / chat | PASS with one failure | `s13-L-hist.png`. Sidebar plus a chat column about 720 pt wide, centred in a content area of about 915 pt, so the cap works. The approval toast overlaps the bottom of the "Pay Placeholder Legal LLP the $2,000 bill on the 30th." message bubble (I-04). The toast sits close to the "2 new messages" pill but does not touch it. The composer is clear. |
| Sidebar | PASS | The sidebar fits its content with about 80 pt free above Integrations. |

## Findings

### I-01 (P1) Sidebar Activity view stays on "Still loading…", and the page behind it too
Evidence: `H1.png` (11-inch landscape, sidebar history view with three skeleton rows and "Still loading… Try again", main area also on skeleton cards with its own "Still loading…"), `r10.png` (11-inch portrait, same view), `s13-hist.png` (13-inch, same view loaded fine).
Observations:
- It did load eventually on the 11-inch device at the first open of the history view in an earlier pass, and the 13-inch device loaded it in under 20 s. Under host load of 145+ the 11-inch view stayed on the skeleton for more than 60 s. So the stall depends on load. I did not see a failing request; curl against the web server returned instantly, but an unauthenticated RPC returned 401 so I could not time the real RPC from outside the browser.
- "Try again" did not change the state in my taps. In the code it calls `window.location.reload()` by default.
Cause (from code): `apps/web/src/pages/ActivityList.tsx` shows `RowsSkeleton` while `loading && !hasAnyRuns`. `loading` clears only when the first `rpc.runs.list({ filter: "active" })` resolves. The three requests (`runs.list` active, `runs.list` recent, `scratchpad.waitingOnYou`) run in `Promise.all`; if any of the three is slow or fails, the 15 s refresh timer and error text appear only after all settle, so a slow third request does not block the first list but a hung one stalls the error state. `apps/web/src/components/ShellSkeleton.tsx` `StillLoading` appears after `STILL_LOADING_MS` (20 s) and its default retry reloads the whole page, which restarts the same slow requests.
Proposed fix: give the Activity RPCs a request timeout that sets `error` (so `ActivityError` with a real retry shows instead of an endless skeleton), and pass `onRetry={() => reloadRef.current?.()}` to the skeleton's `StillLoading` so "Try again" refetches only the list instead of reloading the page. Cause not fully proven (needs the browser network log under load).

### I-02 (P2) Large empty band in the iPad sidebar
Evidence: `r10.png` (11-inch portrait), `r2.png`, `l3.png` (11-inch landscape), `s13-2.png` (13-inch portrait).
Measurements (points, from screenshots at 0.605 pt per displayed pixel for the 11-inch device and 0.688 pt for the 13-inch device):
- 11-inch portrait, history view: skeleton rows end at about y=370 pt; "Still loading…" at about 405 pt; the space header at about 485 pt (80 pt gap); "Archived" row at about 870 pt; "Integrations" at about 1120 pt. The band between "Archived" and "Integrations" is about 250 pt, and the account row is another 40 pt below.
- 11-inch portrait, default view with the page list collapsed: "Archived" at about 810 pt, Integrations at about 1120 pt, about 250 pt empty.
- 11-inch landscape: the page list is capped at nine rows with a "+7 more" row, "+3 more" for chats, and about 75 pt free above Integrations. The main area to the right is 870 pt of content with no sidebar-adjacent gap.
- 13-inch portrait: about 150 pt between "Archived" and "Integrations".
- 13-inch landscape: about 80 pt.
What sits beside it: in portrait, the sidebar is a full-height overlay on the 11-inch device (hamburger pattern) and a persistent column on the 13-inch device. The empty band comes from the sidebar's flex layout: the roster scroll area (`sidebarScrollRef` container in `apps/web/src/pages/shell/space-sidebar.tsx`, class `lg:min-h-0 lg:flex-1`) grows to fill the height while the content is short, with the footer pinned at the bottom.
Proposed fix: let the sidebar footer (Integrations, account) sit directly under the roster when the roster is short, or move Integrations next to the page list. At minimum remove the 80 pt gap between the history skeleton and the space header (the skeleton reserves four rows plus a "Still loading…" row). Taller iPads (13-inch) need the same treatment.

### I-03 (P2) Inconsistent breakpoint: 11-inch portrait uses the phone layout, 13-inch portrait uses the desktop sidebar
Evidence: `r3.png` (11-inch portrait, hamburger, no sidebar), `s13-2.png` (13-inch portrait, persistent sidebar).
Both are iPads in portrait. At 834 pt wide the app shows the phone layout (single column, hamburger, sidebar as an overlay), and at 1032 pt it shows the desktop layout. This is a breakpoint choice (`lg` at 1024 px), not a bug, but the 834 pt layout also shows desktop-style dense lists (Data room tree plus list inline, Finance two-column cards), so it is a mix of phone navigation and desktop content. In landscape the 11-inch device switches to the desktop layout (`l3.png`).
Proposed fix: decide whether 834 pt portrait should be "tablet" (persistent narrow rail or collapsible sidebar) instead of the phone overlay. Not urgent.

### I-04 (P2) Approval toast covers content on iPad
Evidence: `r3.png`, `r4.png` (11-inch portrait Data room: toast covers the bottom list row "MOCK Invoice 3023 - Delta Desk Rentals.pdf" and sits against the dev button), `r8.png` and `r16.png` (11-inch portrait Finance: covers the Breakdown and Upcoming rows), `s13-L-hist.png` (13-inch landscape chat: covers the bottom of the "Pay Placeholder Legal LLP..." message bubble), `s13-2.png` (13-inch portrait chat: about 20 pt above the "2 new messages" pill, no overlap).
The toast is fixed to the bottom right and about 120 pt tall. It does not cover the composer or the pill in any state I captured, but it covers list rows and the last visible chat message line in landscape.
Suspected code: the toast container in the shell (search `Investors agent needs approval` is demo data; the component is the approval toast under `apps/web/src/components/`). I did not locate the exact file.
Proposed fix: reserve bottom padding for the toast on scrolling content, or dock it above the composer in chat and collapse to a small chip after a few seconds.

### I-05 (P3) Small touch targets in the Data room list
Evidence: `r3.png`, `r4.png`. Row checkboxes are about 17 pt, row "…" menus about 20 pt wide visible, below 44 pt. Rows themselves are about 60 pt tall so the row tap target is fine.
Proposed fix: pad the checkbox and menu buttons to 44 pt (invisible hit area) on coarse pointers.

### I-06 (P3) Finance header wraps unevenly on iPad portrait
Evidence: `r8.png`. The space name sits on its own line above the title, the sync line ("Mercury, Brex · syncing…") on a line below, and the note "1 non-USD transaction not counted" wraps to two lines next to Accounts and Ask. Header height is about 130 pt versus about 55 pt for the landscape header (`l3.png`), where the same items fit in one row.
Proposed fix: move the non-USD note into the sync line or an info popover on narrow widths.

### I-07 (P3) Finance and other pages take 20 to 60 s to leave skeletons under load
Evidence: `p-finance.png` through `p-finance5.png` (skeleton for more than 100 s on first load, then loaded after navigating via the sidebar), `L-inbox.png`, `M-contacts.png`, `M-investors.png`. This run's load was extreme, so this is a test-environment note. The pages show placeholders and "Still loading… Try again" only after 20 s, which is reasonable; no page showed an error state.

## Screenshots read (stable names)

11-inch portrait: `r3.png`, `r4.png`, `r5.png`, `r6.png`, `r8.png`, `r9.png`, `r10.png`, `r15.png`, `r16.png`, `r17.png`, `r2.png`, `H1.png` (landscape), `back1.png` (portrait stuck page).
11-inch landscape: `l1r.png`, `l2.png`, `l3.png`, `L-inbox.png`, `L-cal.png`, `L-contacts.png`, `L-investors.png`, `L-company.png`, `L-legal.png`, `M-contacts.png`, `M-investors.png`, `H1.png`.
13-inch: `s13-1.png` (sign-in), `s13-2.png` (home, portrait), `s13-hist.png` (history view, portrait), `s13-L-hist.png` (landscape).
Not committed; recapture from the steps above.

## After (branch mobile7/ipad)

Status: code changes are made and unit-tested. They were NOT verified in the iOS Simulator. No `after-*.png` screenshots exist. When I loaded the branch on the demo web, both iPad simulators failed to load the app: the 11-inch stayed on a "Could not reach the server" page with a frozen status-bar clock, and the 13-inch showed "Safari couldn't open the page because the server stopped responding" for more than five minutes. At the same time `curl` got HTTP 200 from the Vite server in under 10 ms and a headless browser loaded and signed in. Host load average was 175 to 380. Treat every fix below as unverified on a real iPad until the simulators are healthy.

What changed:

- I-01: Each Activity request (`runs.list` active, `runs.list` recent, `waitingOnYou`) now fails after 12 s with "Could not load activity", which shows the existing error with Try again. The lists still render one by one as each request settles. `RowsSkeleton` takes an optional `onRetry`; the Activity skeleton passes a refetch, so "Try again" no longer reloads the page. Test: "turns a request that never answers into the error with Try again, which refetches in place" (failed before the change, passes after). Other `StillLoading` users keep the reload default except Finance, which already passed its own retry; the Suspense page fallbacks in the shell were left on reload.
- I-02: (a) Phone-layout drawer on iPad (coarse pointer, 768 to 1023 pt wide, so 11-inch portrait): the roster pane no longer grows, so Integrations and the account row follow the content directly instead of being pinned 250 to 480 pt below it. (b) Wide layout with a coarse pointer (13-inch portrait, both landscapes): the roster scroller no longer grows, same result. Desktop with a mouse is unchanged and still pins the footer. (c) "+N more" bar: when the row it cuts is at least 60 percent in view, the bar no longer grows to hide that whole row, which saves up to about 35 pt of blank space (landscape band was 67 pt tall in a headless 1210x834 check before the change). The extra gaps around the history view and space header were not changed; I could not see them.
- I-04: not changed. In `r4.png` the page column is already shortened by `--toast-page-reserve` and the toast sits below the column, so the last row is cut by the column edge, not covered. Whether the last row can scroll clear could not be confirmed without a working simulator.
- I-05, I-06: not done.
- I-03: recommendation only. Keep the 1024 px breakpoint for now. If 834 pt portrait should get a persistent sidebar, change it together with the toast and drawer logic, since several files test `isPhone()` and `lg`.

Checks run: vitest for ActivityList and rows-below (pass), tsc for apps/web (pass), biome on touched files (2 existing warnings in ActivityList), `pnpm design-system:check` (pass). No copy changed, so no `intl:extract`.

## Landscape after #984

A first attempt was blocked: under a host load average of about 865 the 13-inch simulator froze mid-rotation and the 11-inch never loaded the page.

A retry on the 13-inch (iPad Pro 13-inch, iOS 26.3, Mobile Safari, demo on main with #984) reached landscape (`l13-land-home.png`, `l13-land-home2.png`):

- The persistent sidebar shows, with Integrations and the account row at its foot and no large empty band above them.
- The chat column is capped, and the last message ("The pilot converted…") sits fully clear of the "Investors agent needs approval" toast. A "6 new messages" pill shows because this was a fresh sign-in with unread messages.
- The first-run tour card (step 1 of 10) and Safari's own prompts (Save Password, Highlights) covered part of the sidebar's agent list. Dismissing them by tap in landscape did not work reliably, so the agent rows under the tour card, the Activity view, Data room and Finance were not seen in landscape.
- The 11-inch was not checked in landscape.

### 11-inch landscape after #984

Retried on the iPad Pro 11-inch in landscape (Mobile Safari, demo on main). This time the first-run tour was marked seen through the API and Safari's password prompt was dismissed first.

- Home/chat: PASS (`l11-land-home.png`). The sidebar shows Chief, Investor Relations and Finance helper, then "+1 more" with no half-visible row, then Integrations and the account row directly below, with no empty band. The chat column is capped. The thread opened at the "NEW" divider with a "6 new messages" pill, as expected for unread messages.
- Activity view: PASS (`l11-land-activity.png`). It loaded with Needs your answer, Working and "Show 2 finished runs", and the sidebar stayed compact underneath.
- Finance: PASS (`l11-land-finance.png`). KPI cards, period tabs and the burn chart fit, and the Pages list and footer are in place. No approval toast was showing, so toast clearance was not judged here.
- Data room: partly seen (`l11-land-dataroom2.png`). The folder tree, filters and the "1 failed" chip render. The file list and the sidebar's agent list were still on skeletons, with the simulator's clock frozen while the host load average was about 545. Treated as environment slowness, not a layout finding.
