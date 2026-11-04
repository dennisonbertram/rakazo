import type { MailAccount } from "@rakazo/adapter-kit";
import type { MailReplyFlag } from "@rakazo/contracts";
import {
  MAIL_REPLY_BATCH_TOOL,
  MAIL_REPLY_FLAGS,
  MAX_COMPOSE_BODY,
  MAX_MAIL_REPLY_BATCH,
  MailSignalsSchema,
} from "@rakazo/contracts";
import { bodyHasLink, recipientsOffThread, redactSecrets, replyGuard } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { mailReplyClientId } from "@rakazo/db";
import { z } from "zod";
import { mailRequestIsValid } from "./approval-ask.js";
import type { FirewallMailDeps } from "./firewall-mail.js";
import { firewallMailReadDecision, threadParticipants } from "./firewall-mail.js";
import type { PriorMailEffect } from "./mail-approval-recovery.js";
import { mailSendRefusal } from "./mail-approval-recovery.js";
import { displayAddress, parseRecipients } from "./mail-compose.js";
import { protectedSenders } from "./mail-protected-senders.js";
import type { MailToolDeps } from "./mail-tools.js";
import { accountName, resolveAccount } from "./mail-tools.js";

type Scope = { spaceId: string; userId: string };

const ReplyArgs = z.object({
  replyToId: z.string().trim().min(1),
  to: z.array(z.string()),
  cc: z.array(z.string()).optional(),
  bcc: z.array(z.string()).optional(),
  subject: z.string(),
  body: z.string().max(MAX_COMPOSE_BODY),
});
const BatchArgs = z.object({ account: z.string().optional(), replies: z.array(ReplyArgs).min(1) });

/** The columns the flags read of a stored or proposed row. */
export type MailReplyFlagInput = {
  connectionId: string;
  providerThreadId: string;
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
  body: string;
  seenMessageId: string | null;
};

const addressesOf = (entries: readonly string[]) =>
  parseRecipients(entries.join(", ")).map((entry) => entry.address);

const flagOrder = (flags: Set<MailReplyFlag>) => MAIL_REPLY_FLAGS.filter((flag) => flags.has(flag));

/** Whether the owner must tick this row deliberately. A link informs; every other flag unticks. */
export const startsUnticked = (flags: readonly MailReplyFlag[]) =>
  flags.some((flag) => flag !== "has_link");

/**
 * Why the owner should look at each row, in the rows' order, most serious first. A flag never blocks.
 * Read from synced mail, so it is only as fresh as the last sync.
 */
export async function mailReplyFlags(
  prisma: Pick<
    PrismaClient,
    "cachedMailMessage" | "mailSenderStat" | "inboxSenderFeedback" | "contact"
  >,
  scope: Scope,
  rows: readonly MailReplyFlagInput[],
): Promise<{ flags: MailReplyFlag[]; newestInboundId: string | null }[]> {
  if (rows.length === 0) return [];
  const threads = await prisma.cachedMailMessage.findMany({
    where: {
      ...scope,
      connectionId: { in: [...new Set(rows.map((row) => row.connectionId))] },
      threadId: { in: [...new Set(rows.map((row) => row.providerThreadId))] },
    },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    select: {
      providerMessageId: true,
      connectionId: true,
      threadId: true,
      fromAddress: true,
      toAddresses: true,
      ccAddresses: true,
      fromSelf: true,
      signals: true,
    },
  });
  const threadOf = (row: MailReplyFlagInput) =>
    threads.filter(
      (message) =>
        message.connectionId === row.connectionId && message.threadId === row.providerThreadId,
    );
  const recipientsOf = rows.map((row) => {
    try {
      return addressesOf([...row.to, ...row.cc, ...row.bcc]).map((a) => a.toLowerCase());
    } catch {
      return [];
    }
  });
  const inboundOf = (row: MailReplyFlagInput) => threadOf(row).filter((m) => !m.fromSelf);
  const sendersOf = (row: MailReplyFlagInput) =>
    inboundOf(row).flatMap((m) => (m.fromAddress ? [m.fromAddress.toLowerCase()] : []));
  const safe = await protectedSenders(prisma, scope, [
    ...rows.flatMap(sendersOf),
    ...recipientsOf.flat(),
  ]);
  const newestSenders = rows.flatMap((row) => {
    const newest = inboundOf(row)[0];
    return newest?.fromAddress
      ? [{ connectionId: row.connectionId, senderAddress: newest.fromAddress.toLowerCase() }]
      : [];
  });
  const stats =
    newestSenders.length === 0
      ? []
      : await prisma.mailSenderStat.findMany({
          where: {
            ...scope,
            connectionId: { in: newestSenders.map((sender) => sender.connectionId) },
            senderAddress: { in: newestSenders.map((sender) => sender.senderAddress) },
          },
          select: {
            connectionId: true,
            senderAddress: true,
            priorContact: true,
            messageCount: true,
            noReplyCount: true,
          },
        });
  return rows.map((row, index) => {
    const recipients = recipientsOf[index] ?? [];
    const inbound = inboundOf(row);
    const newest = inbound[0];
    const flags = new Set<MailReplyFlag>();
    // An entry that does not parse cannot be checked, so it counts as off the thread.
    if (
      recipients.length === 0 ||
      recipientsOffThread(recipients, threadParticipants(threadOf(row))).length > 0
    ) {
      flags.add("not_on_thread");
    }
    if (newest && row.seenMessageId !== newest.providerMessageId) flags.add("new_message");
    if ([...sendersOf(row), ...recipients].some((address) => safe.has(address))) {
      flags.add("important_sender");
    }
    if (newest?.fromAddress) {
      const address = newest.fromAddress.toLowerCase();
      const stat = stats.find(
        (entry) => entry.connectionId === row.connectionId && entry.senderAddress === address,
      );
      const guard = replyGuard({
        fromAddress: address,
        autoSubmitted: MailSignalsSchema.safeParse(newest.signals).data?.autoSubmitted === true,
        priorContact: stat?.priorContact ?? null,
        messageCount: stat?.messageCount ?? 0,
        noReplyCount: stat?.noReplyCount ?? 0,
        protectedSender: safe.has(address),
      });
      // rarely_answered gets no flag: a customer who writes often and has no answer yet matches it.
      if (guard === "no_reply_sender") flags.add("no_reply_address");
      if (guard === "corrected") flags.add("no_reply_needed");
    }
    if (bodyHasLink(row.body)) flags.add("has_link");
    return { flags: flagOrder(flags), newestInboundId: newest?.providerMessageId ?? null };
  });
}

/**
 * The batch rows of this run as the repeat guard reads them, so a sent, unknown, skipped or failed
 * row cannot go out again through another card. A failed row has one way out: the owner's Retry.
 */
export async function priorBatchRows(
  prisma: Pick<PrismaClient, "mailReplyItem" | "composeSend">,
  scope: Scope,
  runId: string,
): Promise<PriorMailEffect[]> {
  const rows = await prisma.mailReplyItem.findMany({
    where: { ...scope, effect: { runId } },
    select: {
      id: true,
      replyToId: true,
      to: true,
      subject: true,
      body: true,
      dispatch: true,
      effect: { select: { status: true } },
    },
  });
  if (rows.length === 0) return [];
  const records = await prisma.composeSend.findMany({
    where: { ...scope, clientId: { in: rows.map((row) => mailReplyClientId(row.id)) } },
    select: { clientId: true, state: true },
  });
  return rows.flatMap((row) => {
    const state = records.find((record) => record.clientId === mailReplyClientId(row.id))?.state;
    const fields = { to: row.to, subject: row.subject, body: row.body };
    // A later call may name the thread or only the same people and subject: both are the same reply.
    const known = (status: string, result: unknown) =>
      [{ ...fields, replyToId: row.replyToId }, fields].map((request) => ({
        runId,
        status,
        request,
        result,
      }));
    const discarded = row.effect.status === "denied";
    if (row.dispatch === "skipped" || discarded) return known("denied", null);
    if (row.dispatch === "reviewing") return [];
    // The same refusals as the owner's own send on a card, which also cover a reworded repeat.
    return known("denied", { outcome: state === "sent" ? "sent" : "unknown" });
  });
}

/** The activity line of a settled batch; undefined when the result is a refusal. */
export function mailBatchStepSummary(result: unknown): string | undefined {
  const replies = (result as { replies?: { outcome?: string }[] } | null)?.replies;
  if (!Array.isArray(replies)) return undefined;
  const sent = replies.filter((reply) => reply.outcome === "sent").length;
  return sent === 1 ? "Sent 1 reply" : `Sent ${sent} replies`;
}

export type PreparedMailReply = {
  id: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  flags: MailReplyFlag[];
};

/**
 * Checks a mail_reply_batch call and stores its rows, before any card. A refusal names the row. The
 * rows are unique per effect and position, so a replayed call makes no second set.
 */
export async function prepareMailReplyBatch(
  deps: Pick<MailToolDeps, "accounts" | "ownerAccounts" | "readableAccounts" | "scope"> & {
    prisma: PrismaClient;
    runId: string;
    effectId: string;
    secrets: string[];
    /** Set for a firewalled agent: each thread must stay inside its support label. */
    firewall?: FirewallMailDeps;
    prior: PriorMailEffect[];
  },
  args: Record<string, unknown>,
): Promise<{ rows: PreparedMailReply[]; account: MailAccount } | { error: string }> {
  const parsed = BatchArgs.safeParse(args);
  if (!parsed.success) {
    return { error: "replies needs at least one row with replyToId, to, subject and body." };
  }
  const { replies } = parsed.data;
  if (replies.length > MAX_MAIL_REPLY_BATCH) {
    return {
      error: `At most ${MAX_MAIL_REPLY_BATCH} replies per call. Split them into several calls.`,
    };
  }
  const scope = { spaceId: deps.scope.spaceId, userId: deps.scope.userId };
  const picked = await resolveAccount(deps, {
    account: parsed.data.account,
    replyToId: replies[0]!.replyToId,
  });
  if ("error" in picked) return { error: picked.error };
  const { account } = picked;
  const name = (index: number) => `Reply ${index + 1} (${replies[index]!.replyToId})`;

  const cached = await deps.prisma.cachedMailMessage.findMany({
    where: {
      ...scope,
      connectionId: account.id,
      providerMessageId: { in: replies.map((reply) => reply.replyToId) },
    },
    select: { providerMessageId: true, threadId: true },
  });
  const threadOf = (replyToId: string) =>
    cached.find((message) => message.providerMessageId === replyToId)?.threadId;
  const seenThreads = new Map<string, number>();
  const rows: Omit<PreparedMailReply, "id" | "flags">[] = [];
  for (const [index, reply] of replies.entries()) {
    const threadId = threadOf(reply.replyToId);
    if (!threadId) {
      return { error: `${name(index)} is not in the synced mail of ${accountName(account)}.` };
    }
    const earlier = seenThreads.get(threadId);
    if (earlier !== undefined) {
      return {
        error: `${name(index)} is in the same thread as ${name(earlier)}. Use one row per thread.`,
      };
    }
    seenThreads.set(threadId, index);
    if (deps.firewall) {
      const decision = await firewallMailReadDecision(
        "mail_get",
        { account: account.address, id: reply.replyToId },
        deps.firewall,
      );
      if (!decision.free) {
        return { error: `${name(index)} is outside this agent's support label.` };
      }
    }
    const fields = [
      ...reply.to,
      ...(reply.cc ?? []),
      ...(reply.bcc ?? []),
      reply.subject,
      reply.body,
    ];
    // The card shows redacted text, and what is sent must be what the card shows.
    if (fields.some((field) => redactSecrets(field, deps.secrets) !== field)) {
      return { error: `${name(index)} contains a saved secret. Remove it and call again.` };
    }
    const refusal = mailSendRefusal(reply, deps.prior, deps.runId, MAIL_REPLY_BATCH_TOOL);
    if (refusal) return { error: `${name(index)}: ${refusal}` };
    if (!mailRequestIsValid("mail_send", reply)) {
      return { error: `${name(index)} is not a valid message. Check its addresses and subject.` };
    }
    const list = (entries: readonly string[] | undefined) =>
      parseRecipients((entries ?? []).join(", ")).map(displayAddress);
    rows.push({
      to: list(reply.to),
      cc: list(reply.cc),
      bcc: list(reply.bcc),
      subject: reply.subject,
    });
  }

  const newest = await deps.prisma.cachedMailMessage.findMany({
    where: {
      ...scope,
      connectionId: account.id,
      threadId: { in: [...seenThreads.keys()] },
      fromSelf: false,
    },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    select: { providerMessageId: true, threadId: true },
  });
  await deps.prisma.mailReplyItem.createMany({
    data: replies.map((reply, position) => {
      const providerThreadId = threadOf(reply.replyToId)!;
      return {
        effectId: deps.effectId,
        position,
        ...scope,
        connectionId: account.id,
        replyToId: reply.replyToId,
        providerThreadId,
        to: rows[position]!.to,
        cc: rows[position]!.cc,
        bcc: rows[position]!.bcc,
        subject: reply.subject,
        body: reply.body,
        seenMessageId:
          newest.find((message) => message.threadId === providerThreadId)?.providerMessageId ??
          null,
      };
    }),
    skipDuplicates: true,
  });
  const stored = await deps.prisma.mailReplyItem.findMany({
    where: { ...scope, effectId: deps.effectId },
    orderBy: { position: "asc" },
  });
  const flags = await mailReplyFlags(deps.prisma, scope, stored);
  return {
    account,
    rows: stored.map((row, index) => ({
      id: row.id,
      to: row.to,
      cc: row.cc,
      bcc: row.bcc,
      subject: row.subject,
      flags: flags[index]?.flags ?? [],
    })),
  };
}
