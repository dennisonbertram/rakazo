import type { ActionApprovalRule } from "@rakazo/core";
import {
  BLOCKED_ACTION_MESSAGE,
  resolveActionApprovalDetail,
  toolRuleAllowsAllow,
} from "@rakazo/core";
import type { NotificationEvents, Prisma, PrismaClient } from "@rakazo/db";
import {
  createNotification,
  listApprovalRules,
  NOTIFICATION_BODY_MAX,
  runAsSystem,
  setApprovalRule,
} from "@rakazo/db";
import type { McpWriteToolName } from "./mcp-read-tools.js";
import { callMcpWriteTool } from "./mcp-read-tools.js";

/** A waiting action that nobody answered in this time is closed. */
export const EXTERNAL_ACTION_TTL_MS = 24 * 60 * 60 * 1000;
/** An approved action that has not finished in this time was cut off (a crashed process). */
const RUNNING_LIMIT_MS = 10 * 60 * 1000;
/** Actions one connection may have waiting at once, so a client cannot flood the member's cards. */
export const MAX_PENDING_PER_CONNECTION = 20;

type Owner = { spaceId: string; userId: string };
const scopeOf = ({ spaceId, userId }: Owner) => ({ spaceId, userId });
const failed = (result: unknown) =>
  typeof result === "object" && result !== null && "error" in result;
const json = (value: unknown) => value as Prisma.InputJsonValue;

export type McpWriteResult = {
  outcome: "ok" | "error" | "pending" | "blocked";
  result: unknown;
};

/** Runs the handler for an action and records how it ended. Callers claim the row first. */
async function execute(
  prisma: PrismaClient,
  action: Owner & { id: string; tool: string; args: unknown },
) {
  let result: unknown;
  try {
    result = await callMcpWriteTool(
      action.tool as McpWriteToolName,
      { prisma, scope: scopeOf(action) },
      (action.args ?? {}) as Record<string, unknown>,
    );
  } catch {
    result = { error: "The action failed" };
  }
  const status = failed(result) ? "failed" : "done";
  await prisma.externalAction.update({
    where: { id: action.id },
    data: { status, result: json(result) },
  });
  return { status, result } as const;
}

/**
 * One write from an outside client, under the member's space-wide approval rules (no bot
 * overrides). Block refuses it. Only an explicit Allow rule (for the tool, or for its action
 * type) runs it now; with no rule, or with Ask, it is stored for the member to approve. Unlike a
 * bot, an outside client gets no default Allow.
 */
export async function submitMcpWrite(
  prisma: PrismaClient,
  caller: Owner & { connectionId: string },
  name: McpWriteToolName,
  args: Record<string, unknown>,
  events?: NotificationEvents,
): Promise<McpWriteResult> {
  const rules = (await listApprovalRules(prisma, scopeOf(caller))) as ActionApprovalRule[];
  const resolved = resolveActionApprovalDetail({ toolName: name, rules });
  if (resolved.decision === "block") {
    return { outcome: "blocked", result: { error: BLOCKED_ACTION_MESSAGE } };
  }
  if (resolved.source === "always_allow" && resolved.decision === "allow") {
    const result = await callMcpWriteTool(name, { prisma, scope: scopeOf(caller) }, args);
    return { outcome: failed(result) ? "error" : "ok", result };
  }
  const waiting = await prisma.externalAction.count({
    where: { connectionId: caller.connectionId, status: "pending" },
  });
  if (waiting >= MAX_PENDING_PER_CONNECTION) {
    return {
      outcome: "error",
      result: { error: "Too many actions are waiting for approval" },
    };
  }
  const action = await prisma.externalAction.create({
    data: { ...scopeOf(caller), connectionId: caller.connectionId, tool: name, args: json(args) },
  });
  await notifyWaiting(prisma, caller, action.id, name, events).catch(() => undefined);
  return { outcome: "pending", result: { status: "pending_approval", actionId: action.id } };
}

async function notifyWaiting(
  prisma: PrismaClient,
  caller: Owner & { connectionId: string },
  actionId: string,
  tool: string,
  events?: NotificationEvents,
) {
  const connection = await prisma.mcpConnection.findFirst({
    where: { id: caller.connectionId },
    select: { label: true },
  });
  const result = await createNotification(prisma, {
    ...scopeOf(caller),
    surface: "mcp",
    title: "Approval needed",
    body: `${connection?.label ?? "A connection"}: ${tool}`.slice(0, NOTIFICATION_BODY_MAX),
    link: "/app?settings=connections",
    importance: "attention",
    kind: "needs_input",
    dedupeKey: `external:${actionId}`,
    skipRateLimits: true,
  });
  if (result.status !== "created") return;
  const { id, importance } = result.notification;
  await events?.notify(scopeOf(caller), { id, surface: "mcp", importance });
}

/** The state of one action, for the connection that asked for it. Another connection's id is not found. */
export async function actionStatus(
  prisma: PrismaClient,
  caller: Owner & { connectionId: string },
  actionId: unknown,
) {
  if (typeof actionId !== "string" || !actionId) return { error: "actionId is required" };
  const row = await prisma.externalAction.findFirst({
    where: { id: actionId, connectionId: caller.connectionId, spaceId: caller.spaceId },
    select: { status: true, result: true },
  });
  if (!row) return { error: "Action not found" };
  return {
    status: row.status,
    ...(row.result !== null && (row.status === "done" || row.status === "failed")
      ? { result: row.result }
      : {}),
  };
}

export type PendingExternalAction = {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  connectionLabel: string;
  createdAt: string;
};

/** The member's actions waiting for an answer, oldest first. Run inside the member's tenant scope. */
export async function listPendingActions(
  prisma: PrismaClient,
  owner: Owner,
  now = new Date(),
): Promise<PendingExternalAction[]> {
  const rows = await prisma.externalAction.findMany({
    where: {
      ...scopeOf(owner),
      status: "pending",
      createdAt: { gt: new Date(now.getTime() - EXTERNAL_ACTION_TTL_MS) },
      connection: { revokedAt: null },
    },
    orderBy: { createdAt: "asc" },
    include: { connection: { select: { label: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    tool: row.tool,
    args: (row.args ?? {}) as Record<string, unknown>,
    connectionLabel: row.connection.label,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** The action is not waiting: answered already (maybe by a second click), expired, or not the member's. */
export class ExternalActionNotPending extends Error {}

/**
 * Approves or denies one waiting action. The conditional update from "pending" is what lets
 * exactly one caller, in any process, claim an action: later callers match no row and the handler
 * runs once. The action's key is `external:<id>`; handlers that take no key rely on that claim.
 */
export async function decideExternalAction(
  prisma: PrismaClient,
  owner: Owner,
  id: string,
  decision: "approve" | "deny",
  options: { alwaysAllow?: boolean; now?: Date } = {},
) {
  const now = options.now ?? new Date();
  const claimed = await prisma.externalAction.updateMany({
    where: {
      id,
      ...scopeOf(owner),
      status: "pending",
      createdAt: { gt: new Date(now.getTime() - EXTERNAL_ACTION_TTL_MS) },
      connection: { revokedAt: null },
    },
    data: { status: decision === "approve" ? "approved" : "denied", decidedAt: now },
  });
  if (claimed.count !== 1) throw new ExternalActionNotPending();
  if (decision === "deny") return { status: "denied" as const };
  const action = await prisma.externalAction.findFirstOrThrow({ where: { id } });
  // "Always allow": a space-wide rule for this tool, as a bot's approval card saves.
  if (options.alwaysAllow && toolRuleAllowsAllow(action.tool)) {
    await setApprovalRule(prisma, {
      ...scopeOf(owner),
      matchKind: "tool",
      matchValue: action.tool,
      effect: "always_allow",
    });
  }
  return execute(prisma, action);
}

/** Closes unanswered actions after a day, and approved ones that never finished. Runs in the job reconciler. */
export function expireExternalActions(prisma: PrismaClient, now = new Date()) {
  return runAsSystem("expire external actions", async () => {
    await prisma.externalAction.updateMany({
      where: {
        status: "pending",
        createdAt: { lt: new Date(now.getTime() - EXTERNAL_ACTION_TTL_MS) },
      },
      data: { status: "expired", decidedAt: now },
    });
    await prisma.externalAction.updateMany({
      where: {
        status: "approved",
        decidedAt: { lt: new Date(now.getTime() - RUNNING_LIMIT_MS) },
      },
      data: { status: "failed", result: { error: "Interrupted" } },
    });
  });
}
