import { RPCHandler } from "@orpc/server/fetch";
import type { Actor } from "@rakazo/contracts";
import type { PrismaClient } from "@rakazo/db";
import { describe, expect, it, vi } from "vitest";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

// Offline boundary: a fake Prisma client drives the real pages handlers and the real
// repos.getBot ownership check.

type Row = Record<string, unknown>;
const actor = {
  spaceId: "space-1",
  userId: "user-1",
  email: "user@rakazo.test",
  isDeploymentOwner: false,
} satisfies Actor;

const match = (row: Row, where: Row = {}) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

function setup() {
  const bots: Row[] = [
    { id: "bot-1", userId: "user-1", spaceId: "space-1", archivedAt: null, name: "Writer" },
    {
      id: "bot-other-user",
      userId: "user-2",
      spaceId: "space-1",
      archivedAt: null,
      name: "Writer",
    },
    {
      id: "bot-other-space",
      userId: "user-1",
      spaceId: "space-2",
      archivedAt: null,
      name: "Writer",
    },
  ];
  const pages: Row[] = [];
  const prisma = {
    bot: {
      findFirst: vi.fn(async ({ where }: { where: Row }) => {
        const bot = bots.find((entry) => match(entry, where));
        return bot ? { ...bot, thread: null, computer: null } : null;
      }),
    },
    botPage: {
      findFirst: vi.fn(
        async ({ where }: { where: Row }) => pages.find((p) => match(p, where)) ?? null,
      ),
      findMany: vi.fn(async ({ where }: { where: Row }) => pages.filter((p) => match(p, where))),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const row = {
          id: `page-${pages.length + 1}`,
          updatedAt: new Date("2026-10-17T00:00:00Z"),
          ...data,
        };
        pages.push(row);
        return row;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const row = pages.find((p) => match(p, where));
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      }),
      deleteMany: vi.fn(async ({ where }: { where: Row }) => {
        const i = pages.findIndex((p) => match(p, where));
        if (i >= 0) pages.splice(i, 1);
        return { count: i >= 0 ? 1 : 0 };
      }),
    },
    botPageRevision: { create: vi.fn() },
    thread: { findFirst: vi.fn(async () => ({ id: "thread-1" })) },
    $transaction: vi.fn(),
  };
  prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  const events = { append: vi.fn(async () => ({})) };
  const deps = {
    prisma: prisma as unknown as PrismaClient,
    events,
    env: { mailWritesDisabled: false },
  } as unknown as RouterDeps;
  const handler = new RPCHandler(createRouter(deps));
  async function call(
    path: "get" | "save" | "list" | "create" | "rename" | "remove",
    input: unknown,
  ) {
    const { response } = await handler.handle(
      new Request(`http://127.0.0.1/rpc/pages/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ json: input }),
      }),
      { prefix: "/rpc", context: { actor } },
    );
    if (!response) throw new Error("Procedure did not match");
    return { status: response.status, body: (await response.json()) as { json: Row | null } };
  }
  return { prisma, events, pages, call };
}

describe("pages router", () => {
  it("saves as the user, reads back, and returns a conflict for a stale revision", async () => {
    const { call, events } = setup();
    expect((await call("get", { botId: "bot-1" })).body.json).toBeNull();
    const saved = await call("save", { botId: "bot-1", content: "# Plan", baseRevision: 0 });
    expect(saved.body.json).toMatchObject({ ok: true, page: { revision: 1, updatedBy: "user" } });
    expect(events.append).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "page.updated",
        payload: { pageId: "page-1", revision: 1, updatedBy: "user" },
      }),
    );
    expect((await call("get", { botId: "bot-1" })).body.json).toMatchObject({ content: "# Plan" });
    const stale = await call("save", { botId: "bot-1", content: "x", baseRevision: 0 });
    expect(stale.body.json).toMatchObject({ ok: false, reason: "conflict", page: { revision: 1 } });
  });

  it("rejects an invalid chart as a bad request", async () => {
    const { call, pages } = setup();
    const result = await call("save", {
      botId: "bot-1",
      content: "```chart\nnope\n```",
      baseRevision: 0,
    });
    expect(result.status).toBe(400);
    expect(pages).toHaveLength(0);
  });

  it("does not expose or modify another user's or another space's bot", async () => {
    const { call, pages } = setup();
    for (const botId of ["bot-other-user", "bot-other-space"]) {
      expect((await call("get", { botId })).status).toBeGreaterThanOrEqual(400);
      expect(
        (await call("save", { botId, content: "x", baseRevision: 0 })).status,
      ).toBeGreaterThanOrEqual(400);
    }
    expect(pages).toHaveLength(0);
  });

  it("lists, creates, renames and removes named pages, and addresses each by pageId", async () => {
    const { call } = setup();
    await call("save", { botId: "bot-1", content: "first", baseRevision: 0 });
    const created = await call("create", { botId: "bot-1", title: " Cash " });
    expect(created.body.json).toMatchObject({ title: "Cash", revision: 1, content: "" });
    const pageId = created.body.json?.id as string;
    expect((await call("create", { botId: "bot-1", title: "Cash" })).status).toBe(409);
    expect((await call("list", { botId: "bot-1" })).body.json).toMatchObject([
      { title: "Writer", revision: 1 },
      { title: "Cash", revision: 1 },
    ]);
    // No pageId still means the first page.
    expect((await call("get", { botId: "bot-1" })).body.json).toMatchObject({ content: "first" });
    const saved = await call("save", { botId: "bot-1", pageId, content: "c", baseRevision: 1 });
    expect(saved.body.json).toMatchObject({ ok: true, page: { title: "Cash", revision: 2 } });
    expect((await call("get", { botId: "bot-1", pageId })).body.json).toMatchObject({
      content: "c",
    });
    expect(
      (await call("rename", { botId: "bot-1", pageId, title: "Money" })).body.json,
    ).toMatchObject({
      title: "Money",
    });
    expect((await call("remove", { botId: "bot-1", pageId })).body.json).toEqual({ ok: true });
    expect((await call("get", { botId: "bot-1", pageId })).body.json).toBeNull();
  });

  it("treats a pageId of another bot as not found", async () => {
    const { call, pages } = setup();
    pages.push({
      id: "foreign",
      botId: "bot-other-user",
      spaceId: "space-1",
      title: "Theirs",
      content: "secret",
      revision: 1,
      updatedBy: "user",
      updatedAt: new Date(),
    });
    expect((await call("get", { botId: "bot-1", pageId: "foreign" })).body.json).toBeNull();
    expect(
      (await call("save", { botId: "bot-1", pageId: "foreign", content: "x", baseRevision: 1 }))
        .status,
    ).toBe(404);
    expect(
      (await call("rename", { botId: "bot-1", pageId: "foreign", title: "Mine" })).status,
    ).toBe(404);
    expect((await call("remove", { botId: "bot-1", pageId: "foreign" })).status).toBe(404);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ title: "Theirs", content: "secret" });
    for (const path of ["list", "create"] as const) {
      expect(
        (await call(path, { botId: "bot-other-user", title: "x" })).status,
      ).toBeGreaterThanOrEqual(400);
    }
  });
});
