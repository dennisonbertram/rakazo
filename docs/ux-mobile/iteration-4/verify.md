# Pass-4 verifier (mob4-R): pass-3 findings on the wave-3 branch

Target: mock-data demo serving the integration worktree (Vite, branch mobile3/final). Pages were hard-reloaded. Phone 390x844, scale 3, CDP touch emulation held open by a background script; `pointer: coarse` was true on every phone run and false at 1440x900. Menus and sheets opened with eval clicks. Slow loads (Finance, Calendar) are not filed. Each screenshot (names below, stored outside the repo) was opened and read.

## Verdicts

| Item | Verdict | Evidence |
|---|---|---|
| P3-01 Company Calendar targets | partly | Month event link is 42x44 (was 42x24): met. "Anniversaries" row wrapper is 44 high, but the checkbox is 16x16 and the label 86x20; the wrapper is not the hit area (P4-01). co-cal.png |
| P3-02 Investors Cap table | met | Names in full ("Maya Chen (Mock)", "River Cofounder (Mock)"), % column visible on every row. investors.png. See P4-02 |
| P3-03 Contacts names | met (phone and 1440) | 390: "Casey Advisor (Mock)", "Jamie Placeholder" in full, emails in full (wrapped). contacts.png. 1440: no name or email cut (scrollWidth = clientWidth); see P4-03. d-contacts.png |
| P3-04 Finance Spend links | met | Transaction links 145x44, 115x44, 133x44 (were 18 and 38 px). fin-spend.png |
| P3-05 Transaction header | met | Back link "Spend" 82x44; Merchant/Date/Status/Source values sit at the same y as their labels (181, 209, 237, 265). fin-txn.png |
| P3-06 Activity filter | met | The search/Filters row pushes the list down; "Investors agent, Needs approval" stays visible. act-filter.png |
| P3-07 Compose Context sheet | met | Bottom sheet starts at y 408; From, To, Subject and Send (y 792) all stay visible. compose-ctx.png |
| V3-09 drawer agent names | met | Chief, "Leadership sync (mock)" (156/156), "Investor Relations (mock)" (166/166), "Finance helper (mock)" (145/145): scrollWidth = clientWidth; no time on phone agent rows. drawer.png |
| V2-09 Investors Contacts emails | met | Full emails, no ellipsis. inv-contacts.png (one wraps mid-word on Contacts: P4-04) |
| "+N more" half row, 1440x900 | met | "+2 more" has a clean gap below Finance helper; no half row. d-contacts.png |

## Regression glance at 390x844

Calendar (Schedule), Inbox, Contacts, Investors (Cap table and Contacts), Company (Overview, Calendar tab), Finance (overview, Spend, transaction), Data room and Activity in the drawer: window scrollWidth 390 everywhere, no interactive control under 44 px in the viewport except P4-01, no console errors seen. Data room filter row, Calendar Schedule header and Inbox toolbar are intact (r-calendar.png, r-data-room.png). Desktop 1440x900 Contacts has scrollWidth 1440 and no phone styling.

## Findings

| Id | Sev | Cat | Finding | Evidence | File |
|---|---|---|---|---|---|
| P4-01 | P3 | a11y | Company Calendar "Anniversaries": the 44 px row is a plain div, so only the 16x16 checkbox and 86x20 label react to a tap. Make the whole row the label or give the label min-h-11. Observed. | co-cal.png | `apps/web/src/pages/CompanyCalendar.tsx` (line ~130) |
| P4-02 | P3 | visual | Investors Cap table: the "Casey Advisor (Mock)" row is taller than its neighbours, with an empty line (about 20 px) between name and "Common · 250,000". Observed. | investors.png | `apps/web/src/pages/Investors.tsx` (holder rows) |
| P4-03 | P3 | visual | Contacts at 1440: the Name column is about 350 px wide but names wrap to two lines at roughly 100 px ("Casey Advisor / (Mock)"). Nothing is cut, but rows are twice as tall as needed. Observed. | d-contacts.png | `apps/web/src/pages/Contacts.tsx` (name cell width) |
| P4-04 | P3 | visual | Contacts phone: one long email breaks mid-word ("...example.te / st"). Observed. | contacts.png | `apps/web/src/pages/Contacts.tsx` |

No P0, P1 or P2 findings.
