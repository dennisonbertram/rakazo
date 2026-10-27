# Mobile pass: scope

Features merged on the fork between 2026-10-13 and 2026-10-27, checked at phone width (390x844 and 375x812, touch emulation). The web app (and Electron, which hosts it) is the target. The Expo app is out of scope for this pass; native parity is tracked in epic #82.

Earlier UX passes 1-23 (docs/ux-loop) already swept the older pages at 375 px. Weight the work toward features merged after pass 23 (2026-10-23), which have had no phone check.

## New since pass 23 (no phone check yet)

| Area | Feature | PRs |
|---|---|---|
| Calendar | Calendar page: Google events plus bot to-dos, check-backs and routines; Day/Week/Month/Schedule views; today highlight; to-dos waiting on you | #897 #899 #902 #907 |
| Contacts | A page per contact (related mail, meetings, documents); Google contact photos; sortable headers and filters | #877 #885 #887 |
| Investors | Cap table, Updates and Contacts tabs; per-holder Invested; sortable holdings | #874 #850 #887 |
| Inbox / Mail | Context panel beside reading and writing; Track a thread; Review with AI for attachments; urgent mail as a table; wider dialog; close on send; Open in Gmail; Send now on drafts; undo toast on send; to-dos in Inbox | #911 #912 #868 #880 #915 #892 #876 #883 #871 #881 #907 |
| Unattended bots | Read-only background runs and the approvals table; routines that watch pages, stay quiet and check in; open items / Waiting on you in Activity; credentials with last used and needs attention; teach a task; bot-built tools and artifact share links; watch a connected app; expiring approval cards; tour stops for routines and approvals | #855 #859 #860 #856 #857 #864 #865 #866 #862 #875 #890 #891 |
| Company | Company map, consent-gated imports, review, history, calendar; search, filters and sorts | #852 #886 |
| Devin | Search, filters and sortable headers | #886 |
| Tables | Sortable headers + URL list params + filter controls on Legal, Contacts, Investors, Finance transactions, Company, Devin, Artifacts, Activity; Legal due-soon chip | #884 #886 #887 #888 #889 |
| Legal | Group similar contracts; party avatar stacks | #878 |
| Chat | Typed UI blocks in bot replies (render_ui); Chief delegate status and per-agent progress; message/card gap; email chat notes routed to the owning agent | #898 #914 #913 #904 #909 |
| Data room | Failed count in the filter row; hover-only tile menu (touch!); folder tree width | #916 #873 #882 |
| Finance | KPI outlines, equal-height cards, Burn breakdown tabs; transactions search/filters/sorts | #867 #888 |
| Shell | Sidebar: Page agents above chats, +N more bar, pinned fold header; brand-coloured Integrations logos | #903 #905 #906 #872 #901 |
| Auth | Sign in with a passkey | #910 |

## Older features in the window (covered by passes 1-23; re-check only if a walk passes through them)

GTM page and agent, Fundraising, Devin page, Granola meetings and Wispr Flow, Important contacts, Team health pages, Projects page, Data room imports, integration agents (Mercury, Brex, Carta), approval toasts, Finance phone layout, Legal on a phone.

## Mobile-only UI

The owner expects some pages to need phone-only UI so that many options stay usable on a phone (for example a filter sheet instead of a row of filter chips, a card list instead of a wide table, a bottom sheet instead of a side panel). Propose these where a desktop control does not fit, reusing shared components (packages/ui-web, shadcn on Base UI) and semantic tokens.
