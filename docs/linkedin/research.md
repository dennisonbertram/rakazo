# LinkedIn API research (official sources only)

Researched 2026-11-05. Read-only: no app created, no login, no API call made.
Every claim has a URL. "Unknown" means no official page I could read confirms it. Doc "last updated" values come from each page's front matter (`ms.date` / `updated_at`) or footer.

Base docs host: `https://learn.microsoft.com/en-us/linkedin/` (abbreviated `L/` below). Marketing docs are versioned; the default view at fetch time was `li-lms-2026-10`.

## 0. Headline findings

1. A self-serve app gets only three open permissions: `profile`, `email` (Sign In with LinkedIn using OpenID Connect) and `w_member_social` (Share on LinkedIn). Source: https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access (ms.date 2025-06-24, updated_at 2026-06-03): "Open Permissions are the only permissions that are available to all developers without special approval."
2. With only self-serve products you can post as the member but cannot read anything back. `r_member_social` is closed ("We're not accepting access requests at this time"). Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview (FAQ 6, ms.date 2026-03-31).
3. Posting as a company page, replying as a page, page analytics, and any reading of page posts/comments need the Community Management API (vetted, two tiers). It is limited to "registered legal organizations for commercial use cases only", needs a verified business email, a verified page and a page super-admin to verify the app. Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review (ms.date 2023-01-10, updated_at 2026-02-11).
4. The general API Terms of Use say you must not "Use the Content or the APIs to automate posting on the LinkedIn Services." This is the main legal constraint on an autonomous agent. It must be resolved with LinkedIn or handled by making every post an explicit, member-initiated action. Source: https://www.linkedin.com/legal/l/api-terms-of-use (last revised 2022-12-13), Section 3.1, item 26 (re-checked 2026-11-05). The Marketing API terms say they control over the API Terms where they conflict (Section 1.3) and do not contain a matching automation clause, but I found no page that says Community Management apps are exempt. Source: https://www.linkedin.com/legal/l/marketing-api-terms (last revised 2025-07-25).
5. Data retention is short. Member social activity data (other people's comments, reactions, posts): 48 hours. Other members' profile data: 24 hours. Your own page's social activity: six weeks (six months if the page authenticated into your app). Source: https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements (updated_at 2026-02-02).
6. No official LinkedIn MCP server found on any official page (absence of evidence; see section 6). Official SDKs exist but are under a proprietary LinkedIn license, not open source.

## 1. Products and access levels

| Product / program | Access | Review process and requirements | Source |
|---|---|---|---|
| Sign In with LinkedIn using OpenID Connect (`openid`, `profile`, `email`) | Self-serve | Add the product on the app's Products tab. LinkedIn states it "does not verify user identities". | https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2 (ms.date 2022-12-14, updated_at 2024-08-08); getting-access page above |
| Share on LinkedIn (`w_member_social`) | Self-serve | Add the product on the Products tab. Rate limits listed on its page: 150 requests/day per member, 100,000/day per application. | https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin (ms.date 2021-02-05, updated_at 2023-12-14) |
| Community Management API | Vetted product, Development tier then Standard tier | See subsection below. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview ; https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review |
| Advertising API (also grants `w_organization_social`, `r_organization_social`, `rw_organization_admin`, `r_organization_admin`, `w_member_social`, `r_basicprofile`) | Approval required | Apply on the Products tab; Development then Standard tier (Standard via support ticket). | https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access (ms.date 2026-10-14) ; https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access |
| Events Management API (`r_events`, `rw_events`) | "self-serve API product on request" | Apply from Products tab. | https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access |
| Lead Sync, Conversions, Matched Audiences | Approval required (open to approved developers) | Separate access forms. | https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access |
| Audience Insights, Media Planning | Restricted: extra criteria, case by case, no fixed timeline | Application survey. | https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access |
| Company Intelligence API | Closed to new applications | "not currently accepting new applications". | https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access |
| Sales Navigator Application Platform (SNAP) | Partner approval ("must be approved as a SNAP partner") | Partner application at business.linkedin.com. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access |
| Talent: Recruiter System Connect, Apply Connect, Apply with LinkedIn, Premium Job Posting | Partner application | Partner application at business.linkedin.com. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access |
| Learning | Request-access page | Separate "Request API Access" process. Details not read. | linked from getting-access page above |
| Compliance (`r_compliance`, `w_compliance`) | Closed: "may not be requested" | n/a | https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access |
| Messages API | "restricted to approved partners" | n/a | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages |
| Connections API (`r_1st_connections`) | "restricted to those developers approved by LinkedIn" | n/a | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api |
| Connections Size API (`r_1st_connections_size`) | "must apply and be accepted to one of LinkedIn's Partner Programs" | n/a | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-size |
| Invitations API | "restricted to approved partners" | n/a | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations |
| Member Data Portability (Member) | Self-request, but only for members in the EEA and Switzerland | Requires using a LinkedIn-provided default company page when creating the app. Data-export oriented, not a posting API. Not explored further. | https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/ |

Note: `r_basicprofile` appears only under Advertising and Community Management in the permission tables, not as an open permission. Source: https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access (permissions table). `r_liteprofile` still appears for Lead Sync and Conversions.

### Community Management API: process and requirements

- Tiers: "Development Tier: Initial approval with limited API call volume. Standard Tier: Full access requiring upgrade from Development Tier." Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
- Development tier limits: 500 calls/app/24 h, 100 calls/member/24 h, no BATCH_GET calls at all, "Webhook for Social Actions: Push notifications disabled", and the integration must be finished within 12 months. Standard tier: "No restrictions". Source: https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access (tier table; page ms.date 2026-10-14). The overview FAQ 3 also states 500/100.
- Development-tier review checks: approved use case, verified business email, verified organization, verified website/domain, and the app verified by the LinkedIn Page of the same organization (page super admin does the verification). Rejection means you must create a new app; you cannot re-apply with the same app. Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review
- "At this time, our Community Management APIs are only available to registered legal organizations for commercial use cases only." "Personal email addresses won't pass the vetting process." Same source.
- Standard-tier review: standard access form, valid privacy policy, compliance with terms and data storage requirements, a high-resolution screencast of the app showing each use case (OAuth consent, posting to the page or profile, how commenter data is displayed, which commenter profile fields are shown, aggregate engagement), plus test credentials. Same source and https://learn.microsoft.com/en-us/linkedin/marketing/quick-start (ms.date 2026-02-16).
- Use-case categories in the form: Page Management, Brand Engagement, Page Analytics, Executive Management (member posting to own profile), Employee Advocacy. Source: community-management-app-review.
- Review timeline: unknown. No official page gives a number of days. For restricted programs, "no fixed timeline" (increasing-access page).
- Must Community Management be the only product on the app? Partly confirmed. FAQ 4 on the overview page: the request option is grayed out unless you "only request Community Management API Development tier access with new developer applications that don't have access to other API products." Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview. FAQ 1 and 5 describe a workaround only for apps that already have Advertising API: create a fresh app, get Dev then Standard approval, then request Standard on the existing Ads app by quoting the new app's client ID. Whether Sign In with LinkedIn or Share on LinkedIn may be added to the same app after Community Management is approved: unknown (not stated). Note that the Community Management permission set (increasing-access page) includes `w_member_social` and `r_basicprofile` but does not list `openid`/`profile`/`email`, so identity may have to come from `/v2/me` via `r_basicprofile`; unconfirmed.
- Approval can be refused even if you meet the minimums: "LinkedIn reserves the right to review applications and select partners at its discretion." Source: increasing-access.
- Developer-portal product page (qualification checklist): https://developer.linkedin.com/product-catalog/marketing/community-management-api (fetched 2026-11-05; no date shown).

## 2. Scopes and endpoints

All versioned endpoints live under `https://api.linkedin.com/rest/...` and need headers `Linkedin-Version: YYYYMM` and `X-Restli-Protocol-Version: 2.0.0`. Source: https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api (ms.date 2026-05-07, updated_at 2026-05-13): "All APIs require the request header Linkedin-Version ... All APIs require the request header X-Restli-Protocol-Version: 2.0.0". The legacy `/v2/...` endpoints (e.g. `/v2/ugcPosts`, `/v2/assets`, `/v2/me`, `/v2/userinfo`) are still what the Share on LinkedIn and Sign-In pages document.

### Realistic reachability summary for a founder's own self-hosted app

| Need | Product required | Founder-realistic? |
|---|---|---|
| Identify the member (name, picture, email, person id) | Sign In with LinkedIn (OIDC), self-serve | Yes |
| Post as the member (text, link, image, video, document, multi-image) | `w_member_social`; Share on LinkedIn (self-serve) or Community Management | Yes for the product; see unknowns on which API surface (below) |
| Read the member's own posts, comments, reactions | `r_member_social` (closed) | No |
| Member post analytics | `r_member_postAnalytics` (Community Management) | Only if Community Management is approved (legal entity) |
| Post as the company page | `w_organization_social` + page role (Community Management or Advertising) | Only after Community Management approval |
| Read page posts/comments/reactions, reply as page | `r_organization_social` / `w_organization_social` (and `_feed` variants) | Same |
| Page analytics and follower count | `rw_organization_admin` / `r_organization_admin` | Same |

### 2.1 Member profile

| Item | Detail | Source |
|---|---|---|
| Scopes | `openid`, `profile`, `email` | https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2 |
| Endpoint | `GET https://api.linkedin.com/v2/userinfo` (Bearer). Fields: `sub`, `name`, `given_name`, `family_name`, `picture`, `locale`, optional `email`, `email_verified`. Discovery document: https://www.linkedin.com/oauth/.well-known/openid-configuration. | same |
| Person URN | Needed as `author` for member posts. The Share on LinkedIn page says to get the Person URN from the Sign-In flow (the `sub` value forms `urn:li:person:{sub}`, my inference from the page's wording; the page says "See Sign In with LinkedIn using OpenID Connect to see how to retrieve the Person URN"). | https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin |
| `/v2/me` | Needs `r_liteprofile` (name, photo) or `r_basicprofile` (adds headline, vanity name). Neither is an open permission. | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api |

### 2.2 Posting as the member

| Surface | Detail | Source |
|---|---|---|
| Posts API (versioned) | `POST https://api.linkedin.com/rest/posts`, 201 with post id in `x-restli-id` header. Body: `author`, `commentary`, `visibility`, `distribution{feedDistribution,targetEntities,thirdPartyDistributionChannels}`, `lifecycleState: PUBLISHED`, `isReshareDisabledByAuthor`. Content types, organic: text, image, video, document, article, MultiImage, poll, celebration. Carousel is sponsored only. Permission listed for member posting: `w_member_social`. The Posts API "replaces the ugcPosts API". | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api |
| Article/link | `content.article{source,thumbnail,title,description}`. "The Posts API does not support URL scraping": you must supply title, description and thumbnail (thumbnail is an Images API URN). | same |
| Images | Images API: `POST /rest/images?action=initializeUpload` with `initializeUploadRequest.owner`, upload binary to returned URL, use `urn:li:image:{id}` in the post. Permissions `w_member_social` / `w_organization_social`. GIF up to 250 frames. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api |
| Documents | Documents API `POST /rest/documents?action=initializeUpload`; "can't exceed 100MB and 300 pages"; types PPT, PPTX, DOC, DOCX, PDF. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api |
| Video | Videos API with multipart upload: `initializeUpload` returns `uploadInstructions`, you upload parts, collect ETags, then `finalizeUpload` with `uploadedPartIds`. The page gives conflicting limits: "File size: Between 75kb and 500MB" (in the ads spec section) and "Maximum allowed Videos size is 5GB" (`fileSizeBytes` field). Length "Three seconds to 30 minutes". | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api |
| Multi-image | `MultiImage` content, minimum 2 and maximum 20 images, organic only. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api |
| Legacy ugcPosts | `POST https://api.linkedin.com/v2/ugcPosts` with `specificContent.com.linkedin.ugc.ShareContent`; media via `POST /v2/assets?action=registerUpload`. This is what the Share on LinkedIn page still documents. | https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin |
| Edit | `POST /rest/posts/{urn}` with `X-RestLi-Method: PARTIAL_UPDATE` and `{"patch":{"$set":{...}}}`. Updatable: `commentary`, `contentCallToActionLabel`, `contentLandingPage`, `lifecycleState`, ad-context fields. 204 on success. | posts-api page above |
| Delete | `DELETE /rest/posts/{urn}`, idempotent 204; batch delete unsupported. | posts-api page above |
| Mentions/hashtags | In `commentary`: `@[Name](urn:li:organization:id)`; organization annotations must match the full name exactly; member annotations may match one name part. Member-mention data for followers/connections may not be used for another purpose (Marketing API Terms 3.1(e)(7)). | posts-api page; https://www.linkedin.com/legal/l/marketing-api-terms |

Unknown: whether a self-serve app that has only Share on LinkedIn (no Community Management) may call the versioned `/rest/posts`, `/rest/images`, `/rest/videos`, `/rest/documents` endpoints, or whether it is limited to the legacy `/v2/ugcPosts` and `/v2/assets` flow documented on the Share on LinkedIn page. The Posts API page lists `w_member_social` but does not name the product that grants it. Test with a real app before designing around it.

Unknown: the versioned Posts API rate limits for a self-serve app. The only documented figures for Share on LinkedIn are 150/member/day and 100,000/app/day (page above, which documents ugcPosts).

### 2.3 Posting as an organization

| Item | Detail | Source |
|---|---|---|
| Scope | `w_organization_social`: "Restricted to organizations where the authenticated member has one of the following company page roles: ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER, CONTENT_ADMIN" (the Posts API page; the comments page lists RECRUITING_POSTER instead of CONTENT_ADMIN, so the role lists on the docs disagree). | posts-api page; https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api |
| Endpoint | Same `POST /rest/posts` with `"author": "urn:li:organization:{id}"`. | posts-api page |
| Discover which pages the member administers | `GET /rest/organizationAcls?q=roleAssignee` (add `role=ADMINISTRATOR&state=APPROVED`). Permissions: `rw_organization_admin` (restricted to role ADMINISTRATOR) or `r_organization_admin`. Roles: ADMINISTRATOR, DIRECT_SPONSORED_CONTENT_POSTER, RECRUITING_POSTER, LEAD_CAPTURE_ADMINISTRATOR, LEAD_GEN_FORMS_MANAGER, ANALYST, CURATOR, CONTENT_ADMINISTRATOR. Page roles cannot be granted through the API ("Please use the UI tool"). | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role (ms.date 2026-04-29); quick-start page |
| Product | Community Management or Advertising API only (both list the scope). | increasing-access page |
| Realistic for a founder? | Only through Community Management approval (legal entity, verified page, business email, screencast for Standard). Unknown whether a single-founder startup passes review; the criteria are "registered legal organizations for commercial use cases". | community-management-app-review |

### 2.4 Reading posts, comments, reactions

| Item | Detail | Source |
|---|---|---|
| Page posts | `GET /rest/posts?author={orgUrn}&q=author` needs `r_organization_social`; count max 100, default 10; sort by `LAST_MODIFIED` or `CREATED`. | posts-api page |
| Member posts | `GET /rest/posts?author={personUrn}&q=author` needs `r_member_social`. | posts-api page |
| `r_member_social` | "restricted and is available to approved users only" (posts-api page). "closed ... We're not accepting access requests at this time due to resource constraints." (overview FAQ 6). | posts-api page; community-management-overview |
| Comments API | `GET/POST /rest/socialActions/{shareUrn\|ugcPostUrn\|commentUrn}/comments`, edit via `PARTIAL_UPDATE`, delete via `DELETE ...?actor={orgUrn}`. Comment `actor` is `urn:li:person` (personal) or `urn:li:organization`/`organizationBrand` (comment made on behalf of the org). Permissions on that page use new names: `w_organization_social_feed`, `r_organization_social_feed`, `w_member_social_feed`, `r_member_social_feed` ("Restricted ... granted to select developers only"). | comments-api page (ms.date 2026-04-28) |
| Reactions API | `GET /rest/reactions/(entity:{urn})?q=entity`, `POST /rest/reactions?actor={urn}`, `DELETE /rest/reactions/(actor:..,entity:..)`. Types: LIKE, PRAISE, EMPATHY, INTEREST, APPRECIATION, ENTERTAINMENT (MAYBE deprecated since 202307). "replaces the likes functionality provided by the existing socialActions endpoint". Same `_feed` permission names. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api |
| Social Metadata API | Counts of comments/reactions per post; also toggles comments on or off for a thread. Same `_feed` permissions. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api |

Documentation conflict to flag: the Posts API page and the increasing-access table use `r_organization_social` / `w_organization_social`, while the Comments, Reactions and Social Metadata pages use `r_organization_social_feed` / `w_organization_social_feed` / `w_member_social_feed` / `r_member_social_feed`. The increasing-access permission table lists all of them under Community Management. Which scope strings the developer portal's Auth tab actually shows after approval: unknown. Check the Auth tab.

### 2.5 Replying to comments

- As the organization: `POST /rest/socialActions/{shareUrn|ugcPostUrn|commentUrn}/comments` with `actor: urn:li:organization:{id}`, `object`, `message.text`, and `parentComment` set to the parent comment's composite URN. Page-admin role required. Source: comments-api page ("Create a Comment on a Comment"). Needs Community Management.
- As the member: same endpoint with `actor: urn:li:person:{id}`; scope listed `w_member_social_feed` (comments page) or `w_member_social` (getting-access page: "Post, comment and like posts on behalf of an authenticated member"). Source: comments-api page; getting-access page.
- Comment images are supported (`content[].entity.image`), but not in inline comments (403). Comment creation has a short-term limit: 429 "creation rate limit exceeded for member" (1-minute window). Source: comments-api page.
- Finding comments to reply to: listing comments on a member post needs read permission (`r_member_social_feed`, "select developers only"). For a self-serve app that cannot read comments, replying as the member is only possible if you already hold the comment URN: unknown whether any other route exists. For pages, `GET .../comments` plus the webhook (section 4) cover it, under Community Management.

### 2.6 Analytics

| API | Endpoint and permission | Limits | Source |
|---|---|---|---|
| Org share statistics | `GET /rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity={orgUrn}`; permission `rw_organization_admin` (ADMINISTRATOR). Organic only. Metrics: impressionCount, uniqueImpressionsCount, clickCount, likeCount, commentCount, shareCount, engagement. | Rolling 12-month window; no pagination; per-share stats lifetime only. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics (ms.date 2026-04-28) |
| Org follower statistics | `GET /rest/organizationalEntityFollowerStatistics?q=organizationalEntity...`; permission `rw_organization_admin`. Lifetime: breakdowns by 7 facets, top 100 each. Time-bound: follower gains only, from 12 months back to 2 days ago. | `totalFollowerCounts` no longer returned here. | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics (ms.date 2026-05-12) |
| Follower count | `GET /rest/networkSizes/urn:li:organization:{id}?edgeType=COMPANY_FOLLOWED_BY_MEMBER` returns `{"firstDegreeSize": N}`; `COMPANY_FOLLOWED_BY_MEMBER` applies from v202305 (older versions used `CompanyFollowedByMember`). Permission shown on that page: `rw_organization_admin`. | none stated | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api |
| Page statistics (views, clicks) | Page exists in the docs at `.../organizations/page-statistics`. Endpoint not read in detail. | n/a | listed on community-management-overview |
| Member post analytics | `GET /rest/memberCreatorPostAnalytics?q=entity&entity=(share:urn...)&queryType=IMPRESSION\|MEMBERS_REACHED\|RESHARE\|REACTION\|COMMENT\|...` or `q=me` for all posts. Permission `r_member_postAnalytics`. From version 202604 also POST_SAVE, POST_SEND, LINK_CLICKS, PREMIUM_CTA_CLICKS, FOLLOWER_GAINED_FROM_CONTENT, PROFILE_VIEW_FROM_CONTENT. "Data is best-effort accurate." DAILY aggregation unsupported for some metrics. Entity must be `ugcPost` or `share`. | none stated for retention | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics (ms.date 2026-05-11) |
| Member profile analytics | Permission `r_member_profileAnalytics` (profile viewers, followers, search appearances). Endpoint page not read. | n/a | increasing-access page |
| Member follower count | `r_1st_connections_size` listed for Community Management, but the Connections Size API says partner program acceptance is required. Treat as unknown for a founder. | n/a | increasing-access page; connections-size page |

All analytics scopes belong to Community Management (or Advertising for the org ones). None is self-serve.

## 3. Not available, or partner-only

| Capability | Status | Official evidence |
|---|---|---|
| Read the member's home feed | No official feed-read API found. Closest: reading posts requires closed `r_member_social`, and the restricted-use page forbids "social feed" use cases for Community Management data ("none of the data ... can be used in a social feed use case"). No page states "home feed is unavailable" in those words. | https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases (updated_at 2025-08-29); posts-api page |
| People search | No official people-search API found. The URL `.../shared/integrations/people/people-search` returned HTTP 404 on 2026-11-05. People Typeahead exists only for `@mentions` in org posts (Community Management). Member data from the mention flow may not be reused for other purposes (Marketing API Terms 3.1(e)(7)). Unknown whether any official page says "people search is not offered". | https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview ; https://www.linkedin.com/legal/l/marketing-api-terms |
| Connections list | Connections API (`GET /v2/connections`, `r_1st_connections`): "restricted to those developers approved by LinkedIn"; 1st-degree only, no browsing, no 2nd-degree. `r_network` is not mentioned on any page I read; I did not find that scope in the official permission tables. | https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api |
| Sending messages | Messages API "restricted to approved partners". Requirements even for partners: the message must follow a specific member action ("Member actions do not include an automated or scheduled event"), the member must opt in, and a draft must be shown and editable. A separate "Page Messaging" API exists inside the Community Management program (see Marketing API Terms 1.6); I did not read its docs. | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages ; https://www.linkedin.com/legal/l/marketing-api-terms |
| Sending invitations | Invitations API "restricted to approved partners". | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations |
| Sales Navigator, Talent, Compliance data | Partner programs; Compliance closed. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access |
| Using member data for sales/recruiting/advertising | Prohibited under Community Management ("not be used for advertising, sales, or recruiting use cases ... to identify sales or marketing prospects ... to create leads ... for sending mass messages"). | restricted-use-cases page |
| Accessing a member's network without their express permission | Prohibited by API Terms 3.1. | https://www.linkedin.com/legal/l/api-terms-of-use |
| Organization page management from fake/headless profiles | "No Headless or Fake Accounts: Do not create fake profiles to manage ad accounts or use individual profiles to manage multiple customers' accounts." | restricted-use-cases page |

## 4. OAuth, limits, versioning, webhooks

| Topic | Fact | Source |
|---|---|---|
| Authorization URL | `GET https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id&redirect_uri&state&scope` (scopes space-delimited). Redirect URLs must be absolute HTTPS, no `#`, query params ignored. Authorization code lifetime 30 minutes. User consents to all scopes at once. Changing scopes forces re-consent. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow (ms.date 2025-11-10, updated_at 2026-05-15) |
| Token URL | `POST https://www.linkedin.com/oauth/v2/accessToken` (form-encoded: `grant_type=authorization_code`, `code`, `client_id`, `client_secret`, `redirect_uri`). Client secret is required in this flow. | same |
| Access token lifetime | "Currently, all access tokens are issued with a 60-day lifespan." Tokens are ~500 chars; plan for 1000+. Requesting a different scope than before invalidates earlier tokens. Token inspector and generator tools exist in the Developer Portal. | same; https://learn.microsoft.com/en-us/linkedin/marketing/quick-start |
| Refresh tokens | Programmatic refresh is available "for a limited set of partners" (3-legged page) / "for all approved Marketing Developer Platform (MDP) partners" (refresh page). Refresh token TTL 365 days fixed from first grant; each refresh gives a new 60-day access token. LinkedIn may revoke at any time. Without it, "refresh" means re-running the authorization flow, which skips the consent screen if the user is still logged in to linkedin.com and the token has not expired. Whether a Community Management Standard-tier app receives programmatic refresh tokens: unknown (not stated; the quoted wording says MDP/approved partners). | https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens ; authorization-code-flow page |
| PKCE | Supported only in a "native client" flow: authorize at `https://www.linkedin.com/oauth/native-pkce/authorization` with `code_challenge` (S256) and loopback redirect (`http://127.0.0.1:{port}` or `[::1]`); "please reach out to your point of contact at LinkedIn, and we will enable PKCE OAuth 2 flow for your app." So it is not self-serve. The standard web flow page does not mention PKCE. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native |
| Client credentials (2-legged) | `grant_type=client_credentials`, 30-minute token. "2-legged OAuth authentication is not available for Marketing APIs." "Your application cannot access these APIs by default." Not useful for member or page actions. | https://learn.microsoft.com/en-us/linkedin/shared/authentication/client-credentials-flow |
| Rate limits | Daily (reset midnight UTC), two kinds: application and member (per member token per app). "Standard rate limits are not published in documentation." Look them up in Developer Portal, app, Analytics tab (shows only endpoints you have called at least once today UTC). 429 on exceed. Email alert at 75% of app limit, delayed 1-2 hours. Dev-tier Community Management: 500/app, 100/member per 24 h. | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits (ms.date 2025-06-18) ; increasing-access page |
| Version header | `Linkedin-Version: YYYYMM`. No default version: "the latest version is not applied by default"; missing or deprecated header returns an error. Monthly releases; each supported "for a minimum of one (1) year". Latest listed: 202610. Marketing version 202511 sunsets 2026-11-16. | https://learn.microsoft.com/en-us/linkedin/marketing/versioning (ms.date 2026-10-15) |
| Protocol header | `X-Restli-Protocol-Version: 2.0.0` on all versioned calls. URNs in URLs must be URL-encoded. | posts-api page |
| Webhooks: which products | "only available for applications with an approved use case for webhooks". The Webhooks tab in the portal is enabled only for such apps. Documented event for Community Management: Organization Social Action Notifications (`eventType: ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS`) for LIKE, COMMENT, SHARE on page posts. Only for posts with `visibility: PUBLIC`. Disabled in Development tier. No webhook documented for member (personal) posts: unknown, none found. | https://learn.microsoft.com/en-us/linkedin/shared/api-guide/webhook-validation (last updated 2026-11-04) ; https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-social-action-notifications ; increasing-access page |
| Webhook validation | LinkedIn sends `GET {webhook}?challengeCode={uuid}`; respond within 3 seconds, HTTP 200, JSON `{"challengeCode":..., "challengeResponse": hex(HMAC-SHA256(challengeCode, clientSecret))}`. Revalidation every 2 hours; 3 consecutive failures block the endpoint. HTTPS only; ngrok URIs not supported. | webhook-validation page |
| Webhook delivery | Each POST carries `X-LI-Signature` = hex(HMAC-SHA256(`"hmacsha256=" + rawBody`, clientSecret)); verify with constant-time compare, using the exact raw body. Respond 2xx. Deduplicate by notification ID (`notificationId`). | webhook-validation page; organization-social-action-notifications page |
| Webhook subscription | `PUT /rest/eventSubscriptions/(developerApplication:urn:li:developerApplication:{appId},user:urn:li:person:{id},entity:urn:li:organization:{id},eventType:ORGANIZATION_SOCIAL_ACTION_NOTIFICATIONS)` body `{"webhook": "https://..."}`. Each page admin must authorize `rw_organization_admin`. Subscription is removed when the member's grant expires or is revoked, or when they stop being an admin, so a 60-day token lapse silently stops delivery. | organization-social-action-notifications page |

## 5. Terms that constrain an AI agent

Dates: API Terms of Use last revised 2022-12-13 (existing developers from 2023-01-13); Marketing API Program ("LMA") Terms last revised 2025-07-25; User Agreement section 8.2 effective 2025-11-03 (as read on 2026-11-05).

| Constraint | Text (verbatim where quoted) | Source |
|---|---|---|
| No automated posting | API Terms 3.1: "Use the Content or the APIs to automate posting on the LinkedIn Services." (Section number 3.1 per the page; the exact bullet index I did not verify beyond "last bullet".) Marketing terms say that in any conflict they control (1.3) and contain no matching clause I found. No official page I read says the clause is waived for Community Management. Treat it as live. | https://www.linkedin.com/legal/l/api-terms-of-use ; https://www.linkedin.com/legal/l/marketing-api-terms |
| Member-initiated actions | Messages API: "A message must be associated with a specific member action. Member actions do not include an automated or scheduled event." That wording is for messaging, not posting. For posts the only explicit rule is the automation clause above. | https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages |
| Scraping | API Terms 3.1: no scraping/crawling "to access LinkedIn content outside the APIs", and no storing or displaying such "Non-Official Content" or combining API Content with it. User Agreement 8.2: no "software, devices, scripts, robots or any other means or processes to scrape or copy the Services"; no "bots or other unauthorized automated methods to access the Services ... or otherwise drive inauthentic engagement". | https://www.linkedin.com/legal/l/api-terms-of-use ; https://www.linkedin.com/legal/user-agreement |
| Retention (general API) | "you will store Content only for the duration necessary for you to provide your Application's services to your Users"; delete data collected for a user "when that User requests deletion or closes their account"; profile data may be refreshed only "when the Member is actually using your Application and not on an automated schedule." Member consent required before accessing their Content (Section 5.2). | https://www.linkedin.com/legal/l/api-terms-of-use |
| Retention (Community Management) | Own members' person ID/URN and profile data: no limit. Other members' profile data: 24 h caching, no storage. Members' social activity data (posts, likes, comments, mentions): 48 hours. Organization social activity: six weeks, or six months if the org authenticated into your app. Org profile data: eight weeks if the org authenticated, otherwise none (name/logo URL 30 days). Page admin/reporting data: one year. IDs/URNs of orgs, posts, comments: no limit. Shortest applicable duration wins. | https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements |
| Deletion | Marketing terms 4.2: permanently delete stored marketing data within ten days or less when the client stops using the service or on the client's or account manager's request, and delete all stored member data on termination. | https://www.linkedin.com/legal/l/marketing-api-terms |
| Member data use | Only for managing the Page or Profile through your app. Not for advertising, sales, recruiting, lead creation, CRM enrichment, audience lists, ad targeting. No export or transfer outside the app, no combining with other data, no building a database across unaffiliated accounts, no deriving sensitive attributes, no sale to data brokers. Display only to people associated with that Page or Profile. Data minimization. | https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases ; Marketing API Terms 3.1(e) |
| AI / model training | Neither the API Terms, the Marketing API Terms nor User Agreement section 8.2 contain an explicit clause about AI or machine-learning training (on the pages as fetched; the 8.2 text is from a summarizer plus my reading, not a full-page grep). Indirect limits that would catch it: use of Content "for any purpose other than to allow your Users" (API Terms 3.1), the no-combining and no-export rules, the 48-hour cap on member activity, and "derivatives thereof" of member data being covered (restricted-use-cases page). Treat training or fine-tuning on API data as prohibited in practice. Unknown: whether other LinkedIn pages (data portability, privacy) address AI explicitly. | the same pages |
| Display | Display of Content must comply with the technical documentation (API Terms 1.3). Marketing Application display of member data must support specific services (Marketing terms 3.1(e)). | https://www.linkedin.com/legal/l/api-terms-of-use |
| Suspension | "We may suspend or terminate ... your access to the APIs or Content at any time for any reason." LinkedIn may monitor and suspend even after approval; material app changes may require re-review. | API Terms 11.3; community-management-app-review page |
| Test accounts | Max five test member profiles, created manually, not by script. | API Terms 2.3 |

Reading of the above for an AI-agent adapter (my inference, not an official statement): a design where the agent drafts and a human clicks approve per post is the safest reading of "automate posting"; a design that publishes on a schedule without a human action carries explicit contractual risk. Reply drafting for comments from a page needs the same human-approval step by the same logic.

## 6. SDKs and MCP servers

### Official LinkedIn

| Item | Status | Licence | Source |
|---|---|---|---|
| `linkedin-developers/linkedin-api-js-client` | Not archived. Last push 2024-07-26. Latest release v0.3.0 (2023-02-07). 135 stars. | Custom "LinkedIn API Development Software License Agreement" (GitHub shows NOASSERTION). Not open source: no copying to public repos, no modification or redistribution beyond the license, tied to the API Agreement, indemnity clause, terminates with API access. | https://github.com/linkedin-developers/linkedin-api-js-client ; license read via GitHub API |
| `linkedin-developers/linkedin-api-python-client` | Not archived. Last push 2024-04-21. Latest release v0.3.0 (2023-06-29). 272 stars. README: "currently in beta"; thin Rest.li client; supports versioned APIs, query tunneling, 2- and 3-legged OAuth. | Same custom license. | https://github.com/linkedin-developers/linkedin-api-python-client |
| Other official repos | Sample Java app, GTM/Adobe conversion tools, job-posting tools (last pushes 2024 to 2026). No MCP repo in the org listing. | n/a | `gh repo list linkedin-developers` on 2026-11-05 |
| Official MCP server | None found on developer.linkedin.com, learn.microsoft.com/linkedin or the linkedin-developers org. A web search found only third-party statements (a vendor blog) that none exists; absence is not proven. | n/a | web search 2026-11-05 |

Implication: the official SDKs cannot be vendored into a public open-source repo under their license (clause 1.b forbids public GitHub copies of the Licensed Materials). Writing a small own HTTP client is the lower-risk path.

### Community MCP servers (not official; licences from GitHub metadata, accessed 2026-11-05)

| Repo | Licence | Method | Notes |
|---|---|---|---|
| stickerdaniel/linkedin-mcp-server (~4.1k stars, pushed 2026-11-04) | Apache-2.0 | Browser automation with Patchright (patched Playwright) against logged-in LinkedIn pages: scraping | Violates User Agreement 8.2 and API Terms 3.1 scraping rules by design. README is promoted by a third-party service. |
| eliasbiondo/linkedin-mcp-server (212 stars) | MIT | Patchright scraping | Same concern. |
| alinaqi/mcp-linkedin-server (55 stars) | none declared | Playwright browser automation | No licence means all rights reserved. |
| prakharagarwal-dev/linkedin-mcp-server, tr4m0ryp/linkedin-mcp-server, Romankhanfx01 fork | Apache-2.0 | Described as search/network/messages: implies unofficial access. Not inspected. | Treat as unofficial. |
| gtm-api/linkedin-mcp (71 stars), TalkToHumans/linkedin-mcp (36), sigvardt/linkedin-buddy | MIT / MIT / none | Messaging, connect, search: not possible via official API, so unofficial or managed-service access. Not inspected. | Treat as unofficial. |
| souravdasbiswas/linkedin-mcp-server (18 stars) | MIT | README: "Official API only. No scraping, no unofficial endpoints." Needs `openid profile email w_member_social`; auto-enables extra modules if Community Management/Advertising scopes present. | Closest match to our need; not code-reviewed by me. |
| fredericbarthelet/linkedin-mcp-server (41 stars, last push 2025-03-19) | none declared | Community Management API; tools `user-info`, `create-post`; HTTP+SSE with MCP third-party-auth draft flow | Stale. |
| Dishant27/linkedin-mcp-server (53 stars) | MIT | Official HTTP APIs; README warns many limits are product/partner restrictions | Not code-reviewed. |
| gacabartosz/linkedin-mcp-server (6 stars) | MIT | Posting, scheduling, comments, reactions; uses `LINKEDIN_API_VERSION` default 202503 (suggests official REST) | Not code-reviewed. |
| tomquirk/linkedin-api (the Voyager "linkedin-api" library) | I could not fetch its metadata (GitHub API 404 on that name) | Unofficial Voyager API | Not verified; flagged as unofficial by name only. |

AGPL: a GitHub search for repositories matching "linkedin mcp" with AGPL-3.0 licence returned no results on 2026-11-05. None of the servers above is AGPL by GitHub metadata. Repos with no licence file are not usable at all.

Sources for this table: GitHub repo metadata and READMEs via `gh api` / `gh search repos` on 2026-11-05 (community, third-party credibility).

## 7. Open questions and unknowns

1. Does a Share-on-LinkedIn-only app work with `/rest/posts`, `/rest/images`, `/rest/videos`, `/rest/documents`, or only the legacy `/v2/ugcPosts` + `/v2/assets`? Not stated on any official page I read.
2. Can Community Management be combined with Sign In with LinkedIn / Share on LinkedIn on one app after approval? FAQ 4 says only request it on apps with no other product; later addition is not addressed.
3. Review time for Development and Standard tiers: no official number.
4. Whether a one-person startup counts as a "registered legal organization" with a "commercial use case": criteria text only; outcome unknown.
5. Whether LinkedIn treats an agent that publishes member-approved or scheduled posts as "automate posting" under API Terms 3.1. No official guidance read.
6. Which scope names the portal grants (`*_social` vs `*_social_feed`); the docs mix both.
7. Whether Standard-tier Community Management apps get programmatic refresh tokens (refresh page says MDP/approved partners).
8. Any webhook for member (personal) post engagement: none found.
9. Whether an official LinkedIn MCP server exists or is announced.
10. Page Statistics and member profile analytics endpoint details (not read).
11. Official page for "home feed" and "people search" being unavailable: none found.
12. Posts API rate limits for versioned endpoints: not published ("Standard rate limits are not published in documentation"); read them in the portal's Analytics tab.

## 8. Source list (all accessed 2026-11-05)

Official docs (credibility: official)
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow-native
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/client-credentials-flow
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/programmatic-refresh-tokens
- https://learn.microsoft.com/en-us/linkedin/shared/api-guide/concepts/rate-limits
- https://learn.microsoft.com/en-us/linkedin/shared/api-guide/webhook-validation
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/share-on-linkedin
- https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api
- https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api
- https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-size
- https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/messages
- https://learn.microsoft.com/en-us/linkedin/shared/integrations/communications/invitations
- https://learn.microsoft.com/en-us/linkedin/dma/member-data-portability/member-data-portability-member/
- https://learn.microsoft.com/en-us/linkedin/marketing/quick-start
- https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access
- https://learn.microsoft.com/en-us/linkedin/marketing/versioning
- https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases
- https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management-app-review
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/documents-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/multiimage-post-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/comments-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/reactions-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-access-control-by-role
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-lookup-api
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/share-statistics
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/follower-statistics
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/organizations/organization-social-action-notifications
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/members/post-statistics
- https://developer.linkedin.com/product-catalog and https://developer.linkedin.com/product-catalog/marketing/community-management-api
- https://www.linkedin.com/legal/l/api-terms-of-use
- https://www.linkedin.com/legal/l/marketing-api-terms
- https://www.linkedin.com/legal/user-agreement
- https://github.com/linkedin-developers (org listing and the two SDK repos and their LICENSE files)

Third-party (credibility: community / third-party)
- GitHub repositories listed in section 6 (metadata via GitHub API).
- Web search result pages summarizing absence of an official MCP server (vendor blogs on contentin.io): weak evidence only.
