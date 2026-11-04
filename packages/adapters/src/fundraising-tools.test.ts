import { investorsAgentSpawnKey } from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import { fundraisingToolFromTool, fundraisingToolsAllowed } from "./fundraising-tools.js";

const scope = { spaceId: "s", userId: "u" };
const row = (extra: Record<string, unknown>) => ({
  id: "c",
  name: "Harbor Angels",
  email: "h@example.test",
  organization: null,
  kind: "prospect",
  notes: null,
  stage: "committed",
  checkSizeCents: 5_000_000n,
  nextStep: "Send SAFE",
  roundId: "r1",
  bot: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...extra,
});
const round = (extra: Record<string, unknown>) => ({
  id: "r1",
  name: "Seed",
  targetCents: 200_000_000n,
  capCents: 1_000_000_000n,
  closedAt: null,
  ...extra,
});

describe("fundraising_read", () => {
  it("returns the open round, pending and each prospect, read with the run owner's scope", async () => {
    const roundFind = vi.fn(async () => round({}));
    const contactFind = vi.fn(async () => [
      row({}),
      row({ id: "d", name: "Old Fund", roundId: "r0", checkSizeCents: null, stage: "committed" }),
    ]);
    const safeFind = vi.fn(async () => [
      {
        id: "s1",
        source: "native",
        contactId: null,
        roundId: "r1",
        investorName: "Lakeside Fund",
        amountCents: 2_500_000n,
        capCents: 1_000_000_000n,
        valuationType: "post_money_cap",
        mfn: false,
        proRata: false,
        sentAt: new Date("2026-02-01T00:00:00Z"),
        paidAt: null,
        createdAt: new Date("2026-02-01T00:00:00Z"),
      },
    ]);
    const prisma = {
      fundraiseRound: { findFirst: roundFind },
      contact: { findMany: contactFind },
      safe: { findMany: safeFind },
    } as never;
    const result = await fundraisingToolFromTool("fundraising_read", { prisma, scope });
    expect(result).toEqual({
      round: {
        id: "r1",
        name: "Seed",
        status: "open",
        targetUsd: 2_000_000,
        postMoneyCapUsd: 10_000_000,
        closedAt: null,
      },
      pendingUsd: 75_000,
      signedUsd: 0,
      fundedUsd: 0,
      safes: [
        {
          investor: "Lakeside Fund",
          source: "native",
          status: "sent",
          amountUsd: 25_000,
          postMoneyCapUsd: 10_000_000,
          sentAt: "2026-02-01T00:00:00.000Z",
          paidAt: null,
          inShownRound: true,
        },
      ],
      prospects: [
        expect.objectContaining({
          name: "Harbor Angels",
          checkSizeUsd: 50_000,
          countsInPending: true,
        }),
        expect.objectContaining({ name: "Old Fund", checkSizeUsd: null, countsInPending: false }),
      ],
    });
    expect(roundFind).toHaveBeenCalledWith({ where: { ...scope, closedAt: null } });
    expect(safeFind).toHaveBeenCalledWith(expect.objectContaining({ where: scope }));
    expect(contactFind).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ...scope, kind: "prospect" } }),
    );
  });

  it("reports a closed round with nothing pending, and no round before the first", async () => {
    const closedAt = new Date("2026-03-01T00:00:00Z");
    const find = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(round({ closedAt }));
    const prisma = {
      fundraiseRound: { findFirst: find },
      contact: { findMany: async () => [row({})] },
      safe: { findMany: async () => [] },
    } as never;
    expect(await fundraisingToolFromTool("fundraising_read", { prisma, scope })).toMatchObject({
      round: { status: "closed", closedAt: closedAt.toISOString() },
      pendingUsd: 0,
      prospects: [{ countsInPending: false }],
    });
    const empty = {
      fundraiseRound: { findFirst: async () => null },
      contact: { findMany: async () => [] },
      safe: { findMany: async () => [] },
    } as never;
    expect(await fundraisingToolFromTool("fundraising_read", { prisma: empty, scope })).toEqual({
      round: null,
      pendingUsd: 0,
      signedUsd: 0,
      fundedUsd: 0,
      safes: [],
      prospects: [],
    });
  });

  it("lists a prospect saved without a stage at Target", async () => {
    const prisma = {
      fundraiseRound: { findFirst: async () => null },
      contact: { findMany: async () => [row({ stage: null, checkSizeCents: null })] },
      safe: { findMany: async () => [] },
    } as never;
    expect(await fundraisingToolFromTool("fundraising_read", { prisma, scope })).toMatchObject({
      prospects: [{ stage: "target" }],
    });
  });

  it("is allowed only for the Investors agent's owner-started runs", () => {
    const base = {
      hasProvider: true,
      groupId: null,
      runUserId: "u",
      botUserId: "u",
      botSpawnKey: investorsAgentSpawnKey("u"),
      trigger: "user",
      messagingChannelRun: false,
    };
    expect(fundraisingToolsAllowed(base)).toBe(true);
    expect(fundraisingToolsAllowed({ ...base, botSpawnKey: "carta-agent:u" })).toBe(false);
    expect(fundraisingToolsAllowed({ ...base, botSpawnKey: null })).toBe(false);
    expect(fundraisingToolsAllowed({ ...base, trigger: "bot_message" })).toBe(false);
  });
});

describe("fundraising_round_save", () => {
  const stored = (data: Record<string, unknown>) => ({
    id: "r9",
    ...data,
    closedAt: null,
  });

  it("stores dollars as cents through saveRound, scoped to the run owner", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => stored(data));
    const prisma = { fundraiseRound: { create } } as never;
    const result = await fundraisingToolFromTool(
      "fundraising_round_save",
      { prisma, scope },
      // Extra keys a model might add are not stored.
      { name: " Seed ", targetUsd: 5_000_000, postMoneyCapUsd: 20_000_000, spaceId: "other" },
    );
    expect(create).toHaveBeenCalledWith({
      data: { ...scope, name: "Seed", targetCents: 500_000_000, capCents: 2_000_000_000 },
    });
    expect(result).toEqual({
      ok: true,
      round: {
        id: "r9",
        name: "Seed",
        status: "open",
        targetUsd: 5_000_000,
        postMoneyCapUsd: 20_000_000,
      },
    });
  });

  it("edits the open round by id and refuses a closed or foreign one", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const findUniqueOrThrow = vi.fn(async () =>
      stored({ name: "Seed", targetCents: 1n, capCents: 2n }),
    );
    const prisma = { fundraiseRound: { updateMany, findUniqueOrThrow } } as never;
    await fundraisingToolFromTool(
      "fundraising_round_save",
      { prisma, scope },
      { id: "r9", name: "Seed", targetUsd: 1, postMoneyCapUsd: 2 },
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "r9", ...scope, closedAt: null },
      data: { name: "Seed", targetCents: 100, capCents: 200 },
    });
    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await fundraisingToolFromTool(
        "fundraising_round_save",
        { prisma, scope },
        { id: "r9", name: "Seed", targetUsd: 1, postMoneyCapUsd: 2 },
      ),
    ).toEqual({ error: "That round was not found, or it is closed and cannot be edited." });
  });

  it("tells the agent a round is already open instead of returning a raw error", async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    });
    const result = await fundraisingToolFromTool(
      "fundraising_round_save",
      { prisma: { fundraiseRound: { create } } as never, scope },
      { name: "Seed", targetUsd: 5_000_000, postMoneyCapUsd: 20_000_000 },
    );
    expect(result).toEqual({
      error: expect.stringContaining("A round is already open. Call fundraising_read"),
    });
    expect(JSON.stringify(result)).not.toContain("Unique constraint");
  });

  it("rejects missing, zero, negative and text amounts without writing", async () => {
    const create = vi.fn();
    const prisma = { fundraiseRound: { create } } as never;
    for (const bad of [
      { name: "Seed", targetUsd: 0, postMoneyCapUsd: 1 },
      { name: "Seed", targetUsd: -5, postMoneyCapUsd: 1 },
      { name: "Seed", targetUsd: "$5M", postMoneyCapUsd: 1 },
      { name: "", targetUsd: 5, postMoneyCapUsd: 1 },
      { name: "Seed", targetUsd: 5 },
    ]) {
      expect(
        await fundraisingToolFromTool("fundraising_round_save", { prisma, scope }, bad),
      ).toEqual({
        error: "Pass name, targetUsd and postMoneyCapUsd as whole US dollars above zero.",
      });
    }
    expect(create).not.toHaveBeenCalled();
  });
});

describe("fundraising_prospects_save argument handling", () => {
  it("refuses more than 60 rows, and names the split", async () => {
    const rows = Array.from({ length: 173 }, (_, i) => ({ firm: `Firm ${i}` }));
    const result = await fundraisingToolFromTool(
      "fundraising_prospects_save",
      { prisma: {} as never, scope },
      { rows },
    );
    expect(result).toEqual({
      error: "At most 60 rows per call; you passed 173. Split the list and call again.",
    });
  });

  it("reports bad rows as failed with their position and saves the rest", async () => {
    const created: Record<string, unknown>[] = [];
    const tx = {
      $executeRaw: async () => 0,
      contact: {
        findMany: async () => [],
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: `c${created.length}` };
        },
      },
      fundraiseRound: { findFirst: async () => null },
    };
    const prisma = { $transaction: async (run: (t: typeof tx) => unknown) => run(tx) } as never;
    const result = await fundraisingToolFromTool(
      "fundraising_prospects_save",
      { prisma, scope, botId: "bot-1" },
      {
        rows: [
          {
            firm: "Harbor Angels",
            amountUsd: 250_000,
            nextStep: "Wave 1",
            kind: "customer",
            id: "x",
            roundId: "y",
          },
          { firm: "Broken", email: "not-an-email" },
          { firm: "Cents Fund", amountUsd: "lots" },
          { notes: "no name" },
        ],
      },
    );
    expect(result).toMatchObject({ added: 1, updated: 0, skipped: [] });
    expect((result as { failed: { row: number }[] }).failed.map((f) => f.row)).toEqual([2, 3, 4]);
    // $250,000 is 25,000,000 cents; kind, id and round from the row never reach the record.
    expect(created).toEqual([
      expect.objectContaining({
        ...scope,
        name: "Harbor Angels",
        organization: "Harbor Angels",
        kind: "prospect",
        stage: "target",
        checkSizeCents: 25_000_000,
        nextStep: "Wave 1",
        botId: "bot-1",
        roundId: null,
      }),
    ]);
    expect(created[0]).not.toHaveProperty("id");
  });
});
