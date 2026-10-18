# VIS-11 judge brief

App: Rakazo, a workspace where non-technical founders run AI bots. Surface: Settings > Models (modal, 1440x900). Persona: first-time founder who never needs to change the model; bots already have one.

## Problem
Screen opens on a 33-provider list ("386 models"), flat actions, three nested scrollers, mixed vocabulary, 60% empty right pane, dropdown not scrolled to current model, Server integrations setup has no recommended option.

## Acceptance criteria
1. Default view shows current model and a single "Use my own key" disclosure; provider list and model counts behind it.
2. One primary action per state; Disconnect is a labelled secondary button.
3. Model dropdown opens with the current model visible and marked.
4. One term (provider); "Thinking" has a plain-language explanation.
5. At most one scroller in the modal at 1440x900.
6. Server integrations has a labelled recommended option.

## Rubric
Score 1-5: criteria met x3, simplicity x2, consistency x2, usability x2, visual x2, effort/risk x1 (5 = small and safe). Return a winner and an optional graft.


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

# VIS-11 Proposal B: Restructure to one column

Remove the provider list as the screen's main structure. The page becomes one column with three blocks, reusing the existing JSX blocks and state code.

## Root cause check
Same as A. The cause is structural: a catalog browser (list on the left, form on the right) is the first thing every user sees, for a task most users never do. Hiding it (A) leaves two scrollers when it is opened. A single column has one scroller by construction.

## Change
Single column, `max-w-xl`, in this order:
1. **Active model card.** Model name and provider on one line ("GPT-6 Luna, through OpenRouter"), and "Thinking effort: Medium" with a help line. Under a connected key, the card holds the Model picker and Thinking select (the existing `catalogModelConfig` block) and the one Save action.
2. **Your own key** (a `<details>`, closed unless `needsModel`, `focusProvider` set, or a key exists).
   - A **Provider** `NativeSelect` with `NativeSelectOptGroup` "Connected" and "All providers". It has browser type-ahead, no scroller, and no model counts.
   - Below it the existing `connectionControls` block: API key field, a `default`-variant "Connect" button (disabled with a hint "Paste a key to connect" while empty), and a `ghost` "Test key".
   - If the chosen provider is connected: a row "Connected · {label}" and an outline "Disconnect {provider}" button.
3. **Backup models** (existing `ModelBackupsSettings`), then an **Advanced** `<details>` holding "Search model" (the embedding field, with a one-line explanation).
The dialog narrows from 1080px to 720px so the column does not float in empty space. In the embedded Settings shell the column is simply left-aligned at `max-w-xl`.
`IntegrationSetup.tsx`: "Recommended" `Badge` and default selection on Composio.
`ModelPicker`: scroll the selected option into view on open.

## Before / after
- Before: list + form, 60% empty right pane, three scrollers.
- After: a card, a closed disclosure, a short list of backups. About 420px tall at rest, no scroller at 1440x900, one at 375.

## Files and tokens
`ModelSettingsOverlay.tsx` (JSX in `body`, about 150 changed lines, state untouched), `SettingsOverlay.tsx` (no width change needed), `ModelBackupsSettings.tsx` (heading only), `IntegrationSetup.tsx`, `messages.po`, stories (`ModelSettingsOverlay.stories.tsx`), tests. Tokens: none new; uses `NativeSelect`, `Badge`, `Button`.

## Effort and risk
M. Risks: the provider `chooseProvider` handler is now driven by a select `onChange`; the e2e specs that click provider buttons (`model-settings.spec.ts`, `model-connection-preflight.spec.ts`, `settings-shell.spec.ts`, `current-models.spec.ts`, `model-picker-search.spec.ts`) must be rewritten to select by label. A native select cannot show a "Connected" status badge beside each name, so the "Connected" group heading carries that. Users with 10+ providers lose the search field (type-ahead replaces it).

## Acceptance criteria
1. Met. 2. Met. 3. Met. 4. Met. 5. Met in every state at 1440x900 (the one scroller is the body column). 6. Met.

# VIS-11 Proposal C: Convention (Zed, Cursor, Raycast)

Follow the pattern used by tools that offer bring-your-own-key: a default-model row on top, then an "API keys" list showing the few common providers, each as its own row with status and an inline key field, and the long tail behind a search.

## Best-in-class references
- **Zed** Settings > AI: "LLM Providers" is a list of provider cards, each with a status ("Configured") and a "Configure" action that expands the key field in place.
- **Cursor** Settings > Models: a model list with toggles, then "API Keys" with one collapsed field per vendor (OpenAI, Anthropic, Google, Azure).
- **Raycast** AI settings: "Bring your own key" is a separate, labelled section below the default model, one field per vendor.
Shared pattern: the default is a single "Default model" control; keys are per-vendor rows with a status word; the long tail is searched, not scrolled.

## Change
1. **Default model** row: current model with a "Change" action that opens the existing `ModelPicker` (selected option scrolled into view and checked).
2. **Thinking effort** as a segmented control (`Toggle` group: Low, Medium, High) with a help line, replacing the `NativeSelect`. Shown only when the model can think; models with more than 3 levels keep the select.
3. **API keys** section: rows for OpenAI, Anthropic, Google, OpenRouter. Each row: name, status word ("Connected" or "Not set"), and one button "Add key" or "Manage". Expanding a row shows the key field, a `default` "Connect" button, a ghost "Test key", and an outline "Disconnect {provider}".
4. **More providers** button opens a `Command` palette in a `Popover` listing the remaining providers (searchable, grouped).
5. Backup models and Search model move under an "Advanced" `<details>`.
6. `IntegrationSetup`: "Recommended" `Badge` and default selection on Composio.

## Before / after
- Before: 33-row list, flat actions, 60% empty pane.
- After: a settings form that reads top to bottom: Default model, Thinking effort, API keys (4 rows + More providers), Advanced.

## Files and tokens
`ModelSettingsOverlay.tsx` (new `ProviderKeyRow`, `MorePicker` components, `body` rewrite, about 350 changed lines), new stories for both, `Toggle` group for effort, `Command`/`Popover` from `ui-web`, `IntegrationSetup.tsx`, `messages.po`, tests. A hard-coded "popular providers" list is new product data that must be kept in sync with the catalog.

## Effort and risk
L. Risks: the four featured providers are a product decision (and `anthropic` and `openai` use subscription sign-in in some states, which changes the row's actions). Two expanded rows can each hold their own preflight and key state, but the current code holds one `apiKey` and one `provider` state; it would need to become per-row. A new `Command` popover for the long tail adds a component with its own keyboard and focus tests. Every model e2e spec needs a rewrite.

## Acceptance criteria
1. Met (a Default model row, no list or counts). 2. Met per row. 3. Met. 4. Met. 5. Met. 6. Met.
Highest regression risk of the three, because it changes how credentials are staged.
