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
