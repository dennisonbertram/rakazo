# LinkedIn: plan and design

Status: plan only. Nothing here is built. Research with a source URL for every claim: `docs/linkedin/research.md` (read 2026-11-05). Format follows `docs/brex-cards/README.md`.

## Summary

A founder can connect their own LinkedIn account and have approved GTM posts published on it without Zernio. That is the whole v1, because it is almost the whole of what LinkedIn gives a normal app.

LinkedIn's API is much smaller than most people expect. Without partner approval an app can do two things: sign the member in and post as the member. It cannot read anything back, not even the member's own posts. Company pages, comments, reactions and analytics need the Community Management API, which LinkedIn grants only to registered companies after a review. Feeds, people search, connections, messages and invitations are closed or partner-only.

So v1 is a native adapter, not an MCP server: a LinkedIn connection plus a second dispatch route behind the existing GTM `gtm_post` tool. The Brex-style in-process MCP server and a LinkedIn agent come in phase 2, after LinkedIn approves Community Management, when there are page posts, comments and statistics for an agent to read and act on.

## What LinkedIn allows (findings)

Section numbers refer to `research.md`.

### Self-serve, for any developer app (§1)

| Product | Scopes | What it allows |
|---|---|---|
| Sign In with LinkedIn using OpenID Connect | `openid`, `profile`, `email` | `GET /v2/userinfo`: name, picture, email, the member id (`sub`) used as the post author. |
| Share on LinkedIn | `w_member_social` | Create a post as the member: text, a link, an image or a video, via `POST /v2/ugcPosts` and `POST /v2/assets?action=registerUpload`. Documented limits: 150 requests per member per day, 100,000 per app per day. |

These three scopes are the only "open permissions" ([getting-access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)). The Share on LinkedIn page documents only the legacy `/v2/ugcPosts` route, which I re-read on 2026-11-05 ([share-on-linkedin](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin)). The newer versioned `/rest/posts` lists `w_member_social`, but no page says a Share-only app may call it (unknown, §2.2). Document posts exist only on the versioned Documents API, so they are unknown for a Share-only app too.

A self-serve app **cannot**: read the member's posts, comments or reactions (`r_member_social` is closed to new requests, [overview FAQ 6](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview)); see post statistics; post as a company page; or list the comments it would reply to.

### Needs Community Management approval (§1, §2.3 to §2.6)

Post as a company page the member administers (`w_organization_social`), list the member's pages (`organizationAcls`), read page posts, comments and reactions, reply and react as the page or as the member, page share and follower statistics, follower count, and member post analytics (`r_member_postAnalytics`). Webhooks for page comments, likes and shares exist only at the Standard tier.

Requirements ([app review](https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review)):
- "Only available to registered legal organizations for commercial use cases." Personal email addresses fail vetting.
- A verified business email, a verified company page, a verified website, and the app verified by the page's super admin.
- Development tier first: 500 calls per app and 100 per member per day, no webhooks, 12 months to finish. Then Standard tier: a privacy policy, a screencast of every use case, and test credentials.
- Request it on a **new app with no other products** (overview FAQ 4). Whether Sign In or Share can be added afterwards is unknown. The Community Management scope set includes `w_member_social` and `r_basicprofile` but not `openid`, so identity would come from `/v2/me`.
- A rejected app cannot re-apply; a new app is needed. No published review time.

### Not available at all to a startup's app (§3)

| What the owner might expect | Reality |
|---|---|
| Read the home feed | No API. Community Management data may not be used in a "social feed" use case. |
| Search people | No API. Mention typeahead exists only for tagging in page posts. |
| List connections | Connections API is "restricted to those developers approved by LinkedIn". |
| Send messages | Messages API is "restricted to approved partners", and even partners may not send on "an automated or scheduled event". |
| Send invitations | Invitations API is "restricted to approved partners". |
| Sales Navigator, Recruiter | Separate partner programs. |
| Use member data for sales, leads, recruiting, ads or CRM enrichment | Prohibited ([restricted uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases)). |

Scraping or browser automation of linkedin.com is forbidden by the API Terms (§3.1) and the User Agreement (§8.2). The popular community LinkedIn MCP servers work this way (§6), so none of them is a candidate.

### OAuth, limits, versions (§4)

- Authorization-code flow with a client secret. Redirect URLs must be absolute HTTPS. PKCE exists only as a native flow that LinkedIn enables per app on request.
- Access tokens last 60 days. Refresh tokens are only for approved Marketing partners (365 days). Without them the member re-runs the flow; LinkedIn skips the consent screen while they are logged in.
- Rate limits are daily per app and per member, mostly unpublished; the Developer Portal's Analytics tab shows them. 429 when exceeded.
- Versioned calls need `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`. There is no default version. Each monthly version is supported for at least one year, then calls with it fail.
- Webhooks: Community Management Standard tier only, for page posts. HMAC challenge every 2 hours; each delivery is signed. The subscription dies when the admin's token expires.

### Terms that constrain an agent (§5)

1. **"Use the Content or the APIs to automate posting on the LinkedIn Services"** is prohibited ([API Terms](https://www.linkedin.com/legal/l/api-terms-of-use) §3.1, item 26, re-checked 2026-11-05). LinkedIn does not define it. This design never lets the agent post on its own: the founder approves each post's exact text, media and time. Whether a post published at the approved time (rather than at the moment of the click) counts as automated is unknown. See open question 1.
2. Retention: other members' comments, reactions and posts may be kept 48 hours; other members' profile data 24 hours. A page's own social activity, six weeks (six months if the page connected the app) ([storage requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)). This matters in phase 2 because agent tool output is stored in run history.
3. Member data is used only to manage that Page or Profile and shown only to people associated with it. It may not be exported or combined with other data. In practice no training on it (§5).
4. LinkedIn may suspend access "at any time for any reason".

### SDKs and existing MCP servers (§6)

- The official SDKs (`linkedin-developers/linkedin-api-js-client`, `-python-client`) are under a proprietary licence that forbids public copies, and they have had no release since 2023. We write a small HTTP client.
- No official LinkedIn MCP server was found.
- The community servers either scrape (stickerdaniel, eliasbiondo, alinaqi), have no licence, or are small official-API wrappers (souravdasbiswas, MIT; Dishant27, MIT) with no code review done. None is AGPL. Ideas taken: none beyond the obvious tool split; nothing is reused.

## Decisions

### 1. v1 is a native adapter and a GTM destination, not an MCP server

Self-serve access gives one useful write (create a post) and no reads. Posting already has one path with exact-match approvals: GTM's `gtm_post` (`docs/plans/gtm-bot.md` §5, `packages/adapters/src/executor.ts`, `packages/adapters/src/gtm-posting.ts`). An MCP server with a single `create_post` tool would add a second way to post, a preset, a binding and an agent, and would have nothing to read. So v1 adds:

- a LinkedIn connection (OAuth, token, status);
- a native dispatch route under `gtm_post` for LinkedIn targets.

Phase 2 (decision 9) adds `packages/linkedin` server code as an in-process MCP server bound like Brex (`rakazo+linkedin://page`, `McpConnector`), because then there are about ten reads and a reply write for an agent. Vendor code lives only in `packages/linkedin` and its binding.

Why not Zernio only: Zernio is a hosted vendor, and AGENTS.md requires that the core product run without one. Zernio stays as an optional destination for the other channels and for LinkedIn accounts without a native connection.

### 2. One way to post: the GTM item is the approval, the target picks the route

GTM already stores a post as a `ScratchpadItem` (`category: public_post`, `channel: linkedin`, `notes` = exact text, `scheduledFor`, `target`). The founder approves it on the GTM page, and `gtm_post({ content, scheduledFor, accountId })` must match it exactly and consumes it once before any network call.

- `target` / `accountId` for a native account is `linkedin:<connectionId>` (v1: the member) and later `linkedin:<connectionId>:org:<orgId>` (phase 2). A Zernio account id never has that prefix.
- The executor branch at `name === GTM_POST_TOOL` resolves the route from the consumed item's target: the `linkedin:` prefix goes to the native route, anything else to Zernio, unchanged. The Zernio API-key check moves inside the Zernio route.
- When the space owner has a native LinkedIn connection, the GTM Channels table and the `accounts` list for the LinkedIn channel show only native targets. Zernio LinkedIn accounts are hidden, so there is one way to post to each LinkedIn account.
- Approval binding is unchanged: exact text, exact instant, exact target. Media (decision 6) adds exact hashes.

### 3. Scheduling: a Postgres row plus a delayed job, not the agent

LinkedIn has no scheduled-publish field on the routes we can use; the documented `lifecycleState` for creating is `PUBLISHED` (unknown whether anything else exists for Share apps). Zernio schedules on its side; for the native route we schedule.

- `gtm_post` on the native route writes a `LinkedInScheduledPost` row (below) in the same transaction that completes the effect with `{ state: "queued", postId: <row id> }`, the same result shape Zernio returns, so GTM's proof and stamp logic is unchanged.
- It enqueues a Graphile job `linkedin.publish` with `runAt: scheduledFor` and `replaceKey: linkedin-publish:<rowId>` (`GraphileJobPublisher`, `packages/adapters/src/wakeup.ts`).
- The job claims the row (`status scheduled → publishing` with `updateMany`), re-reads the token, publishes, and stores the post URN. Then it writes the item's proof (`linkedin:<urn>`, then the post URL; see open question 5) and completes the item. No model call is involved after the founder's approval.
- Re-parking or discarding the item before `scheduledFor` cancels the job and marks the row `cancelled`. After `publishing` it cannot be cancelled.
- Outcomes follow the GTM rules. 201 with an id means `published`. 400, 401, 403 or 422 means `rejected`: the item is re-parked with the reason, and a 401 also marks the connection `reconnect`. 429 means `rejected` with "rate limited". A 5xx, a timeout or a missing id means `uncertain`, which is never retried. The founder checks their LinkedIn profile and uses the existing Re-approve, because the API cannot read member posts back.
- A job that finds the row already `publishing` (crashed worker) marks it `uncertain`. It never publishes twice.

```prisma
model LinkedInScheduledPost {
  id           String    @id @default(cuid())   // also the job key and the gtm_post postId
  spaceId      String
  userId       String
  connectionId String
  effectId     String    @unique                // the gtm_post ExternalEffect
  itemId       String                            // ScratchpadItem, not cascading
  authorUrn    String                            // urn:li:person:<sub>, later urn:li:organization:<id>
  content      String
  media        Json      @default("[]")         // [{ sha256, kind, fileRef }], decision 6
  scheduledFor DateTime
  status       String                            // scheduled | publishing | published | rejected | uncertain | cancelled
  postUrn      String?
  error        String?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  @@index([spaceId, userId, status])
  @@map("linkedin_scheduled_posts")
}
```

The table is registered in `packages/db/src/row-security.ts` with tenant and system policies, like `brex_card_reservations`.

### 4. The connection

The LinkedIn connection reuses the managed-connector path that Gmail uses (`GoogleConnector` in `packages/adapters/src/google-connector.ts`, created by `IntegrationProviderSettings` in `packages/adapters/src/integration-provider-settings.ts`).

- **App credentials.** The operator enters the LinkedIn app's client id and secret once in Settings → Integrations, stored encrypted as `IntegrationProviderConfig` id `linkedin`, like Google. There are no environment variables, per AGENTS.md. Each self-hoster creates their own LinkedIn app. Hosted Praci uses one app (open question 3).
- **Connect.** `begin` builds the authorization URL with scopes `openid profile email w_member_social` and a signed `state`. The callback exchanges the code, calls `/v2/userinfo`, and stores one `Connection` row (`connectorId: "linkedin"`, `provider: "linkedin"`, `providerRef: <sub>`, `displayName: <name>`, `secretId` → `Secret` holding `{ accessToken, expiresAt, scopes }`). `metadata` holds `{ personUrn, expiresAt, apiVersion }` and nothing else from the profile. One connection per space user. Connecting a second LinkedIn member is allowed (each is its own row and target).
- **The redirect is the API's HTTPS URL.** LinkedIn requires HTTPS, so a local stack on plain `http://localhost` cannot complete a real connect. Phone access already uses Tailscale Serve for HTTPS, and the same applies here. The demo stack uses the emulator, which accepts any redirect.
- **Status and reconnect.** Statuses are `connected` and `reconnect`, the same ones Gmail uses. A connection becomes `reconnect` on any 401, or when `expiresAt` has passed. From 7 days before `expiresAt`, the GTM Channels row and the integration tile show the existing "Reconnect" action. Reconnecting re-runs the flow, which LinkedIn completes without a consent screen while the member is logged in. Reconnect replaces the secret and keeps the row id, so scheduled posts keep their `connectionId`. A scheduled post whose publish time falls after `expiresAt` is flagged on its card at approval time. No refresh tokens in v1 (self-serve apps do not get them).
- **Disconnect.** It deletes the secret, cancels this connection's `scheduled` rows (items re-park with "LinkedIn disconnected"), and calls no LinkedIn revoke endpoint, because none is documented for this flow (unknown).
- **Desktop** (Electron) hosts the web UI and connects through the API server's redirect, so nothing desktop-specific is needed. PKCE native is not used: it is not self-serve. **Mobile** (Expo and the native iOS app): connect opens the same web flow in the system browser, through the existing integrations settings screen. Approving posts happens on the GTM page, which has no native mobile screen today (`docs/plans/gtm-bot.md`, "Not built"), so v1 adds no mobile UI. iOS and Expo just list the connection with its status.

### 5. Rate limits and API versions

- Posting volume is tiny compared with 150 calls per member per day. The client counts nothing. A 429 is a definite "not posted" and re-parks the item. In phase 2 the reads go through one small client-side backoff (the Granola pattern, `packages/adapters/src/granola-meeting-source.ts`).
- v1 calls only `/v2/userinfo`, `/v2/ugcPosts` and `/v2/assets`, which take no `Linkedin-Version` header. Phase 2 uses `/rest/*` with one pinned constant, `LINKEDIN_API_VERSION` in `packages/linkedin/src/version.ts`, not an environment variable. A pure `versionSunset(version)` returns version + 12 months. A unit test with an injected date checks it. The connection status API returns `versionExpiresSoon` when fewer than 60 days remain, and the operator's integration page then shows "Update needed". Upgrading is a one-line PR plus the emulator's accepted versions.

### 6. Media and the approval hash

v1 posts text and a link. A URL inside the text is posted as text. An `ARTICLE` share with `originalUrl` is used only when the item has exactly one link card; the founder approves its title and description too, because they are part of what is posted (and the versioned Posts API does not scrape URLs at all). Images and video come in slice 6:

- A post item gets `media: [{ fileRef, sha256, kind: "image" | "video", altText? }]`. `fileRef` points at a file in the space's existing object store (`packages/adapters` S3/MinIO store), uploaded by the founder or produced by the agent before approval.
- The approval card shows each image (or the video's first frame and duration) with its hash prefix. Approval covers `content + scheduledFor + target + media[].sha256` (the hashes join `GtmPostInputSchema`, and `approvalEffectKey` already hashes the whole input).
- At publish time the job reads the bytes, recomputes SHA-256, and refuses (`rejected`, re-park "Media changed") on any mismatch. It then registers the asset, uploads it, and posts. What was approved is byte-for-byte what is posted.
- Documents (PDF carousels) need the versioned Documents API. That route is unknown for Share-only apps, so documents wait for phase 2 or a successful live probe.

### 7. No LinkedIn agent in v1

The GTM agent drafts LinkedIn posts. There is nothing else for a LinkedIn agent to do without read access. The GTM agent keeps its fixed tool list. `gtm_post` remains available only while an approved, unconsumed post exists, and it always takes the mandatory approval path (no saved rules, no Auto Review, no "Always allow"). LinkedIn text written by the agent comes from its own drafting, so nothing new enters the exfiltration firewall's taint model in v1.

### 8. Tenancy and security

- Every query is scoped by `spaceId` and `userId`. The publish job loads the row with the space context (`runAsSystem` then a space-scoped load, as other jobs do) and refuses when the connection's space or user differs from the row's.
- A target `linkedin:<connectionId>` is accepted only if that connection belongs to the run's user in the run's space and is `connected`.
- The token is sent only to `api.linkedin.com` and `www.linkedin.com` (`secureFetch` with `allowedHosts`, as Zernio does). The upload URL that `registerUpload` returns must be on `api.linkedin.com`, otherwise it is refused. Tokens never appear in logs or errors (`sanitizeConnectorError`).
- What LinkedIn data is stored: the member's own id, name and token (allowed without a time limit for the authenticated member, §5), and our own post rows. No other member's data is stored in v1.

### 9. Phase 2, after Community Management approval (designed, not sliced in detail)

Owner prerequisite: a new LinkedIn app with only Community Management, approved at Development tier and then Standard. The connection switches to that app. Its scopes are `r_basicprofile w_member_social w_organization_social r_organization_social rw_organization_admin r_member_postAnalytics` plus the `*_feed` comment scopes; the exact strings are checked on the Auth tab (unknown §2.4). Identity then comes from `/v2/me`.

- **Page targets.** At connect and reconnect, `organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED` lists pages. Each becomes a GTM target `linkedin:<connectionId>:org:<orgId>`, and the publish job posts with `author: urn:li:organization:<id>` on `/rest/posts`.
- **In-process MCP server** `createLinkedInServer` in `packages/linkedin/src/server.ts`, endpoint sentinel `rakazo+linkedin://page`, bound in `McpConnector` exactly like `rakazo+brex://cards`. Closed preset `INTEGRATION_PRESETS.linkedin`.
- **A LinkedIn agent** is provisioned with `ensureIntegrationAgent`. `writesEnabled` is false and every write is a forced write with mandatory approval. The agent may not delegate (as for Carta). Its runs are marked externally tainted from the start, because comments are text written by strangers.
- **Retention.** Tool results from `list_comments` and `list_reactions` contain other members' data. A daily job redacts those tool-result payloads in run history once they are older than 48 hours, and the tools never write comment text into memory, pages or the scratchpad (enforced by marking them firewall-tainted). Statistics and our own page posts are kept no longer than six weeks.
- **Webhooks** (Standard tier): `POST /webhooks/linkedin` in `apps/api`. It answers the HMAC challenge, verifies `X-LI-Signature` on the raw body, dedupes by notification id, and wakes the LinkedIn agent with the comment URN only.

Tool list (all on `/rest/*` with the pinned version):

| Tool | R/W | Input → output | Scope (product: CM = Community Management) |
|---|---|---|---|
| `get_me` | R | `{}` → `{ personUrn, name, pages[] }` | `r_basicprofile`, `rw_organization_admin` (CM) |
| `list_page_posts` | R | `{ orgId, count≤50, start? }` → posts `{ urn, text, createdAt, url? }` | `r_organization_social` (CM) |
| `list_comments` | R | `{ postUrn, count≤50 }` → `{ commentUrn, actorName, text, createdAt }` (tainted) | `r_organization_social_feed` (CM) |
| `get_post_stats` | R | `{ orgId, postUrns[]≤20 }` → impressions, clicks, likes, comments, shares | `rw_organization_admin` (CM) |
| `get_page_stats` | R | `{ orgId, from, to }` → share stats over time | `rw_organization_admin` (CM) |
| `get_follower_stats` | R | `{ orgId, from?, to? }` → total (`networkSizes`) and gains | `rw_organization_admin` (CM) |
| `get_my_post_stats` | R | `{ postUrn? }` → impressions, reach, reactions, comments | `r_member_postAnalytics` (CM) |
| `reply_to_comment` | W | `{ postUrn, parentCommentUrn, as: "member" \| orgId, text, parentExcerpt }` → `{ commentUrn }` | `w_organization_social_feed` / `w_member_social_feed` (CM) |
| `delete_post` | W | `{ postUrn, textExcerpt }` → `{ deleted }` | `w_member_social` / `w_organization_social` (CM) |

Posts to pages still go through GTM. There is no `create_post` tool. The `reply_to_comment` approval card shows the parent comment's excerpt and the exact reply. The server re-reads the parent at dispatch and refuses if the excerpt does not match, as Brex re-checks card names.

Cut from phase 2: reactions as writes, comment deletion, editing posts, Page messaging, events, ads.

## Offline emulator and fixtures

`packages/linkedin/src/emulator.ts`, `LinkedInApiEmulator`, follows the `BrexApiEmulator` and `GranolaApiEmulator` pattern: `node:http` on 127.0.0.1, `start()` returns base URLs, a `requests[]` log, and injectable failures (`failNext(status)`, `timeoutNext()`, `expireTokens()`).

- **v1 routes.** `GET /oauth/v2/authorization` redirects straight back with a code, so the demo has no consent screen. `POST /oauth/v2/accessToken` returns a 60-day token. `GET /v2/userinfo` returns an invented member ("Demo Founder", `sub: demo-member-1`). `POST /v2/ugcPosts` validates the body shape, the bearer token and the author, then returns 201 with `x-restli-id`. `POST /v2/assets?action=registerUpload` returns an upload URL on the emulator. `PUT|POST /mediaUpload/...` stores the bytes and their hash, so tests can assert that what was uploaded is what was approved.
- **Phase 2 routes.** `/rest/posts`, `/rest/organizationAcls`, `/rest/socialActions/{urn}/comments`, statistics, `/rest/networkSizes`. These reject a missing `Linkedin-Version` or `X-Restli-Protocol-Version` header and a version outside the accepted list.
- **Base URLs** come in through a composition-root override `linkedinApi?: { apiBaseUrl, authBaseUrl, fetch }` on the API and worker (the `brexApi` pattern). There is no environment variable.
- **Demo.** `packages/testkit/src/cli/demo.ts` and `emulated-app.ts` start the emulator, seed an `IntegrationProviderConfig` for `linkedin` with placeholder credentials, and connect the seeded user. The GTM demo data gets one approved LinkedIn post scheduled 15 minutes ahead and one parked draft.

All tests run against the emulator or pure functions. No test touches linkedin.com.

## User-facing copy

Only what v1 needs, and mostly existing strings:

| String | Where | Why it is needed |
|---|---|---|
| "LinkedIn" | Integrations tile and connection name | Names the connection. |
| "Client ID" / "Client secret" | Operator settings for the LinkedIn app (same form as Google's) | The operator must paste the app's credentials; reuses Google's labels. |
| "Reconnect" | Existing action, shown on the LinkedIn tile and GTM channel row from 7 days before expiry | LinkedIn tokens expire after 60 days and cannot be refreshed. |
| "LinkedIn disconnected" / "Media changed" / "Rate limited" | Re-park reason on a GTM item | The founder needs to know why an approved post did not go out. Shown only when it happens. |
| "Update needed" | Operator integration page, only within 60 days of the API version sunset (phase 2) | Otherwise posting stops without warning. |

No explainer text. The GTM channel row already shows connection state, and the approval card already shows the post.

## Pull requests (v1)

Verification commands follow `docs/brex-cards/README.md`: `pnpm vitest run <files>`, `pnpm test:integration` for `*.postgres.test.ts`, and `pnpm --filter <package> check` for every package touched. Hand test with `DEMO_SLOT=<n> pnpm demo:up`. No two slices own the same file.

### Slice 1. Contracts and schema
- Owns: `packages/contracts/src/linkedin.ts` (new: `LINKEDIN_TARGET_PREFIX`, `parseLinkedInTarget`, connection metadata schema, `LinkedInPostStatusSchema`), `packages/contracts/src/integration-provider*.ts` (add `linkedin` to the provider id and config schemas), `packages/contracts/src/index.ts`, `schema.prisma` and migration `<ts>_linkedin_scheduled_posts`, `packages/db/src/row-security.ts`, and the Postgres isolation test.
- Done when: the target parser accepts `linkedin:<id>` and rejects anything else, including Zernio ids; the provider config accepts `{ provider: "linkedin", clientId, clientSecret }`; and cross-space reads and writes of the new table fail.

### Slice 2. `packages/linkedin`: client and emulator
- Owns: `packages/linkedin/**` (`client.ts`, `emulator.ts`, `version.ts`, tests), workspace registration, `pnpm-lock.yaml`.
- Done when, against the emulator:
  - the code exchange, `userinfo` and the text, article and image `ugcPosts` calls round-trip;
  - 401 maps to `auth`, 429 to `rate_limited`, other 4xx to `rejected`, and 5xx, timeout and a missing `x-restli-id` to `uncertain`;
  - the upload host allowlist refuses a foreign upload URL;
  - no token appears in any thrown error;
  - `versionSunset` is tested with an injected date.
- No new dependency: global `fetch`, `zod`, `node:http`.

### Slice 3. Connection
- Owns: `packages/adapters/src/linkedin-connector.ts` (new, `ManagedConnectorProvider`), `integration-provider-settings.ts` (one branch), the API connect and callback wiring, the web integrations tile and operator settings fields (with stories), and the iOS and Expo list entries (status only).
- Done when:
  - the operator saves credentials;
  - the user connects through the emulator and gets one `Connection` row, a secret and metadata;
  - a 401, or a passed `expiresAt`, sets `reconnect`;
  - reconnect keeps the row id and replaces the secret;
  - disconnect cancels scheduled rows;
  - another user's connection id is refused everywhere.

### Slice 4. GTM native route and publish job
- Owns: the `gtm_post` branch in `packages/adapters/src/executor.ts` (route by target only), `packages/adapters/src/linkedin-publish.ts` (new: queue and job handler), the worker job registration, `apps/api/src/gtm.ts` (accounts and channel status include native targets and hide Zernio LinkedIn accounts when a native connection exists), and demo seams in `packages/testkit`.
- Done when:
  - an approved item with a native target is consumed once, creates one row and one job, and returns `queued`;
  - a mismatched text, time or target is refused before any row exists;
  - the job publishes once at `runAt`, sets proof, and completes the item;
  - a crash mid-publish marks the row `uncertain` and does not post again;
  - re-park before the time cancels the job;
  - 401 re-parks the item and sets `reconnect`;
  - Zernio targets behave exactly as before (the existing `executor-gtm-gates.test.ts` passes unchanged).
- Tests first: `linkedin-publish.postgres.test.ts`, plus new cases in `executor-gtm-gates.test.ts`.

### Slice 5. Web and hand test
- Owns: GTM channel row and post card changes (reconnect state, the "expires before publish" flag, re-park reasons), stories, `pnpm design-system`, and e2e `apps/web/e2e/gtm.spec.ts` cases.
- Hand test in `pnpm demo:up`: connect LinkedIn (emulator), approve the seeded post, run the job and see the emulator log one `ugcPosts` call with the exact text, and see proof on the item. Then expire the token: the item re-parks and the row shows Reconnect.
- Live check (owner's own app, in the PR description): connect, approve a "test" post a few minutes ahead, confirm it appears on the profile, then delete it by hand. It is reported as unverified if not run.

### Slice 6. Images and video with hash binding
- Owns: the media field on the GTM item and `GtmPostInputSchema`, the approval card media preview, and the media path in the publish job and client.
- Done when: an approved image posts byte-identical (the emulator stores its hash); a file changed after approval is refused with "Media changed"; video uses the `feedshare-video` recipe; the caps are 1 image or 1 video per post in this slice.

Sequencing: 1, then 2 and 3, then 4, then 5. Slice 6 comes after 4.

Phase 2 slices (written when Community Management is approved): page targets; the in-process MCP server, preset and LinkedIn agent; reply approval card; retention redaction job; webhooks.

## What the owner must do

1. Create a LinkedIn developer app at linkedin.com/developers. LinkedIn asks for a company page to associate with the app; whether a page is required for self-serve products is unverified. Add the products **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn**. Add the redirect URL `https://<your Praci host>/api/integrations/linkedin/callback` (the final path is set in slice 3).
2. Paste the client id and secret into Praci: Settings → Integrations → LinkedIn. Keep them out of the repo.
3. Run the live check in slice 5.
4. For phase 2: create a **second, new** app with only the Community Management API. Use a business email and the company's verified page; a page super admin verifies the app. Request Development tier, finish within 12 months, then request Standard tier with a privacy policy, a screencast of each use case and test credentials. Expect discretionary review with no published timeline.

## Cut ideas (not planned)

- Reading the feed, people search, connections, messages, invitations: not available (see findings).
- Browser automation or scraping as a fallback: forbidden by the terms.
- A `create_post` MCP tool or any second posting path.
- Auto-reply to comments, reactions as writes, editing posts, polls, multi-image, documents (until the versioned route is confirmed), and video longer than the documented limits.
- Using LinkedIn data for CRM enrichment or lead lists: prohibited.
- Exposing LinkedIn tools on Praci's public MCP server (`docs/mcp-server/PLAN.md`). Outside clients ask the agent instead.
- Refresh-token handling (self-serve apps do not get refresh tokens).
- A native mobile GTM screen.

## Open questions for the owner

1. **Publish at the approved time, or only at the moment of approval?** The API Terms forbid using the API "to automate posting", without defining it. Recommendation: publish at the approved time. The founder approves the exact text, media and time of each post, no model acts after approval, and this matches how GTM already works through Zernio. Alternative: publish immediately when Approve is clicked, which is the most conservative reading but loses scheduling.
2. **Hide Zernio's LinkedIn accounts once a native connection exists?** Recommendation: yes, so each LinkedIn account has one posting route. Zernio stays for X, Threads and Bluesky.
3. **Hosted Praci: one LinkedIn app for all customers, or bring-your-own app?** Recommendation: self-host and v1 use bring-your-own app credentials (the operator setting above). For hosted, one Praci-owned app for the self-serve products. Phase 2 Community Management is applied for by Praci's legal entity for the hosted service, which matches LinkedIn's "Page Management" use case for a tool vendor. Customers who self-host apply themselves.
4. **Apply for Community Management now?** It is the only way to company-page posting, comments and statistics, and review is discretionary with no timeline. Recommendation: yes, apply now with a new app, in parallel with v1. v1 does not depend on it.
5. **Proof URL.** The API returns a post URN, not a URL. Building `https://www.linkedin.com/feed/update/<urn>/` is common but not documented on any page we read. Recommendation: store `linkedin:<urn>` as proof and show the URL built from it as a link, marked as unverified until the live check confirms it opens the post.
6. **v1 media: text and links only, with images and video in slice 6?** Recommendation: yes. Text and links cover most founder posts, and slice 6 follows directly.
