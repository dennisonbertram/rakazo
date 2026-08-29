import type { JobPublisher } from "@rakazo/adapter-kit";
import { phoneDeliverJob, runContinueJob } from "@rakazo/adapter-kit";
import type { MessageBlock } from "@rakazo/contracts";
import {
  botMessageHopExhausted,
  buildBotMessageWakePrompt,
  clampBotMessage,
  nextBotMessageHop,
} from "@rakazo/core";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { appendEventInTransaction, createThreadMessageInTransaction } from "@rakazo/db";
import { currentBotMessageHop } from "./bot-messages.js";

export interface AgentConnectionDeps {
  prisma: PrismaClient;
  events: Pick<ThreadEvents, "sendUserMessage" | "notify">;
  jobs: Pick<JobPublisher, "enqueue">;
}

type ConnectionRun = {
  id: string;
  workspaceId: string;
  threadId: string;
  botId: string;
  userId: string;
  sourceMessageId?: string | null;
};

type Result =
  | { ok: true; status?: string; botId?: string; name?: string; note?: string }
  | { ok: false; error: string };

/**
 * Bot-to-bot 1:1 connections across workspaces. A request is pending until
 * the target's owner approves (text command or respond_agent_connection);
 * messages ride the existing internal bot-message machinery and never
 * transit iMessage.
 */
export async function connectAgent(
  deps: AgentConnectionDeps,
  _run: ConnectionRun,
  sender: { id: string; name: string },
  input: { phone?: string },
): Promise<Result> {
  const phone = input.phone?.trim();
  if (!phone) return { ok: false, error: "phone is required" };
  const targetIdentity = await deps.prisma.phoneIdentity.findUnique({
    where: { phoneE164: phone },
  });
  if (!targetIdentity) return { ok: false, error: "no agent is registered for that number" };
  if (targetIdentity.botId === sender.id) {
    return { ok: false, error: "a bot cannot connect to itself" };
  }
  const target = await deps.prisma.bot.findUnique({
    where: { id: targetIdentity.botId },
    select: { id: true, name: true, archivedAt: true },
  });
  if (!target || target.archivedAt) return { ok: false, error: "that agent is not available" };

  const existing = await deps.prisma.agentConnection.findUnique({
    where: {
      requesterBotId_targetBotId: { requesterBotId: sender.id, targetBotId: target.id },
    },
  });
  if (existing?.status === "approved") {
    return { ok: true, status: "approved", botId: target.id, name: target.name };
  }
  if (existing?.status === "pending") {
    return { ok: true, status: "pending", note: "Connection already requested; still pending." };
  }

  const requesterIdentity = await deps.prisma.phoneIdentity.findUnique({
    where: { botId: sender.id },
  });
  const requesterOwner = requesterIdentity
    ? await deps.prisma.user.findUnique({
        where: { id: requesterIdentity.userId },
        select: { name: true },
      })
    : null;
  const requesterFirst = requesterOwner?.name.trim().split(/\s+/)[0] || "Someone";

  if (existing) {
    await deps.prisma.agentConnection.update({
      where: { id: existing.id },
      data: { status: "pending" },
    });
  } else {
    await deps.prisma.agentConnection.create({
      data: { requesterBotId: sender.id, targetBotId: target.id, status: "pending" },
    });
  }
  await deps.prisma.phoneOutbound.createMany({
    data: [
      {
        idempotencyKey: `connect:${sender.id}:${target.id}`,
        kind: "dm",
        toNumber: targetIdentity.phoneE164,
        body: `${requesterFirst}'s agent (${sender.name}) wants to connect with your agent. Reply YES to allow, NO to decline.`,
      },
    ],
    skipDuplicates: true,
  });
  await deps.jobs.enqueue(phoneDeliverJob()).catch((error) => {
    console.error("agent connection invite enqueue error", error);
  });
  return { ok: true, status: "pending", botId: target.id, name: target.name };
}

/** The target bot answers a pending request on its owner's instruction. */
export async function respondAgentConnection(
  deps: AgentConnectionDeps,
  _run: ConnectionRun,
  sender: { id: string; name: string },
  input: { accept: boolean },
): Promise<Result> {
  const pending = await deps.prisma.agentConnection.findFirst({
    where: { targetBotId: sender.id, status: "pending" },
    orderBy: { updatedAt: "desc" },
  });
  if (!pending) return { ok: false, error: "no pending connection request" };
  const status = input.accept ? "approved" : "declined";
  await deps.prisma.agentConnection.update({
    where: { id: pending.id },
    data: { status },
  });
  return { ok: true, status };
}

/**
 * Mirror of messageBot across workspaces: the target is resolved through an
 * approved connection instead of the sender's workspace roster.
 */
export async function messageConnectedAgent(
  deps: AgentConnectionDeps,
  run: ConnectionRun,
  sender: { id: string; name: string },
  input: { phone?: string; message: string; deliveryKey?: string },
): Promise<Result> {
  const message = clampBotMessage(String(input.message ?? ""));
  if (!message) return { ok: false, error: "message is required" };
  const phone = input.phone?.trim();
  if (!phone) return { ok: false, error: "phone is required" };

  const targetIdentity = await deps.prisma.phoneIdentity.findUnique({
    where: { phoneE164: phone },
  });
  if (!targetIdentity) return { ok: false, error: "no agent is registered for that number" };
  if (targetIdentity.botId === sender.id) {
    return { ok: false, error: "a bot cannot message itself" };
  }

  const connection = await approvedConnectionBetween(deps.prisma, sender.id, targetIdentity.botId);
  if (!connection) {
    return {
      ok: false,
      error: "no approved connection with that agent; use connect_agent first",
    };
  }

  const hop = nextBotMessageHop(
    await currentBotMessageHop(deps.prisma, run.sourceMessageId ?? null),
  );
  if (botMessageHopExhausted(hop)) {
    return {
      ok: false,
      error:
        "bot-to-bot message limit reached for this chain; report back to the user instead of messaging another bot",
    };
  }

  const target = await deps.prisma.bot.findUnique({
    where: { id: targetIdentity.botId },
    select: { id: true, name: true, archivedAt: true, thread: { select: { id: true } } },
  });
  if (!target || target.archivedAt || !target.thread) {
    return { ok: false, error: "that agent is not available" };
  }
  const targetThreadId = target.thread.id;
  const deliveryKey = input.deliveryKey ? `agent-message:${input.deliveryKey}` : undefined;
  const wakePrompt = buildBotMessageWakePrompt({ from: sender, text: message });

  const committed = await deps.prisma.$transaction(async (tx) => {
    if (deliveryKey) {
      const already = await tx.message.findUnique({
        where: { threadId_clientNonce: { threadId: targetThreadId, clientNonce: deliveryKey } },
        select: { id: true },
      });
      if (already) return { replayed: true as const };
    }
    const senderStillRunning = await tx.run.findFirst({
      where: { id: run.id, status: "running" },
      select: { id: true },
    });
    if (!senderStillRunning) return { ok: false as const, error: "source run is no longer active" };

    const inboundBlock: MessageBlock = {
      kind: "bot_message_received",
      fromBotId: sender.id,
      fromBotName: sender.name,
      text: message,
      hop,
    };
    const outboundBlock: MessageBlock = {
      kind: "bot_message_sent",
      toBotId: target.id,
      toBotName: target.name,
      text: message,
    };
    const inbound = await createThreadMessageInTransaction(tx, {
      threadId: targetThreadId,
      role: "user",
      blocks: [inboundBlock],
      clientNonce: deliveryKey,
    });
    const outbound = await createThreadMessageInTransaction(tx, {
      threadId: run.threadId,
      role: "bot",
      blocks: [outboundBlock],
      botId: run.botId,
      runId: run.id,
    });
    const task = await tx.task.create({
      data: {
        workspaceId: targetIdentity.workspaceId,
        botId: target.id,
        threadId: targetThreadId,
        userId: targetIdentity.userId,
        prompt: wakePrompt,
        status: "queued",
      },
    });
    const nextRun = await tx.run.create({
      data: {
        workspaceId: targetIdentity.workspaceId,
        botId: target.id,
        threadId: targetThreadId,
        taskId: task.id,
        userId: targetIdentity.userId,
        status: "queued",
        trigger: "bot_message",
        sourceMessageId: inbound.id,
      },
      select: { id: true },
    });
    await tx.message.update({ where: { id: inbound.id }, data: { runId: nextRun.id } });
    const inboundEvent = await appendEventInTransaction(tx, {
      workspaceId: targetIdentity.workspaceId,
      threadId: targetThreadId,
      botId: target.id,
      type: "thread.message.created",
      runId: nextRun.id,
      payload: { messageId: inbound.id, role: "user", blocks: [inboundBlock] },
    });
    const outboundEvent = await appendEventInTransaction(tx, {
      workspaceId: run.workspaceId,
      threadId: run.threadId,
      botId: run.botId,
      type: "thread.message.created",
      runId: run.id,
      payload: { messageId: outbound.id, role: "bot", blocks: [outboundBlock] },
    });
    return {
      runId: nextRun.id,
      targetEventSeq: inboundEvent.seq,
      senderEventSeq: outboundEvent.seq,
    };
  });

  if ("replayed" in committed) {
    return {
      ok: true,
      botId: target.id,
      name: target.name,
      note: `Already sent to ${target.name} in this turn; it was not sent again.`,
    };
  }
  if ("ok" in committed) {
    return { ok: false as const, error: committed.error ?? "delivery failed" };
  }

  await deps.events.notify(targetThreadId, committed.targetEventSeq).catch(() => undefined);
  await deps.events.notify(run.threadId, committed.senderEventSeq).catch(() => undefined);
  await deps.jobs.enqueue(runContinueJob(committed.runId)).catch((error) => {
    console.error("agent connection message enqueue", error);
  });
  return {
    ok: true,
    botId: target.id,
    name: target.name,
    note: `Sent to ${target.name}. Delivery is async; a reply wakes you later as a new message.`,
  };
}

async function approvedConnectionBetween(
  prisma: PrismaClient,
  botA: string,
  botB: string,
): Promise<{ id: string } | null> {
  return prisma.agentConnection.findFirst({
    where: {
      status: "approved",
      OR: [
        { requesterBotId: botA, targetBotId: botB },
        { requesterBotId: botB, targetBotId: botA },
      ],
    },
    select: { id: true },
  });
}
