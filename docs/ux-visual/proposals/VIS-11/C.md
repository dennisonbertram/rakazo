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
