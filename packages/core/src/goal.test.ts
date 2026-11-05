import { describe, expect, it } from "vitest";
import { extractForcedSkillName } from "./agent-skill.js";
import { GOAL_TEXT_MAX, parseGoalCommand } from "./goal.js";

describe("parseGoalCommand", () => {
  it("sets a goal from the trimmed text, allowing leading whitespace and several lines", () => {
    expect(parseGoalCommand("/goal ship the report")).toEqual({
      kind: "set",
      text: "ship the report",
    });
    expect(parseGoalCommand("  \n/goal   a\nb  ")).toEqual({ kind: "set", text: "a\nb" });
    expect(parseGoalCommand("/goal\nline one\nline two")).toEqual({
      kind: "set",
      text: "line one\nline two",
    });
  });

  it("shows the goal for a bare command", () => {
    expect(parseGoalCommand("/goal")).toEqual({ kind: "show" });
    expect(parseGoalCommand("/goal   \n ")).toEqual({ kind: "show" });
  });

  it("clears only for the exact word, in any case", () => {
    expect(parseGoalCommand("/goal clear")).toEqual({ kind: "clear" });
    expect(parseGoalCommand("/goal  CLEAR  ")).toEqual({ kind: "clear" });
    expect(parseGoalCommand("/goal clear the inbox")).toEqual({
      kind: "set",
      text: "clear the inbox",
    });
  });

  it("is not a command for other words or text", () => {
    expect(parseGoalCommand("/goals x")).toBeNull();
    expect(parseGoalCommand("/goalx")).toBeNull();
    expect(parseGoalCommand("please /goal x")).toBeNull();
    expect(parseGoalCommand("goal x")).toBeNull();
  });

  it("rejects text over the limit and accepts exactly the limit", () => {
    expect(parseGoalCommand(`/goal ${"a".repeat(GOAL_TEXT_MAX)}`)).toEqual({
      kind: "set",
      text: "a".repeat(GOAL_TEXT_MAX),
    });
    expect(parseGoalCommand(`/goal ${"a".repeat(GOAL_TEXT_MAX + 1)}`)).toEqual({
      kind: "too_long",
    });
  });

  it("keeps /goal out of the skill lookup", () => {
    expect(extractForcedSkillName("/goal x")).toBeNull();
    expect(extractForcedSkillName("/goal")).toBeNull();
    expect(extractForcedSkillName("/goals x")).toEqual({ name: "goals x", rest: "" });
  });
});
