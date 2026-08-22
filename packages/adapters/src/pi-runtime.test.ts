import { describe, expect, it } from "vitest";
import { describeToolActivity } from "./pi-runtime.js";

describe("describeToolActivity", () => {
  it("summarizes builtin tools with their most informative argument", () => {
    expect(describeToolActivity("shell", { command: "pnpm test --filter web" })).toBe(
      "Running: pnpm test --filter web",
    );
    expect(describeToolActivity("read_file", { path: "notes/plan.md" })).toBe(
      "Reading notes/plan.md",
    );
    expect(describeToolActivity("write_file", { path: "out.csv", content: "…" })).toBe(
      "Writing out.csv",
    );
    expect(describeToolActivity("render_plot", { spec: {} })).toBe("Rendering a chart");
    expect(describeToolActivity("run_subagent", { name: "scout", task: "…" })).toBe(
      "Delegating to helper: scout",
    );
  });

  it("names MCP server and remote tool", () => {
    expect(describeToolActivity("mcp__brex__list_expenses", {})).toBe(
      "Using brex: list_expenses",
    );
    expect(describeToolActivity("mcp__demo-oauth__greet", {})).toBe("Using demo-oauth: greet");
  });

  it("truncates long details and collapses whitespace", () => {
    const long = `x${"y".repeat(200)}`;
    const line = describeToolActivity("shell", { command: `a\n\t${long}` });
    expect(line.length).toBeLessThanOrEqual("Running: ".length + 91);
    expect(line).toContain("…");
    expect(line).not.toContain("\n");
  });

  it("falls back to the tool name", () => {
    expect(describeToolActivity("destination_write", undefined)).toBe("Using destination_write");
  });
});
