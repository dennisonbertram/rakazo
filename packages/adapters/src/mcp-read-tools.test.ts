import { describe, expect, it } from "vitest";
import { builtinAgentTools } from "./builtin-tools.js";
import { MCP_READ_TOOLS, mcpReadToolDescriptors, wrapUntrustedText } from "./mcp-read-tools.js";

describe("MCP read tools", () => {
  it("exposes only bot tools that are marked read-only, with a JSON Schema object", () => {
    const names = Object.keys(MCP_READ_TOOLS);
    const descriptors = mcpReadToolDescriptors();
    expect(descriptors.map((tool) => tool.name).sort()).toEqual([...names].sort());
    for (const name of names) {
      const tool = builtinAgentTools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.readOnly, name).toBe(true);
    }
    for (const tool of descriptors) {
      expect(tool.description, tool.name).toBeTruthy();
      expect(tool.inputSchema.type, tool.name).toBe("object");
    }
  });

  it("moves free-text fields at any depth under untrusted_text", () => {
    expect(
      wrapUntrustedText({ rows: [{ id: "1", name: "Ada", notes: "hi" }], total: 2 }, ["name"]),
    ).toEqual({ rows: [{ id: "1", notes: "hi", untrusted_text: { name: "Ada" } }], total: 2 });
  });
});
