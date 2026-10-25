# UX walk: Bot-built apps (shareable by link, runnable by agents)

Walked 2026-10-25 on the demo stack (synthetic data), browser session "unattended-apps", viewport about 1280x577. Stories: `docs/ux-paths/unattended/apps.md`, APPS-C1 to APPS-C8. Screenshots are scratch files in `ux-shots/apps/` under the session scratchpad (not in the repo); names are given below as `ux-shots/apps/<file>`.

Result: 6 of 8 pass, 1 partial (C4), 1 could not be walked as written (C3). No P1 findings.

## APPS-C1: Open a bot-made HTML dashboard: PASS
Steps taken: 3 (Artifacts in sidebar, click "MOCK Cash Dashboard", Maximize). Ideal: 2 (Maximize is optional). Matches the story.
- The list opened in grid view (a remembered preference). Opening a card switches to list plus preview. In the preview the HTML renders as a white card on the dark app; the lock icon is icon-only (hover text is "Isolated preview, no access to your account").
- Maximize hides the artifact list; the same button then reads "Show list" (collapse icon). Works.
- Findings:
  - P3: The white page inside the dark app is a hard contrast jump and the page is cut off at the bottom of the pane with a lot of empty white. Bot-built pages do not know the app theme. (`ux-shots/apps/c1-open.png`)
  - P3: The lock icon is the only hint that the page cannot reach her account. Nothing says it is a static snapshot or when it was made. (`ux-shots/apps/c1-open.png`)
  - P2 (for the new feature): There is no Share, Copy link or Run control anywhere on an artifact; only Download and Maximize. A user cannot tell this is the dead end for sharing. (`ux-shots/apps/c1-max.png`)

## APPS-C2: Compare versions, then delete: PASS
Steps: open artifact, open "Version" select, choose v1 (3), then delete icon opens the dialog (4th). Ideal: 3. The row delete icon shows only on hover/selection.
- v1 loads ("first draft" text), v2 is current. Delete dialog text: "This deletes all 2 versions of this artifact. This can't be undone." Cancel closed it; I did not delete.
- Findings:
  - P3: While v1 is shown, the list row still says "v2" and nothing in the pane says "you are looking at an older version". There is no restore or diff. (`ux-shots/apps/c2-v1.png`)
  - P3: The Version select is a native select; clicking an option through the page did not work for automation, but `select` did. Keyboard/mouse users are fine.
  - P2 (for the new feature): Versions are the only history. A shared link or a tool contract would need "published version" separate from "latest", and there is no such control today.

## APPS-C3: Ask a bot for a dashboard in chat: FAIL (not walkable) 
Steps: Ask Chief, typed "Build me a cash, burn and runway dashboard." and sent. The run started, but the reply was a summary of an unrelated webhook routine ("Billing event: invoice.paid"). No dashboard card appeared in about 30 seconds. The demo model does not call `create_ui_artifact`; the story remains a hypothesis. (`ux-shots/apps/c3-sent.png`, `ux-shots/apps/c3-after.png`)
- Findings:
  - P2: The demo Chief thread is shared with other walkers' automation (a task-card editor with "Saved/Test/Add to routine" and webhook payload messages). My request got buried between webhook runs, so this story is untestable on this stack until a scripted model path is added.
  - P3: The webhook messages are shown in the Chief thread as user-coloured bubbles containing raw "<untrusted_delivery_payload>" text. A non-technical user would see this as noise. (`ux-shots/apps/c3-sent.png`)
  - Note: nothing in the composer hints that a bot can build a page or a tool, so discovery depends on the user asking.

## APPS-C4: Ongoing summary on the bot's Page: PARTIAL (could not reach)
Steps: Opened Finance helper (mock), Investor Relations, Leadership sync, and Finance agent. None showed a "Page" button in the header. The Finance agent header has only a "Finance agent" settings button, a checklist icon button and a routines icon button. The demo has no bot with a written page, so the editor and "Page changed. Reload" were not seen. (`ux-shots/apps/c4-financeagent.png`)
- Findings:
  - P2: With no page, there is nothing to say a bot can have one. The feature exists only after the bot writes it, so a first-time user cannot find it.
  - P3: The two header icons (checklist, routines) have no text; both look alike at 32px. (`ux-shots/apps/c4-agentmenu.png`)

## APPS-C5: Numbers strip and list: PASS (model run, not instant)
Steps: open Finance agent (strip visible), click the icon-only refresh button, add a list item. Ideal: 1.
- The strip shows two cards: "Cash $1,633,221" and "Runway 24.2 mo". Clicking refresh sent the bot a message, the sidebar row went to "Waiting for the model...", then "Working...", then "Updated your pinned numbers: Cash... Runway 24.2 months...". The card detail text changed from "All bank accounts" to "Bank cash; 3-month average burn". So refresh took a full model run (about 40 seconds), not the "no model" refresh the story describes for sourced numbers; these pins have no source.
- The list "Month-end close" shows 3 items and an "Add item" field. I typed an item and pressed Enter through the automation; the list did not change in the next screenshot, so adding was not confirmed. Treat as not verified.
- Findings:
  - P2: The refresh button is an unlabeled icon beside the cards with no spinner state I could see in the screenshot, and the result arrives as a chat message the user may not be looking at. There is no "last updated" time on the strip. (`ux-shots/apps/c5-refresh.png`, `ux-shots/apps/c5-list.png`)
  - P2: A user cannot tell which pins can refresh without the model and which cannot.
  - P3: A "Chief needs approval" toast (a routine, "Every day at 9:00 AM, posts here") overlapped the chat and the list while I worked, covering the message and the "Add item" row. (`ux-shots/apps/c5-list.png`)

## APPS-C6: Give bots a tool via a custom connection: PASS with differences from the story
Steps: Integrations in sidebar, scroll to the bottom "Anything else" group, "Add" on "Add a custom connection" (3, plus a long scroll). Ideal: 3. The row is last on a long page.
- The dialog shows only "Server URL" ("Paste the app's connection URL from its documentation."), with "Advanced" collapsed. The story said Display name and Authentication selects are visible; they are not. Advanced holds "Transport (Streamable HTTP)", "Auth header", "Header value", "Token" and chips "OpenAPI", "GraphQL", "Executor", "Local command", "Search directory", "Search by domain". Cancelled; nothing was connected. I did not see a "which bots may use it" step.
- Findings:
  - P2: The Advanced section is technical (Transport, Auth header, "Executor") for a non-technical founder. The chip names are not explained. (`ux-shots/apps/c6-adv.png`)
  - P3: The dialog is taller than the 577px viewport; Cancel and Connect are cut off at the bottom when Advanced is open. (`ux-shots/apps/c6-adv.png`)
  - P2 (for the new feature): This is the only place that adds a "tool" for bots, and it assumes someone else already runs a server. A bot-built tool has no equivalent entry. (`ux-shots/apps/c6-bottom.png`)

## APPS-C7: Approve a skill the bot wrote: PASS (empty state only)
Steps: Finance agent, header name button opens "Finance agent settings"; scroll to "Skills". The group shows "Built-in skills (12)" and "Add skill"; there is no "Drafts" group because no skill is pending. "Add skill" opens an inline form (Name, "What it does and when to use it", Instructions, Save, Cancel, Upload file, From URL). Cancelled. Approve/Discard was not seen. (`ux-shots/apps/c7-settings.png`, `ux-shots/apps/c7-addskill.png`)
- Findings:
  - P3: Opening Add skill does not scroll the panel; the form fields sit at the bottom edge of the panel and the Name field is only half visible. (`ux-shots/apps/c7-addskill.png`)
  - P3: In the settings panel the Notifications toggle first showed on, then showed "Off in Settings" after a moment; I did not change it. (`ux-shots/apps/c7-settings.png`)
  - Note: skills are prose with a name and instructions, with no inputs, no "test" button and no run history, which matches the story's edge case.

## APPS-C8: Send an investor an outside link: PASS with one difference
Steps: Investors page (cap table first; contacts are far below the fold), row "..." menu for "Priya Placeholder", "Copy link" (3 plus a long scroll). Ideal: 3.
- The menu first showed Resend link, Copy link, Edit, Delete (no Revoke). After a link existed it also showed "Revoke". The "Portal link" dialog has a read-only field and "Copy"/"Done"; it says nothing about expiry or what the investor will see. The row then said "Invited Oct 25".
- The link opened in a separate browser session shows a page with only a centered "Open" button and no name or context. After "Open" it shows "Northwind Robotics" and "Nothing shared yet." with "Sign out". I did not use "Resend link" (it emails). Revoke ran immediately with no confirmation and the row read "Revoked".
- "Copy link" issued a new link on each use (two different tokens); I did not test whether the first one still works.
- Findings:
  - P2: The "Open" landing page gives the recipient no clue who it is from or why to press it. (`ux-shots/apps/c8-portal.png`)
  - P2: "Revoke" has no confirmation, so one slip cuts an investor off; and it is hidden until after a link exists. (`ux-shots/apps/c8-revoke.png`)
  - P3: The Portal link dialog does not say the link is shown once or that "Copy link" makes a new one. (`ux-shots/apps/c8-link.png`)
  - P3: "Nothing shared yet." with no explanation of how things get shared; the share action lives in other pages (Data room, updates). (`ux-shots/apps/c8-portalhome.png`)
  - P2 (for the new feature): The portal shows updates and Data room files only; there is no way to put a bot-built page in it. Visitors are tied to a contact (investor), so a one-off link to an artifact does not fit this model.

## Notes for adding "Bot-built apps: shareable by link AND runnable by agents as reliable tools"
Where it would fit today:
- **Artifacts page** is the natural home for the app itself: it already has a list, versions, an isolated preview, and Download/Maximize. Share, Copy link and Run would be new toolbar buttons next to Download. Today the toolbar gives no sign that sharing exists elsewhere.
- **Investors "..." menu plus the Portal link dialog** is the only link pattern (Copy link / Resend / Revoke). Reuse its wording, but it is per contact and shows no preview, expiry or view count.
- **Integrations "Add custom connection"** is the only "give bots a tool" entry. A bot-built tool would need a visible place in the same area ("Anything else"), but that page is long and the row is last.
- **Bot settings "Skills"** is where users now see reusable steps; it has no inputs, no test and no run history. A "reliable tool" would sit beside it or replace it for repeatable work.
- **Bot header** (checklist icon, routines icon) and the pins strip are icon-only; a "Run" or "Tools" entry would need a labelled control.

What is confusing today:
- Four separate places hold "things a bot made" (Artifacts, bot Page, pins strip/list, Skills) and none links to another.
- Refresh and pins depend on a model run, with no "updated at" time and no signal on which pins are live.
- Version history exists with no "published" notion, so "share this version" has no anchor.
- Outside viewers exist only as investor contacts; the landing page is a bare "Open" button.
- The demo stack could not produce a bot-built dashboard or a bot page, so C3 and C4 need seeded data or a scripted model path before the next walk.
- The Chief thread in the demo is shared with other walker automation, which pollutes this kind of test.
