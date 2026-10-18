# VIS-05: Hide amounts masks inconsistently and misstates ownership

## Problem
The register's root cause ("each page decides what to mask") is only partly right. On main (cce7937d) one switch (`lib/hide-amounts-preference.ts`) and one formatter module (`lib/finance-format.ts`) already mask every dollar figure, the run-out date, the sidebar previews and the charts. What remains wrong was observed live with Hide on (`proposals/VIS-05/shots/finance-hidden.png`, `captable-hidden.png`):
1. The cap-table bar is forced to 50/50 (`ownership-bar` widths `50%`,`50%`) while the legend below prints `85.00%` and `15.00%` (CT-F02). The trick hides nothing and misstates ownership.
2. The Runway KPI shows `24.2 mo` beside `Until •••` (FI-F7). The months reveal the date, so masking only the date protects nothing. `runwayText()` is unmasked in `Finance.tsx`, `FinanceBurn.tsx` and `FinanceCards.tsx`.
3. The tooltip claims "share counts and percentages" are hidden. They are not by design (`percentFigure` is documented as "Not money, so it stays visible"). The copy is false (CT-F05).
4. The control is an eye icon plus a hover-only tooltip and the label "Hide amounts" does not name the scope (LG-F9). The hidden chart is a 300px panel with a sentence and no way to show (FI-F8).
Sidebar previews being masked is intended and stays (agent previews mask through the same hook); the account-menu row already states the state in words.

## Options considered
Weighted score, max 60 (weights 3/2/2/2/2/1), judges U = usability, V = visual craft, E = engineering, then the two external judges.
| Option | Idea | U / V / E | Muse Wonder / Gemini Argon |
|--------|------|-----------|----------------------------|
| A Minimal | Fix bar, runway, copy, placeholder; keep icon control | 47 / 47 / 53 | 47 / 49 |
| B Restructure | Typed `<Masked>` layer, 3-state scope, shell banner | 32 / 36 / 31 | 32 / 36 |
| C Convention | A's fixes plus a labelled "Hide money" / "Money hidden" button | 53 / 53 / 53 | 53 / 58 |
No option is disqualified. Both external judges chose C and proposed the same graft (A's scope sentence in the tooltip; keep the button the same width in both states). Raw judge output: `proposals/VIS-05/external-judges.json`.

## Decision
Option C with A's tooltip copy, scoped as follows.
**Scope rule (one sentence, used in tooltip, menu row and tests):** "Hide money" hides dollar amounts and everything computed from them (runway months, run-out date, burn and cash charts). Ownership percentages, share counts and event dates stay visible.
1. `lib/finance-format.ts`: `runwayText` returns `MASK` while `getHideAmounts()` is true. Remove the "as it does in bot replies" comment; update `finance-format.test.ts`.
2. `pages/CapTable.tsx` `OwnershipBar`: delete the hidden branch and `useHideAmounts()` call there; widths always `c.percent`. Remove stale comments.
3. `components/HideAmountsToggle.tsx` `HideAmountsButton`: replace the icon-only ghost button with `Button variant="ghost"` (existing) `size="sm"`, Eye or EyeOff icon plus visible text "Hide money" (off) or "Money hidden" (on), `aria-pressed` kept, the same `data-testid`. The label has `min-w` sized to the longer string so the header does not shift when toggled (L5). Below the container width where the header already collapses (check 1024, 768, 375) the text is hidden with `sr-only` and the icon stays, keeping `pointer-coarse:size-10` for VIS-04. Tooltip: "Hides dollar amounts and what is computed from them, such as runway and burn charts. Ownership percentages and share counts stay visible." with a first sentence "Money is hidden." when on. `aria-label` stays the verb phrase ("Hide money" / "Show money").
4. `HideAmountsMenuItem`: labels "Hide money" / "Show money"; sub-line states the same scope in short form.
5. `components/finance/charts.tsx` hidden placeholder: keep the reserved height (no shift when toggling); content becomes EyeOff icon, the word "Hidden", and a text `Button variant="outline" size="sm"` "Show money" that calls `setHideAmounts(false)`; at heights under 40px render nothing but keep `data-testid="chart-hidden"`.
6. Copy: run `pnpm --filter @rakazo/web intl:extract`; the new/changed English msgids are the source of truth.
Not changed: chat/artifact masking (`maskCurrencyText`), sidebar previews, formatter modules, B's `<Masked>` component and 3-state scope (rejected).

## Why this is the best
- Against A: A leaves the control as a mystery icon whose state shows only on hover. A first-time founder about to screen-share cannot verify at a glance that money is hidden. C costs about half a day more for one button, in a component that already exists. A fails criterion 4's intent; C meets it.
- Against B: B's premise (no shared decision point) is wrong; the hook and formatters exist. It touches about 40 files for four known defects, cannot wrap string outputs (titles, aria-labels, table helpers, notifications), adds a 3-state choice nobody asked for (I5) and a permanent shell row (L3, L5). Scores 31 to 36 of 60 with every judge.
- Norms satisfied: C3 (state in words), C1 (names what is hidden), C2/H5 (bar and legend agree, date and months agree), I1/I2 (visible state, recovery in the placeholder), L5 (fixed-width label), P1/P2 (eye toggle with a labelled state is the balance-hiding convention in finance apps, from memory), A2 (names kept).
- Costs and rules out: ownership percentages remain visible while hidden, so the toggle is not a full screen-share privacy mode. This is stated in the tooltip. An owner who wants ownership masked can ask for it later; that is a scope change, not a defect. Chat text may still show runway months. Header gains one text label at wide widths; Finance header is crowded and must be checked at 1024. Locale catalogs for 9 non-English languages gain untranslated entries.

## Final acceptance criteria (measurable)
1. Cap table, Hide on and off: each `ownership-bar` child `style.width` equals `${percent}%` in both states (identical within 1px, test and live), and the legend text is unchanged between states.
2. With Hide on, `document.body.innerText` on `/app/finance`, `/finance/runway`, `/finance/burn`, `/finance/accounts` matches none of `\$[\d,]+`, `\d+\.\d\s*mo`, or `(Until|until) [A-Z][a-z]+ \d{4}`.
3. With Hide on, every finance chart region renders `[data-testid="chart-hidden"]` containing the text "Hidden" and a button named "Show money"; clicking it sets the preference off and the chart renders; no empty panel without text.
4. `HideAmountsButton` visible text is "Hide money" off and "Money hidden" on at a container width of at least 640px; the accessible name is the verb phrase; the button's bounding box width is identical in both states (diff 0px); at 375px under `pointer: coarse` it is at least 40x40 and does not overlap neighbours. The tooltip contains the scope sentence. The string "percentages" does not occur in the tooltip as something that is hidden.
5. Masking decisions live only in `hide-amounts-preference.ts` and `finance-format.ts`; `runwayText` masks inside the module; one unit test per page (CapTable, Finance overview, Runway/Burn, Legal header, FinanceCards) asserts the Hide-on render.
6. Hide off renders exactly as today (no desktop density change; screenshot diff of Finance and Cap table with Hide off at 1440x900 under 0.1%).

## Implementation plan
Design system first: nothing new in `packages/ui-web` (reuses `Button`, `Tooltip`). Then `lib/finance-format.ts`, `HideAmountsToggle.tsx`, `charts.tsx`, `CapTable.tsx`, finance callers (no code change expected beyond the formatter), locales, stories (`HideAmountsToggle.stories.tsx` add On/Off at wide and narrow; `charts` hidden story if present). Files: `apps/web/src/lib/finance-format.ts`, `.../lib/finance-format.test.ts`, `.../components/HideAmountsToggle.tsx` (+ test, stories), `.../components/finance/charts.tsx` (+ `charts.hidden.test.tsx`), `.../pages/CapTable.tsx` (+ `CapTable.test.tsx`), `.../pages/Finance.tsx` and `pages/finance/FinanceBurn.tsx` and `components/FinanceCards.tsx` only if tests show a caller bypasses `runwayText`, `locales/*/messages.po`.

## Test plan
Failing first:
- `CapTable.test.tsx`: with Hide on, bar widths equal `85%`/`15%` (fails today at 50/50).
- `finance-format.test.ts`: `runwayText(24.2)` returns `•••` while hidden, `24.2` otherwise.
- `charts.hidden.test.tsx`: placeholder has "Hidden" and a "Show money" button that flips the preference.
- `HideAmountsToggle.test.tsx`: label text per state, aria-pressed, tooltip scope sentence, equal width class in both states.
- Finance page tests: Hide-on text contains no `\d+\.\d mo`.
Also run: `pnpm vitest run` on the touched files, `tsc` in apps/web, `npx biome ci .`, `pnpm design-system:check`, `pnpm --filter @rakazo/web intl:extract`, Storybook build plus `node .storybook/smoke.mjs storybook-static`, and an e2e spec that toggles Hide on Finance and Cap table (existing `e2e/` hide-amounts specs if any, else add one). Live check (agent-browser, vault profile `vis-money`) at 1440x900, 1024x768, 375x812 (coarse): Finance, Runway, Burn, Cap table, Legal with Hide on and off; measure the button width diff and header overlap with the geometry audit.
