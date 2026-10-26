import type {
  ApprovalActionType,
  ApprovalChoice,
  ActionApprovalRule as StoredActionApprovalRule,
} from "@rakazo/contracts";
import { APPROVAL_ACTION_TYPE_IDS } from "@rakazo/contracts";

const APPROVAL_EXEMPT_TOOLS = new Set([
  "computer_observe",
  "computer_act",
  "browser_navigate",
  "browser_snapshot",
  "browser_act",
  "list_files",
  "read_file",
  "read_history",
  "search_history",
  "write_file",
  "shell",
  "open_path",
  "launch_app",
  "remember",
  "request_takeover",
  "request_secret",
  "run_subagent",
  "spawn_bot",
  "schedule_list",
  "schedule_cancel",
  "schedule_runs",
]);
// schedule_create and schedule_update are not listed: they ask only for repeating schedules, which
// depends on the call's arguments, so the executor decides (see scheduleApproval in the adapters).

const APPROVAL_REQUIRED_BUILTIN_TOOLS = new Set([
  "destination.write",
  "delete_bot",
  "archive_bot",
  "secret_request",
  "forget_secret",
  "forget_memory",
  "cloud_agent_launch",
  "cloud_agent_reply",
  "cloud_agent_cancel",
  "mail_draft",
  "mail_modify",
  "mail_send",
  "calendar_create_event",
  "calendar_update_event",
  "calendar_delete_event",
  "drive_create_file",
  "drive_update_file",
  "contacts_save",
]);
/** Built-in mail tools that write; the "email" approval category covers them. */
const BUILTIN_MAIL_WRITE_TOOLS = new Set(["mail_draft", "mail_modify", "mail_send"]);
/** Cannot be auto-reviewed or permanently allowed. imessage_send is a message to a person from the user's agent line. */
const EXPLICIT_APPROVAL_BUILTIN_TOOLS = new Set([
  "create_space",
  "imessage_send",
  "company_fact_upsert",
  "company_import_start",
]);

const UNATTENDED_SAFE_BUILTIN_TOOLS = new Set([
  "browser_snapshot",
  "cloud_agent_status",
  "computer_observe",
  "list_files",
  "list_secrets",
  "read_file",
  "recall_memory",
  "request_takeover",
  "run_subagent",
  "task_catalog",
  "schedule_list",
  "schedule_runs",
  "scratchpad_list",
  "search_data_room",
  "read_data_room_item",
  "company_search",
  "company_get",
  "timeline_query",
  "calendar_query",
  "read_spreadsheet",
  "skill_read",
  "web_fetch",
  "web_search",
  // Write only inside Rakazo (the owner's own notifications, pages, pins and files).
  "notify_user",
  "create_ui_artifact",
  "attach_file",
  "page_write",
  "pins_write",
]);

/**
 * Scratchpad writes are safe unattended unless the item is in a category the scratchpad itself
 * gates (public_post, create_account, outbound_email; packages/adapters/src/scratchpad-tools.ts).
 * scratchpad_add carries the category in its args. scratchpad_update and scratchpad_complete
 * address an item by id, so the executor must put the stored item's category in `args.category`
 * before asking; with no category they fail closed and ask.
 */
const UNATTENDED_SCRATCHPAD_TOOLS = new Set([
  "scratchpad_add",
  "scratchpad_update",
  "scratchpad_complete",
]);
const GATED_SCRATCHPAD_CATEGORIES = new Set(["public_post", "create_account", "outbound_email"]);

const READ_ONLY_CONNECTOR_PATTERN = /(^|_)(get|list|search|find|read)(_|$)/i;
const MUTATING_CONNECTOR_PATTERN =
  /(^|_)(accept|add|approve|archive|assign|buy|cancel|charge|checkout|close|commit|copy|create|delete|deploy|disable|enable|execute|forward|grant|invite|link|mark|merge|modify|move|patch|pay|post|publish|purchase|put|register|reject|remove|rename|replace|reply|reset|revoke|run|schedule|send|set|share|start|stop|submit|subscribe|trigger|unassign|unlink|unsubscribe|update|upload|upsert|write)(_|$)/i;
const COMPOUND_CONNECTOR_ACTION_PATTERN = /_(and|or|then)_/i;

const EMAIL_CONNECTOR_SLUGS = new Set(["gmail", "outlook", "microsoft_outlook"]);
const PURCHASE_CONNECTOR_SLUGS = new Set(["stripe", "shopify", "paypal", "square"]);
const CALENDAR_CONNECTOR_SLUGS = new Set([
  "googlecalendar",
  "google_calendar",
  "calendar",
  "outlook_calendar",
  "calendly",
]);
const MESSAGING_CONNECTOR_SLUGS = new Set([
  "slack",
  "discord",
  "telegram",
  "whatsapp",
  "twilio",
  "sms",
]);

export type ActionApprovalRule = Pick<
  StoredActionApprovalRule,
  "effect" | "matchKind" | "matchValue"
> & {
  /** null or absent: a space-wide rule. A bot id: that bot's override. */
  botId?: string | null;
};

export function connectorKindFromToolName(toolName: string, connectorKinds: string[] = []): string {
  const normalizedTool = toolName.toLowerCase();
  const matched = connectorKinds
    .map((kind) => kind.toLowerCase())
    .filter((kind) => normalizedTool === kind || normalizedTool.startsWith(`${kind}_`))
    .sort((left, right) => right.length - left.length)[0];
  if (matched) return matched;
  const [segment] = toolName.split("_");
  return (segment ?? toolName).toLowerCase();
}

/**
 * `readOnly` is the connector tool's declared effect (for installed APIs, derived from the stored
 * HTTP method and read-only flag). A declared write always needs approval. A declared read never
 * relaxes the name check: the provider chooses both the name and the hint.
 */
export function connectorToolRequiresApproval(toolName: string, readOnly?: boolean): boolean {
  if (readOnly === false) return true;
  if (MUTATING_CONNECTOR_PATTERN.test(toolName)) return true;
  if (COMPOUND_CONNECTOR_ACTION_PATTERN.test(toolName)) return true;
  return !READ_ONLY_CONNECTOR_PATTERN.test(toolName);
}

export function toolRequiresApproval(
  toolName: string,
  viaConnector: boolean,
  readOnly?: boolean,
): boolean {
  if (APPROVAL_EXEMPT_TOOLS.has(toolName)) return false;
  if (toolRequiresExplicitApproval(toolName)) return true;
  if (APPROVAL_REQUIRED_BUILTIN_TOOLS.has(toolName)) return true;
  if (viaConnector) return connectorToolRequiresApproval(toolName, readOnly);
  return false;
}

/** Security-boundary changes cannot be auto-reviewed or permanently allowed. */
export function toolRequiresExplicitApproval(toolName: string): boolean {
  return EXPLICIT_APPROVAL_BUILTIN_TOOLS.has(toolName);
}

function scratchpadWriteIsGated(toolName: string, args?: Record<string, unknown>): boolean {
  const category = args?.category;
  if (toolName === "scratchpad_add" && category === undefined) return false;
  return typeof category !== "string" || GATED_SCRATCHPAD_CATEGORIES.has(category);
}

/**
 * Tools that stay free in a run whose prompt carried outside content (webhook, messaging,
 * watches, or a meeting/external bot message). They write only inside Rakazo or to the owner,
 * never to the outside. Not included: web_fetch, web_search, data room and company reads, which
 * can carry private data out. Use `externalTaintAllowsTool` for the scratchpad's category rule.
 */
export const EXTERNAL_TAINT_SAFE_TOOLS: ReadonlySet<string> = new Set([
  "ask_user",
  "skill_read",
  "notify_user",
  "scratchpad_list",
  "scratchpad_add",
  "scratchpad_update",
  "scratchpad_complete",
  "create_ui_artifact",
  "page_write",
  "pins_write",
  "attach_file",
  "recall_memory",
]);

/** True when a tainted run may call the tool without a card. Same scratchpad rule as unattended. */
export function externalTaintAllowsTool(toolName: string, args?: Record<string, unknown>): boolean {
  if (!EXTERNAL_TAINT_SAFE_TOOLS.has(toolName)) return false;
  return !UNATTENDED_SCRATCHPAD_TOOLS.has(toolName) || !scratchpadWriteIsGated(toolName, args);
}

/**
 * In an unattended run (nobody is watching, or the input comes from outside) a call runs without
 * asking only if it is a read-only connector tool or a safe built-in. Everything else asks.
 * An Allow rule never lifts this; the executor treats the result as a mandatory ask.
 */
export function unattendedToolRequiresApproval(
  unattended: boolean,
  toolName: string,
  viaConnector: boolean,
  readOnly?: boolean,
  args?: Record<string, unknown>,
): boolean {
  if (!unattended) return false;
  if (viaConnector) return connectorToolRequiresApproval(toolName, readOnly);
  if (toolName === "secret_request") {
    const method = args?.method;
    return !(method === undefined || method === "GET" || method === "HEAD");
  }
  if (UNATTENDED_SCRATCHPAD_TOOLS.has(toolName)) return scratchpadWriteIsGated(toolName, args);
  return !UNATTENDED_SAFE_BUILTIN_TOOLS.has(toolName);
}

/** @deprecated Use unattendedToolRequiresApproval with the stored `Run.unattended`. */
export function unattendedTriggerToolRequiresApproval(
  trigger: string,
  toolName: string,
  viaConnector: boolean,
  readOnly?: boolean,
  args?: Record<string, unknown>,
): boolean {
  return unattendedToolRequiresApproval(
    trigger === "webhook",
    toolName,
    viaConnector,
    readOnly,
    args,
  );
}

export const BLOCKED_ACTION_MESSAGE =
  "The user's approval settings block this action. Do not retry it or try another way to do the same thing; tell the user it is blocked by their settings if it matters.";

/**
 * Action types of the approvals table, in display order.
 * `primary` rows show by default; the rest sit under "More actions".
 */
export const ACTION_TYPES: ReadonlyArray<{
  id: ApprovalActionType;
  defaultEffect: ApprovalChoice;
  primary: boolean;
}> = [
  { id: "send_email", defaultEffect: "ask", primary: true },
  { id: "spend_money", defaultEffect: "ask", primary: true },
  { id: "connected_apps_write", defaultEffect: "ask", primary: true },
  { id: "calendar_changes", defaultEffect: "ask", primary: true },
  { id: "files_and_commands", defaultEffect: "allow", primary: true },
  { id: "use_computer", defaultEffect: "allow", primary: false },
  { id: "delete_data", defaultEffect: "ask", primary: false },
  { id: "message_outside", defaultEffect: "ask", primary: false },
  { id: "use_credentials", defaultEffect: "ask", primary: false },
];

const ACTION_TYPE_IDS = new Set<string>(APPROVAL_ACTION_TYPE_IDS);
/** Rules saved before the table (seeded for every new space) use these category names. */
const LEGACY_CATEGORY_ALIASES: Record<string, ApprovalActionType> = {
  email: "send_email",
  purchase: "spend_money",
};

/** The action type a rule's category matchValue stands for, or null for any other category. */
export function actionTypeFromCategory(category: string): ApprovalActionType | null {
  const normalized = category.toLowerCase();
  if (ACTION_TYPE_IDS.has(normalized)) return normalized as ApprovalActionType;
  return LEGACY_CATEGORY_ALIASES[normalized] ?? null;
}

const BUILTIN_ACTION_TYPES: Record<string, ApprovalActionType> = {
  mail_send: "send_email",
  mail_draft: "send_email",
  mail_modify: "send_email",
  calendar_create_event: "calendar_changes",
  calendar_update_event: "calendar_changes",
  calendar_delete_event: "calendar_changes",
  write_file: "files_and_commands",
  shell: "files_and_commands",
  open_path: "files_and_commands",
  launch_app: "files_and_commands",
  computer_act: "use_computer",
  browser_act: "use_computer",
  browser_navigate: "use_computer",
  delete_bot: "delete_data",
  archive_bot: "delete_data",
  forget_memory: "delete_data",
  forget_secret: "delete_data",
  imessage_send: "message_outside",
  secret_request: "use_credentials",
  request_secret: "use_credentials",
  fill_secret: "use_credentials",
};

/**
 * Tool to action type.
 *
 * | Tool                                                                | Action type          |
 * | mail_send, mail_draft, mail_modify; consequential gmail/outlook     | send_email           |
 * | consequential Stripe/Shopify/PayPal/Square; purchase, pay_, charge, checkout, buy_ names | spend_money |
 * | calendar_create/update/delete_event; consequential calendar connectors | calendar_changes  |
 * | write_file, shell, open_path, launch_app                            | files_and_commands   |
 * | computer_act, browser_act, browser_navigate                         | use_computer         |
 * | delete_bot, archive_bot, forget_memory, forget_secret; connector tools named delete/remove/trash | delete_data |
 * | imessage_send; consequential Slack/Discord/Telegram/WhatsApp/Twilio/SMS connectors | message_outside |
 * | secret_request, request_secret, fill_secret                         | use_credentials      |
 * | any other approval-requiring built-in or consequential connector tool | connected_apps_write |
 * | read-only tools                                                     | null                 |
 *
 * Connector rows apply only when `viaConnector` is true. Purchase and email are checked before
 * the delete pattern, so deleting a Gmail thread is "Send email".
 */
export function actionTypeForTool(input: {
  toolName: string;
  viaConnector?: boolean;
  connectorKind?: string;
  readOnly?: boolean;
}): ApprovalActionType | null {
  const { toolName } = input;
  const builtin = BUILTIN_ACTION_TYPES[toolName];
  if (builtin) return builtin;
  if (!input.viaConnector) {
    // Built-ins that need approval but have no row of their own write to connected services.
    return APPROVAL_REQUIRED_BUILTIN_TOOLS.has(toolName) ? "connected_apps_write" : null;
  }
  if (!connectorToolRequiresApproval(toolName, input.readOnly)) return null;
  const kind = (input.connectorKind ?? connectorKindFromToolName(toolName)).toLowerCase();
  if (PURCHASE_CONNECTOR_SLUGS.has(kind) || /purchase|pay_|charge|checkout|buy_/i.test(toolName)) {
    return "spend_money";
  }
  if (EMAIL_CONNECTOR_SLUGS.has(kind) || /send.*mail|gmail_send|outlook_send/i.test(toolName)) {
    return "send_email";
  }
  if (CALENDAR_CONNECTOR_SLUGS.has(kind) || /calendar/i.test(toolName)) return "calendar_changes";
  if (MESSAGING_CONNECTOR_SLUGS.has(kind)) return "message_outside";
  if (/(^|_)(delete|remove|trash)(_|$)/i.test(toolName)) return "delete_data";
  return "connected_apps_write";
}

/** Rows always offer Allow. */
export function actionTypeAllowsAllow(_id: ApprovalActionType): boolean {
  return true;
}

/** A per-tool rule can never be Allow for a tool that always needs an explicit approval. */
export function toolRuleAllowsAllow(toolName: string): boolean {
  return !toolRequiresExplicitApproval(toolName);
}

const EFFECT_TO_CHOICE: Record<StoredActionApprovalRule["effect"], ApprovalChoice> = {
  always_allow: "allow",
  require_approval: "ask",
  block: "block",
};
export const CHOICE_TO_EFFECT: Record<ApprovalChoice, StoredActionApprovalRule["effect"]> = {
  allow: "always_allow",
  ask: "require_approval",
  block: "block",
};

/** The table's rows for the space, and the override of one bot when `botId` is given. */
export function buildApprovalTable(
  rules: ActionApprovalRule[],
  botId?: string,
): Array<{
  actionType: ApprovalActionType;
  effect: ApprovalChoice;
  spaceEffect: ApprovalChoice;
  botEffect: ApprovalChoice | null;
  primary: boolean;
}> {
  const choiceFor = (type: ApprovalActionType, scope: string | null): ApprovalChoice | null => {
    const found = rules.filter(
      (rule) =>
        rule.matchKind === "category" &&
        (rule.botId ?? null) === scope &&
        actionTypeFromCategory(rule.matchValue) === type,
    );
    if (found.length === 0) return null;
    // Legacy and new rows can both exist for one type; the stricter one shows.
    const effects = found.map((rule) => EFFECT_TO_CHOICE[rule.effect]);
    return effects.includes("block") ? "block" : effects.includes("ask") ? "ask" : "allow";
  };
  return ACTION_TYPES.map(({ id, defaultEffect, primary }) => {
    const spaceEffect = choiceFor(id, null) ?? defaultEffect;
    const botEffect = botId ? choiceFor(id, botId) : null;
    return { actionType: id, effect: botEffect ?? spaceEffect, spaceEffect, botEffect, primary };
  });
}

function categoryMatches(
  category: string,
  toolName: string,
  connectorKind: string,
  readOnly: boolean | undefined,
  viaConnector: boolean | undefined,
): boolean {
  const normalized = category.toLowerCase();
  const consequential = connectorToolRequiresApproval(toolName, readOnly);
  // Rules saved before the table keep their old, wider matching (they work without `viaConnector`).
  if (normalized === "email") {
    if (BUILTIN_MAIL_WRITE_TOOLS.has(toolName)) return true;
    if (EMAIL_CONNECTOR_SLUGS.has(connectorKind.toLowerCase())) return consequential;
    if (consequential && /send.*mail|gmail_send|outlook_send/i.test(toolName)) return true;
  }
  if (normalized === "purchase") {
    if (PURCHASE_CONNECTOR_SLUGS.has(connectorKind.toLowerCase())) return consequential;
    if (consequential && /purchase|pay_|charge|checkout|buy_/i.test(toolName)) return true;
  }
  const type = actionTypeFromCategory(category);
  if (!type) return false;
  return actionTypeForTool({ toolName, viaConnector, connectorKind, readOnly }) === type;
}

function ruleMatches(
  rule: ActionApprovalRule,
  toolName: string,
  connectorKind: string,
  readOnly: boolean | undefined,
  viaConnector: boolean | undefined,
): boolean {
  const value = rule.matchValue.toLowerCase();
  switch (rule.matchKind) {
    case "tool":
      return toolName.toLowerCase() === value;
    case "connector":
      return connectorKind.toLowerCase() === value;
    case "category":
      return categoryMatches(rule.matchValue, toolName, connectorKind, readOnly, viaConnector);
    default:
      return false;
  }
}

function ruleSpecificity(rule: ActionApprovalRule): number {
  switch (rule.matchKind) {
    case "tool":
      return 3;
    case "connector":
      return 2;
    case "category":
      return 1;
    default:
      return 0;
  }
}

export type ActionApprovalSource =
  | "block"
  | "require_approval"
  | "always_allow"
  | "default"
  | "action_type_default";

export type ActionApprovalResolved = {
  decision: "ask" | "allow" | "block";
  source: ActionApprovalSource;
  matchingRules: ActionApprovalRule[];
};

type ResolveInput = {
  toolName: string;
  connectorKind?: string;
  /** True for connector tools; the executor knows this. Needed to map connector writes to a type. */
  viaConnector?: boolean;
  readOnly?: boolean;
  /** Space-wide rules (botId null) and any bot's rules; only this bot's apply. */
  rules: ActionApprovalRule[];
  /** The acting bot. Its rules beat space-wide rules, whatever their specificity. */
  botId?: string;
};

/**
 * Deterministic rule resolution.
 * 1. Rules for the acting bot are tried first; if any matches, only they decide. Otherwise
 *    space-wide rules decide.
 * 2. Within a scope the most specific match wins (tool, then connector, then category). At equal
 *    specificity block beats ask beats allow.
 * 3. With no matching rule, a tool that maps to an action type uses that type's default
 *    (`action_type_default`); any other tool is allowed (`default`).
 * A tool that always needs an explicit approval is never allowed: Allow resolves to ask. Block
 * still applies to it.
 */
export function resolveActionApprovalDetail(input: ResolveInput): ActionApprovalResolved {
  const connectorKind = input.connectorKind ?? connectorKindFromToolName(input.toolName);
  const matching = (scope: ActionApprovalRule[]) =>
    scope.filter((rule) =>
      ruleMatches(rule, input.toolName, connectorKind, input.readOnly, input.viaConnector),
    );
  const botRules = matching(
    input.botId ? input.rules.filter((rule) => rule.botId === input.botId) : [],
  );
  const matchingRules =
    botRules.length > 0 ? botRules : matching(input.rules.filter((rule) => !rule.botId));
  const explicit = toolRequiresExplicitApproval(input.toolName);

  if (matchingRules.length === 0) {
    const type = actionTypeForTool({
      toolName: input.toolName,
      viaConnector: input.viaConnector,
      connectorKind,
      readOnly: input.readOnly,
    });
    const typeDefault = ACTION_TYPES.find((entry) => entry.id === type)?.defaultEffect;
    if (typeDefault === "ask" || (typeDefault && explicit)) {
      return { decision: "ask", source: "action_type_default", matchingRules };
    }
    if (typeDefault === "allow")
      return { decision: "allow", source: "action_type_default", matchingRules };
    return { decision: "allow", source: "default", matchingRules };
  }

  const highestSpecificity = Math.max(...matchingRules.map(ruleSpecificity));
  const winners = matchingRules.filter((rule) => ruleSpecificity(rule) === highestSpecificity);
  if (winners.some((rule) => rule.effect === "block")) {
    return { decision: "block", source: "block", matchingRules };
  }
  if (winners.some((rule) => rule.effect === "require_approval") || explicit) {
    return { decision: "ask", source: "require_approval", matchingRules };
  }
  return { decision: "allow", source: "always_allow", matchingRules };
}

export function resolveActionApproval(input: ResolveInput): "ask" | "allow" | "block" {
  return resolveActionApprovalDetail(input).decision;
}

export type AutoReviewJudgeDecision = "pass" | "ask" | "error";

/**
 * Pure combiner for Auto Review after rule resolution.
 * Rules win: block blocks, require_approval asks, always_allow runs. Only a call with no rule
 * (the global default, or an action type's default) may call a judge, and never an unattended
 * run. The judge only escalates a default allow to ask, or lets a default ask through; it never
 * silent-denies.
 */
export function planActionGate(input: {
  resolved: ActionApprovalResolved;
  consequential: boolean;
  autoReviewEnabled: boolean;
  checkerConfigured: boolean;
  /** An unattended run never plans a judge: nobody is there to be spared the card. */
  unattended?: boolean;
}): "ask" | "allow" | "judge" | "block" {
  const { resolved } = input;
  if (resolved.decision === "block") return "block";
  const judgeable =
    !input.unattended &&
    input.consequential &&
    input.autoReviewEnabled &&
    input.checkerConfigured &&
    (resolved.source === "default" || resolved.source === "action_type_default");
  // Explicit-approval tools reach here as ask with source require_approval or action_type_default;
  // the caller marks them mandatory before resolving, so a judge cannot clear them.
  if (resolved.decision === "ask") return judgeable ? "judge" : "ask";
  if (resolved.source === "always_allow") return "allow";
  return judgeable ? "judge" : "allow";
}

/** Map a judge outcome onto ask/allow. Errors fail closed on consequential tools. */
export function applyJudgeDecision(input: {
  decision: AutoReviewJudgeDecision;
  consequential: boolean;
}): "ask" | "allow" {
  if (input.decision === "pass") return "allow";
  if (input.decision === "ask") return "ask";
  return input.consequential ? "ask" : "allow";
}

export function isSecretAskBlock(block: {
  kind: string;
  input?: string;
  approvalEffectId?: string;
}): boolean {
  return block.kind === "ask" && block.input === "secret" && !block.approvalEffectId;
}

export function isApprovalAskBlock(block: {
  kind: string;
  approvalEffectId?: string;
  actions?: Array<{ id: string; label: string }>;
}): boolean {
  if (block.kind !== "ask" || !block.approvalEffectId || !block.actions?.length) return false;
  const actionIds = new Set(block.actions.map((action) => action.id));
  return (
    actionIds.has("allow") &&
    actionIds.has("deny") &&
    [...actionIds].every((id) => id === "allow" || id === "always" || id === "deny")
  );
}
