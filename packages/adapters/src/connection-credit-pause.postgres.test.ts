import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@rakazo/db";
import {
  asSystem,
  createDb,
  createSpaceForMember,
  provisionMessagingIdentity,
  runAsSystem,
  runAsTenant,
} from "@rakazo/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRunExecutor } from "./executor.js";
import {
  CONNECTION_CREDIT_PAUSE_MS,
  clearConnectionPause,
  pauseConnectionForCredit,
} from "./routine-backoff.js";

const url = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE === "1" && url ? describe.sequential : describe.skip;

describePostgres("pausing a model connection that ran out of credit (PostgreSQL)", () => {
  // Two clients stand in for two worker processes sharing the database.
  let workerA: ReturnType<typeof createDb>;
  let workerB: ReturnType<typeof createDb>;
  let system: PrismaClient;
  let tenant: { userId: string; spaceId: string; botId: string; threadId: string };
  let otherSpaceId: string;
  let paidOut: string;
  let funded: string;
  const address = `credit-pause-${randomUUID()}@rakazo.test`;

  beforeAll(async () => {
    workerA = createDb(url!);
    workerB = createDb(url!);
    system = asSystem(workerA.prisma);
    const { userId, spaceId, botId, threadId } = await runAsSystem("credit pause fixture", () =>
      provisionMessagingIdentity(
        workerA.prisma,
        { provider: "email", address },
        { signupsEnabled: undefined, signupAllowlist: undefined },
      ),
    );
    tenant = { userId, spaceId, botId, threadId };
    otherSpaceId = (
      await runAsSystem("credit pause fixture", () =>
        createSpaceForMember(workerA.prisma, {
          currentSpaceId: tenant.spaceId,
          userId: tenant.userId,
          name: "Second space",
        }),
      )
    ).id;
    const connection = (label: string) =>
      system.userModelCredential.create({
        data: { userId: tenant.userId, provider: "openrouter", label, secretId: `fake-${label}` },
      });
    paidOut = (await connection("Paid out")).id;
    funded = (await connection("Funded")).id;
    // The space default is the connection that runs out.
    await system.spaceModelPreference.create({
      data: {
        spaceId: tenant.spaceId,
        userId: tenant.userId,
        credentialId: paidOut,
        modelId: "example/model-a",
        isDefault: true,
      },
    });
  });

  afterAll(async () => {
    if (tenant) {
      await system.messagingIdentity.deleteMany({ where: { address } });
      await system.organization.deleteMany({
        where: { id: { in: [tenant.spaceId, otherSpaceId] } },
      });
      await system.space.deleteMany({ where: { id: { in: [tenant.spaceId, otherSpaceId] } } });
      await system.user.deleteMany({ where: { id: tenant.userId } });
    }
    for (const worker of [workerA, workerB]) {
      if (!worker) continue;
      await worker.prisma.$disconnect();
      await worker.pool.end();
    }
  });

  const scope = (credentialId: string, spaceId = tenant.spaceId) => ({
    spaceId,
    userId: tenant.userId,
    credentialId,
  });

  async function routine(pinnedTo?: string) {
    return system.routine.create({
      data: {
        spaceId: tenant.spaceId,
        userId: tenant.userId,
        botId: tenant.botId,
        name: "Every minute",
        prompt: "fixture",
        crons: ["* * * * *"],
        active: true,
        nextRunAt: new Date(Date.now() - 1_000),
        ...(pinnedTo
          ? { modelProvider: "openrouter", modelId: "example/model-b", modelCredentialId: pinnedTo }
          : {}),
      },
    });
  }

  /** Fires the routine's due occurrence on one worker, as the routine.wakeup job does. */
  async function wake(worker: ReturnType<typeof createDb>, routineId: string) {
    const row = await system.routine.findUniqueOrThrow({ where: { id: routineId } });
    const executor = createRunExecutor({
      prisma: worker.prisma,
      jobs: { enqueue: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) },
      events: { append: async () => undefined },
    } as unknown as Parameters<typeof createRunExecutor>[0]);
    await runAsTenant({ spaceId: tenant.spaceId, userId: tenant.userId }, () =>
      executor.wakeRoutine(routineId, row.nextRunAt!.toISOString()),
    );
    return {
      runs: await system.run.count({ where: { routineId } }),
      routine: await system.routine.findUniqueOrThrow({ where: { id: routineId } }),
    };
  }

  async function clearAll() {
    await system.modelConnectionPause.deleteMany({ where: { userId: tenant.userId } });
  }

  it("holds only the routines on the connection that ran out", async () => {
    await clearAll();
    const onDefault = await routine();
    const onFunded = await routine(funded);
    await runAsTenant(tenant, () =>
      pauseConnectionForCredit({ prisma: workerA.prisma }, scope(paidOut), onDefault.id),
    );

    const held = await wake(workerA, onDefault.id);
    expect(held.runs).toBe(0);
    expect(held.routine.pausedConnectionId).toBe(paidOut);
    // The schedule moves on, and Last ran stays as it was.
    expect(held.routine.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(held.routine.lastRunAt).toBeNull();

    expect((await wake(workerA, onFunded.id)).runs).toBe(1);
  });

  it("is seen by every worker, and concurrent pauses keep one row", async () => {
    await clearAll();
    const onDefault = await routine();
    await Promise.all([
      runAsTenant(tenant, () =>
        pauseConnectionForCredit({ prisma: workerA.prisma }, scope(paidOut)),
      ),
      runAsTenant(tenant, () =>
        pauseConnectionForCredit({ prisma: workerB.prisma }, scope(paidOut)),
      ),
    ]);
    expect(await system.modelConnectionPause.count({ where: { credentialId: paidOut } })).toBe(1);

    expect((await wake(workerB, onDefault.id)).runs).toBe(0);
  });

  it("resumes once the cool-down has passed", async () => {
    await clearAll();
    const onDefault = await routine();
    await runAsTenant(tenant, () =>
      pauseConnectionForCredit(
        { prisma: workerA.prisma },
        scope(paidOut),
        null,
        new Date(Date.now() - CONNECTION_CREDIT_PAUSE_MS - 1_000),
      ),
    );

    expect((await wake(workerA, onDefault.id)).runs).toBe(1);
  });

  it("resumes when a run on the connection gets through", async () => {
    await clearAll();
    const onDefault = await routine();
    await runAsTenant(tenant, () =>
      pauseConnectionForCredit({ prisma: workerA.prisma }, scope(paidOut), onDefault.id),
    );
    await runAsTenant(tenant, () =>
      clearConnectionPause({ prisma: workerB.prisma }, scope(paidOut)),
    );

    const resumed = await wake(workerA, onDefault.id);
    expect(resumed.runs).toBe(1);
    expect(resumed.routine.pausedConnectionId).toBeNull();
  });

  it("keeps a pause in another space of the same owner out of this one", async () => {
    await clearAll();
    const onDefault = await routine();
    await runAsTenant({ spaceId: otherSpaceId, userId: tenant.userId }, () =>
      pauseConnectionForCredit({ prisma: workerA.prisma }, scope(paidOut, otherSpaceId)),
    );

    expect((await wake(workerA, onDefault.id)).runs).toBe(1);
    // Row-level security hides the other space's pause from this tenant.
    const visible = await runAsTenant(tenant, () =>
      workerA.prisma.modelConnectionPause.count({ where: { credentialId: paidOut } }),
    );
    expect(visible).toBe(0);
  });
});
