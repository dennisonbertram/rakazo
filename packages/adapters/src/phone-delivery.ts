import type { AdapterContext, MessagingProvider } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import type { SendBlueOutboundStatus } from "./sendblue.js";

/**
 * Margin under SendBlue's hard 150-consecutive-outbound cap: past this many
 * DMs without a reply from the owner, mirror rows stay pending until the
 * next inbound resets the counter.
 */
export const PHONE_DM_OUTBOUND_CAP = 140;

export interface PhoneDeliveryDeps {
  prisma: PrismaClient;
  messaging: MessagingProvider;
}

/**
 * Automatic mirror, not a send tool: every text-bearing bot message of a
 * phone DM run is copied into the uniform outbox and sent, so delivery does
 * not depend on prompt compliance. Also drains pending outbox rows (invites
 * and intros are enqueued by the channels slice).
 */
export async function deliverPhoneOutbound(
  deps: PhoneDeliveryDeps,
  input: { runId?: string },
  context: AdapterContext,
): Promise<void> {
  if (input.runId) {
    await mirrorRun(deps, input.runId);
  }
  await drain(deps, context);
}

async function mirrorRun(deps: PhoneDeliveryDeps, runId: string): Promise<void> {
  const run = await deps.prisma.run.findUnique({
    where: { id: runId },
    include: { sourceMessage: true },
  });
  if (run?.trigger !== "phone") return;
  const sourceBlocks = (run.sourceMessage?.blocks ?? []) as Array<{ kind?: string }>;
  if (sourceBlocks.some((block) => block.kind === "phone_channel_message")) return;

  const identity = await deps.prisma.phoneIdentity.findUnique({
    where: { botId: run.botId },
  });
  if (!identity) return;

  const messages = await deps.prisma.message.findMany({
    where: { runId: run.id, role: "bot" },
    orderBy: { seq: "asc" },
  });
  for (const message of messages) {
    const text = extractText(message.blocks);
    if (!text) continue;
    const idempotencyKey = `msg:${message.id}`;
    const existing = await deps.prisma.phoneOutbound.findUnique({ where: { idempotencyKey } });
    if (existing) continue;
    await deps.prisma.phoneOutbound.create({
      data: {
        idempotencyKey,
        kind: "dm",
        toNumber: identity.phoneE164,
        body: text,
        sourceMessageId: message.id,
      },
    });
  }
}

async function drain(deps: PhoneDeliveryDeps, context: AdapterContext): Promise<void> {
  const pending = await deps.prisma.phoneOutbound.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });
  for (const row of pending) {
    try {
      if (row.kind === "group" || row.kind === "intro") {
        if (!row.providerGroupId) continue;
        const sent = await deps.messaging.sendGroup(
          { groupId: row.providerGroupId, body: row.body },
          context,
        );
        await deps.prisma.phoneOutbound.update({
          where: { id: row.id },
          data: { status: "sent", providerHandle: sent.handle },
        });
        continue;
      }
      if (!row.toNumber) continue;
      const identity = await deps.prisma.phoneIdentity.findUnique({
        where: { phoneE164: row.toNumber },
      });
      if (identity && identity.outboundSinceInbound >= PHONE_DM_OUTBOUND_CAP) continue;
      const sent = await deps.messaging.sendDirect({ to: row.toNumber, body: row.body }, context);
      await deps.prisma.phoneOutbound.update({
        where: { id: row.id },
        data: { status: "sent", providerHandle: sent.handle },
      });
      if (identity) {
        await deps.prisma.phoneIdentity.update({
          where: { id: identity.id },
          data: { outboundSinceInbound: { increment: 1 } },
        });
      }
    } catch {
      await deps.prisma.phoneOutbound.update({
        where: { id: row.id },
        data: { status: "failed" },
      });
    }
  }
}

/** Outbound status webhooks update outbox rows by provider handle. */
export async function applyPhoneOutboundStatus(
  prisma: PrismaClient,
  event: SendBlueOutboundStatus,
): Promise<void> {
  const status =
    event.status === "ERROR" || event.status === "DECLINED"
      ? "failed"
      : event.status === "SENT" || event.status === "DELIVERED"
        ? "sent"
        : null;
  if (!status) return;
  await prisma.phoneOutbound.updateMany({
    where: { providerHandle: event.handle },
    data: { status },
  });
}

function extractText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .filter(
      (block): block is { kind: string; text: string } =>
        typeof block === "object" &&
        block !== null &&
        (block as { kind?: string }).kind === "text" &&
        typeof (block as { text?: string }).text === "string",
    )
    .map((block) => block.text)
    .join("\n")
    .trim();
}
