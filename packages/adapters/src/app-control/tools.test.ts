import { describe, expect, it } from "vitest";
import type { AppControlOfferInput } from "./tools.js";
import { appControlOffered, resolveAllowedApp } from "./tools.js";

const eligible: AppControlOfferInput = {
  hasProvider: true,
  enabled: true,
  appCount: 1,
  runUserId: "owner",
  ownerUserId: "owner",
  trigger: "user",
  unattended: false,
  externalTaint: false,
  meetingTainted: false,
  hostThisMac: false,
  computerKind: "docker",
  audience: "internal",
};

describe("appControlOffered", () => {
  it("offers the tools to an eligible owner run", () => {
    expect(appControlOffered(eligible)).toBe(true);
  });

  const denied: Array<[string, Partial<AppControlOfferInput>]> = [
    ["no provider", { hasProvider: false }],
    ["switch off", { enabled: false }],
    ["empty app list", { appCount: 0 }],
    ["non-owner user", { runUserId: "someone" }],
    ["no deployment owner", { ownerUserId: null }],
    ["unattended", { unattended: true }],
    ["external taint", { externalTaint: true }],
    ["meeting taint", { meetingTainted: true }],
    ["this-mac host", { hostThisMac: true }],
    ["desktop computer", { computerKind: "desktop" }],
    ["external audience", { audience: "external" }],
    ...[
      "resume",
      "bot_message",
      "spawn",
      "routine",
      "skill",
      "webhook",
      "messaging",
      "mcp",
      "follow_up",
      "reaction",
      "call_end",
      "cloud_agent",
      "created",
      "tickets",
    ].map((trigger): [string, Partial<AppControlOfferInput>] => [
      `trigger ${trigger}`,
      { trigger },
    ]),
  ];
  it.each(denied)("withholds the tools: %s", (_label, change) => {
    expect(appControlOffered({ ...eligible, ...change })).toBe(false);
  });
});

describe("resolveAllowedApp", () => {
  const allowed = [{ id: "com.apple.Music", name: "Music" }];
  it("matches by id or name and nothing else", () => {
    expect(resolveAllowedApp(allowed, "com.apple.music")?.id).toBe("com.apple.Music");
    expect(resolveAllowedApp(allowed, "music")?.id).toBe("com.apple.Music");
    expect(resolveAllowedApp(allowed, "Terminal")).toBeUndefined();
    expect(resolveAllowedApp(allowed, undefined)).toBeUndefined();
  });
});
