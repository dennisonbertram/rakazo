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
