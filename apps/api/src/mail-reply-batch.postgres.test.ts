import type { BackgroundJob, JobPublisher } from "@rakazo/adapter-kit";
import type { EmulatedMessage, PreparedMailReply } from "@rakazo/adapters";
import {
  buildApprovalAskBlock,
  mailReplyFlags,
  mailSendRefusal,
  parseRawMime,
  prepareMailReplyBatch,
  priorBatchRows,
  reconcileMailReplyBatches,
  runMailReplyBatch,
  startsUnticked,
} from "@rakazo/adapters";
import type { Actor } from "@rakazo/contracts";
import { mailReplyHash } from "@rakazo/core/node/approval-effect-key";
import { answerWaitingRunWithTextInTransaction, createThreadEvents } from "@rakazo/db";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { answerEditedMailApproval } from "./mail-approval-edit.js";
import { readMailBatch, retryMailBatch, sendMailBatch } from "./mail-reply-batch.js";
import type { MailFixture } from "./test-support/mail-fixture.js";
import { createMailFixture, daysAgo } from "./test-support/mail-fixture.js";
import { sendThreadMessage, stopThreadRuns } from "./thread-target.js";

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
  const workerDeps = () => ({ prisma, mail: f.mail, jobs, events: events() });
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
  const read = (c: Card, who: Actor = f.a) => readMailBatch(rpcDeps(), who, target(), c.ids);
  const pressRows = async (c: Card, ticked: number[], edits: Record<number, object> = {}) => {
    const { rows } = await read(c);
    return ticked.map((index) => ({
      itemId: rows[index]!.itemId,
      hash: rows[index]!.hash,
      seenMessageId: rows[index]!.seenMessageId,
      ...(edits[index] ? { edits: edits[index] } : {}),
    }));
  };
  const press = async (c: Card, ticked: number[], edits: Record<number, object> = {}) =>
    sendMailBatch(rpcDeps(), f.a, target(), {
      ...c.ids,
      rows: await pressRows(c, ticked, edits),
    });
  const work = (c: Card) => runMailReplyBatch(workerDeps(), { effectId: c.effect.id, ...scope() });
  const reconcile = (minutes = 3) =>
    reconcileMailReplyBatches({
      prisma,
      jobs,
      events: events(),
      now: new Date(Date.now() + minutes * 60_000),
      batchSize: 100,
    });
  const rowsOf = (c: Card) =>
    prisma.mailReplyItem.findMany({
      where: { effectId: c.effect.id },
      orderBy: { position: "asc" },
    });
  const effectOf = (c: Card) =>
    prisma.externalEffect.findUniqueOrThrow({ where: { id: c.effect.id } });
  const runStatus = async (c: Card) =>
    (await prisma.run.findUniqueOrThrow({ where: { id: c.run.id } })).status;
  const sent = () =>
    f.gmail.sentOf("box-a").map((draft) => {
      const mime = parseRawMime(draft.raw);
      return {
        threadId: draft.threadId,
        to: mime.header("to") ?? "",
        cc: mime.header("cc") ?? "",
        text: (mime.text ?? "").trim(),
      };
    });
  const recordOf = (itemId: string) =>
    prisma.composeSend.findUniqueOrThrow({
      where: {
        spaceId_userId_clientId: { ...scope(), clientId: `agent:batch_${itemId}` },
      },
    });
  const resumes = () => enqueued.filter((job) => job.name === "run.continue");
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

  describe("S2: the press", () => {
    it("reads rows for the owner only, with bare recipients", async () => {
      const c = await card(["t1"], {
        replies: [
          {
            ...argsFor(["t1"]).replies[0],
            to: [`"${customer("t1")}" <attacker@elsewhere.example.test>`],
          },
        ],
      });
      const [row] = (await read(c)).rows;
      expect(row?.to).toEqual(["attacker@elsewhere.example.test"]);
      expect(row?.flags).toEqual(["not_on_thread"]);
      expect(row?.startsUnticked).toBe(true);
      await expect(read(c, f.b)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(read(c, f.c)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("the newest message comes back as the acknowledgement to post", async () => {
      const c = await card(["t1"]);
      await cacheInbound("t1", "t1-m2", new Date());
      const [row] = (await read(c)).rows;
      expect(row?.flags).toEqual(["new_message"]);
      expect(row?.startsUnticked).toBe(true);
      expect(row?.seenMessageId).toBe("t1-m2");
    });

    it("another user cannot press, retry or see a press applied", async () => {
      const c = await card();
      const rows = await pressRows(c, [0]);
      await expect(
        sendMailBatch(rpcDeps(), f.b, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        retryMailBatch(rpcDeps(), f.b, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await effectOf(c)).status).toBe("intended");
    });

    it("sends only ticked rows, each in its own thread", async () => {
      const c = await card();
      await press(c, [0, 2]);
      expect(sent()).toEqual([]);
      expect(enqueued.map((job) => job.name)).toEqual(["mail.reply.batch"]);
      expect((await rowsOf(c)).map((row) => row.dispatch)).toEqual(["queued", "skipped", "queued"]);
      await work(c);
      expect(sent().map((mail) => [mail.threadId, mail.to, mail.text])).toEqual([
        ["t1", customer("t1"), "Hello t1"],
        ["t3", customer("t3"), "Hello t3"],
      ]);
      const { rows } = await read(c);
      expect(rows.map((row) => row.state)).toEqual(["sent", "skipped", "sent"]);
    });

    it("sends an edit, and stores its hash as what was approved", async () => {
      const c = await card();
      await press(c, [0, 1], {
        1: {
          body: "An edited reply",
          cc: "extra@customer.example.test, second@customer.example.test",
        },
      });
      const rows = await rowsOf(c);
      expect(rows[1]?.approvedHash).toBe(mailReplyHash(rows[1]!));
      expect(rows[0]?.approvedHash).toBe(mailReplyHash(rows[0]!));
      await work(c);
      const [, edited] = sent();
      expect(edited?.text).toBe("An edited reply");
      expect(edited?.cc).toContain("extra@customer.example.test");
      expect(edited?.cc).toContain("second@customer.example.test");
    });

    it("a changed hash rejects the whole press and nothing changes", async () => {
      const c = await card();
      const rows = await pressRows(c, [0, 1]);
      await prisma.mailReplyItem.updateMany({
        where: { id: rows[1]!.itemId },
        data: { body: "Changed behind the card" },
      });
      await expect(
        sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await effectOf(c)).status).toBe("intended");
      expect((await rowsOf(c)).map((row) => row.dispatch)).toEqual([
        "reviewing",
        "reviewing",
        "reviewing",
      ]);
      expect(enqueued).toEqual([]);
    });

    it("a row of another batch cannot be posted", async () => {
      const c = await card(["t1"]);
      const other = await card(["t2"]);
      const rows = await pressRows(other, [0]);
      await expect(
        sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it.each([
      ["clears all recipients", { to: "" }],
      [
        "has too many recipients",
        {
          to: Array.from({ length: 101 }, (_, i) => `r${i}@customer.example.test`).join(", "),
        },
      ],
      ["has a bad address", { to: "not an address" }],
    ])("an edit that %s rejects the press and the card stays answerable", async (_label, edits) => {
      const c = await card();
      await expect(press(c, [0, 1], { 1: edits })).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect((await effectOf(c)).status).toBe("intended");
      expect(await runStatus(c)).toBe("waiting_input");
      await press(c, [0, 1]);
      expect((await effectOf(c)).status).toBe("executing");
    });

    it("a second press sends nothing twice", async () => {
      const c = await card();
      const rows = await pressRows(c, [0]);
      await sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows });
      await expect(
        sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      await work(c);
      await work(c);
      expect(sent()).toHaveLength(1);
    });

    it("rejects a stale press as changed, then a tick acknowledges the new message", async () => {
      const c = await card(["t1"]);
      const rows = await pressRows(c, [0]);
      await cacheInbound("t1", "t1-m2", new Date());
      await expect(
        sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await effectOf(c)).status).toBe("intended");
      await press(c, [0]);
      expect((await rowsOf(c))[0]?.seenMessageId).toBe("t1-m2");
      await work(c);
      expect(sent()).toHaveLength(1);
    });

    it("refuses while sending is off for the bot or the deployment", async () => {
      const c = await card();
      const rows = await pressRows(c, [0]);
      await expect(
        sendMailBatch({ ...rpcDeps(), mailWritesDisabled: true }, f.a, target(), {
          ...c.ids,
          rows,
        }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      await prisma.bot.update({
        where: { id: botId },
        data: { disabledBuiltinTools: ["mail_send"] },
      });
      await expect(
        sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
      expect((await effectOf(c)).status).toBe("intended");
    });
  });

  describe("S2: settlement", () => {
    it("the run waits through the sends and a reconciler pass, then resumes once with per-row outcomes", async () => {
      const c = await card();
      await press(c, [0, 1]);
      expect(await runStatus(c)).toBe("waiting_input");
      expect((await effectOf(c)).status).toBe("executing");
      await reconcile(0);
      expect(await runStatus(c)).toBe("waiting_input");
      // The row is queued and fresh: recovery does not touch it, and nothing resumes.
      expect(resumes()).toEqual([]);
      await work(c);
      expect(await runStatus(c)).toBe("queued");
      const settled = await effectOf(c);
      expect(settled.status).toBe("completed");
      expect(settled.result).toEqual({
        count: 3,
        sent: 2,
        failed: 0,
        unknown: 0,
        replies: [
          { replyToId: "t1-m1", outcome: "sent" },
          { replyToId: "t2-m1", outcome: "sent" },
          { replyToId: "t3-m1", outcome: "skipped" },
        ],
        note: "The user sees each reply's result on the card. Do not list them; answer in a sentence.",
      });
      expect(JSON.stringify(settled.result)).not.toContain("Hello");
      expect(resumes()).toHaveLength(1);
      await work(c);
      await reconcile();
      expect(resumes()).toHaveLength(1);
    });

    it("puts the counts on the card", async () => {
      const c = await card();
      await press(c, [0, 1]);
      f.gmail.failNext(400, { urlIncludes: "drafts/send", reason: "invalidArgument", skip: 1 });
      await work(c);
      const message = await prisma.message.findUniqueOrThrow({ where: { id: c.message.id } });
      expect((message.blocks as { mailBatch: unknown; status: string }[])[0]).toMatchObject({
        status: "answered",
        mailBatch: { count: 3, sent: 1, failed: 1, unknown: 0 },
      });
    });

    it("Discard is no longer possible once pressed", async () => {
      const c = await card();
      await press(c, [0]);
      expect(
        await events().answerRunInput({
          ...c.ids,
          spaceId: f.a.spaceId,
          threadId,
          answeredByUserId: f.a.userId,
          answer: "deny",
        }),
      ).toBe(false);
      expect((await effectOf(c)).status).toBe("executing");
    });
  });

  describe("S2: failures and Retry failed", () => {
    it("row 2 failing does not stop row 3, and Retry sends only the failed row", async () => {
      const c = await card();
      await press(c, [0, 1, 2]);
      f.gmail.failNext(400, { urlIncludes: "drafts/send", reason: "invalidArgument", skip: 1 });
      await work(c);
      expect(sent().map((mail) => mail.text)).toEqual(["Hello t1", "Hello t3"]);
      const { rows } = await read(c);
      expect(rows.map((row) => row.state)).toEqual(["sent", "not_sent", "sent"]);
      expect(rows.map((row) => row.retryable)).toEqual([false, true, false]);
      expect((await effectOf(c)).result).toMatchObject({ sent: 2, failed: 1 });
      expect(await runStatus(c)).toBe("queued");
      enqueued = [];
      const count = await retryMailBatch(rpcDeps(), f.a, target(), {
        ...c.ids,
        rows: rows.map((row) => ({ itemId: row.itemId, seenMessageId: row.seenMessageId })),
      });
      expect(count).toBe(1);
      await work(c);
      expect(sent().map((mail) => mail.text)).toEqual(["Hello t1", "Hello t3", "Hello t2"]);
      // A retry does not wake the agent or change its stored result.
      expect(resumes()).toEqual([]);
      expect((await effectOf(c)).result).toMatchObject({ sent: 2, failed: 1 });
      expect((await read(c)).rows.map((row) => row.state)).toEqual(["sent", "sent", "sent"]);
    });

    it("a whole-batch failure is retried after the run has ended", async () => {
      const c = await card();
      await press(c, [0, 1, 2]);
      f.gmail.failNext(429, { urlIncludes: "drafts", times: 200 });
      await work(c);
      f.gmail.clearFailures();
      expect(sent()).toEqual([]);
      expect((await effectOf(c)).result).toMatchObject({ sent: 0, failed: 3 });
      await prisma.run.update({ where: { id: c.run.id }, data: { status: "completed" } });
      const { rows } = await read(c);
      await retryMailBatch(rpcDeps(), f.a, target(), {
        ...c.ids,
        rows: rows.map((row) => ({ itemId: row.itemId, seenMessageId: row.seenMessageId })),
      });
      await work(c);
      expect(sent()).toHaveLength(3);
    });

    it("cannot be retried before settlement", async () => {
      const c = await card();
      await press(c, [0]);
      const { rows } = await read(c);
      await expect(
        retryMailBatch(rpcDeps(), f.a, target(), {
          ...c.ids,
          rows: [{ itemId: rows[0]!.itemId, seenMessageId: rows[0]!.seenMessageId }],
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    });

    it("a second Retry press sends nothing twice", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      f.gmail.failNext(400, { urlIncludes: "drafts/send", reason: "invalidArgument" });
      await work(c);
      const { rows } = await read(c);
      const posted = {
        ...c.ids,
        rows: [{ itemId: rows[0]!.itemId, seenMessageId: rows[0]!.seenMessageId }],
      };
      expect(await retryMailBatch(rpcDeps(), f.a, target(), posted)).toBe(1);
      expect(await retryMailBatch(rpcDeps(), f.a, target(), posted)).toBe(0);
      await Promise.all([work(c), work(c)]);
      expect(sent()).toHaveLength(1);
    });

    it("a delayed worker cannot resend a failed record", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      f.gmail.failNext(400, { urlIncludes: "drafts/send", reason: "invalidArgument" });
      await work(c);
      const [row] = await rowsOf(c);
      expect((await recordOf(row!.id)).state).toBe("failed");
      // A worker that read the row before the failure and claims it now.
      await prisma.mailReplyItem.update({ where: { id: row!.id }, data: { dispatch: "queued" } });
      await work(c);
      expect(sent()).toEqual([]);
      expect((await recordOf(row!.id)).state).toBe("failed");
    });

    it("overwrites a draft changed in the mailbox after a failed attempt", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      f.gmail.failNext(400, { urlIncludes: "drafts/send", reason: "invalidArgument" });
      await work(c);
      const [row] = await rowsOf(c);
      const { draftId } = await recordOf(row!.id);
      const tampered = [
        "To: attacker@elsewhere.example.test",
        "Subject: Changed in Gmail",
        "Content-Type: text/plain",
        "",
        "Changed in Gmail",
      ].join("\r\n");
      f.gmail.handle(
        "box-a",
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`,
        "PUT",
        { message: { raw: Buffer.from(tampered).toString("base64url"), threadId: "t1" } },
      );
      const { rows } = await read(c);
      await retryMailBatch(rpcDeps(), f.a, target(), {
        ...c.ids,
        rows: [{ itemId: rows[0]!.itemId, seenMessageId: rows[0]!.seenMessageId }],
      });
      await work(c);
      expect(sent()).toMatchObject([{ to: customer("t1"), text: "Hello t1" }]);
      expect(f.gmail.draftsOf("box-a")).toEqual([]);
    });

    it("makes a new draft on Retry when the draft is gone", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      f.gmail.failNext(400, { urlIncludes: "drafts/send", reason: "invalidArgument" });
      await work(c);
      const [row] = await rowsOf(c);
      const { draftId } = await recordOf(row!.id);
      f.gmail.handle(
        "box-a",
        `https://gmail.googleapis.com/gmail/v1/users/me/drafts/${draftId}`,
        "DELETE",
      );
      const { rows } = await read(c);
      await retryMailBatch(rpcDeps(), f.a, target(), {
        ...c.ids,
        rows: [{ itemId: rows[0]!.itemId, seenMessageId: rows[0]!.seenMessageId }],
      });
      await work(c);
      expect(sent()).toMatchObject([{ text: "Hello t1" }]);
    });

    it("a send with an unclear outcome is unknown and never retried", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      f.gmail.failNext(500, { urlIncludes: "drafts/send", times: 10 });
      await work(c);
      f.gmail.clearFailures();
      const [row] = await rowsOf(c);
      expect((await recordOf(row!.id)).state).toBe("unknown");
      const { rows } = await read(c);
      expect(rows[0]).toMatchObject({ state: "unknown", retryable: false });
      expect((await effectOf(c)).result).toMatchObject({ unknown: 1, failed: 0 });
      expect(
        await retryMailBatch(rpcDeps(), f.a, target(), {
          ...c.ids,
          rows: [{ itemId: rows[0]!.itemId, seenMessageId: rows[0]!.seenMessageId }],
        }),
      ).toBe(0);
      await work(c);
      await reconcile();
      expect(sent()).toEqual([]);
      expect((await recordOf(row!.id)).state).toBe("unknown");
    });
  });

  describe("S2: holds", () => {
    const heldAfterWork = async (c: Card) => {
      await work(c);
      await reconcile();
      return (await rowsOf(c)).map((row) => [row.dispatch, row.error]);
    };

    it("a hash difference holds the row, no provider call, and is never retried", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      const [row] = await rowsOf(c);
      await prisma.mailReplyItem.update({ where: { id: row!.id }, data: { body: "Tampered" } });
      expect(await heldAfterWork(c)).toEqual([["held", "hash"]]);
      expect(sent()).toEqual([]);
      expect(f.gmail.draftsOf("box-a")).toEqual([]);
      const { rows } = await read(c);
      expect(rows[0]).toMatchObject({ state: "not_sent", retryable: false });
      expect(
        await retryMailBatch(rpcDeps(), f.a, target(), {
          ...c.ids,
          rows: [{ itemId: rows[0]!.itemId, seenMessageId: rows[0]!.seenMessageId }],
        }),
      ).toBe(0);
      await work(c);
      expect(sent()).toEqual([]);
    });

    it("a disconnected account holds the row, and recovery leaves it", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      await prisma.connection.update({ where: { id: f.connA }, data: { status: "revoked" } });
      expect(await heldAfterWork(c)).toEqual([["held", "account"]]);
      expect(sent()).toEqual([]);
    });

    it("a read-only agent's grant holds the row; a write grant sends", async () => {
      const c = await card(["t1", "t2"]);
      await press(c, [0, 1]);
      await prisma.connection.update({
        where: { id: f.connA },
        data: { agentBotId: botId === "" ? null : await ownerAgent(), writesEnabled: true },
      });
      await prisma.botConnectionAccess.create({
        data: { botId, connectionId: f.connA, ...scope(), canWrite: false },
      });
      expect(await heldAfterWork(c)).toEqual([
        ["held", "grant"],
        ["held", "grant"],
      ]);
      expect(sent()).toEqual([]);
      await prisma.botConnectionAccess.update({
        where: { connectionId_botId: { botId, connectionId: f.connA } },
        data: { canWrite: true },
      });
      const { rows } = await read(c);
      await retryMailBatch(rpcDeps(), f.a, target(), {
        ...c.ids,
        rows: rows.map((row) => ({ itemId: row.itemId, seenMessageId: row.seenMessageId })),
      });
      await work(c);
      expect(sent()).toHaveLength(2);
    });

    it("the bot's sending switch holds the row", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      await prisma.bot.update({
        where: { id: botId },
        data: { disabledBuiltinTools: ["mail_send"] },
      });
      expect(await heldAfterWork(c)).toEqual([["held", "switch"]]);
      expect(sent()).toEqual([]);
    });

    it("a new message holds the row, and Retry with the acknowledgement sends", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      await cacheInbound("t1", "t1-m2", new Date());
      expect(await heldAfterWork(c)).toEqual([["held", "new_message"]]);
      expect(sent()).toEqual([]);
      const [before] = await rowsOf(c);
      await expect(
        retryMailBatch(rpcDeps(), f.a, target(), {
          ...c.ids,
          rows: [{ itemId: before!.id, seenMessageId: "t1-m1" }],
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      const { rows } = await read(c);
      await retryMailBatch(rpcDeps(), f.a, target(), {
        ...c.ids,
        rows: [{ itemId: rows[0]!.itemId, seenMessageId: rows[0]!.seenMessageId }],
      });
      await work(c);
      expect(sent()).toHaveLength(1);
    });

    it("an invalid stored message holds the row", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      const [row] = await rowsOf(c);
      const broken = { ...row!, to: ["not an address"] };
      await prisma.mailReplyItem.update({
        where: { id: row!.id },
        data: { to: broken.to, approvedHash: mailReplyHash(broken) },
      });
      expect(await heldAfterWork(c)).toEqual([["held", "invalid"]]);
      expect(sent()).toEqual([]);
    });

    it("mail writes turned off hold the row without a record", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      await runMailReplyBatch(
        { ...workerDeps(), mailWritesDisabled: true },
        { effectId: c.effect.id, ...scope() },
      );
      expect((await rowsOf(c)).map((row) => [row.dispatch, row.error])).toEqual([
        ["held", "not_sent"],
      ]);
      expect(sent()).toEqual([]);
    });

    it("a grant revoked during the batch holds the rows not yet sent", async () => {
      const c = await card();
      await press(c, [0, 1, 2]);
      const agent = await ownerAgent();
      onSync = async () => {
        await prisma.connection.update({
          where: { id: f.connA },
          data: { agentBotId: agent, writesEnabled: true },
        });
      };
      await work(c);
      expect(sent().map((mail) => mail.text)).toEqual(["Hello t1"]);
      expect((await rowsOf(c)).map((row) => row.dispatch)).toEqual(["claimed", "held", "held"]);
    });

    it("a new message during the batch holds that row and sends the others", async () => {
      const c = await card();
      await press(c, [0, 1, 2]);
      onSync = async () => {
        onSync = undefined;
        await cacheInbound("t2", "t2-m2", new Date());
      };
      await work(c);
      expect(sent().map((mail) => mail.text)).toEqual(["Hello t1", "Hello t3"]);
      expect((await read(c)).rows.map((row) => row.state)).toEqual(["sent", "not_sent", "sent"]);
    });

    const ownerAgent = async () =>
      (
        await prisma.bot.upsert({
          where: { id: `${botId}-owner` },
          create: {
            id: `${botId}-owner`,
            ...scope(),
            name: "Inbox owner",
            color: "blue",
          },
          update: {},
        })
      ).id;
  });

  describe("S2: recovery", () => {
    /** Ages the row, its record and the effect past the staleness window. */
    const age = async (c: Card) => {
      const old = new Date(Date.now() - 10 * 60_000);
      await prisma.$executeRaw`UPDATE mail_reply_items SET "updatedAt" = ${old} WHERE "effectId" = ${c.effect.id}`;
      await prisma.$executeRaw`UPDATE external_effects SET "updatedAt" = ${old} WHERE id = ${c.effect.id}`;
      await prisma.$executeRaw`UPDATE compose_sends SET "updatedAt" = ${old} WHERE "userId" = ${f.a.userId}`;
    };
    const claimRow = async (c: Card, state?: string) => {
      const [row] = await rowsOf(c);
      await prisma.mailReplyItem.update({ where: { id: row!.id }, data: { dispatch: "claimed" } });
      if (state) {
        await prisma.composeSend.create({
          data: { ...scope(), clientId: `agent:batch_${row!.id}`, connectionId: f.connA, state },
        });
      }
      return row!.id;
    };
    const now = (extra = 0) =>
      reconcileMailReplyBatches({
        prisma,
        jobs,
        events: events(),
        now: new Date(Date.now() + extra),
        batchSize: 100,
      });

    it("enqueues a queued row again once stale, and not before", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      enqueued = [];
      await now();
      expect(enqueued).toEqual([]);
      await age(c);
      await now();
      expect(enqueued).toMatchObject([
        { name: "mail.reply.batch", payload: { effectId: c.effect.id }, keepExisting: true },
      ]);
    });

    it("moves a claimed row with no record, or one in draft, back to queued; the next job sends once", async () => {
      for (const state of [undefined, "draft"]) {
        const c = await card(["t1"]);
        await press(c, [0]);
        await claimRow(c, state);
        await age(c);
        await now();
        expect((await rowsOf(c))[0]?.dispatch).toBe("queued");
        await work(c);
        await work(c);
        expect(sent()).toHaveLength(1);
        f.seed({ "box-a": THREADS.map((thread) => inbound(thread)) });
      }
    });

    it("a killed worker leaves pending as unknown, never resent, and the batch settles", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      const id = await claimRow(c, "pending");
      await now();
      expect((await recordOf(id)).state).toBe("pending");
      expect(await runStatus(c)).toBe("waiting_input");
      await age(c);
      await now();
      expect((await recordOf(id)).state).toBe("unknown");
      await work(c);
      expect(sent()).toEqual([]);
      expect((await effectOf(c)).result).toMatchObject({
        unknown: 1,
        replies: [{ outcome: "unknown" }],
      });
      expect(await runStatus(c)).toBe("queued");
      expect(resumes()).toHaveLength(1);
    });

    it("leaves sent, failed and unknown records, and held, skipped and composer rows, alone", async () => {
      for (const state of ["sent", "failed", "unknown"]) {
        const c = await card(["t1"]);
        await press(c, [0]);
        const id = await claimRow(c, state);
        await age(c);
        await now();
        expect((await rowsOf(c))[0]?.dispatch).toBe("claimed");
        expect((await recordOf(id)).state).toBe(state);
        await prisma.composeSend.deleteMany({ where: { id: (await recordOf(id)).id } });
      }
      for (const dispatch of ["held", "skipped", "composer"]) {
        const c = await card(["t1"]);
        await press(c, [0]);
        const [row] = await rowsOf(c);
        await prisma.mailReplyItem.update({ where: { id: row!.id }, data: { dispatch } });
        await age(c);
        enqueued = [];
        await now();
        expect((await rowsOf(c))[0]?.dispatch).toBe(dispatch);
        expect(
          enqueued.filter(
            (job) => job.name === "mail.reply.batch" && job.payload.effectId === c.effect.id,
          ),
        ).toEqual([]);
      }
      expect(sent()).toEqual([]);
    });

    it("settles a batch whose worker died after the last row", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      await claimRow(c, "sent");
      await age(c);
      await now();
      expect((await effectOf(c)).status).toBe("completed");
      expect(await runStatus(c)).toBe("queued");
      expect(resumes()).toHaveLength(1);
      await age(c);
      await now();
      expect(resumes()).toHaveLength(1);
    });

    it("two workers at once send each row once", async () => {
      const c = await card();
      await press(c, [0, 1, 2]);
      await Promise.all([work(c), work(c)]);
      expect(sent()).toHaveLength(3);
      expect(resumes()).toHaveLength(1);
    });
  });

  describe("S2: open checks", () => {
    it("a new owner message during sending is refused, and the run stays paused", async () => {
      const c = await card();
      await press(c, [0, 1]);
      await expect(
        sendThreadMessage(
          { prisma, events: events(), jobs } as never,
          f.a,
          { kind: "bot", botId, threadId } as never,
          { text: "One more thing" } as never,
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await runStatus(c)).toBe("waiting_input");
      await work(c);
      expect(sent()).toHaveLength(2);
      expect((await effectOf(c)).status).toBe("completed");
    });

    it("Stop during sending: approved rows still send, settlement wakes nothing, the results stay", async () => {
      const c = await card();
      await press(c, [0, 1]);
      await stopThreadRuns({ prisma, events: events(), sandbox: {} } as never, f.a, {
        kind: "bot",
        botId,
        threadId,
      } as never);
      expect(await runStatus(c)).toBe("cancelled");
      expect((await effectOf(c)).status).toBe("executing");
      await work(c);
      expect(sent()).toHaveLength(2);
      expect((await effectOf(c)).status).toBe("completed");
      expect(await runStatus(c)).toBe("cancelled");
      expect(resumes()).toEqual([]);
      expect((await read(c)).rows.map((row) => row.state)).toEqual(["sent", "sent", "skipped"]);
      const message = await prisma.message.findUniqueOrThrow({ where: { id: c.message.id } });
      expect((message.blocks as { mailBatch: unknown }[])[0]?.mailBatch).toMatchObject({ sent: 2 });
    });

    it("Stop before the press closes the card and nothing can send", async () => {
      const c = await card();
      const rows = await pressRows(c, [0]);
      await stopThreadRuns({ prisma, events: events(), sandbox: {} } as never, f.a, {
        kind: "bot",
        botId,
        threadId,
      } as never);
      expect((await effectOf(c)).status).toBe("stopped");
      await expect(
        sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(enqueued).toEqual([]);
    });

    it("clearing the thread during sending: approved rows still send and settle with no card", async () => {
      const c = await card();
      await press(c, [0, 1]);
      await events().clearThread({ spaceId: f.a.spaceId, threadId, botId });
      expect(await prisma.message.count({ where: { id: c.message.id } })).toBe(0);
      expect(await runStatus(c)).toBe("cancelled");
      await work(c);
      expect(sent()).toHaveLength(2);
      expect((await effectOf(c)).status).toBe("completed");
      expect(resumes()).toEqual([]);
    });

    it("clearing the thread before the press closes the batch: the press finds no card", async () => {
      const c = await card();
      const rows = await pressRows(c, [0]);
      await events().clearThread({ spaceId: f.a.spaceId, threadId, botId });
      await expect(
        sendMailBatch(rpcDeps(), f.a, target(), { ...c.ids, rows }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("S2: repeat guard", () => {
    const repeat = async (runId: string, args: Record<string, unknown>) =>
      mailSendRefusal(args, await priorBatchRows(prisma, scope(), runId), runId);

    it("refuses mail_send for a sent, unknown or failed row, reworded or without the id", async () => {
      const c = await card();
      await press(c, [0, 1, 2]);
      f.gmail.failNext(400, { urlIncludes: "drafts/send", reason: "invalidArgument", skip: 1 });
      await work(c);
      for (const thread of ["t1", "t2", "t3"]) {
        const refusal = await repeat(c.run.id, {
          to: [customer(thread)],
          subject: `Re: Subject ${thread}`,
          body: "Reworded",
          replyToId: `${thread}-m1`,
        });
        expect(refusal).toEqual(expect.stringContaining("Do not send it again"));
        const withoutId = await repeat(c.run.id, {
          to: [customer(thread)],
          subject: `Re: Subject ${thread}`,
          body: "Reworded",
        });
        expect(withoutId).toEqual(expect.stringContaining("Do not send it again"));
      }
    });

    it("refuses mail_send repeating a skipped or discarded row, but lets another thread through", async () => {
      const c = await card();
      await press(c, [0]);
      await work(c);
      expect(
        await repeat(c.run.id, {
          to: [customer("t2")],
          subject: "Re: Subject t2",
          body: "Hello t2",
          replyToId: "t2-m1",
        }),
      ).toEqual(expect.stringContaining("discarded"));
      expect(
        await repeat(c.run.id, {
          to: [customer("t4")],
          subject: "Re: Subject t4",
          body: "Hello t4",
          replyToId: "t4-m1",
        }),
      ).toBeUndefined();
    });

    it("a batch row cannot repeat a sent row of the same run", async () => {
      const c = await card(["t1"]);
      await press(c, [0]);
      await work(c);
      const refusal = await prepare(c.effect.id, c.run.id, argsFor(["t1"]));
      expect(refusal).toEqual({ error: expect.stringContaining("Reply 1 (t1-m1)") });
    });
  });
});
