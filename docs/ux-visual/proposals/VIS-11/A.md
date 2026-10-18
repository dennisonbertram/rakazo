# VIS-11 Proposal A: Minimal

Smallest change that still touches every acceptance criterion. Keep the two-pane layout and the provider list. Hide the list behind the existing "Use your own key" idea, and fix the labels and buttons in place.

## Root cause check
Confirmed in `apps/web/src/pages/ModelSettingsOverlay.tsx`. The body (line ~1228) always renders a 310px provider list beside a detail pane. The founder-relevant fact ("This space already uses OpenRouter") is one line in the detail pane (line ~1480), and the only own-key path is a nested `<details>` inside that pane.

## Change
1. Wrap the whole `Providers` column (search, list) and the detail pane in one top-level `<details>` titled "Use my own key". It is closed unless `me.needsModel` is true, `focusProvider !== undefined`, or the user already has a connected credential. Above it, the existing "Active model" row stays.
2. Remove the `Plural` "N models" from `renderProviderRow`; show only the auth hint.
3. Buttons: "Connect API key" becomes `variant="default"`; "Test API key" becomes `variant="ghost"`; the Disconnect button label becomes "Disconnect {provider}" with `variant="outline"`. The heading above the key field says "API key"; the button says "Replace key".
4. `ModelPicker`: on open, `scrollIntoView({block: "center"})` the selected option.
5. Copy: "Thinking: Medium" becomes "Thinking effort: Medium", with a one-line explanation under the Thinking select. "Data room search model" becomes "Search model". "Providers" is the only term for vendors.
6. `IntegrationSetup.tsx`: add a "Recommended" `Badge` to the Composio row and default the choice to Composio.

## Before / after
- Before: 1080px modal opens on a 33-row list, an "Active model" line, a one-sentence right pane. Three scrollers when a provider is open.
- After: the modal opens on Active model, Backup models, and one closed "Use my own key" row. Opening it reveals the old two-pane layout unchanged.

## Files and tokens
`ModelSettingsOverlay.tsx`, `model-thinking-options.tsx` (label only), `IntegrationSetup.tsx`, `messages.po` files via `intl:extract`. No new tokens. Components: existing `Badge`, `Button` variants.

## Effort and risk
S to M. About 80 changed lines. Low risk: no state logic changes. Risk: when the disclosure is open, the provider list (max 240px at small widths, flex-1 at md) and the detail pane are both scrollers, so the layout is still two scrollers and the 768/375 squeeze (VIS-01) is unchanged. Existing e2e tests that fill "Search providers" must open the disclosure first.

## Acceptance criteria
1. Met: default view shows the active model and one closed "Use my own key" row; list and counts are inside it.
2. Met: one `default` button per state; Disconnect is a labelled outline button.
3. Met: the current model is centered on open.
4. Met: one term, "Thinking effort" with an explanation.
5. Partly met: one scroller only while the disclosure is closed. Open, there are two (provider list and detail pane).
6. Met: Composio is labelled and preselected.
