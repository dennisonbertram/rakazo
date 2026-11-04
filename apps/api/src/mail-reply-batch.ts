import { ORPCError } from "@orpc/server";
import type { JobPublisher, MailProvider } from "@rakazo/adapter-kit";
import { mailReplyBatchJob } from "@rakazo/adapter-kit";
import {
  mailReplyFlags,
  mailRequestIsValid,
  normalizeMailEdits,
  parseRecipients,
  startsUnticked,
} from "@rakazo/adapters";
import type { Actor, MailBatch, MailBatchPressRow } from "@rakazo/contracts";
import {
  disabledBuiltinToolSet,
  MAIL_REPLY_BATCH_TOOL,
  MessageBlock as MessageBlockSchema,
} from "@rakazo/contracts";
import { mailReplyHash } from "@rakazo/core/node/approval-effect-key";
import type { PrismaClient, ThreadEvents } from "@rakazo/db";
import {
  MAIL_REPLY_HASH_HOLD,
  mailReplyClientId,
  mailReplyState,
  retryMailReplyBatch,
} from "@rakazo/db";
import { getLogger } from "@rakazo/logging";
import { mailContext } from "./inbox.js";

type Target = { threadId: string };
type CardInput = { runId: string; messageId: string };

export type MailBatchDeps = {
  prisma: PrismaClient;
  mail: Pick<MailProvider, "listAccounts">;
  jobs: JobPublisher;
  events: Pick<ThreadEvents, "acceptMailReplyBatch">;
  mailWritesDisabled?: boolean;
};

const CHANGED = "This card changed. Reload it and review again.";

/** The card, only for the run's own user: everything below is scoped by this read. */
async function findCard(
  prisma: PrismaClient,
  actor: Actor,
  target: Target,
  input: CardInput,
): Promise<{
  effect: { id: string; status: string };
  disabled: ReadonlySet<string>;
}> {
  const scope = { spaceId: actor.spaceId, userId: actor.userId };
  const run = await prisma.run.findFirst({
    where: { id: input.runId, threadId: target.threadId, ...scope },
    select: { bot: { select: { disabledBuiltinTools: true } } },
  });
  const message = run
    ? await prisma.message.findFirst({
        where: { id: input.messageId, threadId: target.threadId, runId: input.runId, role: "bot" },
      })
    : null;
  const blocks = MessageBlockSchema.array().safeParse(message?.blocks);
  const card = blocks.success
    ? blocks.data.find((block) => block.kind === "ask" && block.mailBatch)
    : undefined;
  const effectId = card?.kind === "ask" ? card.approvalEffectId : undefined;
  const effect = effectId
    ? await prisma.externalEffect.findFirst({
        where: {
          id: effectId,
          spaceId: actor.spaceId,
          runId: input.runId,
          kind: MAIL_REPLY_BATCH_TOOL,
        },
        select: { id: true, status: true },
      })
    : null;
  if (!run || !effect) throw new ORPCError("NOT_FOUND", { message: "Not found" });
  return { effect, disabled: disabledBuiltinToolSet(run.bot.disabledBuiltinTools) };
}

const storedRows = (prisma: PrismaClient, actor: Actor, effectId: string) =>
  prisma.mailReplyItem.findMany({
    where: { spaceId: actor.spaceId, userId: actor.userId, effectId },
    orderBy: { position: "asc" },
  });

const bare = (entries: string[]) =>
  parseRecipients(entries.join(", "), true).map((entry) => entry.address);

/** `threads.mailBatch`: the rows as the server reads them now, with fresh flags. */
export async function readMailBatch(
  deps: Pick<MailBatchDeps, "prisma" | "mail">,
  actor: Actor,
  target: Target,
  input: CardInput,
): Promise<MailBatch> {
  const { effect } = await findCard(deps.prisma, actor, target, input);
  const scope = { spaceId: actor.spaceId, userId: actor.userId };
  const rows = await storedRows(deps.prisma, actor, effect.id);
  const [flags, records, accounts] = await Promise.all([
    mailReplyFlags(deps.prisma, scope, rows),
    deps.prisma.composeSend.findMany({
      where: { ...scope, clientId: { in: rows.map((row) => mailReplyClientId(row.id)) } },
      select: { clientId: true, state: true },
    }),
    deps.mail.listAccounts(scope, mailContext(actor, "mail.batch.read")),
  ]);
  return {
    account: accounts.find((account) => account.id === rows[0]?.connectionId)?.address ?? null,
    effectStatus: effect.status,
    rows: rows.map((row, index) => {
      const composeState = records.find(
        (record) => record.clientId === mailReplyClientId(row.id),
      )?.state;
      const rowFlags = flags[index]?.flags ?? [];
      const state = mailReplyState(row, composeState);
      return {
        itemId: row.id,
        replyToId: row.replyToId,
        to: bare(row.to),
        cc: bare(row.cc),
        bcc: bare(row.bcc),
        subject: row.subject,
        body: row.body,
        hash: mailReplyHash(row),
        seenMessageId: flags[index]?.newestInboundId ?? null,
        flags: rowFlags,
        startsUnticked: startsUnticked(rowFlags),
        state,
        error: row.error,
        retryable:
          effect.status === "completed" &&
          state === "not_sent" &&
          row.error !== MAIL_REPLY_HASH_HOLD,
      };
    }),
  };
}

const sendingOff = () =>
  new ORPCError("PRECONDITION_FAILED", { message: "Sending is turned off." });

/**
 * Send selected. Before the claim, each ticked row is validated whole, as it will be sent. An invalid
 * row rejects the press with that row's error and the card stays answerable. A row whose hash or
 * newest message differs from what the client read rejects it as changed, so the card reloads.
 */
export async function sendMailBatch(
  deps: MailBatchDeps,
  actor: Actor,
  target: Target,
  input: CardInput & { rows: MailBatchPressRow[] },
): Promise<void> {
  if (deps.mailWritesDisabled) throw sendingOff();
  const { effect, disabled } = await findCard(deps.prisma, actor, target, input);
  if (disabled.has("mail_send") || disabled.has(MAIL_REPLY_BATCH_TOOL)) throw sendingOff();
  if (new Set(input.rows.map((row) => row.itemId)).size !== input.rows.length) {
    throw new ORPCError("BAD_REQUEST", { message: "A reply is listed twice." });
  }
  const scope = { spaceId: actor.spaceId, userId: actor.userId };
  const stored = await storedRows(deps.prisma, actor, effect.id);
  const flags = await mailReplyFlags(deps.prisma, scope, stored);
  const rows = input.rows.map((posted) => {
    const index = stored.findIndex((row) => row.id === posted.itemId);
    const row = stored[index];
    if (!row || mailReplyHash(row) !== posted.hash) {
      throw new ORPCError("CONFLICT", { message: CHANGED });
    }
    // Ticking a row the card flagged is the owner's acknowledgement of that message.
    if ((flags[index]?.newestInboundId ?? null) !== posted.seenMessageId) {
      throw new ORPCError("CONFLICT", { message: CHANGED });
    }
    const checked = normalizeMailEdits(posted.edits ?? {});
    const position = `Reply ${index + 1}`;
    if (!checked.ok) {
      throw new ORPCError("BAD_REQUEST", { message: `${position}: ${checked.error}` });
    }
    const { account: _account, ...edits } = checked.edits;
    const final = {
      to: edits.to ?? row.to,
      cc: edits.cc ?? row.cc,
      bcc: edits.bcc ?? row.bcc,
      subject: edits.subject ?? row.subject,
      body: edits.body ?? row.body,
    };
    if (!mailRequestIsValid("mail_send", final)) {
      throw new ORPCError("BAD_REQUEST", { message: `${position}: The message is not valid.` });
    }
    return { itemId: row.id, hash: posted.hash, seenMessageId: posted.seenMessageId, final };
  });
  const accepted = await deps.events.acceptMailReplyBatch({
    spaceId: actor.spaceId,
    threadId: target.threadId,
    runId: input.runId,
    messageId: input.messageId,
    answeredByUserId: actor.userId,
    rows,
  });
  if (accepted.status === "changed") throw new ORPCError("CONFLICT", { message: CHANGED });
  if (accepted.status === "closed") {
    throw new ORPCError("CONFLICT", { message: "This prompt is no longer awaiting an answer" });
  }
  // The rows are durable; a missed enqueue is repaired by the reconciler.
  await deps.jobs
    .enqueue(mailReplyBatchJob({ effectId: accepted.effectId, ...scope }))
    .catch((error) => getLogger().error("mail batch enqueue", error));
}

/**
 * Retry failed. The posted seenMessageId is the owner's acknowledgement of a new message; the worker
 * repeats every check, so a revoked grant holds the row again. Only the run's own user may press it.
 */
export async function retryMailBatch(
  deps: Pick<MailBatchDeps, "prisma" | "jobs" | "mailWritesDisabled">,
  actor: Actor,
  target: Target,
  input: CardInput & { rows: { itemId: string; seenMessageId: string | null }[] },
): Promise<number> {
  if (deps.mailWritesDisabled) throw sendingOff();
  const { effect } = await findCard(deps.prisma, actor, target, input);
  const scope = { spaceId: actor.spaceId, userId: actor.userId };
  const stored = await storedRows(deps.prisma, actor, effect.id);
  const flags = await mailReplyFlags(deps.prisma, scope, stored);
  for (const posted of input.rows) {
    const index = stored.findIndex((row) => row.id === posted.itemId);
    if (index < 0 || (flags[index]?.newestInboundId ?? null) !== posted.seenMessageId) {
      throw new ORPCError("CONFLICT", { message: CHANGED });
    }
  }
  const retried = await retryMailReplyBatch(deps.prisma, {
    ...scope,
    effectId: effect.id,
    rows: input.rows,
  });
  if (retried.status === "closed") {
    throw new ORPCError("CONFLICT", { message: "These replies are still being sent." });
  }
  if (retried.count > 0) {
    await deps.jobs
      .enqueue(mailReplyBatchJob({ effectId: effect.id, ...scope }))
      .catch((error) => getLogger().error("mail batch retry enqueue", error));
  }
  return retried.count;
}
