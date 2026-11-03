import { describe, expect, it } from "vitest";
import { EXTERNAL_TAINT_SAFE_TOOLS } from "./action-approval.js";
import {
  FIREWALL_ASK_TOOLS,
  FIREWALL_FREE_TOOLS,
  firewallDraftIsFree,
  firewallToolClass,
} from "./firewall.js";

describe("firewallToolClass", () => {
  it("classifies the plan's examples", () => {
    expect(firewallToolClass("notify_user")).toBe("free");
    expect(firewallToolClass("mail_get")).toBe("free");
    expect(firewallToolClass("read_history")).toBe("free");
    expect(firewallToolClass("mail_send")).toBe("ask");
    expect(firewallToolClass("save_memory")).toBe("ask");
    expect(firewallToolClass("message_bot")).toBe("ask");
    expect(firewallToolClass("web_fetch")).toBe("ask");
  });

  it("drops anything that is not on a list, including names it has never seen", () => {
    for (const name of [
      "shell",
      "search_data_room",
      "calendar_query",
      "agent_send",
      "update_bot",
      "web_search",
      "some_future_tool",
      "mcp__server__send",
      "",
    ]) {
      expect(firewallToolClass(name)).toBe("dropped");
    }
  });

  it("keeps the lists disjoint", () => {
    for (const name of FIREWALL_FREE_TOOLS) expect(FIREWALL_ASK_TOOLS.has(name)).toBe(false);
  });

  it("does not inherit names from Object.prototype", () => {
    expect(firewallToolClass("constructor")).toBe("dropped");
    expect(firewallToolClass("__proto__")).toBe("dropped");
  });

  it("makes every tainted-run safe tool free, except the ones the profile narrows", () => {
    // A tool added to EXTERNAL_TAINT_SAFE_TOOLS later fails here until someone decides about it.
    const narrowed = new Map<string, string>([
      ["attach_file", "dropped"],
      ["list_secrets", "dropped"],
      ["page_source_set", "dropped"],
      ["page_source_remove", "dropped"],
      ["pins_write", "dropped"],
      ["page_write", "ask"],
      ["page_create", "ask"],
    ]);
    for (const name of EXTERNAL_TAINT_SAFE_TOOLS) {
      expect(firewallToolClass(name), name).toBe(narrowed.get(name) ?? "free");
    }
  });
});

describe("firewallDraftIsFree", () => {
  const participants = ["sam@customer.example", "support@us.example"];
  it("is free when every recipient is a thread participant and the body has no link", () => {
    expect(
      firewallDraftIsFree({ to: ["sam@customer.example"], body: "Thanks, fixed.", participants }),
    ).toBe(true);
    expect(
      firewallDraftIsFree({
        to: ["SAM@customer.example"],
        cc: ["support@us.example"],
        body: "ok",
        participants,
      }),
    ).toBe(true);
  });
  it("asks for a new recipient in to, cc or bcc", () => {
    for (const field of ["to", "cc", "bcc"] as const) {
      expect(
        firewallDraftIsFree({
          to: ["sam@customer.example"],
          [field]: ["billing@evil.example"],
          body: "x",
          participants,
        }),
      ).toBe(false);
    }
  });
  it("asks without recipients or without known participants, and for any link", () => {
    expect(firewallDraftIsFree({ to: [], body: "x", participants })).toBe(false);
    expect(firewallDraftIsFree({ to: ["sam@customer.example"], body: "x", participants: [] })).toBe(
      false,
    );
    for (const body of ["see http://evil.example/x", "www.evil.example", "https://a.example"]) {
      expect(firewallDraftIsFree({ to: ["sam@customer.example"], body, participants })).toBe(false);
    }
  });
});
