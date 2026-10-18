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
