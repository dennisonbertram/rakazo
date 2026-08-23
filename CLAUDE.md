See AGENTS.md for repository instructions.

## UI: Beautiful UI first

Before building any UI surface by hand, check Beautiful UI
(https://www.beautifului.dev/, source github.com/TurboKach/ai-native-react-components, MIT).
It covers the AI-native primitives this product needs: loading/thinking states,
streaming text, approval cards, tool chips, task rows, chat composer, prompt
bar, tables, and more. Prefer porting its version over inventing one.

Rules:
- Hand-port from the repository source and adapt tokens to Rakazo's palette;
  never `shadcn add` from the live registry (supply-chain risk — the registry
  fetch executes whatever the URL serves at that moment).
- Ported primitives live in `apps/web/src/components/beautiful-ui/`
  (`LoadingState`, `Shimmer`, `SuccessPop`, `BuiCard`, `BuiButton`, plus the
  shared tokens/keyframes in `beautiful-ui.css`). Reuse and extend these before
  adding new visual language.
- Attribute ports in a file comment (MIT © 2026 Turbo).
