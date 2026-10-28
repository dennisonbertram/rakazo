import type { PrismaClient } from "@rakazo/db";
import { builtinAgentTools } from "./builtin-tools.js";
import { contactToolFromTool } from "./contact-tools.js";
import type { DataRoomToolDeps } from "./data-room-tools.js";
import { dataRoomToolFromTool } from "./data-room-tools.js";
import { financeToolFromTool } from "./finance-tools.js";
import { fundraisingToolFromTool } from "./fundraising-tools.js";

type Scope = { spaceId: string; userId: string };

/**
 * The one list of bot tools an outside MCP client may call, and the free-text fields of each
 * result. Those fields are written by people or third parties, so they are returned inside
 * `untrusted_text`. A tool joins the list only if it is read-only and works from stored data,
 * with no run, bot, connector or model consent behind it.
 *
 * Left out on purpose: `meetings_list` (gated by per-model AI data consent, which has no meaning
 * for an outside client), `scratchpad_list` (a bot's own list, and not marked read-only),
 * `finance_crypto` (not in the plan's v1 list).
 */
export const MCP_READ_TOOLS = {
  contacts_list: ["name", "organization", "notes"],
  finance_overview: ["text"],
  finance_breakdown: ["name"],
  finance_transactions: ["vendor"],
  finance_recurring: [],
  cap_table_read: [],
  fundraising_read: ["name", "organization", "nextStep"],
  search_data_room: ["name", "snippet"],
} as const satisfies Record<string, readonly string[]>;

export type McpReadToolName = keyof typeof MCP_READ_TOOLS;

export const isMcpReadTool = (name: string): name is McpReadToolName =>
  Object.hasOwn(MCP_READ_TOOLS, name);

/** Name, description and JSON Schema of every read tool, taken from the bot definitions. */
export function mcpReadToolDescriptors() {
  return builtinAgentTools
    .filter((tool) => isMcpReadTool(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as { type: "object"; [key: string]: unknown },
    }));
}

/** Moves the listed text fields of every object in `value` under an `untrusted_text` key. */
export function wrapUntrustedText(value: unknown, fields: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((item) => wrapUntrustedText(item, fields));
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  const untrusted: Record<string, string> = {};
  for (const [key, inner] of Object.entries(value)) {
    if (fields.includes(key) && typeof inner === "string") untrusted[key] = inner;
    else out[key] = wrapUntrustedText(inner, fields);
  }
  return Object.keys(untrusted).length ? { ...out, untrusted_text: untrusted } : out;
}

const KEYWORD_ONLY = async () => ({
  model: null,
  embedder: null,
  embeddingModel: null,
  recipients: [],
  consentKey: "",
  allowed: false,
});

/** Runs a read tool through the handler the bots use, for the member and Space of the connection. */
export async function callMcpReadTool(
  name: McpReadToolName,
  deps: { prisma: PrismaClient; scope: Scope },
  args: Record<string, unknown>,
): Promise<unknown> {
  const { prisma, scope } = deps;
  let result: Record<string, unknown>;
  if (name === "contacts_list" || name === "cap_table_read") {
    result = await contactToolFromTool(name, { prisma, scope }, args);
  } else if (name === "fundraising_read") {
    result = await fundraisingToolFromTool(name, { prisma, scope });
  } else if (name === "search_data_room") {
    // Search only reads the Data room. Keyword search needs no model, mail or Drive account.
    result = await dataRoomToolFromTool(
      name,
      { prisma, scope, resolveAi: KEYWORD_ONLY } as unknown as DataRoomToolDeps,
      {} as Parameters<typeof dataRoomToolFromTool>[2],
      args,
    );
  } else {
    result = await financeToolFromTool(name, { prisma, scope }, args);
  }
  return wrapUntrustedText(result, MCP_READ_TOOLS[name]);
}
