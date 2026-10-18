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
