import type { BackgroundJob, JobPublisher } from "@rakazo/adapter-kit";
import type { EmulatedMessage, PreparedMailReply } from "@rakazo/adapters";
import {
  buildApprovalAskBlock,
  mailReplyFlags,
  prepareMailReplyBatch,
  priorBatchRows,
  startsUnticked,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { answerWaitingRunWithTextInTransaction, createThreadEvents } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { answerEditedMailApproval } from "./mail-approval-edit.js";
import type { MailFixture } from "./test-support/mail-fixture.js";
import { createMailFixture, daysAgo } from "./test-support/mail-fixture.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("mail_reply_batch (PostgreSQL)", () => {
  let f: MailFixture;
  let prisma: MailFixture["prisma"];
  let botId: string;
  let threadId: string;
  let enqueued: BackgroundJob[];
  let onSync: (() => Promise<void>) | undefined;
  let seq = 0;
  const jobs: JobPublisher = {
    enqueue: async (job) => {
      enqueued.push(job);
      if (job.name === "mail.sync") await onSync?.();
    },
    cancel: async () => {},
    close: async () => {},
  };
  const events = () => createThreadEvents(prisma);
  const scope = () => ({ spaceId: f.a.spaceId, userId: f.a.userId });
  const target = () => ({ threadId });
  const rpcDeps = () => ({ prisma, mail: f.mail, jobs, events: events() });

  const THREADS = ["t1", "t2", "t3", "t4"];
  const inbound = (
    thread: string,
    id = `${thread}-m1`,
    from = customer(thread),
  ): EmulatedMessage => ({
    id,
    threadId: thread,
    date: daysAgo(1).toISOString(),
    labels: ["INBOX"],
    from,
    to: "box-a@example.test",
    subject: `Subject ${thread}`,
    text: "A question",
  });
  const customer = (thread: string) => `${thread}@customer.example.test`;
  const cacheInbound = (thread: string, id = `${thread}-m1`, receivedAt = daysAgo(1)) =>
    f.cache(f.a, f.connA, id, {
      threadId: thread,
      from: customer(thread),
      receivedAt,
      signals: null,
    });

  beforeAll(async () => {
    f = await createMailFixture("batch", databaseUrl!);
    prisma = f.prisma;
    botId = (
      await prisma.bot.create({
        data: { spaceId: f.a.spaceId, userId: f.a.userId, name: "Support", color: "blue" },
      })
    ).id;
    threadId = (
      await prisma.thread.create({ data: { spaceId: f.a.spaceId, userId: f.a.userId, botId } })
    ).id;
  });
  afterAll(async () => {
    await f?.dispose();
  });
  beforeEach(async () => {
    enqueued = [];
    onSync = undefined;
    await f.wipe();
    f.seed({ "box-a": THREADS.map((thread) => inbound(thread)) });
    for (const thread of THREADS) await cacheInbound(thread);
    await prisma.bot.update({
      where: { id: botId },
      data: { disabledBuiltinTools: [], firewall: false },
    });
    await prisma.connection.update({
      where: { id: f.connA },
      data: { agentBotId: null, writesEnabled: false, status: "connected", allAgents: true },
    });
    await prisma.botConnectionAccess.deleteMany({ where: { botId } });
  });
  afterEach(async () => {
    await prisma.run.deleteMany({ where: { threadId } });
    await prisma.message.deleteMany({ where: { threadId } });
    await prisma.task.deleteMany({ where: { threadId } });
    await prisma.event.deleteMany({ where: { threadId } });
  });

  const argsFor = (threads: string[], extra: Record<string, unknown> = {}) => ({
    replies: threads.map((thread) => ({
      replyToId: `${thread}-m1`,
      to: [customer(thread)],
      subject: `Re: Subject ${thread}`,
      body: `Hello ${thread}`,
      ...extra,
    })),
  });

  /** A waiting run with the batch's card and rows, as the executor leaves it. */
  async function card(
    threads = ["t1", "t2", "t3"],
    args: Record<string, unknown> = argsFor(threads),
  ) {
    const n = seq++;
    const task = await prisma.task.create({
      data: { ...scope(), botId, threadId, prompt: "p", status: "running" },
    });
    const run = await prisma.run.create({
      data: {
        ...scope(),
        botId,
        threadId,
        taskId: task.id,
        status: "waiting_input",
        trigger: "user",
      },
    });
    const effect = await prisma.externalEffect.create({
      data: {
        spaceId: f.a.spaceId,
        runId: run.id,
        kind: "mail_reply_batch",
        idempotencyKey: `batch-${process.pid}-${Date.now()}-${n}`,
        status: "intended",
        request: args as never,
      },
    });
    const prepared = await prepare(effect.id, run.id, args);
    if ("error" in prepared) throw new Error(prepared.error);
    const message = await prisma.message.create({
      data: {
        threadId,
        seq: 1000 + n,
        role: "bot",
        runId: run.id,
        botId,
        blocks: [
          buildApprovalAskBlock(effect.id, "mail_reply_batch", args, [], {
            mailBatch: prepared.rows,
          }) as never,
        ],
      },
    });
    return {
      run,
      effect,
      message,
      rows: prepared.rows,
      ids: { runId: run.id, messageId: message.id },
    };
  }
  const prepare = async (effectId: string, runId: string, args: Record<string, unknown>) =>
    prepareMailReplyBatch(
      {
        prisma,
        accounts: () =>
          f.mail
            .listAccounts(scope(), {
              operationId: "t",
              traceId: "t",
              ...scope(),
              signal: new AbortController().signal,
            })
            .then((accounts) => accounts.filter((account) => account.id === f.connA)),
        scope: { ...scope(), botId },
        runId,
        effectId,
        secrets: [],
        prior: await priorBatchRows(prisma, scope(), runId),
      },
      args,
    );

  type Card = Awaited<ReturnType<typeof card>>;
  const rowsOf = (c: Card) =>
    prisma.mailReplyItem.findMany({
      where: { effectId: c.effect.id },
      orderBy: { position: "asc" },
    });
  const effectOf = (c: Card) =>
    prisma.externalEffect.findUniqueOrThrow({ where: { id: c.effect.id } });
  const runStatus = async (c: Card) =>
    (await prisma.run.findUniqueOrThrow({ where: { id: c.run.id } })).status;
  const sent = () => f.gmail.sentOf("box-a");
  const flagsOf = (rows: PreparedMailReply[]) => rows.map((row) => row.flags);
  const flagged = async (c: Card) =>
    (await mailReplyFlags(prisma, scope(), await rowsOf(c))).map((row) => row.flags);

  describe("S1: proposal", () => {
    it("makes one set of rows when the call is replayed", async () => {
      const c = await card();
      const again = await prepare(c.effect.id, c.run.id, argsFor(["t1", "t2", "t3"]));
      expect("rows" in again && again.rows.map((row) => row.id)).toEqual(c.rows.map((r) => r.id));
      expect(await rowsOf(c)).toHaveLength(3);
    });

    it("stores the newest inbound message of each thread as seen", async () => {
      await cacheInbound("t1", "t1-m2", new Date());
      const c = await card();
      const [first] = await rowsOf(c);
      expect(first?.seenMessageId).toBe("t1-m2");
      expect(flagsOf(c.rows)).toEqual([[], [], []]);
    });

    describe("flags", () => {
      it("Not on this thread: a recipient who took no part", async () => {
        const c = await card(["t1"], {
          replies: [{ ...argsFor(["t1"]).replies[0], cc: ["stranger@elsewhere.example.test"] }],
        });
        expect(flagsOf(c.rows)).toEqual([["not_on_thread"]]);
      });

      it("Not on this thread: a Cc hidden in a To entry", async () => {
        const c = await card(["t1"], {
          replies: [
            {
              ...argsFor(["t1"]).replies[0],
              to: [`${customer("t1")}, hidden@elsewhere.example.test`],
            },
          ],
        });
        expect(flagsOf(c.rows)).toEqual([["not_on_thread"]]);
        // The row is split, so the card shows both, bare.
        expect((await read(c)).rows[0]?.to).toEqual([
          customer("t1"),
          "hidden@elsewhere.example.test",
        ]);
      });

      it("a display name cannot make an outsider look like a participant", async () => {
        const c = await card(["t1"], {
          replies: [
            {
              ...argsFor(["t1"]).replies[0],
              to: [`"${customer("t1")}" <attacker@elsewhere.example.test>`],
            },
          ],
        });
        expect(flagsOf(c.rows)).toEqual([["not_on_thread"]]);
      });

      it("New message: a newer inbound message after the proposal, and none for our own", async () => {
        const c = await card(["t1"]);
        await f.cache(f.a, f.connA, "t1-self", {
          threadId: "t1",
          from: "box-a@example.test",
          fromSelf: true,
          receivedAt: new Date(),
          signals: null,
        });
        expect(await flagged(c)).toEqual([[]]);
        await cacheInbound("t1", "t1-m2", new Date());
        expect(await flagged(c)).toEqual([["new_message"]]);
      });

      it("Important sender: a marked sender in the thread, or a recipient in Contacts", async () => {
        await prisma.inboxSenderFeedback.create({
          data: {
            ...scope(),
            senderAddress: customer("t1"),
            mark: "important",
          },
        });
        await prisma.contact.create({
          data: { ...scope(), name: "A contact", email: "contact@customer.example.test" },
        });
        await prisma.cachedMailMessage.updateMany({
          where: { providerMessageId: "t2-m1" },
          data: { ccAddresses: ["contact@customer.example.test"] },
        });
        const c = await card(["t1", "t2", "t3"], {
          replies: [
            argsFor(["t1"]).replies[0],
            { ...argsFor(["t2"]).replies[0], cc: ["contact@customer.example.test"] },
            argsFor(["t3"]).replies[0],
          ],
        });
        expect(flagsOf(c.rows)).toEqual([["important_sender"], ["important_sender"], []]);
        await prisma.inboxSenderFeedback.deleteMany({ where: scope() });
        await prisma.contact.deleteMany({ where: scope() });
      });

      it("No-reply address", async () => {
        await prisma.cachedMailMessage.updateMany({
          where: { providerMessageId: "t1-m1" },
          data: { fromAddress: "no-reply@customer.example.test" },
        });
        const c = await card(["t1"], {
          replies: [{ ...argsFor(["t1"]).replies[0], to: ["no-reply@customer.example.test"] }],
        });
        expect(flagsOf(c.rows)).toEqual([["no_reply_address"]]);
      });

      it("You said no reply needed", async () => {
        await prisma.mailSenderStat.create({
          data: {
            ...scope(),
            connectionId: f.connA,
            senderAddress: customer("t1"),
            noReplyCount: 3,
          },
        });
        const c = await card(["t1"]);
        expect(flagsOf(c.rows)).toEqual([["no_reply_needed"]]);
      });

      it("Has a link stays ticked; the most serious flag comes first", async () => {
        const c = await card(["t1", "t2"], {
          replies: [
            { ...argsFor(["t1"]).replies[0], body: "See https://example.test/a" },
            {
              ...argsFor(["t2"]).replies[0],
              body: "See www.example.test",
              cc: ["stranger@elsewhere.example.test"],
            },
          ],
        });
        expect(flagsOf(c.rows)).toEqual([["has_link"], ["not_on_thread", "has_link"]]);
        expect(flagsOf(c.rows).map(startsUnticked)).toEqual([false, true]);
      });

      it("rarely answered gets no flag", async () => {
        await prisma.mailSenderStat.create({
          data: {
            ...scope(),
            connectionId: f.connA,
            senderAddress: customer("t1"),
            messageCount: 50,
            priorContact: false,
          },
        });
        const c = await card(["t1"]);
        expect(flagsOf(c.rows)).toEqual([[]]);
      });
    });

    describe("the card cannot be approved or edited through the other paths", () => {
      it("an Allow answer is refused and the card stays open", async () => {
        const c = await card();
        const answered = await events().answerRunInput({
          ...c.ids,
          spaceId: f.a.spaceId,
          threadId,
          answeredByUserId: f.a.userId,
          answer: "allow",
        });
        expect(answered).toBe(false);
        expect((await effectOf(c)).status).toBe("intended");
        expect(await runStatus(c)).toBe("waiting_input");
      });

      it("composer text cannot answer it", async () => {
        const c = await card();
        const answered = await prisma.$transaction((tx) =>
          answerWaitingRunWithTextInTransaction(tx, {
            spaceId: f.a.spaceId,
            threadId,
            runId: c.run.id,
            answeredByUserId: f.a.userId,
            answer: "send them",
          }),
        );
        expect(answered).toBeNull();
        expect(await runStatus(c)).toBe("waiting_input");
      });

      it("the single card's edit path refuses it", async () => {
        const c = await card();
        await expect(
          answerEditedMailApproval(
            { ...rpcDeps(), mailWritesDisabled: false } as never,
            f.a,
            target(),
            { ...c.ids, mail: { body: "Edited" } },
          ),
        ).rejects.toMatchObject({ code: "CONFLICT" });
        expect((await effectOf(c)).status).toBe("intended");
      });

      it("Discard denies the effect, resumes the run and sends nothing", async () => {
        const c = await card();
        expect(
          await events().answerRunInput({
            ...c.ids,
            spaceId: f.a.spaceId,
            threadId,
            answeredByUserId: f.a.userId,
            answer: "deny",
          }),
        ).toBe(true);
        expect((await effectOf(c)).status).toBe("denied");
        expect(await runStatus(c)).toBe("queued");
        expect(enqueued).toEqual([]);
        expect(sent()).toEqual([]);
      });
    });

    describe("scope", () => {
      it("another user in the space or another space sees nothing", async () => {
        const c = await card();
        expect(
          await priorBatchRows(prisma, { spaceId: f.b.spaceId, userId: f.b.userId }, c.run.id),
        ).toEqual([]);
        expect(
          await mailReplyFlags(
            prisma,
            { spaceId: f.c.spaceId, userId: f.c.userId },
            await rowsOf(c),
          ),
        ).toMatchObject([
          { newestInboundId: null },
          { newestInboundId: null },
          { newestInboundId: null },
        ]);
      });

      it("a thread of another account is refused", async () => {
        await f.cache(f.a, f.connA2, "other-m1", { threadId: "other", signals: null });
        const refusal = await prepare("no-effect", "no-run", {
          replies: [{ ...argsFor(["t1"]).replies[0], replyToId: "other-m1" }],
        });
        expect(refusal).toEqual({
          error: expect.stringContaining("Reply 1 (other-m1) is not in the synced mail"),
        });
      });
    });
  });
});
