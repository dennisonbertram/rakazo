# App Discovery: Praci — Live pages

Everything below was read from code in the repository. Nothing was run in a browser. The spec (docs/agent-pages/live-pages.md) is a plan. The shipped code differs from it in the places I note.

## Application Type
Praci/Rakazo is a multi-surface AI "bots" workspace.
- Web is a React SPA (apps/web). Electron (apps/desktop) hosts the same web app.
- Expo mobile is in apps/mobile and native iOS is in apps/ios.
- "Live pages" are agent-built pages that belong to a bot. A page is either Markdown "blocks" or sandboxed HTML. Its numbers, tables and charts come from server-refreshed "sources" and need no model run.

## Tech Stack
- Web UI: React, Tiptap editor, Lingui (`<Trans>` / ``t`...` `` strings), `@rakazo/ui-web`, lucide icons, react-router.
- API: oRPC contracts in packages/contracts and handlers in apps/api/src/router.ts.
- Data: Prisma/Postgres with RLS. Scheduler is graphile-worker (`pages.refresh.tick`).
- Shared logic in packages/core (`pages.ts`, `html-page.ts`) and packages/adapters (`pages.ts`, `page-sources.ts`, `page-source-tick.ts`, `page-source-approval.ts`, `builtin-tools.ts`).
- Mobile uses `sandboxed-html-preview.tsx`. iOS uses SwiftUI with `SafeHTMLView` (WKWebView).

## User Roles
- Bot owner (the user): edits pages, approves sources, manages sources, shares.
- The bot (agent): builds pages and sources through tools.
- Anonymous viewer: opens a shared snapshot link at `/s#<token>`.
- Non-owners cannot reach a bot page. Handlers authorize via `repos.getBot(actor, botId)`.

## Feature Map

### 1. Bot page panel with named page tabs
Files: apps/web/src/pages/shell/bot-page-panel.tsx (`BotPagePanel`, `PageEditor`) and apps/web/src/pages/BotPageView.tsx.

**Entry from bot chat.** The chat header shows a `FileText` icon button with title and aria-label "Page". It appears only when the active bot already has a page (`rpc.pages.get` returns non-null, or a `page.updated` or `page.data` event arrives). Clicking it toggles a side panel beside the chat (Shell.tsx ~5109, panel `"page"`, ~5488).

**What the user can do in the side panel:**
- **Switch pages.** A tab row (`TabsList`, aria-label "Pages") appears when the bot has 2 or more pages. The first page opens by default.
- **Create a page.** The `+` icon button (aria-label "New page") is shown only when at least one page exists. It is disabled at `BOT_PAGE_MAX_PAGES` (20). It creates a page titled "New page", or "New page 2", "New page 3" and so on, then opens an inline rename field.
  - Consequence: the user cannot create a bot's first page. The bot must do that with `page_write` or `page_create`.
- **Rename.** Options menu, "Rename". The inline input has aria-label "Page title" and a 60-character max. Enter saves, Escape or blur cancels, and the text is selected on focus.
- **Delete.** The "Delete" menu item (destructive) shows only when there are 2 or more pages and the panel is not the full-width one. Its confirmation dialog is titled "Delete {title}?" with buttons "Cancel" and "Delete". The last page cannot be deleted from the UI.
- **Edit content.** The editor is Tiptap with aria-label "Page", autosaves 800 ms after typing, and conflict-checks by revision.
  - If someone else saved, a button reads "Page changed. Reload".
  - A failed save shows "Could not save the page."
- **Options menu.** The `…` button has aria-label "Page options". Its items are "Refresh" (only if the page has sources), "Sources" (only if it has sources), "Share", "Rename" and "Delete".
- **Delete a live block.** Hovering a metric, table or sourced chart shows a delete button (aria-label "Delete block"). A static chart has a button with aria-label "Delete chart". GTM blocks also have "Move up", "Move down" and "Delete block".

**Full-width route** (see Navigation): `BotPageView` renders `BotPagePanel` with `fixedPageId`.
- The header is `PageHeader` with the page title and the options menu.
- There are no tabs, no "New page", and no "Delete".
- An unknown page triggers `onMissing`, which navigates to `/app` with replace.

### 2. Live blocks (metric, table, chart with source)
Files: packages/core/src/pages.ts (`splitPage`), packages/contracts/src/pages.ts, apps/web/src/components/pages/PageLiveBlocks.tsx, apps/web/src/pages/shell/page-live.ts, page-live-extensions.ts, page-chart-extension.ts.
- Fences are `metric`, `table` and `chart`. A chart gains optional `source`, `path` and `over: latest|history`, per the spec. A history chart plots one snapshot per refresh.
- **Metric card.** Label at top, value in large text. `format: usd` is masked by the user's "hide amounts" preference.
- **Table block.** Title is `block.name`, with a compact table of columns and rows.
- **Hover or focus** shows the fetch time. Each block is focusable (`tabIndex=0`).
- **Failed refresh.** A warning dot (aria-label "Source failed") opens a popover with the error text and a "Retry" button. "Retry" calls `pages.refresh`.
- **Paused source.** The dot has aria-label "Source paused" and no Retry.
- **Placeholders by status** (exact strings):
  - pending: "Waiting for approval". It becomes a clickable underlined button when `onReview` is provided, which only happens on the full-width page. It navigates to `/app/{botId}` (the chat) to review the approval card.
  - paused: "Paused"
  - denied: "Not approved"
  - missing: "Source not found"
  - default: "No data yet"
  - While loading or refreshing: shimmer "Refreshing".

### 3. Page sources dialog
File: apps/web/src/components/pages/PageSourcesDialog.tsx. Open it from the options menu, "Sources".
- **Title:** "Sources". **Empty:** "No sources". **Loading:** `RowsSkeleton` with 3 rows.
- **Each row shows:**
  - The source name.
  - A subline of `serverName · tool · schedule`.
  - The last refresh time, formatted like "Nov 1, 3:05 PM".
  - A badge: "ok", "failed" (destructive, when the source is active and has `lastError`), "pending", "paused" or "denied".
  - The last error on its own truncated line, with the full text in the `title` tooltip.
- **Per-row menu** (aria-label "{name} options"):
  - "Change schedule" submenu with radio items "Every 15 min", "Hourly", "Every 6 hours", "Daily", "Weekly".
  - "Pause" (only when active).
  - "Resume" (only when paused).
  - "Remove" (destructive).
- **Remove confirmation:** title "Remove {name}?", buttons "Cancel" and "Remove".
- After a remove, blocks that use the source show "Source not found".
- Errors appear as an inline `role=alert` line.
- **"Refresh now"** is the "Refresh" item in the options menu, not a button in the dialog. It calls `pages.refresh`. The spec says it is rate-limited to once a minute per page (not verified in code).
- **Auto-pause** (page-source-tick.ts): after 5 consecutive failures the source becomes paused. Resuming resets the failure count.
  - The bot's thread gets one message: "A source on one of your pages stopped working. Call page_source_list to see which one and why."
  - Other caps: 2,000 refreshes per space per UTC day, 100 sources per space, 20 per page, 50 claimed per tick, 4 concurrent calls per space.
- **The dialog cannot create sources or edit a source's call.** Only the bot can (`page_source_set`).

### 4. Approval cards (mcp and http sources)
Files: packages/adapters/src/page-source-approval.ts, apps/web/src/components/AskCard.tsx (and AskCard.stories.tsx, AskCardPageSource.test.tsx), apps/web/src/pages/shell/transcript.tsx, packages/adapters/src/executor.ts.
- **How it appears.** When the bot saves an mcp or http source, it is stored as pending. A bot message with an `ask` block carrying `pageSource {sourceId, callHash}` is posted in the bot's thread, the thread is marked unread, and a "help" notification goes out. The run is not paused.
- **Card text:** `Read {serverName or host} {every 15 minutes | every hour | every 6 hours | every day | every week}?`
- **Detail lines:**
  - `Request: GET {url}` for http, or `Request: {tool} {json args}` for mcp.
  - `Key: {secretName}` (http with a secret only).
  - `Page: {pageTitle}` (cut to 100 characters).
- **Buttons:** "Allow" and "Not now". After answering, the label is "Allowed" or "Not now".
- **Other card states:** "Sending…" while the answer is in flight, and "No longer active" when it can no longer be answered.
- **Approval hash.** A bot changing the call (url, secret, accept, server, tool or args) sends the source back to pending with a new card. Changing only the name or schedule does not need a new approval.
- **Not verified:** the server-side `threads.answer` handling (the spec says it goes through `findPageSourceApproval`), and that Allow rules never skip the card (spec claim; `action-approval.ts` references `pageSource`).
- **Mobile thread** (apps/mobile/app/thread.tsx ~3815) also renders these cards through `askBlock.pageSource`.
- A pending block's "Waiting for approval" link on the full-width page jumps to the chat.

### 5. HTML pages
Files: apps/web/src/components/pages/HtmlPageView.tsx, SandboxedHtmlViewer.tsx, apps/web/public/html-viewer.html, packages/core/src/html-page.ts.
- A page created with `kind: "html"` (fixed at creation) renders read-only in the sandboxed viewer, in a box about 70vh tall with a bordered rounded frame. The user cannot edit it in the UI.
- The HTML declares its sources with `<meta name="praci-sources" content="Overview, Revenue">` and optionally history with `<meta name="praci-history" content="Revenue">`. The limit is 20 sources, and only the first 20,000 characters are scanned.
- The app pushes `{type:"praci-data", sources:{name:{value, fetchedAt, error?, history?}}}` into the frame by `postMessage`. This happens after load and on every `page.data` event. Data for a different revision never reaches the frame.
- A failed load "keeps what it last showed" silently. There is no error text for HTML pages.
- **Security note from the spec:** DNS exfiltration is a known limitation of HTML pages. Blocks pages do not have that path.

### 6. Sidebar pages
Files: apps/web/src/components/SidebarPages.tsx, SidebarPagesGroup.tsx, SidebarPageLink.tsx, AddSidebarPage.tsx, apps/web/src/lib/sidebar-page-copy.ts, packages/db/src/sidebar-pages.ts.
- **"Add page" row.** A `+` row (data-testid `sidebar-add-page`, aria-label and label "Add page") opens a menu.
  - The menu lists a template ("Team health" with the description "Workload and key people, from your connected tools") when available.
  - It also lists each bot as a group header (avatar and name) with that bot's pages underneath.
  - The row renders nothing if nothing is addable. It is hidden in the rail and collapsed modes.
- **Picking a page** calls `sidebarPages.add({pageId})` and navigates to `/app/pages/{botId}/{pageId}`.
- **Sidebar row.** It shows the page title with the bot avatar. Its hover menu (aria-label "Page options") has "Remove from sidebar". Removing while on that page navigates to `/app`.
- **Group menu.** `SidebarPagesGroup` has "Show in sidebar", "Expand {title}" and "Collapse {title}".
- Spec says deleting a page removes its sidebar rows (not verified).

### 7. Snapshot sharing
Files: the `pages.share` handler at apps/api/src/router.ts:4520 (calls `sharePageSnapshot`), apps/web/src/components/ArtifactShareDialog.tsx, App.tsx:118 (route `/s`).
- Options menu, "Share" calls `pages.share`. It returns `{url: {webOrigin}/s#{token}, expiresAt, artifactId}`.
- **Dialog** (`CopyLinkDialog`), title "Share link".
  - Note: "Anyone with this link can view this version until you stop sharing or for 30 days." Or, with an expiry: "Anyone with this link can view this version until {date}."
  - Second line: "Links are shown once. Replacing this one stops the old link."
  - Buttons: "Replace link" and "Stop sharing".
  - "Stop sharing" opens a confirmation titled "Stop sharing this link?" with "Cancel" and "Stop sharing". It calls `artifactShares.revoke({artifactId})`.
- The public route `/s#token` is a static view-only copy. By design it holds no source URL, key or call, and it is frozen. Not verified in a browser.

### 8. Bot tools (packages/adapters/src/builtin-tools.ts ~525-648, names in packages/contracts/src/builtin-tools.ts)
- `page_list`: lists the bot's pages (title, revision, updated). Read-only.
- `page_create {title, kind: "blocks"|"html"}`: the title is up to 60 characters and a bot has up to 20 pages. `kind` is fixed at creation.
- `page_read {page?}`, `page_write {content, baseRevision, page?}` and `page_edit {old_string, new_string, baseRevision, page?}`. A stale revision saves nothing and returns the current page. `page_write` and `page_edit` are limited to 200,000 characters and 20 charts. The bot is told not to start with a heading that repeats the title.
- `page_source_list {page?}`
- `page_source_set {page?, name, kind: praci|mcp|http, url?, secret?, accept?: json|csv, server?, tool?, args?, schedule: 15m|1h|6h|1d|1w (default 1h)}`
  - A praci source runs once immediately and returns a preview of up to 4,000 characters.
  - mcp and http sources return pending until the owner allows them.
  - The praci tool allowlist is `PRACI_SOURCE_TOOLS` in packages/adapters/src/praci-source-tools.ts. The spec lists finance_overview, finance_breakdown, finance_transactions, finance_recurring, cap_table_read, fundraising_read, contacts_list and board_tickets. The file contents were not read.
- `page_source_remove {page?, name}`
- There is no `page_delete` tool. I grepped `packages/adapters/src` and found nothing, so the spec's `page_delete` was not shipped. Only the owner deletes a page, through the UI RPC `pages.remove`.

### 9. RPCs (packages/contracts/src/rpc.ts:932, handlers in apps/api/src/router.ts ~4479-4670)
All keyed by `botId`, with `pageId` optional (default is the first page).
- `pages.get`, `pages.save`
- `pages.list`, `pages.create`, `pages.rename`, `pages.remove`
- `pages.data` and `pages.refresh` (both return `PageData`)
- `pages.share`
- `pages.sources`, `pages.removeSource`, `pages.setSourceSchedule`, `pages.pauseSource`, `pages.resumeSource`

The live `page.updated` and `page.data` thread events refresh open pages.

### 10. Mobile (apps/mobile/app/agent-page.tsx, lib/agent-page.ts)
- Screen "Page" (_layout.tsx:247), reached from the bot thread (thread.tsx:1055 pushes `/agent-page?botId=`). It is also listed in the sidebar section of app/index.tsx, via `sidebarBotPages`.
- **Read-only.** It has a hide/show amounts toggle ("Show amounts" / "Hide amounts"), a page picker (label "Page"), live block statuses, and chart SVGs rendered on the server.
- **Strings:**
  - "Could not load this page."
  - "No page yet."
  - "Chart could not be drawn."
  - "Waiting for approval", "Not approved", "Source not found", "Paused", "No data yet"
  - "Source paused" / "Source failed" as accessibility labels
- HTML pages use `SandboxedHtmlPreview` with `htmlPageDataScript`.
- No share control was found in the mobile screen (grep for "share" returned nothing).

### 11. iOS (apps/ios/Sources/Praci/AgentPages/AgentPageScreen.swift, AgentPageModel.swift, and Packages/RakazoCore/Pages/*)
- Native SwiftUI. The navigation title is the page title, falling back to the bot name or "Page".
- Empty state is "No page yet" (doc icon), plus a primary "Open chat" button.
- A "More" menu (accessibility id `pageMore`) holds a page Picker (when 2 or more pages), "Share" and "Stop sharing" (once a share exists).
- A confirm dialog has "Stop sharing" and "Cancel". Errors show as an alert titled "Something went wrong".
- Block placeholders: "Waiting for approval", "Not approved", "Source not found", "Paused", "No data yet". Warning labels: "Source failed" / "Source paused", with a "Retry" button. Charts show "Chart could not be drawn."
- Amounts are masked via the hide-amounts setting. Display uses `SafeHTMLView`.

## Navigation Structure (routes)
- **Bot chat:** `/app/:botId` (App.tsx:267). The Page side panel opens in place through the header "Page" button, with no URL change.
- **Full-width bot page:** `/app/pages/:botId/:pageId` (App.tsx:266; Shell.tsx:1189 `useMatch`). It is the sidebar target, and the "Waiting for approval" link goes back to `/app/{botId}`.
- **Public share:** `/s#<token>`, checked by `window.location.pathname === "/s"` in App.tsx:118.
- **Mobile:** `/agent-page?botId=...`. **iOS:** `AgentPageScreen`.
- **HTML sandbox frame:** `/html-viewer.html`.

## Data Entities (CRUD)
- **BotPage** (many per bot, max 20): id, botId, title (1-60), kind (blocks|html), content, revision. Revisions are kept in `BotPageRevision`.
  - Create: UI "+" or bot `page_create`/`page_write`. Read: panel, `pages.get/list`. Update: Tiptap autosave, `pages.rename`, bot `page_write/edit`. Delete: UI Delete, `pages.remove` (not the last page, and not from the full-width view).
- **PageSource**: name, kind (praci|mcp|http), call, schedule, status (pending|active|paused|denied), lastRefreshAt, lastError, failures.
  - Create and update: the bot only (`page_source_set`). The owner can change schedule, pause, resume and remove. Approve or deny happens on the chat card.
- **PageSourceSnapshot**: stored history of successful refreshes. Retention is 400 days and at most 2,000 per source, per the spec (retention cron `pages.snapshots.retention`).
- **SidebarPage**: now supports `pageId`. Add and remove from the sidebar UI.
- **ArtifactShare**: created by Share, revoked by "Stop sharing".
- Migrations: packages/db/prisma/migrations/20261231000029_page_sources and ..._030_page_snapshot_budget_index.

## Integrations
- MCP servers (mcp sources). Praci's own data tools (praci sources). Outbound HTTP through a saved bot secret or a keyless safe fetch (http sources, GET only, JSON or CSV, 1 MB, SSRF-guarded).
- The bot secret request card ("Provide secret" / `SecretRequestDialog`) supplies keys.
- Share artifacts at `/s`. graphile-worker for refresh and retention. Thread notifications for approvals.
- Realtime events `page.updated` and `page.data`.

## Error, empty, loading states (exact copy)
- **Panel loads:** nothing renders until the page loads. If it fails to load, a `role=alert` shows the error text, or "Could not save the page." for saves.
- **Empty bot:** no "Page" button at all. The only way to a first page is for the bot to write one.
- **Live blocks:** the strings in the placeholders list above, plus the popover on a failed source.
- **Sources dialog:** "No sources", skeleton rows, inline error.
- **Share errors:** shown as a line inside the share dialog.
- **Mobile:** "Could not load this page.", "No page yet.", "Chart could not be drawn."
- **iOS:** "No page yet", "Open chat", "Something went wrong".
- Mobile and iOS pending blocks are not clickable.

## Demo data available
- `pnpm demo:up` runs packages/testkit/src/cli/demo.ts and seeds through packages/testkit/src/cli/demo/seed.ts. It creates:
  - Chief (first bot), the Inbox agent, the Finance agent (Mercury and Brex with canned tools), the Carta agent (mock cap table), Investors, Legal and other agents.
  - Pins for the Finance agent (Cash, Runway and a month-end checklist).
- **Confirmed absent:** no grep hit for `BotPage`, `PageSource` or page seeding in seed.ts (the only `page` hits are about dashboard and cap-table pages). The demo seeds NO bot pages and NO page sources. A walker must get a page created first.
  - Ask a bot in chat, such as the Finance agent, "Build me a Cash page with page_source_set". Whether the demo bot has a model (the `DEMO_NO_MODEL=1` flag exists) was not checked.
  - Or call the RPCs directly. `pages.create` works for the owner, but the web `rpc` helper in apps/web/e2e/helpers (used by apps/web/e2e/bot-page.spec.ts) is the pattern for seeding a page through `pages.save`.
- **E2E precedent:** apps/web/e2e/bot-page.spec.ts creates a page with a chart and a table through RPC, then opens it with the "Page" button. page-browser.spec.ts is unrelated; its test is about a browser-page helper.
- **Sources in the demo.**
  - praci sources over the finance tools are the safest, since there is canned finance data.
  - mcp sources can use the emulated Carta and finance MCP servers.
  - http sources fail against the real internet, because demo outbound HTTP is emulated. This part is from your brief; I did not find the emulation code.
  - Failure behavior is still worth testing for that reason: the "failed" badge and Retry popover are reachable with an http source.
  - The pending flow for mcp and http can be exercised by asking the bot for one.

## Recommended Story Topics
1. **First page, switching and managing pages.** The bot builds a first page. Then the user adds a second page with "+", renames it, switches between "Pages" tabs, hits the 20-page cap, and deletes a page. Rationale: it covers the panel and its create, rename and delete flows, plus the quirk that there is no "New page" button until a page exists. Files: bot-page-panel.tsx, packages/contracts/src/pages.ts, apps/api/src/router.ts.
2. **Live blocks on a page.** A metric, table, source-backed chart and history chart, with hover timestamps, hide-amounts masking, and the Refresh menu item. Rationale: the core value of the feature. Files: PageLiveBlocks.tsx, page-live.ts, packages/core/src/pages.ts.
3. **Managing sources.** Open "Sources", change the schedule, pause, resume and remove, then see "Source not found" on dependent blocks. Rationale: all the owner controls in one dialog. Files: PageSourcesDialog.tsx, the `pages.*Source*` RPCs, page-source-tick.ts.
4. **Source failure and recovery.** An http source fails against the emulated network, giving the "failed" badge and warning dot, the error popover and Retry, then auto-pause after 5 failures, the bot's pause message, and the bot fixing and resuming the source. Rationale: covers error states and the self-healing loop. Files: PageLiveBlocks.tsx (FailedDot), page-source-tick.ts, page-source-http.test.ts.
5. **Approving an outside source.** The bot adds an mcp or http source and the "Read ... every hour?" card appears with Allow or Not now. A blocked block shows "Waiting for approval" and links to the chat; then check "Allowed", "Not approved" and re-approval after a call change. Rationale: the main security flow and the trust boundary. Files: page-source-approval.ts, AskCard.tsx, AskCardPageSource.test.tsx.
6. **HTML pages.** A bot writes a `kind: html` page with a `praci-sources` meta tag, the data reaches the page by `postMessage`, and it updates on refresh. Rationale: the second page format and the sandbox. Files: HtmlPageView.tsx, SandboxedHtmlViewer.tsx, public/html-viewer.html, packages/core/src/html-page.ts.
7. **Sidebar and full-width page.** "Add page", then pick a bot's page, open `/app/pages/:botId/:pageId`, use the header options menu, and use "Remove from sidebar". Rationale: the main persistent entry point. Files: SidebarPages.tsx, AddSidebarPage.tsx, SidebarPagesGroup.tsx, BotPageView.tsx.
8. **Sharing a snapshot.** Share, copy the link, open `/s#token` logged out, then Replace link and "Stop sharing". Rationale: the only public exposure. Files: ArtifactShareDialog.tsx, the `pages.share` handler, artifact-share.ts.
9. **(Optional, lower priority) Mobile and iOS read-only views.** The page picker, hide-amounts, block placeholders, and iOS Share and Stop sharing. Rationale: a cross-surface check. Files: apps/mobile/app/agent-page.tsx, AgentPageScreen.swift.

Unconfirmed items: the praci tool allowlist contents, the exact `threads.answer` approval handling, whether the demo bots have a working model, the demo HTTP emulation code, the public share page's visible copy, and the "Refresh" once-a-minute rate limit. Where the spec and the code differ, the code above is what shipped.
