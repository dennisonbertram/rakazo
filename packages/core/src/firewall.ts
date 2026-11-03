/**
 * Agent firewall tool profile. A firewalled agent is offered only the tools on these two closed
 * lists. Anything else (built-ins, company, MCP agent, voice, meeting and data room tools, connector
 * tools, tools added later) is dropped. See docs/agent-firewall/PLAN.md, section 3.
 */

/** Offered and called without a card. Some are narrowed further at call time (see the plan). */
export const FIREWALL_FREE_TOOLS: ReadonlySet<string> = new Set([
  // Tainted-run safe tools (EXTERNAL_TAINT_SAFE_TOOLS) except attach_file: the profile has no files.
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
  "page_write",
  "page_source_set",
  "page_source_remove",
  "page_create",
  "pins_write",
  "recall_memory",
  "task_catalog",
  "schedule_list",
  "schedule_runs",
  "list_secrets",
  // Its own pages and pins.
  "page_list",
  "page_read",
  "page_edit",
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
