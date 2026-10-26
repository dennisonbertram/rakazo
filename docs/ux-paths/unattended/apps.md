## Area: Bot-built apps, shareable by link and runnable by agents (APPS-nnn)

Generated: 2026-10-25
Code read at: branch `feat/unattended-bots` (worktree checkout of `main` at the time of reading).
PRD under review: the original draft, section 3 "Small apps by link", the "USER ADDITIONS (2026-10-25)" bullet on apps, and the "Non-goals" line. Cited below as `PRD:<line>` against the draft file.
Persona for every story: Maya Chen, a first-time founder at Northwind Robotics (MOCK DEMO DATA). She is not technical. She wants a small, reliable tool or page her bots build for her, and sometimes wants to show it to one person outside the company.

How this was checked: the demo stack was opened in a browser and the Artifacts list, an HTML artifact, the "Isolated preview" lock and the version selector were observed (APPS-C1, APPS-C2). Every other current story, and every claim about code, comes from reading the files cited; those stories were not walked and their model-dependent steps are marked as hypotheses. Screenshots are scratch files and are not committed.

---

## 1. Current state

### 1.1 What a bot can produce today

| Output | Tool / feature | Where it lives | Who can see it | Can it change after it is made? |
|---|---|---|---|---|
| Dashboard, table, summary | `create_ui_artifact` | `Artifact` row, mime `application/vnd.rakazo.ui+openui`, file ext `.rkui` | Space owner only, inside the app | New version only (same title) |
| Free-form HTML page | `attach_file` on an `.html` file in the bot's workspace | `Artifact` row, mime `text/html` | Space owner only, inside the app | New version only (same `name`) |
| Spreadsheet | `create_spreadsheet` | `Artifact` row | Space owner only | New version |
| One document per bot (Markdown + charts) | `page_read`, `page_write`, `page_edit` | `BotPage` + `BotPageRevision` | Space owner; the owner can edit it | Yes, both sides edit with revision checks |
| Up to 6 numbers plus one list | `pins_read`, `pins_write` | `BotPins` | Space owner; owner edits the list | Yes; numbers can refresh without a model |

Nothing in this table is reachable by a person who is not signed in as the space owner, except investor updates and shared Data room files through the investor portal (section 1.5).

### 1.2 `create_ui_artifact` (read-only cards)

- Tool definition: `packages/adapters/src/builtin-tools.ts:1543`. Handler: `packages/adapters/src/executor.ts:5032`. Input schema and limits: `packages/ui-artifact/src/vocabulary.ts` (`uiArtifactInputSchema` at line 145; `UI_LIMITS` at line 4: 60,000 source characters, 200 blocks, 3 layout levels, 200 table rows, 12 columns, 60 chart points, 6 series).
- Blocks: heading, text, metric, table, list, badge, divider, chart (line or bar), card, stack, grid. The tool description says "there are no links, images, buttons or scripts".
- `packages/adapters/src/ui-artifact-tool.ts` is only 17 lines: the guidance string `UI_ARTIFACT_GUIDANCE` and `uiArtifactFileName`. It is not where the tool is defined.
- Each call publishes a bot message with the artifact card into the thread (`publishMessage`, `executor.ts:5053`). A scheduled run that updates a dashboard therefore also posts a card in chat every time.
- Calling it again with the same title creates a new version (`packages/db/src/artifact-versions.ts`).
- Rendered by `apps/web/src/components/UiArtifactView.tsx` (web) and listed in mobile `apps/mobile/app/artifacts.tsx`.

### 1.3 Free-form HTML artifacts

- The model is told to use "an HTML page with attach_file only when you need a free-form page" (`ui-artifact-tool.ts:4`). `attach_file` is defined at `builtin-tools.ts:300`.
- Web preview: `apps/web/src/components/ArtifactPreview.tsx:33` sends `text/html` to `SandboxedHtmlViewer` (`apps/web/src/components/SandboxedHtmlViewer.tsx`). The page runs inside a `sandbox="allow-scripts"` iframe (line 220) without `allow-same-origin`, with the policy `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; form-action 'none'; base-uri 'none'` (line 4). Links and form submits are blocked by a guard script.
- Consequence: an HTML artifact can compute and draw, but it cannot make any network request, cannot store data (no same-origin storage) and cannot call an API. It is a static, script-capable page.
- UI label on the preview: a lock button with the label "Isolated preview — no access to your account" (`apps/web/src/pages/Artifacts.tsx:1106`).
- Size: attachments are capped at 10 MiB (`packages/contracts/src/attachments.ts:1`).

### 1.4 Artifact versions

- Table `Artifact` (`packages/db/prisma/schema.prisma:1357`): one row per stored file, with `storageKey`, `hash`, `rootArtifactId`, `version`. It has no JSON data field and no app identity.
- A "family" is not an id the bot chooses. `resolveNextArtifactVersion` (`packages/db/src/artifact-versions.ts:6`) finds the latest row with the same space, user, bot, group and a case-insensitive equal `name`. Renaming therefore starts a new family at v1. `withResolvedArtifactVersion` (line 40) serializes same-name publishes with an advisory lock.
- UI (`apps/web/src/pages/Artifacts.tsx`): route `/app/artifacts` (list) and `/app/artifacts/:artifactId` (`apps/web/src/App.tsx:239-240`); a "Version" select (line 1091) shows `v2 · 8m ago` style entries; Download; Maximize; per-row delete. Deleting says "This deletes all N versions of this artifact." (line 430-432). There is no way to roll back to or pin a version; the newest version is the one shown by default.
- RPC (`packages/contracts/src/rpc.ts:1259-1296`): `artifacts.list`, `listSpace`, `listVersions`, `create`, `get`, `getById`, `remove`. All require the signed-in owner.

### 1.5 Outside viewing: the investor portal (the only precedent)

- A founder opens `/app/investors`, uses the row menu "Copy link" or "Resend link" (`apps/web/src/pages/Investors.tsx:476-527`), and the "Portal link" dialog (`apps/web/src/components/CopyLinkDialog.tsx`) shows the link once, because only its hash is stored.
- Investor side: web routes `/portal/open` (link token in the URL fragment) and `/portal/home` (`apps/web/src/App.tsx:75-80`); API under `/api/portal` (`apps/api/src/investor-portal.ts`). A token lasts 90 days and a session 30 days (`packages/db/src/investor-portal.ts:22-23`). The cookie `rakazo_portal` is `httpOnly`, `secure`, `SameSite=Lax`, path `/api/portal`.
- Revoke: the row menu "Revoke" ends all links and sessions (`endPortalAccess`, `packages/db/src/investor-portal.ts:38`). The Investors table has a Portal column showing sent, opened or "Revoked" (`Investors.tsx:444-448`).
- What the portal serves: investor updates and shared Data room documents only (`apps/api/src/investor-portal.ts:90-95`, `PortalStore`). Documents are always downloads with `content-security-policy: sandbox; default-src 'none'` (lines 135-143). It never serves an `Artifact`, a `BotPage` or any active content.
- It is on the same web app and API as the product (`/portal/*`, `/api/portal/*`), not on a separate host.

### 1.6 Pages and pins

- Bot Page: one Markdown document per bot (`BotPage.botId @unique`, `schema.prisma:1205-1210`). Charts are fenced JSON, never HTML or script (`docs/agent-pages/README.md`, decision 3 and "Not in v1"). Web: a header button labelled "Page" (`apps/web/src/pages/Shell.tsx:4852-4863`) that shows only once the bot has a page (`pageBotId`, set at `Shell.tsx:1849` and `:1909`). The panel shows "Page changed. Reload" on a conflict (`apps/web/src/pages/shell/bot-page-panel.tsx:295`). GTM bots add live blocks (`gtm-plan`, `gtm-channels`, `gtm-metric`) validated by `gtmPageContentError` (`packages/adapters/src/pages.ts`).
- Page saves emit thread event `page.updated` (`packages/adapters/src/pages.ts:197`). Nothing wakes a bot on it.
- Pins (`docs/agent-pages/pins.md`, `packages/adapters/src/pins.ts`): a numbers strip with a "Refresh" button (`apps/web/src/pages/shell/bot-pins.tsx:92`) and a "List" panel with an "Add item" row. A number can carry a `PinSource`: a saved, read-only MCP tool call that refreshes with no model. The server checks the assignment allowlist, tool annotations and `connectorToolRequiresApproval === false`, on write and again on refresh. This is the one existing model-free, reliable, repeatable tool call.
- The sidebar section titled "Pinned" (`apps/web/src/pages/shell/space-sidebar.tsx:277`) pins bots, not artifacts or apps.
- Fast-follow "live charts" (a `source` on `PageChart`) is described in `docs/agent-pages/README.md` but is not implemented: `PageChartSchema` has no `source` field (`packages/contracts/src/pages.ts:15-22`).

### 1.7 Custom or bot-defined tools today

There is no object called "a tool a bot defines", with an input schema, versions and a test. What exists:

| Mechanism | Who creates it | Executable? | Approval | Reference |
|---|---|---|---|---|
| Scripts in the bot's computer, run with `shell` after `write_file` | The bot | Yes, arbitrary code | None: `write_file` and `shell` are in `APPROVAL_EXEMPT_TOOLS` (`packages/core/src/action-approval.ts:3-24`, lines 13-14) | `docs/computer-runtime.md` |
| Installed API / GraphQL operations (`CapabilityInstall`, kind `api` or `graphql`, up to 100 operations, each with method, path, `inputSchema`, `readOnly`) | The owner, through RPC `capabilities.install` (`apps/api/src/router.ts:4767`) and the dialog "Add a custom connection" (`apps/web/src/components/integrations/CustomConnectionDialog.tsx`) | Calls a remote HTTP API; no bot code | Writes ask; `readOnly` operations can be allowed | `packages/adapters/src/installed-connectors.ts:77-95`, `packages/contracts/src/domain.ts:830` |
| MCP server added by a bot (`add_mcp_server`) | The bot, after the owner approves a card titled "Connect MCP server “name”" with buttons "Approve" or "Authorize" and "Not now" | A remote server. `stdio` (local command) works only when the deployment sets `MCP_STDIO_ENABLED=true` and allowlists the command (`apps/api/src/env.ts:249-250`, `apps/worker/src/index.ts:139-140`) | Owner approval of the card (`apps/web/src/pages/shell/message-cards.tsx:470-500`) | `builtin-tools.ts:616`, `packages/adapters/src/mcp-server-tool.ts` |
| Agent skills (`skill_create`, `skill_update`) | The bot proposes; the owner approves | No: a `SKILL.md` recipe in prose | Saved as a draft until the owner presses "Approve" in bot settings, Skills, "Drafts" (`apps/web/src/pages/shell/BotSkillsSection.tsx`) | `builtin-tools.ts:1987`, `schema.prisma:1016` |
| Taught skills (record a demo) | The owner | Replay playbook through the computer | See the teaching area | `schema.prisma:988` |
| Pin sources | The bot | A saved read-only MCP call | Server-side read-only check | section 1.6 |

`task_catalog` (`builtin-tools.ts:1735`) is the read-only inventory of a bot's tasks, routines, taught skills, skills and exposed tools. It is the place where a new tool kind would have to show up so the bot can find it.

### 1.8 What is missing (stated plainly)

- No share link for any artifact, page or app. No anonymous or outside-viewer route for them.
- No second origin or host for bot-made content. All previews are in-app iframes.
- No per-app data store and no data API. An HTML artifact cannot read or write data (CSP `default-src 'none'`).
- No app identity independent of the artifact `name`; no rollback or version pinning.
- No "run this artifact as a tool". An artifact is never executed by a bot, a routine or a watcher.
- No input schema, test, or declared side effects for a bot's own scripts, and no registry the next run can rely on.
- No audit of who viewed an artifact. No expiry, password or revocation (those exist only for investor portal links).
- Approvals: `unattendedTriggerToolRequiresApproval` returns `false` for every trigger except `"webhook"` (`action-approval.ts:146`). Under a schedule, `create_ui_artifact`, `attach_file`, `page_write`, `pins_write`, `write_file` and `shell` all run without any ask. Under a webhook they ask, because none is in `UNATTENDED_SAFE_BUILTIN_TOOLS` (`action-approval.ts:59-85`).

---

## 2. Current stories

Every story below is for Maya unless stated. "Walked" means observed in the demo stack on 2026-10-25.

## APPS-C1: Open a bot-made HTML dashboard from Artifacts

**Type**: short
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Look at the dashboard her bot built last week.
**Preconditions**: Demo stack signed in. Artifact "MOCK Cash Dashboard" exists (HTML).
**Ideal path**: 2 steps. The sidebar item "Artifacts" and one click on the artifact open it.
**Alternate paths**: Chat card in the thread that produced it (`ArtifactFileCard`, "Preview <name>"); sidebar search "See all in Artifacts" (`Shell.tsx:2378`); "Ask" button on the page opens Chief.
**Status**: Walked.

### Steps
1. Click "Artifacts" in the sidebar → `/app/artifacts`, list view, heading "Artifacts", filters "Search", "Added: Any time".
2. Click "MOCK Cash Dashboard" → the right pane shows a white card: "MOCK DEMO DATA: Cash dashboard", cash, burn, runway. A lock button is labelled "Isolated preview — no access to your account". Buttons "Download" and "Maximize" show.
3. Click "Maximize" → the preview fills the page; the same control now reads "Show list".

### Variations
- Grid view ("Grid view" button) shows cards with the description line.
- Mobile: `apps/mobile/app/artifacts.tsx` shows the HTML in `sandboxed-html-preview.tsx`.

### Edge Cases
- A script in the page runs but any network call fails silently (no connect rule). Maya sees a static page and cannot tell why a live number is not updating.
- Links inside the page do nothing (blocked by the guard script).

## APPS-C2: Compare versions of an artifact, then delete it

**Type**: short
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: See what changed in last month's investor update and remove an old draft.
**Preconditions**: "MOCK Investor Update - September" has v1 and v2.
**Ideal path**: 3 steps for the comparison (open, open the select, choose v1). Deleting adds 2.
**Alternate paths**: None found. There is no side-by-side or diff view, and no "restore this version".
**Status**: Walked (open and select); delete read from code.

### Steps
1. Open `/app/artifacts` and click "MOCK Investor Update - September" → the row shows a "v2" badge; the pane has a "Version" select showing "v2 · 8m ago".
2. Open the "Version" select and choose "v1 · 8m ago" → the pane loads v1.
3. Click the row's delete icon ("Delete MOCK Investor Update - September") → dialog "Delete "MOCK Investor Update - September"?" with "This deletes all 2 versions of this artifact." and "This can't be undone."; buttons "Cancel" and "Delete".

### Variations
- A bot that renames the title on its next run starts a new v1 instead of v3 (family key is the name).

### Edge Cases
- Deleting removes every version at once. There is no per-version delete.

## APPS-C3: Ask a bot for a dashboard in chat (`create_ui_artifact`)

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Get a one-screen summary of cash and burn she can come back to.
**Preconditions**: A bot with the built-in tool `create_ui_artifact` enabled and a model that can call it. Not walked: depends on the model.
**Ideal path**: 2 steps: ask, then open the card.
**Alternate paths**: Ask for an HTML page instead (the bot uses `write_file` plus `attach_file`); ask the bot to put it on its Page (`page_write`).
**Status**: Code-read; model behavior is a hypothesis.

### Steps
1. In the thread with Chief, type "Build me a cash, burn and runway dashboard." → the run starts; the activity line reads "Creating a dashboard" (`packages/adapters/src/pi-runtime.ts:883`).
2. The bot calls `create_ui_artifact` with a title and blocks → a card for the artifact appears in the thread. If the input is invalid the tool returns "Invalid UI artifact" with problems and the bot retries.
3. Click the card (label "Preview <title>") → the preview opens, rendered by `UiArtifactView`.
4. Say "Add last month for comparison." → the bot calls the tool with the same title; the card shows a new version, and `/app/artifacts` shows a "v2" badge.

### Variations
- The title differs by one character: a second artifact is created, not a new version.

### Edge Cases
- The dashboard is a snapshot. Numbers do not update unless the bot or a routine calls the tool again, which posts another card in chat each time.
- Money charts honor "Hide money" only when the bot sets `money: true` on the chart block.

## APPS-C4: Keep an ongoing summary on the bot's Page

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Have one place where the finance bot's weekly summary lands and where she can add her own notes.
**Preconditions**: The bot has written its page at least once (`page_write` with `baseRevision: 0`). Not walked.
**Ideal path**: 2 steps: open the bot, click "Page".
**Alternate paths**: Mobile page screen (read only); a GTM bot's page is also reachable from the "GTM" sidebar page.
**Status**: Code-read.

### Steps
1. Open the bot's thread → once a page exists, the header shows a "Page" button (`Shell.tsx:4852`). Before that, no button shows.
2. Click "Page" → the Tiptap editor opens beside the chat. Charts render from embedded rows.
3. Type a note → it saves after a short delay with the current revision.
4. While the bot rewrites the page, the panel shows "Page changed. Reload" (`bot-page-panel.tsx:295`); Maya clicks it and sees the bot's version.

### Variations
- A chart block can be deleted (button "Delete chart") but not edited.

### Edge Cases
- The bot cannot put buttons, forms, links or HTML on a page. A user who asks for "an app on my page" gets a document.
- Only one page per bot.

## APPS-C5: Numbers strip and list that refresh without the model

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: See "Higgsfield spend this month" at the top of a bot's chat and refresh it with one click.
**Preconditions**: The bot has written pins with a read-only MCP `source` on each number. Not walked.
**Ideal path**: 1 step: the strip is already visible; one click on "Refresh".
**Alternate paths**: Ask the bot in chat to refresh its numbers; for a number with no `source`, "Refresh" sends the bot a visible message "Update your pinned numbers."
**Status**: Code-read.

### Steps
1. Open the bot → the numbers strip shows up to six cards (label, value, detail).
2. Click "Refresh" (`bot-pins.tsx:92`) → the icon spins; sourced numbers update with no model run.
3. Use "List" in the header and the "Add item" row to add a to-do → saved with a revision check.

### Variations
- If a source fails, the old value stays and a warning icon shows the error text.

### Edge Cases
- Only MCP tools can be sources. Built-in tools and scripts cannot (`docs/agent-pages/pins.md`, "Not in v1").
- A tool that needs approval can never be a source.

## APPS-C6: Give bots a tool: add a custom connection or approve an MCP server

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Let her bots call a small HTTP service her contractor built, for a repetitive lookup.
**Preconditions**: A URL for an MCP server (remote). Not walked.
**Ideal path**: 3 steps: Integrations, "Add a custom connection", paste the URL.
**Alternate paths**: Ask a bot "connect this MCP server" and press "Approve" on the card "Connect MCP server “name”" (`message-cards.tsx:470`); owner installs an OpenAPI or GraphQL surface through RPC `capabilities.install` (no UI found for OpenAPI operation lists beyond the custom connection dialog).
**Status**: Code-read.

### Steps
1. Click "Integrations" in the sidebar → the integrations page (the exact entry point to the custom dialog was not walked).
2. Choose "Add a custom connection" → dialog with "Display name", "Server URL" ("Paste the app's connection URL from its documentation."), "Authentication" ("No authentication", "Bearer token", "API key header"), "Cancel".
3. Add it → either connected, or a status "Needs reconnect" until sign-in. Choose which bots may use it (bot access list).
4. In a thread, ask the bot to use it → the bot sees the tools; calls that write ask for approval, read-only ones do not.

### Variations
- Local command (stdio) servers work only on deployments that enable them and allowlist the command (`apps/api/src/env.ts:249-250`). The dialog has a command field ("Enter the command to run." is its empty-field error, `CustomConnectionDialog.tsx:327`); whether a disallowed command is refused at save or at first use was not checked.

### Edge Cases
- This route needs a server somewhere that Maya's contractor runs. Praci runs no code for her.

## APPS-C7: Approve a skill the bot wrote

**Type**: short
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Let a bot keep the steps of a repeated task so the next run follows them.
**Preconditions**: The bot called `skill_create`; the skill is a draft. Not walked.
**Ideal path**: 2 steps: open the bot's settings, press "Approve" on the draft.
**Alternate paths**: "Add skill" (owner writes one, or "From URL"); "Discard".
**Status**: Code-read.

### Steps
1. Open the bot's settings and find the section "Skills" → a "Drafts" group lists the proposed skill with "Approve" and "Discard".
2. Press "Approve" → the skill joins the catalog; the bot loads it with `skill_read` when it matches.

### Edge Cases
- A skill is instructions in prose. It cannot declare inputs, run code or be tested. A bot that follows it can still go wrong in a different way each run.
- `skill_update` on an active skill is a proposal that needs "Update" approval.

## APPS-C8: Send an investor an outside link (the only outside-viewer flow)

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Give an investor a link where she can read the latest update and download shared documents, then cut her access.
**Preconditions**: A contact of kind investor with an email, an update sent or a Data room file shared. Not walked.
**Ideal path**: 3 steps: Investors page, row menu "Copy link", paste into a message.
**Alternate paths**: "Resend link" emails it; mobile Investors page.
**Status**: Code-read.

### Steps
1. Open `/app/investors` and the row menu for an investor ("Actions for <name>") → "Resend link", "Copy link", "Revoke".
2. Click "Copy link" → dialog "Portal link" with a read-only field and "Copy"; the link is shown once.
3. The investor opens it → `/portal/open` exchanges the token for a session cookie, then `/portal/home` shows "Latest update", "Earlier updates", "Documents" with "Download" and "Sign out". An empty portal says "Nothing shared yet."
4. Maya clicks "Revoke" → the Portal column reads "Revoked"; the investor's link and session stop working.

### Edge Cases
- The portal shows only updates and Data room files. A bot-made dashboard cannot be put in it.
- The link shows `Opened` in the Portal column but there is no per-view log.

---

## 3. Future stories

Design frame used in these stories. It is a proposal, not a decision. A bot-built app is a versioned bundle with an optional tool manifest. Tools run in the bot's computer or as read-only connector calls, never as Praci-hosted arbitrary server code, so the PRD non-goal at `PRD:13` still holds for the hosting side. Everything reuses: `Artifact` plus versions for storage, `SandboxedHtmlViewer` for display, `ApprovalCard`-style cards for asks, `CopyLinkDialog` and the portal token model for links, the Pins `PinSource` checks for read-only guarantees, `task_catalog` for discovery.

## APPS-F1: Ask for a reusable tool, not just a page

**Type**: long
**Topic**: Bot-built apps
**Persona**: Maya, founder, wants her finance bot to produce the same vendor-spend breakdown every Monday.
**Goal**: Get a named tool "Vendor spend by category" that takes a date range and returns a table, and keep it.
**Why the user cares**: She gets the same shape of answer every week without re-explaining it or hoping the bot writes it the same way.
**Preconditions**: Finance bot with Mercury connected, read tools only.
**Ideal path**: 4 steps: ask, preview the result with sample input, press "Save as tool", name it.
**Alternate paths today**: ask for a dashboard (APPS-C3), or a skill (APPS-C7); both lose the exact steps.

### Steps
1. Maya types "Make me a tool that breaks vendor spend down by category for any date range." → the bot writes the script and a small input form, runs it once against last month, and shows the result as an app card with "Preview".
2. Maya opens the preview → she sees the table and the inputs ("From", "To"). A "What it can do" line lists: reads Mercury transactions, writes nothing, no network except Mercury.
3. She presses "Save as tool" → the tool is stored as v1 and appears in the bot's tool list and in `task_catalog`.
4. She says "Run it for September." → the bot calls the tool; the answer arrives as the same table, in the same columns.

### Variations
- She wants it only as a page: she does nothing and the app stays a normal artifact.

### What could go wrong
- Noise: every build run posts a card. Only the finished preview should post.
- Safety: a script that writes or sends must not be saveable as a tool without a visible declaration and an approval.
- Cost: a build that loops on model retries; cap attempts.

## APPS-F2: A saved tool runs on a schedule and stays quiet

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Have "Vendor spend by category" run every Monday at 8:00 and only tell her when a category jumps more than 20 percent.
**Why the user cares**: She hears from the bot when something changed, not every week.
**Preconditions**: APPS-F1 done; a routine exists for this bot.
**Ideal path**: 3 steps: open the tool, "Run on a schedule", choose "Mondays 8:00" and "Only tell me if it changes".
**Alternate paths today**: a routine whose prompt says "run the script" (the model decides each time).

### Steps
1. Maya opens the tool and picks "Run on a schedule" → she chooses a day and time and a "tell me when" rule.
2. The routine calls the saved tool version with no model reasoning for the run itself (like a pin refresh).
3. Result unchanged → nothing in chat; the app's "Last run" updates.
4. Result crosses the rule → one message that leads with the category and the change, linking the app.

### What could go wrong
- Noise: a card in chat per run (the current `create_ui_artifact` behavior). Updating an app must not post by default.
- Safety: a scheduled run must not use a tool that writes. A write inside a scheduled tool must end as a pending approval, not a silent write (today only webhook runs ask, `action-approval.ts:146`).
- Cost: many small runs; per-bot daily cap and cheaper model for the summary line.

## APPS-F3: Share a dashboard with an advisor by link, view only

**Type**: long
**Topic**: Bot-built apps
**Persona**: Maya, who wants her advisor Dana to see the cash dashboard without making her an account.
**Goal**: Send Dana a view-only link that expires and can be cut off.
**Why the user cares**: Dana sees live numbers in one click and Maya keeps control of who sees what and for how long.
**Preconditions**: A saved app with no personal data in it.
**Ideal path**: 4 steps: open the app, "Share", review, copy link.
**Alternate paths today**: Download and email the file; investor portal (only updates and documents).

### Steps
1. Maya opens the app in Artifacts and presses "Share" → a card shows exactly what Dana will see (the rendered app and any data it holds) and asks her to confirm. Sharing always asks; a bot cannot do it by itself.
2. She chooses "View only", an expiry (default 30 days) and optionally a password → a "Link" dialog (same layout as "Portal link") shows the link once.
3. Dana opens it → the app loads on a separate origin, in a sandbox, with no cookie from the product.
4. Maya sees "Viewed 3 times, last 2 hours ago" on the app and presses "Revoke" when Dana is done → the link stops working.

### Variations
- Edit access for a trusted person: the link allows writing only to the app's own data store, never to Maya's account.
- The app's data changes after the share: a banner on the share card says the data changed since she confirmed.

### What could go wrong
- Safety: a bot that makes a new version after the share could add data Maya never reviewed; a new version should not go live on an existing link until she approves it.
- Safety: links in chat transcripts leak; show once, store the hash only (as the portal does).
- Cost: public viewers can hit the data API; per-link rate and size limits.

## APPS-F4: An outside person fills in a form and the bot reacts

**Type**: long
**Topic**: Bot-built apps
**Persona**: Maya, collecting candidate scorecards from her two interviewers.
**Goal**: A "Hiring scorecard" app that interviewers fill in by link; the bot summarizes after each submission.
**Why the user cares**: She stops chasing people by email and gets one summary she can read.
**Preconditions**: A saved app with a small data store; edit links for two people.
**Ideal path**: 5 steps: ask, preview, share edit links, interviewers submit, read the summary.
**Alternate paths today**: a Google Form outside Praci; email replies the bot reads.

### Steps
1. Maya asks for a scorecard form → the bot builds the app; Maya previews it.
2. She presses "Share", chooses "Can edit", names the two people → two links, each shown once.
3. An interviewer submits → the entry goes to the app's data store, scoped to that app and link.
4. If Maya turned on "Wake the bot on new entries", the bot gets one thread event per batch (debounced), reads the entries and updates a summary.
5. Maya opens the summary on the app or in chat.

### What could go wrong
- Safety: submitted text is untrusted; the bot must treat it as data, not instructions.
- Noise: wake once per batch, not per keystroke or per entry.
- Cost: a public link someone floods; per-link submit limits and a hard stop.

## APPS-F5: Update an app safely, with a way back

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Let the bot improve a shared dashboard but see the new version before it replaces the old one for viewers.
**Why the user cares**: A bot's edit cannot break the page Dana already relies on.
**Preconditions**: A shared app at v2.
**Ideal path**: 3 steps: see "v3 ready for review", preview, "Publish v3".
**Alternate paths today**: the "Version" select shows all versions but publishing is automatic and there is no rollback (APPS-C2).

### Steps
1. The bot builds v3 → Maya sees a "New version" card in chat and in Artifacts, with v3 marked "Not live".
2. She opens the "Version" select, picks v3 and previews → viewers still see v2.
3. She presses "Publish v3" → viewers get v3; "Restore v2" appears next to the select.
4. If a scheduled tool still depends on v2's inputs, the card says so before she publishes.

### What could go wrong
- Noise: do not ask on trivial data refreshes; ask only on code or layout changes.
- Safety: version must be pinned by hash so a tool never runs code Maya did not approve.

## APPS-F6: A tool breaks and tells Maya once

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: When a saved tool fails because its source changed, hear about it once and see a proposed fix, not a failure every Monday.
**Why the user cares**: Her Monday routine does not silently produce empty or wrong numbers.
**Preconditions**: A scheduled tool from APPS-F2 whose source format changed.
**Ideal path**: 2 steps: read one notice, press "Review fix".
**Alternate paths today**: the routine keeps running and the bot improvises each time.

### Steps
1. Run fails its output check (missing column) → the tool is paused and Maya gets one notification: "Vendor spend by category stopped: column 'category' missing."
2. The bot proposes v2 with a fix and a test result as a "Draft version" card; Maya presses "Review fix", previews, and presses "Publish and resume".

### What could go wrong
- Noise: repeated failure notices; one per tool until resolved, with backoff.
- Safety: the proposed fix is a draft; it cannot run unattended before approval.
- Cost: retries on every run; auto-pause after N failures.

## APPS-F7: One bot finds and uses a tool another bot saved

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya, who has a Finance bot and a Chief bot.
**Goal**: Chief can call "Vendor spend by category" without rebuilding it.
**Why the user cares**: She builds each thing once, and bots do not each invent a slightly different version.
**Preconditions**: A saved tool owned by the Finance bot.
**Ideal path**: 2 steps: ask Chief for vendor spend; Maya approves the grant once.
**Alternate paths today**: `message_bot` to ask the Finance bot; the Finance bot answers in prose.

### Steps
1. Maya asks Chief "How did vendor spend change this month?" → Chief finds the tool in `task_catalog` and asks for access.
2. Maya presses "Allow" on a card naming the tool, its declared reads, and that it writes nothing → Chief runs it.
3. Settings, under the tool, list "Used by: Finance, Chief" with a "Remove" action.

### What could go wrong
- Safety: a tool inherits the permissions of its owner by default; grant per bot, and check the tool's declared effects against the caller's rules.
- Noise: a grant card for every bot pair; ask once per bot and tool.

## APPS-F8: Check what a tool can do before it runs while Maya is away

**Type**: medium
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Before a tool is allowed to run in the background, see in plain words what it reads and changes, and try it once with her watching.
**Why the user cares**: She trusts it enough to leave it alone.
**Preconditions**: A saved tool, not yet allowed in the background.
**Ideal path**: 3 steps: open the tool, "Try it now", "Allow in background".
**Alternate paths today**: a routine that runs `shell` with no declared effects (approval-exempt, `action-approval.ts:13-14`).

### Steps
1. Maya opens the tool → a short list: "Reads: Mercury transactions. Writes: nothing. Network: Mercury only. Last test: passed."
2. She presses "Try it now" → it runs with her watching and shows the output.
3. She presses "Allow in background" → routines, watchers and other bots may call it without asking, for read-only effects only. Anything it tries beyond the declaration becomes a pending approval.

### What could go wrong
- Safety: the declaration is the tool's own claim; the platform must enforce it (no network beyond the list, writes blocked), not trust it.
- Noise: do not show this card for tools that only format data.

## APPS-F9: Retire an app and every link to it

**Type**: short
**Topic**: Bot-built apps
**Persona**: Maya
**Goal**: Delete an old app and be sure no link or schedule still uses it.
**Why the user cares**: Nothing she thought was gone keeps running or stays readable.
**Preconditions**: An app with one live share link and one scheduled use.
**Ideal path**: 2 steps: "Delete", confirm.
**Alternate paths today**: delete in Artifacts removes all versions (APPS-C2) but there are no links or schedules to check.

### Steps
1. Maya presses "Delete" on the app → the dialog says "This ends 1 link and stops 1 schedule, and deletes all 4 versions and its data."
2. She confirms → links return "This link no longer works."; the routine reports once that its tool is gone.

### What could go wrong
- Safety: account export and deletion must include app data (`packages/adapters/src/account-export.ts` handles artifacts today).
- Noise: one notice for the routine, not one per skipped run.

---

## 4. PRD corrections

Line references to the PRD use the numbering of the original draft file. Code references are repo-relative.

1. **PRD:18, "create_ui_artifact (ui-artifact-tool.ts, packages/ui-artifact) read-only".** Imprecise. `packages/adapters/src/ui-artifact-tool.ts` has only `UI_ARTIFACT_GUIDANCE` and `uiArtifactFileName` (lines 1-17). The tool definition is `packages/adapters/src/builtin-tools.ts:1543`, the handler is `packages/adapters/src/executor.ts:5032`, and the schema and limits are `packages/ui-artifact/src/vocabulary.ts:4-30` and `:145`. "Read-only" is true but incomplete: the artifact is also a snapshot, and each call posts a card into the thread (`executor.ts:5053`), which matters for any plan where a scheduled run updates an app.
2. **PRD:18 and PRD:39, apps need a "versioned static bundle".** Free-form HTML artifacts already exist: `attach_file` (`builtin-tools.ts:300`) on an `.html` file, previewed by `apps/web/src/components/ArtifactPreview.tsx:33` through `SandboxedHtmlViewer`. The draft does not say so. Scripts already run there, in `sandbox="allow-scripts"` with no `allow-same-origin` (`SandboxedHtmlViewer.tsx:220`).
3. **PRD:39, "strict CSP, sandboxed iframes" as a must.** Already true for in-app viewing (`SandboxedHtmlViewer.tsx:4-5`). The consequence the draft misses: that policy is `default-src 'none'`, so an HTML app cannot call a data API at all. A per-app data store needs a narrow `connect-src` to one data host, which is a new rule, not a reuse.
4. **PRD:18, "Artifact + artifact-versions.ts" as the container.** Imprecise. A version family is keyed by space, user, bot, group and a case-insensitive `name` (`packages/db/src/artifact-versions.ts:6-30`), so renaming creates a new family and there is no stable app id. `Artifact` has no data field and one file per row (`schema.prisma:1357-1392`). The draft's "per-app JSON data store as Artifact with versions" therefore needs new storage; only the file and version behavior is reusable. The draft names no function: they are `resolveNextArtifactVersion` and `withResolvedArtifactVersion`. Delete removes all versions with no per-version delete (`Artifacts.tsx:430-432`).
5. **PRD:18, "investor portal (packages/db/src/investor-portal.ts) precedent for outside viewing".** Correct for tokens and revocation (hash-only token, 90-day link, 30-day session: `packages/db/src/investor-portal.ts:22-23`; `endPortalAccess` at `:38`), but the portal serves only investor updates and shared Data room documents (`apps/api/src/investor-portal.ts:90-125`), and documents are always downloads under `sandbox; default-src 'none'` (`:135-143`). It never serves an `Artifact` or active content. It also runs on the product's own web app and API (`/portal/*`, `apps/web/src/App.tsx:75-80`), not on a separate host, so "separate origin" in `PRD:39` and the `/a/:token` plan in `PRD:41` are new work.
6. **PRD:39, "view audit".** Missing detail: the portal records only when a link was sent and last opened (`Investors.tsx:444-448`, `portalLastSeenAt`). There is no per-view log to reuse.
7. **PRD:40, "promote to Page / pin".** Neither accepts an app. A Page is one Markdown document per bot with chart fences and no HTML (`schema.prisma:1205-1210`; `docs/agent-pages/README.md`, decision 3 and "Not in v1"). Pins are up to six numbers plus one list (`docs/agent-pages/pins.md`). The "Pinned" group in the sidebar pins bots (`apps/web/src/pages/shell/space-sidebar.tsx:277`). The draft also omits `packages/adapters/src/pins.ts` from its file list even though it is the closest existing model-free tool call.
8. **PRD:39, "viewer edits emit thread event (opt-in wake)".** The event half has a precedent (`page.updated`, `packages/adapters/src/pages.ts:197`) but no code wakes a bot on a page or pin event. The opt-in wake is new.
9. **PRD:13 versus PRD:77 (internal conflict).** The non-goals exclude "server-side app hosting / arbitrary backend code for bot apps in v1". The user addition says bot-built apps must be runnable by agents as reliable tools. These are compatible only if the tool runs in the bot's computer or as a read-only connector call. The draft does not say where the code runs, which is the main open design question. Also missing from the draft: bots can already write and run scripts with no ask, because `write_file` and `shell` are in `APPROVAL_EXEMPT_TOOLS` (`packages/core/src/action-approval.ts:3-24`, lines 13-14). Those scripts have no input schema, no version, no test and no registry, and the computer workspace is checkpointed latest-only (`docs/computer-runtime.md:90`). Team bots share one OS user and workspace and it is not a security boundary (`docs/computer-runtime.md:17,34`).
10. **PRD:77, "agents build tools for specific repetitive work".** The draft does not mention the existing tool-definition mechanisms, which a design should extend or deliberately not duplicate: installed API and GraphQL operations with a `readOnly` flag (`packages/adapters/src/installed-connectors.ts:77-95`, `packages/contracts/src/domain.ts:830`, RPC `capabilities.install` at `apps/api/src/router.ts:4767`, owner-only, UI "Add a custom connection"); `add_mcp_server` with an owner approval card (`builtin-tools.ts:616`, `message-cards.tsx:470-500`), where local `stdio` servers need `MCP_STDIO_ENABLED` and an allowlist (`apps/api/src/env.ts:249-250`); `skill_create` drafts, which are prose only (`builtin-tools.ts:1987`); and `task_catalog` (`builtin-tools.ts:1735`), where any new tool kind must be listed so bots find it.
11. **PRD:42, "app_share (always asks), never unattended" and the approvals rule.** Not enforced by the current code path. `unattendedTriggerToolRequiresApproval` only affects `trigger === "webhook"` (`action-approval.ts:146`), and `UNATTENDED_SAFE_BUILTIN_TOOLS` (`:59-85`) is an allowlist, so new `app_*` tools would ask on a webhook but run free on a schedule. Today `create_ui_artifact`, `attach_file`, `page_write` and `pins_write` are in neither `APPROVAL_EXEMPT_TOOLS` nor `APPROVAL_REQUIRED_BUILTIN_TOOLS`, so they run without an ask in scheduled runs. "Always asks" must be an explicit `APPROVAL_REQUIRED` or explicit-approval entry, and `app_update` for a shared app needs its own rule (see APPS-F5). There is also no existing "approval to share outside" card; the closest pattern is the held bot-to-bot share (`packages/adapters/src/bot-share.ts`).
12. **PRD:39, "limits".** Missing figures that already bound this area: attachments 10 MiB (`packages/contracts/src/attachments.ts:1`), UI artifact 60,000 characters and 200 blocks (`vocabulary.ts:4-30`), Page 200,000 characters and 20 charts (`packages/contracts/src/pages.ts`). The data store limits are TBD.
13. **PRD:13, "editing apps or skills on mobile in v1".** Mobile already lists and previews artifacts including HTML (`apps/mobile/app/artifacts.tsx`, `apps/mobile/components/sandboxed-html-preview.tsx`), and is read-only for pages. The draft should say that viewing an app on mobile is in scope and only editing is out.
14. **PRD:69-70, phasing puts apps last (phase 5).** The user addition makes a minimal "saved tool" concept a dependency of watchers (`connector_read` and `command` probes at `PRD:24`) and of unattended approvals, because all three need the same notion of a named, read-only-checked, repeatable call. Pins already implement the read-only check (`packages/adapters/src/pins.ts`). Recommendation, not a fact: define the shared "reliable read-only call" first and let apps and watchers both use it.
15. **PRD:42, "show data before first share".** There is no data store today, so there is nothing to show. For the existing artifacts the equivalent is the rendered preview (APPS-F3 step 1).
16. **Not stated in the draft, a constraint that affects the design.** An artifact is visible only to the signed-in space owner. Every artifact RPC is authorized by space and user (`apps/api/src/artifacts.ts`, `getOwnedArtifact`, `getSpaceArtifactById`). A share route must be a new, separately authorized path with its own tests; it cannot reuse `artifacts.getById`.
