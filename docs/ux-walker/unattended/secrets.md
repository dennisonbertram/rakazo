# UX walk: Secrets the bot uses without seeing them

Walked on the demo stack (web, synthetic data), bot Chief, desktop viewport 1400x1000. Source stories: `docs/ux-paths/unattended/secrets.md`. Screenshots are scratch files outside the repo, in `ux-shots/secrets/` of the session scratchpad (names below are file names inside that folder).

Result: 5 of 7 stories walked by hand and passed (C1, C2, C6, C7, plus the edge cases noted). C3, C4 and C5 could not be walked: the demo model does not call `request_secret` or `secret_request`, so the protected card, the website login fill and the authenticated-request approval card were not seen. They remain code and e2e-spec verified only (`apps/web/e2e/secret-card.spec.ts`).

Test data: I added `github` (bearer, `https://api.example.test`) and `netbird-setup-key` (command variable) with fake values, replaced one value, and removed both. The bot is back to "No credentials saved for this bot."

## SECRETS-C1: Open a bot's saved credentials — PASS (with friction)

- Steps taken: 1) open `/app/<botId>`, 2) click bot name "Chief" in the header (settings panel opens), 3) click **Advanced** (a row, not announced as a button), 4) scroll the panel past Workspace, Open work, Model, Thinking, Read replies aloud, Disabled tools to reach **Credentials**. Four actions plus a long scroll. Ideal: 2.
- What I saw: "Credentials", "Values are encrypted and never shown again.", "No credentials saved for this bot.", **Add credential**. Matches the story. Screenshots: `c1-panel.png`, `c1-expanded.png`, `c1-credentials.png`.
- Findings:
  - P2: Credentials is the last item inside Advanced, below seven unrelated settings, so a user who wants to know "what does this bot hold" has to expand a collapsed group and scroll. Nothing on the first screen of settings hints that credentials exist. `c1-credentials.png`.
  - P2 (accessibility): the **Advanced** row does not appear in the interactive accessibility snapshot (no button or expanded state). A click by text did not find it; I had to click by coordinates. Keyboard and screen reader users may not be able to open it. `c1-big.png`.
  - P3: the settings panel needs a tall window. At 1280x577 **Advanced** is cut off at the bottom edge and the panel did not scroll with wheel input in my first attempt. `c1-panel.png`.

## SECRETS-C2: Add a bearer token yourself — PASS

- Steps taken: Add credential, Name `github`, Site `https://api.example.test`, Type left at Bearer token (default), Value, Save credential. Six actions, matches the ideal path.
- What I saw: new row "github / https://api.example.test / Bearer token · Updated 10/25/2026" with **Replace value** and **Remove**. The form closed and the value is not shown. `c2-form.png`, `c2-filled.png`, `c2-saved.png`.
- Edge cases tried: name `Bad Name` with site `http://api.example.test` leaves **Save credential** disabled. `c2-invalid-submit.png`.
- Findings:
  - P2: when Save is disabled there is no message saying why. The only guidance is the static grey hint under Name ("Lowercase letters, numbers, hyphens and underscores, starting with a letter."). The Site field has no hint that it must be HTTPS. A user who types `http://` or `API-Key` sees a dead button.
  - P3: the form is added below the existing rows with no scroll or focus change; with a long panel the new fields can appear off-screen (I had to scroll to find them).
  - P3: the label "Site" is the origin the secret may be sent to. Nothing says that the bot can only use the token against that exact site, which is the main safety property and the thing a founder would want to read once.
  - P3: "Updated <date>" is the only metadata. No created, last used or use count (known gap, matches PRD item).

## SECRETS-C3: Answer a protected card in a thread — NOT WALKED

Demo model does not call `request_secret`. No evidence from this walk. For the feature: the card is the only path that creates a login credential from a conversation, so a routine that needs a new secret has no setup-time equivalent today.

## SECRETS-C4: Save a website login and let the bot sign in — NOT WALKED

Needs a bot that calls `request_secret` with `auth: login` and a real HTTPS login page. Not available in the demo. Not walked. In the Disabled tools list the tools `Request secret`, `List secrets`, `Secret request`, `Forget secret` appear (see notes), but `browser_act` `fill_secret` is not a separate tool, so it cannot be turned off independently.

## SECRETS-C5: Approve or allow an authenticated request — NOT WALKED

No `secret_request` call can be produced in the demo. I did see the generic approval card for another action (an email send in the Chief thread, "Inbox agent needs approval"), which shows approvals work in this stack, but not the secret-specific one.

## SECRETS-C6: Replace or remove a credential — PASS

- Steps taken: Replace value, type new value, Save new value (3). Remove, confirm Remove (2).
- What I saw: **Replace value** swaps the row for one Value field with **Save new value** and **Cancel**; Save is disabled until text is entered. After saving the row returns to normal. Because the date was the same day, the "Updated" text did not visibly change, so there is no visible proof of success. **Remove** shows an inline confirm: "Remove netbird-setup-key? This bot will no longer be able to use it." with **Remove** and **Cancel**. After confirm the row disappears. `c6-replace.png`, `c6-replaced.png`, `c6-confirm.png`, `c6-removed.png`, `c6-empty.png`.
- Findings:
  - P3: no confirmation after Replace (no toast, no "Replaced" text, and the date is date-only), so on the same day the user cannot tell the save worked.
  - P3: removal is immediate after one confirm and there is no undo, unlike Contacts (Undo toast). Acceptable for a secret, but the confirm copy does not mention routines that use the credential; it would need to once unattended runs depend on it.
  - P3: the confirm text "Remove X? This bot will no longer be able to use it." is clear and correct.

## SECRETS-C7: Give a bot a command variable — PASS

- Steps taken: Add credential, choose Type **Command variable**, Name `netbird-setup-key`, Value, Save credential. Five actions.
- What I saw: choosing Command variable hides the Site field (good). Under Name the form adds "Available to this bot's shell commands as $NETBIRD_SETUP_KEY". The saved row reads "netbird-setup-key / Command variable · $NETBIRD_SETUP_KEY · Updated 10/25/2026". `c7-form.png`, `c7-saved.png`.
- Findings:
  - P2: the only warning that this value is readable by the bot's own shell is that grey helper line under Name, which says "available to" and not "visible to". A founder can easily read it as a safe injection like the bearer type. Matches future story SECRETS-F7.
  - P3: the row metadata wraps badly: "Command variable · $NETBIRD_SETUP_KEY ·" then "Updated 10/25/2026" on the next line with a trailing dot. `c7-saved.png`.
  - P3: Type picker is a plain select with the five types in an order that puts Bearer token first (good default) but gives no one-line description of each type.

## Notes for adding "Secrets the bot uses without seeing them"

- Where it fits: the Credentials section inside bot settings > Advanced is the only management screen. It works for a single bot and is the natural home for per-credential usage ("last used", "used by routine") and for a "which routines may use this" setting. No space-level screen exists; `AgentSecret` has no UI at all.
- What is confusing today:
  - Discoverability: four steps and a long scroll to find Credentials. For unattended bots, a founder will want to see "what credentials can my routines use" from the routine itself, not from bot settings.
  - Two different safety models share one form: backend-injected (bearer, header, basic, login) and shell-visible (command variable). The form does not group or label them differently except for one small helper line.
  - The secret tools are in the **Disabled tools** list with raw tool names ("Secret request", "Request secret", "List secrets", "Forget secret"). That is the only existing control for turning secret use off per bot, and it is easy to miss. It would be the obvious place a "read-only in unattended runs" rule would be confused with.
  - No usage information anywhere: no last used, no count, no link to runs.
  - Mobile has no Credentials list (from code, not walked).
- Walk limits: protected card (C3), website login fill (C4) and the secret-specific approval card (C5) were not seen in a browser. Any design that depends on how those look needs a walk with a model or fixture that calls `request_secret` and `secret_request`.
- Environment observation: another session was acting in the same demo user's Chief thread during my walk (an email send request, a "Share your chats and mail" consent card answered, and an approval card appeared). I did not cause or touch these. Credentials state was unaffected.
