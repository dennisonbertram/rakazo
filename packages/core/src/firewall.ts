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
  // Always a card (explicit approval), so offering it lets the agent ask without a free path.
  "request_access",
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
  "mail_reply_batch",
  "mail_draft",
  "mail_modify",
  "web_fetch",
  "save_memory",
  "remember",
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

/**
 * Read-only queries an email thread's own agent may make. For that agent only (see
 * `firewallToolClass`) they ask on a card instead of being dropped. Writes stay dropped.
 */
export const FIREWALL_MAIL_THREAD_ASK_TOOLS: ReadonlySet<string> = new Set([
  "search_data_room",
  "read_data_room_item",
  "contacts_list",
]);

export type FirewallToolClass = "free" | "ask" | "dropped";

/**
 * `askExtra` holds the tools of capabilities the owner granted this agent through request_access
 * (see `firewallAccessTools`). They ask on every call; a grant never makes a tool free.
 */
export function firewallToolClass(
  name: string,
  mailThreadAgent = false,
  askExtra: ReadonlySet<string> = new Set(),
): FirewallToolClass {
  if (FIREWALL_FREE_TOOLS.has(name)) return "free";
  if (FIREWALL_ASK_TOOLS.has(name) || askExtra.has(name)) return "ask";
  if (mailThreadAgent && FIREWALL_MAIL_THREAD_ASK_TOOLS.has(name)) return "ask";
  return "dropped";
}

/** The reason line on a card the firewall forced. */
export const FIREWALL_CARD_REASON = "Firewall";

const bareAddress = (value: string) => value.trim().toLowerCase();

/**
 * `to`, `cc`, `bcc` and `participants` are bare addresses: the caller splits each field with the
 * same parser the draft handler uses (`parseRecipients`), so one entry cannot hide a second
 * recipient. A draft is free when it names at least one recipient, every To, Cc and Bcc address is already a
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
  const recipients = [...(input.to ?? []), ...(input.cc ?? []), ...(input.bcc ?? [])];
  if (recipients.length === 0) return false;
  if (recipientsOffThread(recipients, input.participants).length > 0) return false;
  return !bodyHasLink(input.body ?? "");
}

/** The bare addresses that are not participants of the thread. The caller splits each field first. */
export function recipientsOffThread(
  recipients: readonly string[],
  participants: readonly string[],
): string[] {
  const known = new Set(participants.map(bareAddress));
  return recipients.map(bareAddress).filter((address) => !known.has(address));
}

/** Any link in a mail body, until the firewall site list exists. */
export const bodyHasLink = (body: string) => /https?:\/\/|www\./i.test(body);
