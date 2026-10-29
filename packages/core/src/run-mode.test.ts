import { RUN_TRIGGERS } from "@rakazo/contracts";
import { describe, expect, it } from "vitest";
import { chainedRunMode, newRunExternalTaint, newRunUnattended } from "./run-mode.js";

const OWNER_LIVE = ["user", "reaction", "call_end", "skill", "follow_up"];

describe("newRunUnattended", () => {
  it.each(RUN_TRIGGERS)("%s without a source run", (trigger) => {
    expect(newRunUnattended({ trigger })).toBe(!OWNER_LIVE.includes(trigger));
  });

  it("is unattended for an unknown trigger", () => {
    expect(newRunUnattended({ trigger: "something_new" })).toBe(true);
    expect(newRunUnattended({ trigger: "something_new", source: null })).toBe(true);
  });

  it.each(RUN_TRIGGERS)("%s copies the source run's mode", (trigger) => {
    expect(newRunUnattended({ trigger, source: { unattended: true } })).toBe(true);
    expect(newRunUnattended({ trigger, source: { unattended: false } })).toBe(false);
  });
});

describe("newRunExternalTaint", () => {
  it.each(RUN_TRIGGERS)("%s without a source run", (trigger) => {
    expect(newRunExternalTaint({ trigger })).toBe(
      ["webhook", "messaging", "mcp"].includes(trigger),
    );
  });

  it("inherits from the source run and never clears it", () => {
    expect(newRunExternalTaint({ trigger: "spawn", source: { externalTaint: true } })).toBe(true);
    expect(newRunExternalTaint({ trigger: "webhook", source: { externalTaint: false } })).toBe(
      true,
    );
    expect(newRunExternalTaint({ trigger: "follow_up", source: { externalTaint: false } })).toBe(
      false,
    );
  });
});

describe("chainedRunMode", () => {
  it("copies the source run", () => {
    expect(chainedRunMode("follow_up", { unattended: false, externalTaint: false })).toEqual({
      unattended: false,
      externalTaint: false,
    });
    expect(chainedRunMode("spawn", { unattended: true, externalTaint: true })).toEqual({
      unattended: true,
      externalTaint: true,
    });
  });

  it("fails closed when the source is unknown", () => {
    expect(chainedRunMode("follow_up", null)).toEqual({ unattended: true, externalTaint: true });
  });
});
