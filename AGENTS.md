# AGENTS.md

- This is a public repository: assume all tracked content and diffs are public. Never commit secrets, `.env` files, private URLs, personal/customer data, or real production data; use fake placeholders. Review `git status` and the staged diff before committing, and never force-add ignored files. If private data appears, stop and alert the maintainer.
- Rakazo targets web, Electron desktop, and Expo mobile; Electron hosts the web UI. Consider every surface when changing features or contracts.
- Avoid visible UI copy unless it is necessary; the best UI needs no visible copy. When visible copy is necessary, keep it concise and user-friendly. Always provide concise accessibility labels for controls that need an accessible name.
- Prefer shared packages for domain logic, contracts, API behavior, and reusable UI. Keep genuinely native navigation, storage, permissions, and interactions platform-specific.
- Keep third-party services behind provider-neutral contracts and adapters. Core domain logic, persistence, orchestration, and reusable UI must not depend on a specific LLM, sandbox, memory, voice, or integration vendor; keep provider-specific configuration and translation inside its adapter.
- Treat auth, secret handling, sandbox boundaries, host commands, and integrations as security-sensitive. Keep tests deterministic and offline by default.
- After creating a pull request, stay with it until CI and automated review bots have finished. Poll checks, reviews, review threads, and PR comments at roughly 60-second intervals; passing checks alone do not mean the review is complete. Address every actionable issue, push the fixes, and repeat the review cycle until no actionable feedback remains. Do not merge while review bots are still pending or review issues remain unresolved.

## Fork and Upstream Contribution Policy

- The fork is the product-velocity lane. Continue product work on the fork even when an upstream PR is delayed, unreviewed, or conflicting.
- Upstream contributions are a separate lane: start each contribution branch from freshly fetched `origin/main`, keep it narrowly scoped to one reusable improvement, and do not bundle fork-only product work into it.
- Do not revive or force-merge a conflicting upstream PR wholesale. Re-evaluate its implementation against current upstream, preserve only the independently valuable deltas, and submit those as small follow-up PRs with focused regression tests.
- Synchronize upstream into the fork periodically in a dedicated worktree and integration branch. Record the base SHAs, resolve conflicts intentionally, run the relevant verification suite, and merge into the fork only after it is green. Never use a synchronization attempt to overwrite the active product branch or discard fork-only behavior.
- Treat an upstream merge, a green CI run, and a verified local feature as separate facts. Report each explicitly; do not claim one proves either of the others.
- For security-sensitive protocol work such as MCP/OAuth, prefer the current upstream implementation as the compatibility base when it is stronger, then port isolated fork improvements only after preserving its security invariants and tests. In particular, credentials must remain scoped to their intended origin, remote egress controls must remain enforced, and real-provider behavior must be proven separately from mocked tests.
