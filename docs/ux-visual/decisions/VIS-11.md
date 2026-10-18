# VIS-11: Models overlay exposes engineering settings to founders

## Problem
Root cause (confirmed in `apps/web/src/pages/ModelSettingsOverlay.tsx`, `body`, lines ~1168-1520): the screen is a catalog browser. A 310px list of 33 providers with "N models" counts sits beside a detail pane, and every user sees it first, although the page's own copy says most users should change nothing. The fact a founder needs ("this space already uses OpenRouter") is one line in the detail pane, and the only own-key path is a `<details>` nested inside it. The visible symptoms follow from this: flat actions, three nested scrollers, a 60% empty pane, mixed vocabulary. The scope in `problems.md` is correct; the root cause stands.

Findings covered: AO-02, AO-18, AO-19, AO-20, AO-21, AO-26 (disappears with the list), SI-F25, SI-F14, SI-F33 (reduced: backups move out of the default view). The 768/375 collapse stays in VIS-01.
Evidence: `auth-onboarding/shots/1440x900-model-picker-{provider,own-key,dropdown}.png`, `settings-integrations/shots/1440x900-settings-models.png`.
No already-decided simplification in `docs/ux-flow/report.md` touches this surface (that report covers the inbox).

## Options considered
Weighted score, max 60 (criteria x3, simplicity x2, consistency x2, usability x2, visual x2, effort x1).

| Option | Idea | Usability lens | Visual lens | Engineering lens | Muse Wonder | Gemini Argon |
|--------|------|----------------|-------------|------------------|-------------|--------------|
| A Minimal | Close the two-pane layout behind one disclosure; fix labels and buttons | 40 | 38 | 44 | 40 | 41 |
| B Restructure | One column; grouped provider select; reuse existing blocks | 54 | 52 | 50 | 54 | 59 |
| C Convention (Zed, Cursor, Raycast) | Default-model row + per-provider key rows + searchable long tail | 42 | 40 | 38 | 34 | 35 |

Per-criterion scores for my three lenses are in the order criteria / simplicity / consistency / usability / visual / effort: Usability A 3,3,4,3,3,5; B 5,5,4,5,4,3; C 4,3,3,4,4,2. Visual A 3,3,4,3,2,5; B 5,4,4,4,5,3; C 4,3,3,3,4,2. Engineering A 3,4,5,3,3,5; B 5,4,4,4,4,3; C 4,2,3,3,3,1. External scores and defenses are in `proposals/VIS-11/external-judges.json`. Both external judges chose B. A fails criterion 5 (two scrollers once opened); C fails criterion 1 (it shows provider rows by default).

## Decision
Build **B** with one graft, and decline one graft.

Layout (single column, `max-w-xl`; dialog width 1080 to 720px; embedded Settings is left-aligned at the same max width):
1. **Active model** block: model name and provider ("GPT-6 Luna, through OpenRouter"), then "Thinking effort: Medium". The Thinking select, when shown, has the help line "How long the AI works on a hard question before answering. Higher is slower and costs more." The header chip carries the same wording as a `title`.
2. **Use my own key** `<details>`. Closed by default. Open when `me.needsModel`, when `focusProvider !== undefined`, or when `ownKeyProvider` is set (keeps the Legal-page "Add your OpenRouter key" deep link working). Inside:
   - **Provider** `NativeSelect` with `NativeSelectOptGroup` "Connected" and "All providers". No search field, no counts, no list scroller. It calls `chooseProvider`. (The "Search providers" field and AO-26 go away.)
   - The existing `connectionControls` and `catalogModelConfig` blocks. Key label is "API key" (the heading "Replace API key" is removed). Primary button: `variant="default"` "Connect" (or "Replace key" when connected), disabled with the visible hint "Paste a key to connect" while empty. "Test key" is `variant="ghost"`. A connected provider shows "Connected · {label}" and an outline button "Disconnect {provider}".
   - The existing confirm dialog for disconnect is unchanged.
3. **Advanced** `<details>` (closed). Contains Backup models (`ModelBackupsSettings`) and "Search model" (the embedding field, with the line "Used to search your data room by meaning. Leave on Default unless you know you need another."). **Graft accepted (Argon, from C's progressive disclosure):** backups move into Advanced so a founder with no key never sees the unactionable "Connect a provider to add backups".
4. `ModelPicker`: when opened, the selected option is scrolled into view (`block: "center"`) and keeps its check mark and `aria-selected`. The initial highlight is the selected option.
5. Vocabulary: "provider" is the only word for the vendor. "AI company" and "AI service" are removed from user strings. The description line becomes "The AI your bots think with. They already have one; use your own key only if you want to pay a provider directly."
6. `IntegrationSetup.tsx`: the Composio row gets a "Recommended" `Badge` and is the default choice (`useState<Choice>("composio")`). Detail line: "One API key covers Slack, Notion, GitHub and more." This is justified because Composio needs one field where Pipedream needs three (Client ID, Project ID, secret), and it is the integration the Composio Instant plan builds on (`docs/composio-instant/README.md`).

**Declined graft (Muse, from C):** a Low/Medium/High segmented `Toggle` for Thinking effort. It adds a second control type and a branch for models with more than three levels, for a control a founder rarely touches. The select with a help line meets criterion 4.

Out of scope: product semantics of model choice per credential, the `/integrations/setup` "Search apps" field shown in Executor mode (F14's second half; filed to VIS-11's follow-up list), and the 768/375 reflow (VIS-01).

## Why this is the best
- Against A: A keeps the catalog browser and only puts it behind a disclosure, so the first user to open it (or any user with a key or `needsModel`) gets back two scrollers, the empty right pane and the same squeeze. It meets criterion 5 only while closed. B removes the structure, not just the first view.
- Against C: C shows four "Not set" key rows by default, which contradicts criterion 1 and invites a founder to look for a key they do not need. It also needs per-row credential state (the component holds one `provider` and one `apiKey`), a new Command popover, a hard-coded list of featured providers, and special handling where Anthropic and OpenAI use subscription sign-in. Highest regression risk for the same visible gain.
- Norms satisfied: I5 (Hick: no list by default), C1 (one term, explained effort), H1 and H2 (one primary button, labelled secondary), L1 (one scroller), D2 (no dead pane), I6/I8 (current model visible and marked; disabled state gives a reason), P2 (native select for a long single choice, disclosure for advanced).
- Costs and what rules out: the provider search field goes away (browser type-ahead on the select replaces it; 33 options is fine for a native select). The select cannot show a per-option "Connected" badge, so the group heading carries that. Five e2e specs that click provider buttons must be rewritten. The modal gets narrower.

## Implementation plan
1. Design system: no new tokens or components. Use `NativeSelect`/`NativeSelectOptGroup`, `Badge`, `Button` variants.
2. `ModelSettingsOverlay.tsx`: rewrite the JSX in `body` only. Keep all state, handlers, `connectionControls`, `catalogModelConfig`, `saveButton`. Delete `renderProviderRow`, `providerQuery`, and the `Plural` import if unused. Change `EmbeddingModelField` heading and copy. Add the `useEffect` that scrolls the selected option in `ModelPicker`. Narrow `DialogContent` to `w-[720px]`.
3. `model-thinking-options.tsx`: no change unless the Advanced label text moves.
4. `ModelBackupsSettings.tsx`: heading wording only if needed inside Advanced.
5. `IntegrationSetup.tsx`: default choice, Recommended badge, detail copy.
6. Stories: `ModelSettingsOverlay.stories.tsx` (default, own key open, connected, needsModel), `IntegrationSetup.stories.tsx` (Recommended).
7. `pnpm --filter @rakazo/web intl:extract` for the .po files; update e2e specs.

Files to change:
- `apps/web/src/pages/ModelSettingsOverlay.tsx`
- `apps/web/src/pages/ModelSettingsOverlay.test.tsx`
- `apps/web/src/pages/ModelSettingsOverlay.stories.tsx`
- `apps/web/src/pages/ModelBackupsSettings.tsx` (only if wording needs to change)
- `apps/web/src/components/integrations/IntegrationSetup.tsx` and `IntegrationSetup.stories.tsx`
- `apps/web/e2e/model-settings.spec.ts`, `model-connection-preflight.spec.ts`, `current-models.spec.ts`, `model-picker-search.spec.ts`, `settings-shell.spec.ts`, `integration-setup.spec.ts`, `local-settings.spec.ts`, `onboarding-model-auto-skip.spec.ts` (only where they touch provider search, default choice or renamed strings)
- `apps/web/src/locales/*/messages.po` (generated)
- Not needed: `SettingsOverlay.tsx`, `AccountSettingsOverlay.tsx`, `packages/ui-web/src/model-thinking-options.tsx` (list from `problems.md` reviewed; none needs an edit under this design).

## Final acceptance criteria (measurable)
1. Default view (`me.needsModel` false, no `focusProvider`): the modal shows the title, the active model line, a closed "Use my own key" disclosure and a closed "Advanced" disclosure. No element matching `/\d+ models?/` and no "Search providers" input is visible. When `needsModel` is true or `focusProvider` is set, the own-key disclosure is open.
2. In each of four states (default, own-key empty, key typed, connected) the dialog contains at most one `Button` with `variant="default"` that is the state's main action: "Connect" (disabled with the visible text "Paste a key to connect" while empty; enabled once 8+ characters are typed). "Test key" is ghost. A connected provider shows an outline button whose accessible name is "Disconnect {provider}". There is no heading and button both reading "Replace API key".
3. With 30 or more options and the current model at position 25 or later, opening the dropdown puts the option with `aria-selected="true"` fully inside the listbox rectangle, and it shows the check icon. ArrowDown starts from it.
4. No visible string contains "AI company" or "AI service". "Provider" is the only vendor term. The header chip reads "Thinking effort: {level}". The Thinking select has the help line quoted above. "Data room search model" and "Embedding model" are replaced by "Search model" plus its explanation.
5. At 1440x900, in default, own-key-open and connected states, `layout-audit.js` reports at most one scroller inside the dialog (the content column). The provider chooser is a native select. `viewport.pageScrollY` is 0. No horizontal overflow at 1440.
6. `/integrations/setup` (server setup): the Composio row has the visible text "Recommended" and `aria-pressed="true"` on first render; Pipedream and others have no badge. Existing connect flow for each choice is unchanged.
7. Regression guards: `focusProvider` still opens the own-key field focused; disconnect still asks for confirmation; `ModelBackupsSettings` still saves; `bun`/vitest suites for these files pass; Storybook smoke passes.

## Test plan
Write failing first, then implement.
- Vitest, `ModelSettingsOverlay.test.tsx` (embedded render): AC1 (default: no "models" count text, own-key `details` not open; `needsModel` and `focusProvider` variants open), AC2 (button variants through `data-slot`/class or role queries for each of the four states), AC4 (string scan of the rendered text), provider select `onChange` calls `chooseProvider` and shows the key form.
- Vitest, `ModelPicker` (new test with 30 options): AC3 through `scrollIntoView` spy being called on the selected option and `aria-selected`; jsdom has no layout, so the in-rectangle check is in e2e.
- Vitest, `IntegrationSetup`: AC6 (badge text, default `aria-pressed`).
- Playwright (apps/web/e2e): update the five model specs to use `getByLabel("Provider").selectOption(...)`; add to `model-picker-search.spec.ts` the AC3 rectangle check; add to `model-settings.spec.ts` the AC5 check by evaluating scrollers in the dialog at 1440x900 in the three states and asserting `<= 1`; add the AC6 check to `integration-setup.spec.ts`. Run from repo root with the harness command in the task, one spec at a time with `--spec=e2e/<file>`.
- Gates: `tsc` in `apps/web`, `npx biome ci .`, `pnpm design-system:check`, `pnpm --filter @rakazo/web intl:extract`, Storybook build and `node .storybook/smoke.mjs storybook-static` (stories change).
- Visual: fresh screenshots at 1440x900 for default, own-key open, connected, needsModel, dropdown open, and `/integrations/setup`, compared with the "before" shots listed under Evidence. 768 and 375 are checked only for no new overflow; their reflow belongs to VIS-01.
