/**
 * Agent firewall tool profile. A firewalled agent is offered only the tools on these two closed
 * lists. Anything else (built-ins, company, MCP agent, voice, meeting and data room tools, connector
 * tools, tools added later) is dropped. See docs/agent-firewall/PLAN.md, section 3.
 */

/** Offered and called without a card. Some are narrowed further at call time (see the plan). */
export const FIREWALL_FREE_TOOLS: ReadonlySet<string> = new Set([
  // Tainted-run safe tools (EXTERNAL_TAINT_SAFE_TOOLS) except attach_file and list_secrets: the profile has no files and no secrets, not even names.
  "ask_user",
  "skill_read",
  "tool_run",
  "notify_user",
  "scratchpad_list",
  "board_tickets",
  "ticket_get",
  "scratchpad_add",
  "scratchpad_update",
  "scratchpad_complete",
  "create_ui_artifact",
  "render_ui",
  "recall_memory",
  "task_catalog",
  "schedule_list",
  "schedule_runs",
  // Reads of its own pages and pins. Writes ask: page Markdown images are an outbound channel.
  "page_list",
  "page_read",
  "pins_read",
  // Mail reads, inside the support scope (the executor checks the scope).
  "mail_search",
  "mail_grep",
  "mail_get",
  "inbox_overview",
  "show_emails",
  // Its own thread.
  "read_history",
  "search_history",
]);

/**
 * Offered, but every call asks on a card that cannot become a saved rule. The executor may lift
 * mail_draft, mail_modify and web_fetch to free under the conditions in the plan.
 */
export const FIREWALL_ASK_TOOLS: ReadonlySet<string> = new Set([
  "page_write",
  "page_create",
  "page_edit",
  "mail_send",
  "mail_draft",
  "mail_modify",
  "web_fetch",
  "save_memory",
  "remember",
  "save_shared_memory",
  "skill_create",
  "skill_update",
  "schedule_create",
  "schedule_update",
  "watch_create",
  "message_bot",
  "ticket_create",
  "ticket_update",
  "ticket_comment",
]);

export type FirewallToolClass = "free" | "ask" | "dropped";

export function firewallToolClass(name: string): FirewallToolClass {
  if (FIREWALL_FREE_TOOLS.has(name)) return "free";
  if (FIREWALL_ASK_TOOLS.has(name)) return "ask";
  return "dropped";
}

/** The reason line on a card the firewall forced. */
export const FIREWALL_CARD_REASON = "Firewall";

const bareAddress = (value: string) =>
  (/<([^<>]+)>/.exec(value)?.[1] ?? value).trim().toLowerCase();

/**
 * A draft is free when it names at least one recipient, every To, Cc and Bcc address is already a
 * participant in the thread being answered, and the body has no link (the site list that would
 * allow a link arrives with slice S3, so until then any link asks).
 */
export function firewallDraftIsFree(input: {
  to?: readonly string[];
  cc?: readonly string[];
  bcc?: readonly string[];
  body?: string;
  participants: readonly string[];
}): boolean {
  const recipients = [...(input.to ?? []), ...(input.cc ?? []), ...(input.bcc ?? [])].map(
    bareAddress,
  );
  if (recipients.length === 0) return false;
  const known = new Set(input.participants.map(bareAddress));
  if (!recipients.every((address) => known.has(address))) return false;
  return !/https?:\/\/|www\./i.test(input.body ?? "");
}

const scopePrefix = (label: string) => `label:"${label.replaceAll('"', "")}" (`;

/** The model's Gmail query, held inside the support label. The parentheses stop an OR leaving it. */
export function supportScopeQuery(label: string, query: string): string {
  return `${scopePrefix(label)}${query})`;
}

/** Whether a query is one `supportScopeQuery` produced for this label. */
export function isSupportScopedQuery(label: string, query: string): boolean {
  const prefix = scopePrefix(label);
  if (!query.startsWith(prefix)) return false;
  // The parenthesis opened by the prefix must close at the very end, outside any quoted text.
  let depth = 1;
  let quoted = false;
  for (let i = prefix.length; i < query.length; i += 1) {
    const char = query[i];
    if (char === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth === 0) return i === query.length - 1;
    }
  }
  return false;
}
