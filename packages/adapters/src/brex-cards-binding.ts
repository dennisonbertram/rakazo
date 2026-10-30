// Stub so the red tests import: the binding is implemented in the next commit.
import type { PrismaClient } from "@rakazo/db";
import type { McpSession } from "./mcp-transport.js";

export interface BrexCardsBindingOptions {
  server: { id: string; spaceId: string; userId: string };
  token: string;
  prisma: PrismaClient;
  fetch?: typeof fetch;
  baseUrl?: string;
  now?: () => Date;
}

export function createBrexCardsStore(_options: Omit<BrexCardsBindingOptions, "token">): never {
  throw new Error("not implemented");
}

export async function connectBrexCardsSession(
  _session: McpSession,
  _options: BrexCardsBindingOptions,
): Promise<void> {
  throw new Error("not implemented");
}
