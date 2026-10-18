# Judge brief: VIS-05 "Hide amounts" masks inconsistently

App: Rakazo, an AI "chief of staff" workspace for startup founders (cap table, finance, legal, inbox). Persona: naive first-time founder, often screen-sharing.
Problem (re-scoped after reading code): one switch exists, but cap-table bar is forced 50/50 while legend says 85/15; Runway shows "24.2 mo" next to "Until •••"; tooltip claims percentages and share counts are hidden (they are not); control is an unlabeled eye icon; hidden chart is a 300px panel with no way to show.
Acceptance: (1) bar and legend never disagree; (2) no money, runway duration or run-out date on /app/finance/*; (3) charts show "Hidden" and a way to show; (4) control names what is hidden and shows state as text/tooltip; (5) one shared decision point, unit test per page.
Rubric (score 1-5, weights): meets criteria x3, simplicity x2, consistency x2, usability x2, visual quality x2, effort/risk x1 (5 = small and safe). Return a winner, optional graft, scores, defense.
Screenshots: current Finance and Cap table with Hide on are attached.

# VIS-05 Proposal A: Minimal (fix the four wrong spots, keep every component)

## Re-scope note (read first)
The problem register says each page decides masking on its own. After reading the code on current main (cce7937d) this is only partly true. There is already one switch (`apps/web/src/lib/hide-amounts-preference.ts`: `useHideAmounts`, `getHideAmounts`, `maskCurrencyWhenHidden`) and one formatter module (`lib/finance-format.ts`) that masks every dollar value. Several findings are already fixed on main: run-out date shows "Until •••", charts render a "Chart hidden while amounts are hidden" placeholder, and the sidebar previews are masked on purpose. What is still wrong, observed live (Hide on, `shots/finance-hidden.png`, `shots/captable-hidden.png`):
1. Cap table: bar segments are forced to 50/50 (`ownership-bar` widths `50%`,`50%`) while the legend directly below prints `Common 85.00%` and `Option pool 15.00%`. The equal-width trick hides nothing and contradicts the legend.
2. Finance Runway KPI shows `24.2 mo` while the same card says `Until •••`. Today's date plus 24.2 months is the run-out date, so the mask on the date protects nothing. `runwayText()` is also unmasked in FinanceBurn and in the chat FinanceCard.
3. The tooltip says the switch hides "share counts and percentages". Code does not (`percentFigure` and share counts are documented as "Not money, so it stays visible"). The copy is false.
4. The control names its scope badly ("Hide amounts") and shows state only as an eye-off icon plus a hover-only tooltip. The chart placeholder has no way to show the data.

## Change
Keep `HideAmountsButton`, `HideAmountsMenuItem`, the hook and the formatter module. Decide the scope in one sentence and make code, copy and visuals match it: **"Hide money" hides dollar amounts and everything computed from them (runway months, run-out date, burn and cash charts). Ownership percentages, share counts and dates of events stay visible.**
- `lib/finance-format.ts`: `runwayText` returns `MASK` ("•••") while hidden.
- `pages/CapTable.tsx` `OwnershipBar`: delete the `hidden ? equal : percent` branch; widths always follow `c.percent`. Remove the stale comments.
- `components/HideAmountsToggle.tsx`: label strings "Hide amounts"/"Show amounts" become "Hide money"/"Show money"; tooltip rewritten to match the scope sentence (drop "share counts and percentages").
- `components/finance/charts.tsx` hidden placeholder: add a text button "Show" next to "Hidden" (calls `setHideAmounts(false)`), keep reserved height.

## Before / After
- Cap table, Hide on: bar 50/50 vs legend 85/15 becomes bar 85/15 with legend 85/15.
- Finance, Hide on: `24.2 mo` / `Until •••` becomes `••• mo` / `Until •••`.
- Chart, Hide on: grey 300px panel with a sentence becomes the same panel with "Hidden" and a "Show" button.
- Control: eye-off icon, tooltip only, becomes the same icon with the label "Hide money" and a shorter tooltip stating the scope. State is still icon plus tooltip.

## Files / tokens
`apps/web/src/lib/finance-format.ts`, `apps/web/src/pages/CapTable.tsx`, `apps/web/src/components/HideAmountsToggle.tsx`, `apps/web/src/components/finance/charts.tsx`, tests (`CapTable.test.tsx`, `HideAmountsToggle.test.tsx`, `charts.hidden.test.tsx`, `finance-format.test.ts`, Finance tests that assert months), `locales/*/messages.po` via `pnpm --filter @rakazo/web intl:extract`. No new tokens.

## Effort / risks
About 0.5 day. Risks: renaming strings forces locale catalog updates (10 locales; untranslated entries fall back to the source until translated). Tests that assert visible `mo` while hidden need updating. Chat/artifact text still shows runway months (chat masker only handles currency); stated as a known gap, outside the criteria's route list.

## Acceptance criteria
1. Bar widths equal Hide-off widths: met (branch deleted; legend and bar both read the same data).
2. No money, runway duration or run-out date on `/app/finance/*`: met (runway months masked; date already masked).
3. Charts show "Hidden" with a way to show: met (button in placeholder).
4. Control shows state as text or tooltip, label names what is hidden: partly met (label "Hide money", tooltip states state; no visible text state).
5. One shared decision point plus per-page unit tests: met (runway joins the formatter module; tests added per page).

# VIS-05 Proposal B: Restructure (a typed masking layer so pages stop deciding)

## Change
Replace call-site masking with one module and one component, then migrate every consumer.
- New `apps/web/src/lib/masking.ts` with `type MaskKind = "money" | "derived-money" | "ownership"` and a single policy table `MASKED_WHEN_HIDDEN` that says which kinds are masked. `mask(kind, text)` and `useMask()` read it.
- New `<Masked kind="money">{value}</Masked>` component that renders the value, or a fixed-width "•••" with `aria-label="Hidden"`, plus a one-time `title`. Pages stop calling `getHideAmounts()` or `hiddenOr()`.
- A 3-state scope selector in the header popover (Money only / Money and ownership / Nothing) so a founder can screen-share the cap table safely.
- A shell-level banner row ("Money hidden. Show") under the header on every page while on, replacing per-page icons.
- A shared `<HiddenPanel>` for charts with a Show button.
- A lint-style test that greps components for `\$\{.*\}` or `toFixed` outside `<Masked>` to prove no page formats a figure unmasked.

## Before / After
Before: ~40 files call `useHideAmounts()` and format by hand. After: pages render `<Masked>`; policy is one table; the control becomes a popover with 3 scopes; a banner states the mode on every page, including Inbox and chat where there is no header button.

## Files / tokens
`lib/masking.ts` (new), `components/Masked.tsx` (new), `components/HiddenPanel.tsx` (new), `HideAmountsToggle.tsx`, `pages/Shell.tsx` (banner), `pages/CapTable.tsx`, `pages/Finance.tsx`, `pages/finance/*` (7 files), `pages/Legal.tsx`, `components/finance/*`, `components/FinanceCards.tsx`, `pages/shell/bot-pins.tsx`, `lib/finance-format.ts`, `lib/crypto-format.ts`, a popover from `@rakazo/ui-web`, stories for the three new components, locale catalogs. No new tokens.

## Effort / risks
3 to 5 days. Touches about 40 files that already have tests and stories, in a lane that other agents are editing (finance, shell). Large risk of regressions in formatters that return strings (the table cells, tooltips, document titles, browser notifications, aria labels cannot be wrapped in a component). The 3-state scope adds a decision the first-time founder never asked to make (Hick, I5) and a new persisted preference. A shell banner adds a permanent row that grows the header (L3, L5).

## Acceptance criteria
1. Bar widths: met (ownership kind is policy-controlled; default shows true widths).
2. No money, runway or date: met by policy table.
3. Charts: met by HiddenPanel.
4. Control states scope as text: met (popover shows the three scopes, banner names state).
5. One shared decision plus unit test per page: met most strongly, but at the cost of migrating everything.

# VIS-05 Proposal C: Convention (privacy eye with a visible "hidden" state, as in consumer finance apps)

## Pattern
Balance-hiding in consumer and business finance apps is a single eye toggle at the point of the money. Examples I recall (not re-verified in this session): Mercury and Revolut put an eye on the balance, Monarch Money has a "Hide balances" control in the header, Coinbase and Robinhood mask balances with dots and keep percentages and charts visible, and Apple Wallet and banking apps mask with "••••". The common rules: (1) the mask is dots in the same width as the figure, (2) the control sits next to the figure it hides and says "Hide balances" or "Show balances" in words, (3) percentages and share counts are not balances and stay visible, (4) charts are replaced by a muted placeholder that says "Balances hidden".

## Change
- Scope sentence stays the same as in A: money plus what is computed from it. Ownership percentages stay visible; the bar shows true widths (rule 3).
- Move the header icon into a labelled text button in the page header: eye icon plus the words "Hide money", which becomes "Money hidden" with EyeOff in a secondary-variant pill while on. The state is visible text at all widths at least 640px; below that it is icon only with `aria-label` (matches the 44px target work in VIS-04).
- Mask the Runway months and date together (dots).
- Chart placeholder: muted panel, EyeOff icon, "Hidden", and a "Show money" button.
- Add the same pill to the Cap table, Finance and Legal headers by changing the one component they already share.

## Before / After
Before: eye-off icon only. After: a pill that reads "Money hidden" while on and a plain eye with the label "Hide money" when off. Bar, runway and chart as in A.

## Files / tokens
`HideAmountsToggle.tsx` (new variant of the header button), `Button` `variant="secondary"` and `size="sm"` (existing), `lib/finance-format.ts`, `CapTable.tsx`, `charts.tsx`, tests, locale catalogs. No new tokens.

## Effort / risks
About 1 day. Risk: a text pill adds width to three already-full headers (Finance header has Accounts, Ask, status text, source chips at 1280 wide; at 375 it must collapse to icon). A pill that only appears when on shifts header layout when toggled (L5) unless its slot is reserved. Examples above are from memory; the pattern is standard, but I did not re-check each product.

## Acceptance criteria
1. Bar widths: met. 2. No money or runway on finance routes: met. 3. Charts: met. 4. Label and state as text: met most strongly (visible words). 5. Shared decision: met as in A.

