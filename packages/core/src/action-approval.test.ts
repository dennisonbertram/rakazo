import { describe, expect, it } from "vitest";
import type { ActionApprovalRule, ActionApprovalSource } from "./action-approval.js";
import {
  ACTION_TYPES,
  actionTypeForTool,
  applyJudgeDecision,
  buildApprovalTable,
  connectorKindFromToolName,
  connectorReadRequiresApproval,
  connectorToolRequiresApproval,
  EXTERNAL_TAINT_SAFE_TOOLS,
  externalTaintAllowsTool,
  isApprovalAskBlock,
  isSecretAskBlock,
  outboundSiteGate,
  planActionGate,
  resolveActionApproval,
  resolveActionApprovalDetail,
  toolRequiresApproval,
  toolRequiresExplicitApproval,
  toolResultTaintsRun,
  toolRuleAllowsAllow,
  unattendedToolRequiresApproval,
  unattendedTriggerToolRequiresApproval,
} from "./action-approval.js";

describe("toolRequiresApproval", () => {
  it("requires approval for consequential builtins and destination writes", () => {
    expect(toolRequiresApproval("destination.write", false)).toBe(true);
    expect(toolRequiresApproval("destination.write", true)).toBe(true);
    expect(toolRequiresApproval("secret_request", false)).toBe(true);
    expect(toolRequiresApproval("forget_secret", false)).toBe(true);
    expect(toolRequiresApproval("forget_memory", false)).toBe(true);
    expect(toolRequiresApproval("list_secrets", false)).toBe(false);
    expect(toolRequiresApproval("delete_bot", false)).toBe(true);
    expect(toolRequiresApproval("archive_bot", false)).toBe(true);
    expect(toolRequiresApproval("cloud_agent_launch", false)).toBe(true);
    expect(toolRequiresApproval("create_space", false)).toBe(true);
    expect(toolRequiresApproval("contacts_save", false)).toBe(true);
    expect(toolRequiresApproval("contacts_add", false)).toBe(false);
    expect(toolRequiresApproval("cap_table_update", false)).toBe(false);
    expect(toolRequiresExplicitApproval("contacts_save")).toBe(false);
    expect(toolRequiresExplicitApproval("create_space")).toBe(true);
    expect(toolRequiresExplicitApproval("imessage_send")).toBe(true);
    expect(toolRequiresExplicitApproval("imessage_read")).toBe(false);
    expect(toolRequiresExplicitApproval("save_shared_memory")).toBe(false);
    expect(toolRequiresExplicitApproval("archive_bot")).toBe(false);
  });

  it("does not gate read-only or local work", () => {
    for (const name of [
      "list_files",
      "computer_observe",
      "read_file",
      "write_file",
      "shell",
      "remember",
      "save_shared_memory",
      "spawn_bot",
      "run_subagent",
    ]) {
      expect(toolRequiresApproval(name, false)).toBe(false);
    }
  });

  it("gates connector executes except obvious reads", () => {
    expect(toolRequiresApproval("gmail_send_email", true)).toBe(true);
    expect(toolRequiresApproval("crm_create_note", true)).toBe(true);
    expect(toolRequiresApproval("get_contact", true)).toBe(false);
    expect(toolRequiresApproval("contacts_get", true)).toBe(false);
    expect(toolRequiresApproval("GMAIL_LIST_THREADS", true)).toBe(false);
    expect(toolRequiresApproval("list_messages", true)).toBe(false);
    expect(toolRequiresApproval("search_threads", true)).toBe(false);
    expect(toolRequiresApproval("find_user", true)).toBe(false);
    expect(toolRequiresApproval("read_inbox", true)).toBe(false);
    expect(toolRequiresApproval("contacts_get_or_create", true)).toBe(true);
    expect(toolRequiresApproval("notion_search_and_update", true)).toBe(true);
    expect(toolRequiresApproval("crm_get_then_upsert", true)).toBe(true);
  });
});

describe("connectorToolRequiresApproval", () => {
  it("matches read-only connector tool names", () => {
    expect(connectorToolRequiresApproval("list_items")).toBe(false);
    expect(connectorToolRequiresApproval("send_message")).toBe(true);
  });

  it("requires approval for a declared write whatever its name says", () => {
    expect(connectorToolRequiresApproval("read_profile_card", false)).toBe(true);
    expect(connectorToolRequiresApproval("find_validator_record", false)).toBe(true);
    expect(connectorToolRequiresApproval("read_profile_card", true)).toBe(false);
    expect(connectorToolRequiresApproval("read_profile_card")).toBe(false);
  });

  it("never lets a declared read relax a mutating or ambiguous name", () => {
    expect(connectorToolRequiresApproval("delete_item", true)).toBe(true);
    expect(connectorToolRequiresApproval("get_or_create_contact", true)).toBe(true);
    expect(connectorToolRequiresApproval("profile_card", true)).toBe(true);
  });
});

describe("resolveActionApprovalDetail", () => {
  it("applies category rules to declared writes with read-looking names", () => {
    const rules = [
      { effect: "require_approval" as const, matchKind: "category" as const, matchValue: "email" },
    ];
    const base = { toolName: "gmail_read_thread", connectorKind: "gmail", rules };
    expect(resolveActionApprovalDetail(base).decision).toBe("allow");
    expect(resolveActionApprovalDetail({ ...base, readOnly: false }).decision).toBe("ask");
  });
});

describe("unattendedTriggerToolRequiresApproval", () => {
  it("forces approval for webhook-triggered local side effects", () => {
    for (const name of ["shell", "write_file", "browser_act", "computer_act"]) {
      expect(unattendedTriggerToolRequiresApproval("webhook", name, false)).toBe(true);
    }
  });

  it("allows webhook-triggered reads to stay unattended", () => {
    for (const name of [
      "computer_observe",
      "read_file",
      "web_search",
      "browser_snapshot",
      "request_takeover",
      "run_subagent",
    ]) {
      expect(unattendedTriggerToolRequiresApproval("webhook", name, false)).toBe(false);
    }
    expect(unattendedTriggerToolRequiresApproval("webhook", "github_get_issue", true)).toBe(false);
  });

  it("forces approval for webhook-triggered connector writes regardless of normal rules", () => {
    expect(unattendedTriggerToolRequiresApproval("webhook", "github_create_issue", true)).toBe(
      true,
    );
    expect(unattendedTriggerToolRequiresApproval("user", "shell", false)).toBe(false);
  });

  it("forces approval for webhook-triggered declared writes with read-looking names", () => {
    for (const name of ["read_profile_card", "find_validator_record", "get_status"]) {
      expect(unattendedTriggerToolRequiresApproval("webhook", name, true, false)).toBe(true);
      expect(toolRequiresApproval(name, true, false)).toBe(true);
    }
    expect(unattendedTriggerToolRequiresApproval("webhook", "read_profile_card", true, true)).toBe(
      false,
    );
    expect(unattendedTriggerToolRequiresApproval("webhook", "delete_record", true, true)).toBe(
      true,
    );
    expect(unattendedTriggerToolRequiresApproval("user", "read_profile_card", true, false)).toBe(
      false,
    );
  });
});

describe("isApprovalAskBlock", () => {
  it("detects allow/deny approval cards", () => {
    expect(
      isApprovalAskBlock({
        kind: "ask",
        approvalEffectId: "effect-1",
        actions: [
          { id: "allow", label: "Allow once" },
          { id: "always", label: "Always allow" },
          { id: "deny", label: "Deny" },
        ],
      }),
    ).toBe(true);
    expect(isApprovalAskBlock({ kind: "ask" })).toBe(false);
    expect(
      isApprovalAskBlock({
        kind: "ask",
        approvalEffectId: "effect-1",
        actions: [{ id: "deny", label: "No" }],
      }),
    ).toBe(false);
  });
});

describe("isSecretAskBlock", () => {
  it("detects masked secret asks", () => {
    expect(isSecretAskBlock({ kind: "ask", input: "secret" })).toBe(true);
    expect(isSecretAskBlock({ kind: "ask", input: "text" })).toBe(false);
    expect(
      isSecretAskBlock({
        kind: "ask",
        input: "secret",
        approvalEffectId: "effect-1",
      }),
    ).toBe(false);
  });
});

describe("connectorKindFromToolName", () => {
  it("uses the first underscore segment", () => {
    expect(connectorKindFromToolName("gmail_send_email")).toBe("gmail");
  });

  it("prefers the longest matching connected provider slug", () => {
    expect(
      connectorKindFromToolName("microsoft_outlook_send_email", ["microsoft", "microsoft_outlook"]),
    ).toBe("microsoft_outlook");
  });
});

describe("resolveActionApproval", () => {
  const alwaysAllowDestination: ActionApprovalRule[] = [
    { effect: "always_allow", matchKind: "tool", matchValue: "destination.write" },
  ];
  const requireEmail: ActionApprovalRule[] = [
    { effect: "require_approval", matchKind: "category", matchValue: "email" },
  ];
  const requireDestination: ActionApprovalRule[] = [
    { effect: "require_approval", matchKind: "tool", matchValue: "destination.write" },
  ];

  it("skips approval when always-allow matches", () => {
    expect(
      resolveActionApproval({
        toolName: "destination.write",
        rules: alwaysAllowDestination,
      }),
    ).toBe("allow");
  });

  it("requires approval for email even when always-allow would match another tool", () => {
    expect(
      resolveActionApproval({
        toolName: "gmail_send_email",
        rules: [...alwaysAllowDestination, ...requireEmail],
      }),
    ).toBe("ask");
  });

  it("applies the email category to the built-in mail write tools", () => {
    for (const toolName of ["mail_draft", "mail_modify", "mail_send"])
      expect(resolveActionApproval({ toolName, rules: requireEmail })).toBe("ask");
    expect(resolveActionApproval({ toolName: "mail_read", rules: requireEmail })).toBe("allow");
  });

  it("does not apply consequential categories to connector reads", () => {
    expect(
      resolveActionApproval({
        toolName: "gmail_list_threads",
        rules: requireEmail,
      }),
    ).toBe("allow");
  });

  it("lets an explicit rule gate a tool that is exempt by default", () => {
    expect(
      resolveActionApproval({
        toolName: "shell",
        rules: [{ effect: "require_approval", matchKind: "tool", matchValue: "shell" }],
      }),
    ).toBe("ask");
  });

  it("lets require_approval beat always-allow at the same specificity", () => {
    expect(
      resolveActionApproval({
        toolName: "destination.write",
        rules: [...alwaysAllowDestination, ...requireDestination],
      }),
    ).toBe("ask");
  });

  it("allows actions by default when no rules match", () => {
    expect(
      resolveActionApproval({
        toolName: "list_files",
        rules: [],
      }),
    ).toBe("allow");
    expect(resolveActionApproval({ toolName: "remember", rules: [] })).toBe("allow");
  });

  it("lets a tool exception override a broader category rule", () => {
    expect(
      resolveActionApproval({
        toolName: "gmail_send_email",
        rules: [
          ...requireEmail,
          { effect: "always_allow", matchKind: "tool", matchValue: "gmail_send_email" },
        ],
      }),
    ).toBe("allow");
  });

  it("labels always-allow vs default allow", () => {
    expect(
      resolveActionApprovalDetail({
        toolName: "destination.write",
        rules: alwaysAllowDestination,
      }),
    ).toMatchObject({ decision: "allow", source: "always_allow" });
    expect(
      resolveActionApprovalDetail({
        toolName: "remember",
        rules: [],
      }),
    ).toMatchObject({ decision: "allow", source: "default" });
  });
});

describe("planActionGate", () => {
  const consequential = true;

  it("lets require_approval win without judging", () => {
    expect(
      planActionGate({
        resolved: {
          decision: "ask",
          source: "require_approval",
          matchingRules: [],
        },
        consequential,
        autoReviewEnabled: true,
        checkerConfigured: true,
      }),
    ).toBe("ask");
  });

  it("lets always_allow skip the judge", () => {
    expect(
      planActionGate({
        resolved: {
          decision: "allow",
          source: "always_allow",
          matchingRules: [],
        },
        consequential,
        autoReviewEnabled: true,
        checkerConfigured: true,
      }),
    ).toBe("allow");
  });

  it("judges consequential default actions when auto review is ready", () => {
    expect(
      planActionGate({
        resolved: { decision: "allow", source: "default", matchingRules: [] },
        consequential,
        autoReviewEnabled: true,
        checkerConfigured: true,
      }),
    ).toBe("judge");
  });

  it("stays YOLO when auto review is off or checker missing", () => {
    expect(
      planActionGate({
        resolved: { decision: "allow", source: "default", matchingRules: [] },
        consequential,
        autoReviewEnabled: false,
        checkerConfigured: true,
      }),
    ).toBe("allow");
    expect(
      planActionGate({
        resolved: { decision: "allow", source: "default", matchingRules: [] },
        consequential,
        autoReviewEnabled: true,
        checkerConfigured: false,
      }),
    ).toBe("allow");
  });

  it("asks before a new site without judging, even with a rule for the whole tool", () => {
    const gate = (source: "default" | "always_allow") =>
      planActionGate({
        resolved: { decision: "allow", source, matchingRules: [] },
        consequential,
        autoReviewEnabled: true,
        checkerConfigured: true,
        newDestination: true,
      });
    expect(gate("default")).toBe("ask");
    expect(gate("always_allow")).toBe("ask");
  });

  it("does not judge non-consequential tools", () => {
    expect(
      planActionGate({
        resolved: { decision: "allow", source: "default", matchingRules: [] },
        consequential: false,
        autoReviewEnabled: true,
        checkerConfigured: true,
      }),
    ).toBe("allow");
  });
});

describe("applyJudgeDecision", () => {
  it("maps pass and ask", () => {
    expect(applyJudgeDecision({ decision: "pass", consequential: true })).toBe("allow");
    expect(applyJudgeDecision({ decision: "ask", consequential: true })).toBe("ask");
  });

  it("fails closed on consequential checker errors and open on exempt", () => {
    expect(applyJudgeDecision({ decision: "error", consequential: true })).toBe("ask");
    expect(applyJudgeDecision({ decision: "error", consequential: false })).toBe("allow");
  });
});

describe("mail write tools", () => {
  it.each(["mail_draft", "mail_modify", "mail_send"])(
    "%s needs approval, also on an unattended run",
    (name) => {
      expect(toolRequiresApproval(name, false)).toBe(true);
      expect(unattendedTriggerToolRequiresApproval("webhook", name, false)).toBe(true);
      expect(toolRequiresExplicitApproval(name)).toBe(false);
    },
  );
});

describe("calendar write tools", () => {
  it.each(["calendar_create_event", "calendar_update_event", "calendar_delete_event"])(
    "%s needs approval, also on an unattended run",
    (name) => {
      expect(toolRequiresApproval(name, false)).toBe(true);
      expect(unattendedTriggerToolRequiresApproval("webhook", name, false)).toBe(true);
    },
  );
});

describe("drive write tools", () => {
  it.each(["drive_create_file", "drive_update_file"])("%s needs approval", (name) => {
    expect(toolRequiresApproval(name, false)).toBe(true);
    expect(unattendedTriggerToolRequiresApproval("webhook", name, false)).toBe(true);
  });
  it.each(["drive_search", "drive_read"])("%s does not", (name) => {
    expect(toolRequiresApproval(name, false)).toBe(false);
  });
});

const rule = (
  effect: "always_allow" | "require_approval" | "block",
  matchKind: "tool" | "connector" | "category",
  matchValue: string,
  botId: string | null = null,
) => ({ effect, matchKind, matchValue, botId });

describe("actionTypeForTool", () => {
  it.each([
    ["mail_send", false, "send_email"],
    ["mail_draft", false, "send_email"],
    ["mail_modify", false, "send_email"],
    ["calendar_create_event", false, "calendar_changes"],
    ["calendar_delete_event", false, "calendar_changes"],
    ["write_file", false, "files_and_commands"],
    ["shell", false, "files_and_commands"],
    ["open_path", false, "files_and_commands"],
    ["launch_app", false, "files_and_commands"],
    ["computer_act", false, "use_computer"],
    ["browser_act", false, "use_computer"],
    ["browser_navigate", false, "use_computer"],
    ["delete_bot", false, "delete_data"],
    ["forget_memory", false, "delete_data"],
    ["forget_secret", false, "delete_data"],
    ["imessage_send", false, "message_outside"],
    ["secret_request", false, "use_credentials"],
    ["fill_secret", false, "use_credentials"],
    ["drive_create_file", false, "connected_apps_write"],
    ["gmail_send_email", true, "send_email"],
    ["stripe_create_charge", true, "spend_money"],
    ["googlecalendar_create_event", true, "calendar_changes"],
    ["slack_post_message", true, "message_outside"],
    ["github_delete_branch", true, "delete_data"],
    ["github_create_issue", true, "connected_apps_write"],
  ] as const)("%s (connector %s) is %s", (toolName, viaConnector, expected) => {
    expect(actionTypeForTool({ toolName, viaConnector })).toBe(expected);
  });

  it("maps read-only tools to no action type", () => {
    expect(actionTypeForTool({ toolName: "read_file" })).toBeNull();
    expect(actionTypeForTool({ toolName: "github_get_issue", viaConnector: true })).toBeNull();
    expect(
      actionTypeForTool({ toolName: "github_get_issue", viaConnector: true, readOnly: false }),
    ).toBe("connected_apps_write");
  });

  it("does not let a readOnly hint hide a mutating connector tool", () => {
    expect(
      actionTypeForTool({ toolName: "gmail_send_email", viaConnector: true, readOnly: true }),
    ).toBe("send_email");
    expect(
      actionTypeForTool({ toolName: "GMAIL_FETCH_EMAILS", viaConnector: true, readOnly: true }),
    ).toBeNull();
    expect(
      resolveActionApprovalDetail({
        toolName: "gmail_send_email",
        viaConnector: true,
        readOnly: true,
        rules: [
          {
            matchKind: "category",
            matchValue: "send_email",
            effect: "block",
            botId: null,
          },
        ],
      } as never).decision,
    ).toBe("block");
  });

  it("lists the nine action types, five shown by default", () => {
    expect(ACTION_TYPES.map((type) => type.id)).toHaveLength(9);
    expect(ACTION_TYPES.filter((type) => type.primary)).toHaveLength(5);
    expect(ACTION_TYPES.find((type) => type.id === "files_and_commands")?.defaultEffect).toBe(
      "allow",
    );
  });
});

describe("block rules and per-bot rules", () => {
  const gmail = { toolName: "gmail_send_email", connectorKind: "gmail", viaConnector: true };

  it("block beats ask beats allow at equal specificity", () => {
    expect(
      resolveActionApprovalDetail({
        ...gmail,
        rules: [rule("always_allow", "category", "send_email"), rule("block", "category", "email")],
      }),
    ).toMatchObject({ decision: "block", source: "block" });
    expect(
      resolveActionApprovalDetail({
        ...gmail,
        rules: [
          rule("always_allow", "category", "send_email"),
          rule("require_approval", "category", "email"),
        ],
      }),
    ).toMatchObject({ decision: "ask", source: "require_approval" });
  });

  it("a more specific rule still wins over a block", () => {
    expect(
      resolveActionApproval({
        ...gmail,
        rules: [
          rule("block", "category", "send_email"),
          rule("always_allow", "tool", "gmail_send_email"),
        ],
      }),
    ).toBe("allow");
  });

  it("a bot rule beats a space rule at any specificity", () => {
    const rules = [
      rule("always_allow", "tool", "gmail_send_email"),
      rule("block", "category", "send_email", "bot-1"),
    ];
    expect(resolveActionApproval({ ...gmail, rules, botId: "bot-1" })).toBe("block");
    expect(resolveActionApproval({ ...gmail, rules, botId: "bot-2" })).toBe("allow");
    expect(resolveActionApproval({ ...gmail, rules })).toBe("allow");
  });

  it("falls back to space rules when the bot has no matching rule", () => {
    const rules = [
      rule("block", "category", "send_email"),
      rule("always_allow", "category", "spend_money", "bot-1"),
    ];
    expect(resolveActionApproval({ ...gmail, rules, botId: "bot-1" })).toBe("block");
  });

  it("uses the action type default when no rule matches", () => {
    expect(resolveActionApprovalDetail({ ...gmail, rules: [] })).toMatchObject({
      decision: "ask",
      source: "action_type_default",
    });
    expect(resolveActionApprovalDetail({ toolName: "shell", rules: [] })).toMatchObject({
      decision: "allow",
      source: "action_type_default",
    });
    expect(resolveActionApprovalDetail({ toolName: "remember", rules: [] })).toMatchObject({
      decision: "allow",
      source: "default",
    });
  });

  it("never allows an explicit-approval tool, but can block it", () => {
    expect(
      resolveActionApprovalDetail({
        toolName: "imessage_send",
        rules: [rule("always_allow", "tool", "imessage_send")],
      }),
    ).toMatchObject({ decision: "ask" });
    expect(
      resolveActionApprovalDetail({
        toolName: "imessage_send",
        rules: [rule("block", "category", "message_outside")],
      }),
    ).toMatchObject({ decision: "block" });
    expect(toolRuleAllowsAllow("imessage_send")).toBe(false);
    expect(toolRuleAllowsAllow("shell")).toBe(true);
  });
});

describe("planActionGate with block and unattended runs", () => {
  const base = { consequential: true, autoReviewEnabled: true, checkerConfigured: true };
  const resolved = (decision: "ask" | "allow" | "block", source: ActionApprovalSource) => ({
    decision,
    source,
    matchingRules: [],
  });

  it("blocks without review", () => {
    expect(planActionGate({ ...base, resolved: resolved("block", "block") })).toBe("block");
  });

  it("plans a judge for a default only when attended", () => {
    expect(planActionGate({ ...base, resolved: resolved("allow", "default") })).toBe("judge");
    expect(planActionGate({ ...base, resolved: resolved("ask", "action_type_default") })).toBe(
      "judge",
    );
    expect(
      planActionGate({ ...base, unattended: true, resolved: resolved("allow", "default") }),
    ).toBe("allow");
    expect(
      planActionGate({
        ...base,
        unattended: true,
        resolved: resolved("ask", "action_type_default"),
      }),
    ).toBe("ask");
  });

  it("never judges a rule", () => {
    expect(planActionGate({ ...base, resolved: resolved("ask", "require_approval") })).toBe("ask");
    expect(planActionGate({ ...base, resolved: resolved("allow", "always_allow") })).toBe("allow");
  });
});

describe("unattendedToolRequiresApproval", () => {
  it("never asks for an attended run", () => {
    expect(unattendedToolRequiresApproval(false, "shell", false)).toBe(false);
    expect(unattendedToolRequiresApproval(false, "github_create_issue", true)).toBe(false);
  });

  it.each([
    "write_file",
    "shell",
    "computer_act",
    "browser_act",
    "open_path",
    "launch_app",
    "add_to_data_room",
    "mail_send",
    "contacts_add",
    "cap_table_update",
    "mail_draft",
    "mail_modify",
    "drive_create_file",
    "drive_update_file",
    "calendar_create_event",
    "calendar_update_event",
    "calendar_delete_event",
    "contacts_save",
  ])("asks for %s in an unattended run", (name) => {
    expect(unattendedToolRequiresApproval(true, name, false)).toBe(true);
  });

  it.each([
    "mail_search",
    "mail_grep",
    "mail_get",
    "inbox_overview",
    "drive_search",
    "drive_read",
    "calendar_list_events",
    "calendar_get_event",
    "contacts_list",
  ])("does not ask for the read-only %s in an unattended run", (name) => {
    expect(unattendedToolRequiresApproval(true, name, false)).toBe(false);
  });

  it.each([
    "read_file",
    "run_subagent",
    "notify_user",
    "create_ui_artifact",
    "attach_file",
    "page_write",
    "pins_write",
    "legal_unreviewed_documents",
    "legal_upsert_contract",
    "legal_upsert_deadline",
    "legal_upsert_node",
    "legal_link",
    "legal_query",
  ])("lets %s run in an unattended run", (name) => {
    expect(unattendedToolRequiresApproval(true, name, false)).toBe(false);
  });

  it("keeps an internal legal tool asking in a tainted run", () => {
    expect(externalTaintAllowsTool("legal_upsert_contract")).toBe(false);
  });

  it("does not exempt a connector tool that shares a legal name", () => {
    expect(unattendedToolRequiresApproval(true, "legal_upsert_contract", true)).toBe(true);
  });

  it("allows only GET and HEAD secret requests", () => {
    expect(unattendedToolRequiresApproval(true, "secret_request", false, undefined, {})).toBe(
      false,
    );
    for (const method of ["GET", "HEAD"]) {
      expect(
        unattendedToolRequiresApproval(true, "secret_request", false, undefined, { method }),
      ).toBe(false);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        unattendedToolRequiresApproval(true, "secret_request", false, undefined, { method }),
      ).toBe(true);
    }
  });

  it("gates scratchpad writes by category and fails closed when it is unknown", () => {
    const check = (name: string, args: Record<string, unknown>) =>
      unattendedToolRequiresApproval(true, name, false, undefined, args);
    expect(check("scratchpad_add", {})).toBe(false);
    expect(check("scratchpad_add", { category: "followup" })).toBe(false);
    expect(check("scratchpad_add", { category: "public_post" })).toBe(true);
    expect(check("scratchpad_update", { category: "followup" })).toBe(false);
    expect(check("scratchpad_update", { category: "outbound_email" })).toBe(true);
    expect(check("scratchpad_complete", {})).toBe(true);
    expect(check("scratchpad_complete", { category: "create_account" })).toBe(true);
  });

  it("asks for connector writes and lets declared reads run", () => {
    expect(unattendedToolRequiresApproval(true, "github_create_issue", true)).toBe(true);
    expect(unattendedToolRequiresApproval(true, "github_get_issue", true, true)).toBe(false);
  });
});

describe("buildApprovalTable", () => {
  it("shows defaults, space rules, legacy aliases and a bot override", () => {
    const rows = buildApprovalTable(
      [
        rule("require_approval", "category", "email"),
        rule("block", "category", "delete_data"),
        rule("always_allow", "category", "send_email", "bot-1"),
        rule("block", "category", "delete_data", "bot-2"),
      ],
      "bot-1",
    );
    const byType = Object.fromEntries(rows.map((row) => [row.actionType, row]));
    expect(rows).toHaveLength(9);
    expect(byType.send_email).toMatchObject({
      spaceEffect: "ask",
      botEffect: "allow",
      effect: "allow",
    });
    expect(byType.delete_data).toMatchObject({
      spaceEffect: "block",
      botEffect: null,
      effect: "block",
    });
    expect(byType.files_and_commands).toMatchObject({ spaceEffect: "allow", botEffect: null });
    expect(buildApprovalTable([], undefined)[0]).toMatchObject({ botEffect: null, primary: true });
  });
});

describe("tool_run", () => {
  it("runs without a card in unattended and tainted runs", () => {
    expect(unattendedToolRequiresApproval(true, "tool_run", false)).toBe(false);
    expect(externalTaintAllowsTool("tool_run")).toBe(true);
  });
});

describe("external taint safe tools", () => {
  it("excludes tools that can carry private data out", () => {
    for (const name of ["web_fetch", "web_search", "search_data_room", "company_get", "shell"]) {
      expect(EXTERNAL_TAINT_SAFE_TOOLS.has(name)).toBe(false);
    }
    expect(externalTaintAllowsTool("ask_user")).toBe(true);
    expect(externalTaintAllowsTool("web_fetch")).toBe(false);
  });

  it("keeps internal metadata reads free", () => {
    for (const name of ["task_catalog", "schedule_list", "schedule_runs", "list_secrets"]) {
      expect(externalTaintAllowsTool(name)).toBe(true);
    }
  });

  it("applies the scratchpad category rule", () => {
    expect(externalTaintAllowsTool("scratchpad_list")).toBe(true);
    expect(externalTaintAllowsTool("scratchpad_add", { category: "followup" })).toBe(true);
    expect(externalTaintAllowsTool("scratchpad_add", { category: "public_post" })).toBe(false);
    expect(externalTaintAllowsTool("scratchpad_complete", {})).toBe(false);
  });
});

describe("outboundSiteGate", () => {
  const siteRule: ActionApprovalRule = {
    effect: "always_allow",
    matchKind: "site",
    matchValue: "example.com",
  };

  it("lets a run reach sites it was given", () => {
    expect(
      outboundSiteGate({ trigger: "user", site: "example.com", trusted: true, rules: [] }),
    ).toBe("allow");
  });

  it("asks before a new site in a run a person can answer", () => {
    for (const trigger of ["user", "follow_up", "routine", "bot_message", "messaging"]) {
      expect(outboundSiteGate({ trigger, site: "attacker.test", trusted: false, rules: [] })).toBe(
        "ask",
      );
    }
  });

  it("refuses a new site in a webhook run and never allows it on its own", () => {
    expect(
      outboundSiteGate({ trigger: "webhook", site: "attacker.test", trusted: false, rules: [] }),
    ).toBe("deny");
    expect(
      outboundSiteGate({
        trigger: "webhook",
        site: "attacker.test",
        trusted: false,
        rules: [{ effect: "always_allow", matchKind: "tool", matchValue: "web_fetch" }],
      }),
    ).toBe("deny");
  });

  it("allows a site the owner always allowed, even in a webhook run", () => {
    for (const trigger of ["user", "webhook"]) {
      expect(
        outboundSiteGate({ trigger, site: "example.com", trusted: false, rules: [siteRule] }),
      ).toBe("allow");
    }
    expect(
      outboundSiteGate({
        trigger: "webhook",
        site: "other.com",
        trusted: false,
        rules: [siteRule],
      }),
    ).toBe("deny");
  });

  it("matches site rules ahead of tool rules", () => {
    expect(
      resolveActionApprovalDetail({
        toolName: "web_fetch",
        site: "example.com",
        rules: [
          { effect: "require_approval", matchKind: "tool", matchValue: "web_fetch" },
          siteRule,
        ],
      }).decision,
    ).toBe("allow");
    expect(
      resolveActionApprovalDetail({ toolName: "web_fetch", site: "other.com", rules: [siteRule] })
        .source,
    ).toBe("default");
  });
});

describe("connectorReadRequiresApproval", () => {
  it("keeps reads free until outside content enters the run", () => {
    expect(connectorReadRequiresApproval({ tainted: false, connectorTrusted: false })).toBe(false);
  });

  it("keeps reads free on a connector the run already used or was approved for", () => {
    expect(connectorReadRequiresApproval({ tainted: true, connectorTrusted: true })).toBe(false);
  });

  it("asks before a read on a new connector once the run is tainted", () => {
    expect(connectorReadRequiresApproval({ tainted: true, connectorTrusted: false })).toBe(true);
  });
});

describe("toolResultTaintsRun", () => {
  it("treats outside content as taint, including connector tools and new tools", () => {
    for (const tool of [
      "web_fetch",
      "web_search",
      "browser_snapshot",
      "computer_observe",
      "shell",
      "read_file",
      "run_subagent",
      "gmail_list_messages",
      "some_future_tool",
    ]) {
      expect(toolResultTaintsRun(tool)).toBe(true);
    }
  });

  it("does not taint on the bot's own writes and saved state", () => {
    for (const tool of ["ask_user", "remember", "recall_memory", "skill_read", "write_file"]) {
      expect(toolResultTaintsRun(tool)).toBe(false);
    }
  });
});
