import { describe, expect, it } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import {
  MCP_READ_EXCEPTIONS,
  MCP_READ_TOOLS,
  MCP_WRITE_TOOLS,
  mcpReadToolDescriptors,
  mcpWriteToolDescriptors,
  wrapUntrustedText,
} from "./mcp-read-tools.js";

/** Allowlisted tools that are not bot tools: they read or start a bot thread instead. */
const NOT_BOT_TOOLS = ["thread_read", "agent_send"];

describe("MCP read tools", () => {
  it("exposes only bot tools that are marked read-only, or listed with a reason", () => {
    const names = Object.keys(MCP_READ_TOOLS);
    const descriptors = mcpReadToolDescriptors();
    expect(descriptors.map((tool) => tool.name).sort()).toEqual([...names].sort());
    for (const name of names.filter((n) => !NOT_BOT_TOOLS.includes(n))) {
      const tool = builtinAgentTools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      if (MCP_READ_EXCEPTIONS[name]) expect(tool?.readOnly, name).not.toBe(true);
      else expect(tool?.readOnly, name).toBe(true);
    }
    for (const [name, reason] of Object.entries(MCP_READ_EXCEPTIONS)) {
      expect(Object.keys(MCP_READ_TOOLS), name).toContain(name);
      expect(reason, name).toBeTruthy();
    }
    for (const tool of descriptors) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
  });

  it("lists write tools that exist, are not read-only, and never overlap the read tools", () => {
    const names = Object.keys(MCP_WRITE_TOOLS);
    expect(
      mcpWriteToolDescriptors()
        .map((tool) => tool.name)
        .sort(),
    ).toEqual([...names].sort());
    for (const name of names.filter((n) => !NOT_BOT_TOOLS.includes(n))) {
      const tool = builtinAgentTools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.readOnly, name).not.toBe(true);
      expect(Object.keys(MCP_READ_TOOLS), name).not.toContain(name);
    }
  });

  it("asks scratchpad tools for a botId and hides arguments an outside client may not set", () => {
    const byName = Object.fromEntries(
      [...mcpReadToolDescriptors(), ...mcpWriteToolDescriptors()].map((t) => [t.name, t]),
    );
    for (const name of ["scratchpad_list", "scratchpad_add", "scratchpad_update"]) {
      expect(byName[name]?.inputSchema.required, name).toContain("botId");
    }
    const add = byName.scratchpad_add?.inputSchema.properties as Record<string, unknown>;
    expect(add.botId).toBeDefined();
    for (const hidden of ["category", "channel", "forAgent", "target"]) {
      expect(add[hidden], hidden).toBeUndefined();
    }
  });

  it("moves free-text fields at any depth under untrusted_text", () => {
    expect(
      wrapUntrustedText({ rows: [{ id: "1", name: "Ada", notes: "hi" }], total: 2 }, ["name"]),
    ).toEqual({ rows: [{ id: "1", notes: "hi", untrusted_text: { name: "Ada" } }], total: 2 });
  });
});
