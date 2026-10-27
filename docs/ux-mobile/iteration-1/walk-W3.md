# Walk W3: Contacts, Investors, Company, Devin, journeys 02 and 04

Setup: mock demo stack, Maya (mock founder). The agent-browser "iPhone 16 Pro" preset gave a 402 px wide window (not 390) and no coarse pointer, so a CDP override added 390x844 at scale 3 with touch emulation. After the override `matchMedia('(pointer: coarse)')` and `(hover: none)` were both true; the page still reported `innerWidth` 402 in later reads (the preset width), so measurements are at 390-402 px. Touch targets were measured with coarse pointer. Geometry audit and a touch-target scan ran on every key screen. No page-level horizontal overflow on any screen (pageOverflowX 0). Browser error log was empty. Screenshots are in the walker's scratch folder (names below).

## Verdicts (taps actual/ideal)

| Story | Verdict | Taps | Notes |
|---|---|---|---|
| MOB-CON-01 | PASS | 2/2 | Name + Kind only, no Email. Avatar initials "C(" for "Casey Advisor (Mock)" (con01.png) |
| MOB-CON-02 | PASS | 1/1 per sort | URL gets `sort`/`dir`; arrow shown; header buttons 44 px. Email/Org sort impossible on phone (W3-08) |
| MOB-CON-03 | PASS | 3/2 | Kind menu opens as a clipped scroll list (con03b.png); empty state with "Clear filters" is good (con03d.png) |
| MOB-CON-04 | PASS (partial) | 2/2 | Details, mails, Back restores list params (good). Sam has no meetings or documents in the demo, so those sections were not walked |
| MOB-CON-05 | PASS with friction | 4/4 | Dialog fits, Save disabled until Name filled. No confirmation after Save; active search "sam" hid the new contact. Keyboard-open layout not testable here |
| MOB-INV-01 | PASS | 1 per tab | Segmented tabs 44 px, fit width, URL `?tab=` set |
| MOB-INV-02 | PASS with friction | 1 | Invested only appears as unlabeled "$2,500" in the secondary line (inv02b.png). Sort menu does include Invested (good) |
| MOB-INV-03 | PASS | 1 | Updates is empty ("No updates yet") so opening an update was not testable |
| MOB-INV-04 | BLOCKED (partial) | 3/2 | Tabs are "SAFEs and funds" / "Board", not Investor/Board. Board is empty so "Message the board" is not shown. Search, sort, direction layout fine |
| MOB-INV-05 | FAIL | n/a | Tapping a contact row opens an Edit dialog, not the contact page. Row menu has only Resend link / Copy link / Edit / Delete (inv05a.png) |
| MOB-COM-01 | FAIL | n/a | Review tab is off screen and unreachable; strip does not scroll (com01.png, com03.png) |
| MOB-COM-02 | PASS (empty only) | 2/2 | People table is empty, header shows with no empty message (com02.png); rows not testable |
| MOB-COM-03 | BLOCKED | n/a | No import scope or review items ("Review (0)", "Nothing to review"). Only the empty state was checked |
| MOB-COM-04 | PASS (partial) | 3/3 | History: "No dated facts" with Year/Quarter/Month zoom; Calendar month grid fits, no sideways scroll (com04b.png). No facts to open |
| MOB-DEV-01 | BLOCKED | n/a | Devin hidden until connected (owner decision). Direct URL /app/devin shows a skeleton that never resolves (dev01b.png) |
| MOB-JRN-02 | FAIL | stopped at step 3 | Cannot reach a contact page from the Investors Contacts tab (W3-02). Harbor Ventures is not in Holdings in the demo (only SAFE row "Harbor Angels"). Walked the equivalent via /app/contacts: mail opens, Context shows Threads and Documents, no Track control visible (jrn02b.png) |
| MOB-JRN-04 | BLOCKED (partial) | n/a | Company Review empty. Data room walked: "1 failed" chip leads to filtered list with "Replace file" and a "..." menu (drm04.png, drm05.png). Contact-owner step not walked (no link from document to contact seen) |

Counts: PASS 8 (3 with friction, 3 partial), FAIL 3 (INV-05, COM-01, JRN-02), BLOCKED 5 (INV-04, COM-03, DEV-01, JRN-04, plus partial coverage noted). SKIPPED 0.

## Already good

Contacts empty state and Clear filters; Contacts header buttons at 44 px; contact detail Back restores `q`/`sort`; Add/Edit contact dialog stacks Save and Cancel full width; Investors segmented tabs and holdings Sort menu include hidden columns; Data room failed chip and filter; Company Calendar grid fits 390 px.

## Findings

| ID | Story/page | Sev | Cat | What happened vs expected | Evidence | Suspected location | Fix |
|---|---|---|---|---|---|---|---|
| W3-01 | MOB-COM-01, JRN-04 | P0 | bug | The six Company tabs are 462 px wide in a 370 px parent with `overflow: visible` (spill 92 px). "Review (0)" is cut off and cannot be tapped (a click on it did nothing). On `?view=review` no tab looks selected. Observed. | com01.png, com03.png; tablist scrollWidth 462, clientWidth 462, parent 370 | `apps/web/src/pages/Company.tsx:261-281`, `packages/ui-web/src/components/ui/tabs.tsx:18` | Make the strip horizontally scrollable with the selected tab scrolled into view, or use a select on phones |
| W3-02 | MOB-INV-05, JRN-02 | P1 | flow | Tapping a row in the Investors Contacts tab opens the Edit contact dialog (with Delete under Cancel). No path to the contact page, related mail, meetings or documents. Observed. | inv05a.png; row menu lists only Resend link, Copy link, Edit, Delete | `apps/web/src/pages/Investors.tsx` (contacts rows near 1489-1560) | Row tap goes to `/app/contacts/:id`; move Edit into the row menu |
| W3-03 | MOB-INV-02, JRN-02 | P2 | copy | Per-holder Invested appears as a bare "$2,500" at the end of "Common · 4,000,000 · $2,500", with no label. Rows without investment have no value. Observed. | inv02b.png | `apps/web/src/components/cap-table/HoldingsTable.tsx:196` | Label it ("$2,500 invested") |
| W3-04 | MOB-INV-02 | P3 | visual | Rows have uneven height: "Casey Advisor (Mock)" row is taller with the name far from its secondary line. Search/Security/Sort wrap to two rows, Sort alone and right-aligned. Observed. | inv02b.png, inv02c.png | `HoldingsTable.tsx` row, toolbar | Align name block to top; put Sort and Security on one row or in a sheet |
| W3-05 | Investors (all tabs) | P2 | flow | The Action items card (about 190 px) sits above every tab. On Contacts the list starts at the fold (about y 830 of 844) and the heading "Contacts" repeats the tab name. Observed. | inv04a.png | `apps/web/src/pages/Investors.tsx` | Collapse Action items to a one-line row on phones, or only show on Cap table |
| W3-06 | MOB-COM-01..04 | P2 | visual | Company header differs from other pages: an empty hamburger row, then the title and "Reconstructed" below it; "Import" is a plain underlined link 42x20 px. Observed. | com01.png; touch scan "Import 42x20" | `apps/web/src/pages/Company.tsx` header | Use the standard page header (title in the hamburger row); make Import a 44 px button or move into the "..." menu |
| W3-07 | MOB-COM-02 | P3 | flow | Empty People shows column headers and nothing else, no empty-state text (Overview and Review do have one). Observed. | com02.png | `Company.tsx:163-207` | Add the same empty message |
| W3-08 | MOB-CON-02 | P3 | flow | Email and Organization sort headers are hidden at phone width, so those sorts are not possible. Observed (th widths 0). | con02 header scan | `apps/web/src/pages/Contacts.tsx:201,205` | Add a Sort menu like Investors has |
| W3-09 | MOB-CON-01 | P3 | bug | Initials for "Casey Advisor (Mock)" render "C(" (takes first character of "(Mock)" token). Observed. | con01.png | avatar initials helper used by `Contacts.tsx` | Strip parenthesised text before taking initials |
| W3-10 | MOB-CON-01 | P3 | visual | Name column is narrow because Kind takes about 40 percent: "Sam Sampleswo…" truncates though space is free. The header row is 61 px tall with a large gap. Observed. | con03a.png | `Contacts.tsx:195-213` | Shrink Kind column, stack Kind under name on phones, reduce header height |
| W3-11 | MOB-CON-05 | P2 | flow | After Save the dialog closes with no toast and the list keeps the old search, so the new contact is not visible. It was saved (found after clearing search). Observed. | con05c.png, con05d.png | `apps/web/src/components/ContactDialog.tsx` | Clear filters or open the new contact, or show an "Added" toast with View |
| W3-12 | MOB-CON-03 | P3 | visual | Kind menu is a scroll list cut off at "Advisor"; no indication more items follow. Observed. | con03b.png | `apps/web/src/components/ListControls.tsx` | Let the menu use more height on phones or a bottom sheet |
| W3-13 | MOB-DEV-01 | P2 | bug | Direct `/app/devin` when Devin is not connected shows a skeleton that never resolves (waited over 15 s) instead of a redirect or not-found. Observed. | dev01b.png | `apps/web/src/pages/Devin.tsx` | Redirect to Integrations when not connected |
| W3-14 | Touch targets | P2 | a11y | Under 44 px with coarse pointer: "SAFEs, if converted at cap" 299x20 (Investors), Company Calendar "Anniversaries" checkbox 16x16, event chips 44x24, Import 42x20. Measured. | tt.js scans | `cap-table` SAFE toggle, `CompanyCalendar.tsx` | Add `pointer-coarse` sizes |
| W3-15 | MOB-JRN-02 | P2 | flow | Mail Context is a full-screen overlay showing a 40 px sliver of the mail; two "Close" buttons (mail and panel). No Track control found in the mail toolbar (Reply, Context, More with only Forward). UNVERIFIED whether Track needs a Context-capable mail. | jrn02b.png | `components/inbox/InboxMessageDialog.tsx:698` | Make Context a bottom sheet; confirm where Track lives |
| W3-16 | MOB-INV-05 | P3 | visual | Focus ring on contact row buttons hugs the text with no padding and is cut at the left edge. Observed. | inv05c.png | `Investors.tsx` contact row | Add padding or inset ring |
| W3-17 | Data room | P3 | visual | The "1 failed" chip sits 6 px higher than the Filters button beside it (top 62 vs 68). Menu from row "..." touches the right screen edge. Measured. | drm02.png, drm05.png | `apps/web/src/pages/DataRoom.tsx` toolbar | Align items to center; add menu collision padding |
| W3-18 | Data room | P3 | perf | List showed skeleton rows for over 4 s on first load. Observed once. | drm01.png | n/a | Check load time |
| W3-19 | MOB-CON-04 | P3 | flow | Contact URL carries the list params (`?sort=kind&dir=asc&q=sam`) so shared contact links include a search. Observed (also why Back works). | URL read | `Contacts.tsx` row navigate | Acceptable; strip only if shareable URLs matter |

Not walked: keyboard-open layouts, Track, Message the board, Company import/review actions, real meetings/documents on a contact (demo lacks them).
