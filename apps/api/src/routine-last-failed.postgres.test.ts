import { randomUUID } from "node:crypto";
import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { createDb, createRepos } from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("routine status lastRunFailed (PostgreSQL)", () => {
  const suffix = randomUUID().slice(0, 8);
  const id = (name: string) => `rlf-${name}-${suffix}`;
  const orgId = id("org");
  const spaceId = id("space");
  const userId = id("owner");
  const actor: Actor = {
    userId,
    spaceId,
    email: `${userId}@rakazo.test`,
    isDeploymentOwner: false,
  };
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let botId: string;
  let threadId: string;
  let client: {
    routines: {
      list(input: {
        botId: string;
      }): Promise<{ id: string; status: { lastRunFailed?: boolean } }[]>;
    };
  };

  beforeAll(async () => {
    const db = createDb(databaseUrl as string);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };
    await prisma.user.create({
      data: { id: userId, name: userId, email: `${userId}@rakazo.test`, emailVerified: false },
    });
    await prisma.organization.create({
      data: { id: orgId, name: orgId, slug: orgId, createdAt: new Date() },
    });
    await prisma.space.create({
      data: { id: spaceId, organizationId: orgId, name: "General", isDefault: true },
    });
    await prisma.member.create({
      data: {
        id: id("m"),
        organizationId: orgId,
        userId,
        role: "member",
        createdAt: new Date(),
      },
    });
    const bot = await createRepos(prisma).createBot(actor, {
      name: "Runner",
      title: "",
      description: "",
      instructions: "",
      notifyOnFinish: false,
    });
    botId = bot.id;
    threadId = (await prisma.thread.findFirstOrThrow({ where: { botId } })).id;
    client = createRouterClient(
      createRouter({
        prisma,
        env: {},
        events: { append: vi.fn(), notify: vi.fn() },
        jobs: { enqueue: vi.fn(), cancel: vi.fn() },
      } as unknown as RouterDeps),
      { context: { actor } as never },
    ) as never;
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.bot.deleteMany({ where: { spaceId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await close();
  });

  it("is true only when the newest terminal run failed", async () => {
    const routine = await prisma.routine.create({
      data: { spaceId, botId, userId, name: "Daily", prompt: "p", crons: ["0 9 * * *"] },
    });
    const task = await prisma.task.create({
      data: { spaceId, botId, threadId, userId, prompt: "p", status: "completed" },
    });
    const run = (status: string, minutesAgo: number) =>
      prisma.run.create({
        data: {
          spaceId,
          botId,
          threadId,
          taskId: task.id,
          userId,
          status,
          trigger: "routine",
          routineId: routine.id,
          createdAt: new Date(Date.now() - minutesAgo * 60_000),
        },
      });
    const failedFlag = async () =>
      (await client.routines.list({ botId })).find((r) => r.id === routine.id)?.status
        .lastRunFailed;

    expect(await failedFlag()).toBeFalsy();
    await run("failed", 30);
    await run("completed", 20);
    await run("running", 1);
    expect(await failedFlag()).toBe(false);
    await run("failed", 10);
    expect(await failedFlag()).toBe(true);
    await run("cancelled", 5);
    expect(await failedFlag()).toBe(false);
  });
});
