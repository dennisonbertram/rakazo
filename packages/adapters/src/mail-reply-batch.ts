import type { AdapterContext, JobPublisher, MailAccount, MailProvider } from "@rakazo/adapter-kit";
import { mailReplyBatchJob, runContinueJob } from "@rakazo/adapter-kit";
import type { MailReplyFlag } from "@rakazo/contracts";
import {
  disabledBuiltinToolSet,
  MAIL_REPLY_BATCH_TOOL,
  MAIL_REPLY_FLAGS,
  MAX_COMPOSE_BODY,
  MAX_MAIL_REPLY_BATCH,
  MailSignalsSchema,
} from "@rakazo/contracts";
import {
  accountAllowedIn,
  bodyHasLink,
  connectionAccessFilter,
  connectionRowsForAudience,
  recipientsOffThread,
  redactSecrets,
  replyGuard,
  withInboxAgentStandIn,
} from "@rakazo/core";
import { mailReplyHash } from "@rakazo/core/node/approval-effect-key";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import { MAIL_REPLY_CLIENT_PREFIX, MAIL_REPLY_HASH_HOLD, mailReplyClientId } from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { z } from "zod";
import { mailRequestIsValid } from "./approval-ask.js";
import type { FirewallMailDeps } from "./firewall-mail.js";
import { firewallMailReadDecision, threadParticipants } from "./firewall-mail.js";
import type { PriorMailEffect } from "./mail-approval-recovery.js";
import { MAIL_APPROVAL_STALE_MS, mailSendRefusal } from "./mail-approval-recovery.js";
import { displayAddress, parseRecipients } from "./mail-compose.js";
import { protectedSenders } from "./mail-protected-senders.js";
import type { MailToolDeps } from "./mail-tools.js";
import { accountName, mailToolFromTool, resolveAccount } from "./mail-tools.js";

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

export type MailReplyWorkerDeps = {
  prisma: PrismaClient;
  mail: MailProvider;
  jobs: JobPublisher;
  events: Pick<ThreadEvents, "setMailBatchCounts" | "settleMailReplyBatch">;
  mailWritesDisabled?: boolean;
};

/**
 * Why this bot may not send now, as a hold code, read fresh. Turning off Allow changes, a write
 * grant or the bot's sending switch stops every row not yet sent.
 */
async function sendDenial(
  prisma: PrismaClient,
  scope: Scope,
  botId: string,
  connectionId: string,
): Promise<"grant" | "switch" | null> {
  const bot = await prisma.bot.findFirst({
    where: { id: botId, ...scope },
    select: {
      id: true,
      userId: true,
      spawnKey: true,
      audience: true,
      firewall: true,
      archivedAt: true,
      disabledBuiltinTools: true,
    },
  });
  if (!bot || bot.archivedAt) return "grant";
  const rows = await prisma.connection.findMany({
    where: scope,
    select: {
      id: true,
      connectorId: true,
      provider: true,
      status: true,
      allAgents: true,
      writesEnabled: true,
      agentBotId: true,
      privateByDefault: true,
      botAccess: {
        where: connectionAccessFilter(bot),
        select: { botId: true, canWrite: true },
      },
      agentBot: { select: { spawnKey: true } },
    },
  });
  const allowed = accountAllowedIn(
    connectionRowsForAudience(
      rows.map((row) => withInboxAgentStandIn(row, bot)),
      bot.audience,
      bot.firewall,
    ),
    connectionId,
    MAIL_REPLY_BATCH_TOOL,
    bot,
  );
  if (!allowed) return "grant";
  const off = disabledBuiltinToolSet(bot.disabledBuiltinTools);
  return off.has("mail_send") || off.has(MAIL_REPLY_BATCH_TOOL) ? "switch" : null;
}

async function sendRow(
  deps: MailReplyWorkerDeps,
  scope: Scope,
  rowId: string,
  botId: string,
  context: AdapterContext,
): Promise<void> {
  const hold = (error: string) =>
    deps.prisma.mailReplyItem.updateMany({
      where: { id: rowId, dispatch: "claimed" },
      data: { dispatch: "held", error },
    });
  const row = await deps.prisma.mailReplyItem.findFirst({ where: { id: rowId, ...scope } });
  if (!row) return;
  // The order of the plan: hash, account, grant, bot switch, stale thread, message validity. Each
  // refusal holds the row with no provider call.
  if (!row.approvedHash || mailReplyHash(row) !== row.approvedHash) {
    await hold(MAIL_REPLY_HASH_HOLD);
    return;
  }
  const accounts = await deps.mail.listAccounts(scope, context);
  const account = accounts.find((candidate) => candidate.id === row.connectionId);
  if (!account) {
    await hold("account");
    return;
  }
  const denial = await sendDenial(deps.prisma, scope, botId, row.connectionId);
  if (denial) {
    await hold(denial);
    return;
  }
  const [flagged] = await mailReplyFlags(deps.prisma, scope, [row]);
  if (flagged?.flags.includes("new_message")) {
    await hold("new_message");
    return;
  }
  const message = { to: row.to, cc: row.cc, bcc: row.bcc, subject: row.subject, body: row.body };
  if (!mailRequestIsValid("mail_send", message)) {
    await hold("invalid");
    return;
  }
  await mailToolFromTool(
    "mail_send",
    {
      mail: deps.mail,
      prisma: deps.prisma,
      jobs: deps.jobs,
      accounts: async () => [account],
      // Read again right before each provider write, including a provider retry.
      beforeWrite: async () =>
        (await sendDenial(deps.prisma, scope, botId, row.connectionId))
          ? "This connected account is no longer available for changes by this bot."
          : null,
      ...(deps.mailWritesDisabled ? { writesDisabled: true } : {}),
      idempotencyKey: `batch_${row.id}`,
      sendOnce: true,
      scope: { ...scope, botId },
    },
    context,
    { ...message, replyToId: row.replyToId },
  );
  const record = await deps.prisma.composeSend.findUnique({
    where: { spaceId_userId_clientId: { ...scope, clientId: mailReplyClientId(row.id) } },
    select: { id: true },
  });
  // The send refused before it made a record (mail writes are off, for example).
  if (!record) await hold("not_sent");
}

/** Handler for the `mail.reply.batch` job: sends the queued rows in order, then settles. */
export async function runMailReplyBatch(
  deps: MailReplyWorkerDeps,
  payload: Scope & { effectId: string },
): Promise<void> {
  const scope = { spaceId: payload.spaceId, userId: payload.userId };
  const effect = await deps.prisma.externalEffect.findFirst({
    where: { id: payload.effectId, spaceId: scope.spaceId, kind: MAIL_REPLY_BATCH_TOOL },
    select: { runId: true, run: { select: { botId: true } } },
  });
  if (!effect) return;
  const context: AdapterContext = {
    operationId: `mail.reply.batch:${payload.effectId}`,
    traceId: `mail.reply.batch:${payload.effectId}`,
    ...scope,
    botId: effect.run.botId,
    runId: effect.runId,
    signal: new AbortController().signal,
  };
  for (;;) {
    const next = await deps.prisma.mailReplyItem.findFirst({
      where: { ...scope, effectId: payload.effectId, dispatch: "queued" },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (!next) break;
    const claimed = await deps.prisma.mailReplyItem.updateMany({
      where: { id: next.id, dispatch: "queued" },
      data: { dispatch: "claimed" },
    });
    if (claimed.count !== 1) continue;
    try {
      await sendRow(deps, scope, next.id, effect.run.botId, context);
    } catch (error) {
      // One row's error never ends the job. The row stays claimed for recovery.
      getLogger().error("mail reply batch row", error);
    }
    await deps.events
      .setMailBatchCounts({ ...scope, effectId: payload.effectId })
      .catch((error) => getLogger().error("mail reply batch counts", error));
  }
  const { resumeRunId } = await deps.events.settleMailReplyBatch({
    ...scope,
    effectId: payload.effectId,
  });
  if (resumeRunId) {
    // The queued run is durable; a missed wake is repaired by the reconciler.
    await deps.jobs
      .enqueue(runContinueJob(resumeRunId))
      .catch((error) => getLogger().error("mail reply batch wake", error));
  }
}

/**
 * Recovers batches whose worker died, with the same staleness as a mail approval:
 * - queued: enqueue again.
 * - claimed with no record, or one in draft: back to queued. The draft claim stops two workers.
 * - claimed with pending: unknown, never resent.
 * - nothing waiting but the effect still executing: settle.
 * Held, skipped and composer rows, and claimed ones with a sent, failed or unknown record, are left
 * alone. Safe with several workers: every change is conditional on the row being unchanged.
 */
export async function reconcileMailReplyBatches(deps: {
  prisma: PrismaClient;
  jobs: JobPublisher;
  events: Pick<ThreadEvents, "settleMailReplyBatch">;
  now: Date;
  batchSize: number;
}): Promise<void> {
  const cutoff = new Date(deps.now.getTime() - MAIL_APPROVAL_STALE_MS);
  const enqueue = (row: { effectId: string; spaceId: string; userId: string }) =>
    deps.jobs.enqueue({
      ...mailReplyBatchJob({ effectId: row.effectId, spaceId: row.spaceId, userId: row.userId }),
      keepExisting: true,
      replaceLockedBefore: cutoff,
    });
  // A sent, failed or unknown row stays claimed for good, so the scan leaves those out; otherwise they
  // would fill every batch and an interrupted row behind them would never be reached.
  // ponytail: still reads every finished row of the index range each pass; give finished rows their
  // own dispatch state if this table grows large enough to show up in the reconciler's timing.
  const claimed = await deps.prisma.$transaction(
    (tx) => tx.$queryRaw<
      { id: string; effectId: string; spaceId: string; userId: string; updatedAt: Date }[]
    >`
      SELECT r.id, r."effectId", r."spaceId", r."userId", r."updatedAt"
      FROM mail_reply_items r
      LEFT JOIN compose_sends c
        ON c."spaceId" = r."spaceId" AND c."userId" = r."userId"
        AND c."clientId" = ${MAIL_REPLY_CLIENT_PREFIX} || r.id
      WHERE r.dispatch = 'claimed' AND r."updatedAt" <= ${cutoff}
        AND (c.id IS NULL OR c.state IN ('draft', 'pending'))
      ORDER BY r."updatedAt" ASC, r.id ASC
      LIMIT ${deps.batchSize}`,
  );
  for (const row of claimed) {
    const record = await deps.prisma.composeSend.findUnique({
      where: {
        spaceId_userId_clientId: {
          spaceId: row.spaceId,
          userId: row.userId,
          clientId: mailReplyClientId(row.id),
        },
      },
      select: { id: true, state: true, updatedAt: true },
    });
    if (!record || record.state === "draft") {
      await deps.prisma.mailReplyItem.updateMany({
        where: { id: row.id, dispatch: "claimed", updatedAt: row.updatedAt },
        data: { dispatch: "queued" },
      });
    } else if (record.state === "pending" && record.updatedAt <= cutoff) {
      // It may have reached the provider, so it is never sent again.
      await deps.prisma.composeSend.updateMany({
        where: { id: record.id, state: "pending", updatedAt: record.updatedAt },
        data: { state: "unknown" },
      });
    }
  }
  // Includes rows just moved back above: their updatedAt is new, so match on the claim list too.
  const queued = await deps.prisma.mailReplyItem.findMany({
    where: {
      dispatch: "queued",
      OR: [{ updatedAt: { lte: cutoff } }, { id: { in: claimed.map((row) => row.id) } }],
    },
    distinct: ["effectId"],
    take: deps.batchSize,
    select: { effectId: true, spaceId: true, userId: true },
  });
  await Promise.all(queued.map(enqueue));
  const executing = await deps.prisma.externalEffect.findMany({
    where: { kind: MAIL_REPLY_BATCH_TOOL, status: "executing", updatedAt: { lte: cutoff } },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: deps.batchSize,
    select: { id: true, spaceId: true, run: { select: { userId: true } } },
  });
  for (const effect of executing) {
    const { resumeRunId } = await deps.events.settleMailReplyBatch({
      spaceId: effect.spaceId,
      userId: effect.run.userId,
      effectId: effect.id,
    });
    if (resumeRunId) await deps.jobs.enqueue(runContinueJob(resumeRunId));
  }
}
