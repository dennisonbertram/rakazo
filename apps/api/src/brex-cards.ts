import { ORPCError } from "@orpc/server";
import type { McpConnector } from "@rakazo/adapters";
import type { Actor, Bot, BrexCardsControls, BrexCardsList } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";

export interface BrexCardsDeps {
  prisma: PrismaClient;
  secrets: { put(plaintext: string, context: never): Promise<{ id: string; ciphertext: string }> };
  mcp: Pick<McpConnector, "callServerTool">;
  /** Where Brex is reached; the demo and tests point it at an emulator. */
  brexApi?: { baseUrl?: string; fetch?: typeof fetch };
  provisionAgent: (actor: Actor, serverId: string) => Promise<Bot>;
  archiveBot: (actor: Actor, botId: string) => Promise<void>;
}

const notImplemented = (): never => {
  throw new ORPCError("NOT_IMPLEMENTED");
};

export async function brexCardsConnect(
  _deps: BrexCardsDeps,
  _actor: Actor,
  _token: string,
): Promise<{ serverId: string; agentBotId: string }> {
  return notImplemented();
}

export async function brexCardsReplaceToken(
  _deps: BrexCardsDeps,
  _actor: Actor,
  _token: string,
): Promise<void> {
  return notImplemented();
}

export async function brexCardsCards(_deps: BrexCardsDeps, _actor: Actor): Promise<BrexCardsList> {
  return notImplemented();
}

export async function brexCardsGetControls(
  _deps: BrexCardsDeps,
  _actor: Actor,
): Promise<BrexCardsControls> {
  return notImplemented();
}

export async function brexCardsSetControls(
  _deps: BrexCardsDeps,
  _actor: Actor,
  _controls: BrexCardsControls,
): Promise<BrexCardsControls> {
  return notImplemented();
}
