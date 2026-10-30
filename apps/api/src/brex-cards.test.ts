import { createRouterClient } from "@orpc/server";
import type { Actor } from "@rakazo/contracts";
import {
  BREX_AGENT_MODEL,
  BREX_CARDS_CONTROLS_DEFAULTS,
  BREX_CARDS_MCP_ENDPOINT,
  FINANCE_MCP_ENDPOINTS,
  integrationAgentSpawnKey,
} from "@rakazo/contracts";
import { describe, expect, it, vi } from "vitest";
import type { BrexCardsDeps } from "./brex-cards.js";
import {
  brexCardsCards,
  brexCardsConnect,
  brexCardsGetControls,
  brexCardsReplaceToken,
  brexCardsSetControls,
} from "./brex-cards.js";
import { ensureIntegrationAgent } from "./integration-agent.js";
import type { RouterDeps } from "./router.js";
import { createRouter } from "./router.js";

const owner = { userId: "owner", spaceId: "space", email: "o@example.test" } as Actor;
const member = { ...owner, userId: "member" } as Actor;
const roles: Record<string, string> = { owner: "owner", member: "member", former: "member" };

const TOKEN = "bxt_unit_test_token_9f3a";
const NEW_TOKEN = "bxt_unit_test_token_new_77c1";

type Row = Record<string, unknown> & { id?: string };

/** The few tables the Brex cards code touches, in memory. */
function fakeDb(seed: { bot?: Row; server?: Row; connection?: Row } = {}) {
  const state = {
    servers: seed.server ? [seed.server] : ([] as Row[]),
    secrets: [] as Row[],
    connections: seed.connection ? [seed.connection] : ([] as Row[]),
    bots: seed.bot ? [seed.bot] : ([] as Row[]),
  };
  let n = 0;
  const spaceMember = {
    findUnique: vi.fn(async ({ where }: { where: { spaceId_userId: { userId: string } } }) => {
      const role = roles[where.spaceId_userId.userId];
      return role ? { role } : null;
    }),
  };
  const brexCardsConnection = {
    findUnique: vi.fn(async ({ where }: { where: { spaceId?: string; serverId?: string } }) => {
      const found = state.connections.find(
        (c) => c.spaceId === where.spaceId || c.serverId === where.serverId,
      );
      if (!found) return null;
      return { ...found, server: state.servers.find((s) => s.id === found.serverId) };
    }),
    create: vi.fn(async ({ data }: { data: Row }) => {
      state.connections.push({ ...BREX_CARDS_CONTROLS_DEFAULTS, ...data });
      return data;
    }),
    update: vi.fn(async ({ where, data }: { where: { serverId: string }; data: Row }) => {
      const row = state.connections.find((c) => c.serverId === where.serverId);
      Object.assign(row as Row, data);
      return row;
    }),
  };
  const mcpServer = {
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { id: `srv-${++n}`, revision: 1, writesEnabled: false, ...data };
      state.servers.push(row);
      return row;
    }),
    findFirst: vi.fn(
      async ({ where }: { where: Row }) =>
        state.servers.find(
          (s) => s.id === where.id && (!where.userId || s.userId === where.userId),
        ) ?? null,
    ),
    findFirstOrThrow: vi.fn(
      async ({ where }: { where: Row }) => state.servers.find((s) => s.id === where.id) as Row,
    ),
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = state.servers.find((s) => s.id === where.id && s.userId === where.userId);
      if (row) Object.assign(row, data);
      return { count: row ? 1 : 0 };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = state.servers.find((s) => s.id === where.id) as Row;
      for (const [key, value] of Object.entries(data)) {
        row[key] =
          value && typeof value === "object" && "increment" in value
            ? (row[key] as number) + (value as { increment: number }).increment
            : value;
      }
      return row;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
      state.servers = state.servers.filter((s) => s.id !== where.id);
      state.connections = state.connections.filter((c) => c.serverId !== where.id);
      return { count: 1 };
    }),
  };
  const secret = {
    findFirst: vi.fn(async () => null),
    count: vi.fn(
      async ({ where }: { where: { ciphertext: string } }) =>
        state.secrets.filter((row) => row.ciphertext === where.ciphertext).length,
    ),
    create: vi.fn(async ({ data }: { data: Row }) => {
      state.secrets.push(data);
      return data;
    }),
    deleteMany: vi.fn(async ({ where }: { where: { id: string } }) => {
      state.secrets = state.secrets.filter((s) => s.id !== where.id);
      return { count: 1 };
    }),
  };
  const bot = {
    findFirst: vi.fn(
      async ({ where }: { where: Row }) =>
        state.bots.find(
          (b) =>
            (where.id === undefined || b.id === where.id) &&
            (!where.spawnKey || b.spawnKey === where.spawnKey) &&
            (!where.userId || !b.userId || b.userId === where.userId),
        ) ?? null,
    ),
    // Honors the `modelId: null` condition the way the database does.
    updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
      const row = state.bots.find((b) => b.id === where.id);
      if (!row || ("modelId" in where && row.modelId !== where.modelId)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
  };
  const prisma = {
    spaceMember,
    brexCardsConnection,
    mcpServer,
    secret,
    botSecret: { count: vi.fn(async () => 0) },
    integrationProviderConfig: { count: vi.fn(async () => 0) },
    bot,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
  };
  return { state, prisma };
}

const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

/** Brex as the token check sees it. `fail` maps a path to a status or an error. */
function fakeBrex(fail: Record<string, number | "network"> = {}) {
  const calls: Array<{ path: string; authorization: string | null }> = [];
  const fetchFn = vi.fn(async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    const path = `${u.pathname}${u.search}`;
    calls.push({ path, authorization: new Headers(init?.headers).get("authorization") });
    const failure = fail[u.pathname];
    if (failure === "network") throw new TypeError("fetch failed");
    if (failure) return json({ error: "no" }, failure);
    if (u.pathname === "/v2/users/me")
      return json({ id: "usr_1", first_name: "Ada", last_name: "Example" });
    if (u.pathname === "/v2/cards") return json({ items: [], next_cursor: null });
    if (u.pathname === "/v2/company") return json({ id: "cmp_77", legal_name: "Example Co" });
    return json({}, 404);
  });
  return { calls, brexApi: { baseUrl: "http://brex.test", fetch: fetchFn as typeof fetch } };
}

function deps(
  db: ReturnType<typeof fakeDb>,
  brex = fakeBrex(),
  overrides: Partial<BrexCardsDeps> = {},
) {
  const secrets = {
    delete: vi.fn(async () => undefined),
    put: vi.fn(async (plaintext: string) => ({
      id: `sec-${db.state.secrets.length + 1}`,
      ciphertext: plaintext,
    })),
  };
  const callServerTool = vi.fn();
  const provisionAgent = vi.fn(async (_actor: Actor, serverId: string) => {
    const existing = db.state.bots[0];
    if (existing) return existing as never;
    const created = { id: "bot-new", spawnKey: integrationAgentSpawnKey(serverId), modelId: null };
    db.state.bots.push(created);
    return created as never;
  });
  const archiveBot = vi.fn(async () => undefined);
  return {
    brex,
    secrets,
    callServerTool,
    provisionAgent,
    archiveBot,
    deps: {
      prisma: db.prisma,
      secrets,
      mcp: { callServerTool },
      brexApi: brex.brexApi,
      provisionAgent,
      archiveBot,
      ...overrides,
    } as unknown as BrexCardsDeps,
  };
}

const connectedDb = (botExtra: Row = {}, rowOwner = "owner") =>
  fakeDb({
    server: {
      id: "srv-existing",
      spaceId: "space",
      userId: rowOwner,
      endpoint: BREX_CARDS_MCP_ENDPOINT,
      secretId: "sec-old",
      revision: 3,
      writesEnabled: false,
      agentBotId: "bot-1",
      slug: "brex-cards",
      name: "Brex cards",
      description: "",
      transport: "streamable_http",
      command: null,
      args: [],
      env: {},
      headers: {},
      enabled: true,
      agentExclusive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    connection: {
      serverId: "srv-existing",
      spaceId: "space",
      brexAccountId: "cmp_77",
      ...BREX_CARDS_CONTROLS_DEFAULTS,
    },
    bot: {
      id: "bot-1",
      spaceId: "space",
      userId: "owner",
      archivedAt: null,
      spawnKey: "integration-agent:srv-existing",
      modelId: null,
      ...botExtra,
    },
  });

describe("brexCardsConnect", () => {
  it("refuses a member before anything is checked or stored", async () => {
    const db = fakeDb();
    const t = deps(db);
    await expect(brexCardsConnect(t.deps, member, TOKEN)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(t.brex.calls).toEqual([]);
    expect(t.secrets.put).not.toHaveBeenCalled();
    expect(db.state.servers).toEqual([]);
  });

  it("refuses a second connect in the space as a conflict, without calling Brex", async () => {
    const db = connectedDb();
    const t = deps(db);
    await expect(brexCardsConnect(t.deps, owner, TOKEN)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(t.brex.calls).toEqual([]);
  });

  it.each([
    [{ "/v2/users/me": 401 }, "Brex rejected this token"],
    [{ "/v2/cards": 403 }, "Brex rejected this token"],
    [{ "/v2/company": 401 }, "Brex rejected this token"],
    [{ "/v2/users/me": 500 }, "Could not reach Brex"],
    [{ "/v2/cards": "network" as const }, "Could not reach Brex"],
    [{ "/v2/company": 429 }, "Could not reach Brex"],
  ])("a failed token check %j stores nothing and says exactly %s", async (fail, message) => {
    const db = fakeDb();
    const t = deps(db, fakeBrex(fail));
    const error = await brexCardsConnect(t.deps, owner, TOKEN).catch((e: unknown) => e);
    expect(error).toMatchObject({ message });
    expect(String((error as Error).message)).not.toContain(TOKEN);
    expect(t.secrets.put).not.toHaveBeenCalled();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(db.state).toMatchObject({ servers: [], secrets: [], connections: [] });
    expect(t.provisionAgent).not.toHaveBeenCalled();
  });

  it("checks the three Brex endpoints with the token, then stores an exclusive, read-only server with the company id", async () => {
    const db = fakeDb();
    const t = deps(db);
    const result = await brexCardsConnect(t.deps, owner, TOKEN);

    expect(t.brex.calls).toEqual([
      { path: "/v2/users/me", authorization: `Bearer ${TOKEN}` },
      { path: "/v2/cards?limit=1", authorization: `Bearer ${TOKEN}` },
      { path: "/v2/company", authorization: `Bearer ${TOKEN}` },
    ]);
    expect(JSON.parse(db.state.secrets[0]?.ciphertext as string)).toMatchObject({ secret: TOKEN });
    expect(db.state.servers[0]).toMatchObject({
      spaceId: "space",
      userId: "owner",
      slug: "brex-cards",
      name: "Brex cards",
      endpoint: BREX_CARDS_MCP_ENDPOINT,
      transport: "streamable_http",
      secretId: db.state.secrets[0]?.id,
      agentExclusive: true,
      writesEnabled: false,
    });
    expect(db.state.connections[0]).toMatchObject({
      serverId: db.state.servers[0]?.id,
      spaceId: "space",
      createdByUserId: "owner",
      brexAccountId: "cmp_77",
    });
    expect(t.provisionAgent).toHaveBeenCalledWith(owner, db.state.servers[0]?.id);
    expect(result).toEqual({ serverId: db.state.servers[0]?.id, agentBotId: "bot-new" });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("pins the model only on an agent whose model is empty", async () => {
    const empty = fakeDb({
      bot: { id: "bot-1", spawnKey: "integration-agent:fin", modelId: null },
    });
    await brexCardsConnect(deps(empty).deps, owner, TOKEN);
    expect(empty.state.bots[0]).toMatchObject({
      modelProvider: BREX_AGENT_MODEL.provider,
      modelId: BREX_AGENT_MODEL.id,
      thinkingLevel: BREX_AGENT_MODEL.thinkingLevel,
    });

    const chosen = fakeDb({
      bot: { id: "bot-1", spawnKey: "integration-agent:fin", modelId: "my-own-model" },
    });
    await brexCardsConnect(deps(chosen).deps, owner, TOKEN);
    expect(chosen.state.bots[0]).toMatchObject({ modelId: "my-own-model" });
    expect(chosen.state.bots[0]).not.toHaveProperty("modelProvider");
  });

  it("removes the secret, server and state row when provisioning fails, and says why", async () => {
    const db = fakeDb();
    const t = deps(db, fakeBrex(), {
      provisionAgent: vi.fn(async () => {
        throw new Error("agent exploded");
      }),
    });
    await expect(brexCardsConnect(t.deps, owner, TOKEN)).rejects.toThrow("agent exploded");
    expect(db.state).toMatchObject({ servers: [], secrets: [], connections: [] });
  });

  it("archives the agent it created on failure, but never a shared finance agent", async () => {
    const own = fakeDb({
      bot: { id: "bot-own", spawnKey: "integration-agent:srv-1", modelId: null },
    });
    const ownDeps = deps(own);
    own.prisma.bot.updateMany.mockRejectedValueOnce(new Error("pin failed"));
    await expect(brexCardsConnect(ownDeps.deps, owner, TOKEN)).rejects.toThrow("pin failed");
    expect(ownDeps.archiveBot).toHaveBeenCalledWith(owner, "bot-own");

    const shared = fakeDb({
      bot: { id: "bot-fin", spawnKey: "integration-agent:fin", modelId: null },
    });
    const sharedDeps = deps(shared);
    shared.prisma.bot.updateMany.mockRejectedValueOnce(new Error("pin failed"));
    await expect(brexCardsConnect(sharedDeps.deps, owner, TOKEN)).rejects.toThrow("pin failed");
    expect(sharedDeps.archiveBot).not.toHaveBeenCalled();
    expect(shared.state.servers).toEqual([]);
  });
});

describe("brexCardsReplaceToken", () => {
  it("refuses a member before calling Brex", async () => {
    const db = connectedDb();
    const t = deps(db);
    await expect(brexCardsReplaceToken(t.deps, member, NEW_TOKEN)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(t.brex.calls).toEqual([]);
  });

  it("is not found when the space has no Brex cards connection", async () => {
    const t = deps(fakeDb());
    await expect(brexCardsReplaceToken(t.deps, owner, NEW_TOKEN)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("keeps the old secret and changes nothing when Brex rejects the new token", async () => {
    const db = connectedDb();
    const t = deps(db, fakeBrex({ "/v2/users/me": 401 }));
    await expect(brexCardsReplaceToken(t.deps, owner, NEW_TOKEN)).rejects.toMatchObject({
      message: "Brex rejected this token",
    });
    expect(t.secrets.put).not.toHaveBeenCalled();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(db.state.servers[0]).toMatchObject({ secretId: "sec-old", revision: 3 });
  });

  it("swaps the secret and bumps the revision, keeping controls and the model", async () => {
    const db = connectedDb({ modelId: "my-own-model" });
    db.state.secrets.push({ id: "sec-old", ciphertext: "old" });
    db.state.connections[0] = { ...db.state.connections[0], maxCardsPerDay: 2 };
    const t = deps(db);
    await brexCardsReplaceToken(t.deps, owner, NEW_TOKEN);

    expect(db.state.servers[0]).toMatchObject({ revision: 4, secretId: "sec-2" });
    expect(db.state.secrets.map((s) => s.id)).toEqual(["sec-2"]);
    expect(JSON.parse(db.state.secrets[0]?.ciphertext as string)).toMatchObject({
      secret: NEW_TOKEN,
    });
    expect(db.state.connections[0]).toMatchObject({ maxCardsPerDay: 2, brexAccountId: "cmp_77" });
    expect(db.state.bots[0]).toMatchObject({ modelId: "my-own-model" });
  });
});

describe("brexCardsCards", () => {
  const BODY = {
    cards: [
      {
        id: "card_1",
        name: "Ads",
        lastFour: "4242",
        status: "ACTIVE",
        ownerUserId: "usr_1",
        limitCents: 50_000,
        currency: "USD",
        duration: "MONTHLY",
      },
    ],
  };

  it("refuses a member without calling the tool", async () => {
    const t = deps(connectedDb());
    await expect(brexCardsCards(t.deps, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(t.callServerTool).not.toHaveBeenCalled();
  });

  it("calls only list_cards and returns the rows with the agent and the write switch", async () => {
    const db = connectedDb();
    const t = deps(db);
    t.callServerTool.mockResolvedValue({ content: [{ type: "text", text: JSON.stringify(BODY) }] });
    const list = await brexCardsCards(t.deps, owner);

    expect(t.callServerTool).toHaveBeenCalledTimes(1);
    const [server, context, tool, args] = t.callServerTool.mock.calls[0] ?? [];
    expect(server).toMatchObject({ id: "srv-existing" });
    expect(context).toMatchObject({ spaceId: "space", userId: "owner" });
    expect([tool, args]).toEqual(["list_cards", {}]);
    expect(list).toEqual({
      serverId: "srv-existing",
      agentBotId: "bot-1",
      writesEnabled: false,
      cards: [
        {
          cardId: "card_1",
          name: "Ads",
          lastFour: "4242",
          ownerUserId: "usr_1",
          status: "ACTIVE",
          limitCents: 50_000,
          currency: "USD",
          duration: "MONTHLY",
        },
      ],
    });
  });

  it("reports a failed tool call as an error, not an empty list", async () => {
    const t = deps(connectedDb());
    t.callServerTool.mockResolvedValue({
      isError: true,
      content: [{ type: "text", text: "Brex rejected the token or its scope" }],
    });
    await expect(brexCardsCards(t.deps, owner)).rejects.toThrow("Brex rejected the token");
  });
});

describe("brexCards controls", () => {
  it("returns the stored controls to the owner and refuses a member", async () => {
    const t = deps(connectedDb());
    await expect(brexCardsGetControls(t.deps, owner)).resolves.toEqual(
      BREX_CARDS_CONTROLS_DEFAULTS,
    );
    await expect(brexCardsGetControls(t.deps, member)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("stores valid controls and returns them", async () => {
    const db = connectedDb();
    const next = {
      ...BREX_CARDS_CONTROLS_DEFAULTS,
      maxCardsPerDay: 2,
      allowedDurations: ["MONTHLY"],
    };
    const t = deps(db);
    await expect(brexCardsSetControls(t.deps, owner, next as never)).resolves.toEqual(next);
    expect(db.state.connections[0]).toMatchObject({
      maxCardsPerDay: 2,
      allowedDurations: ["MONTHLY"],
    });
  });

  it("rejects invalid controls and refuses a member, changing nothing", async () => {
    const db = connectedDb();
    const t = deps(db);
    const bad = { ...BREX_CARDS_CONTROLS_DEFAULTS, maxCardsPerDay: 0 };
    await expect(brexCardsSetControls(t.deps, owner, bad as never)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(
      brexCardsSetControls(t.deps, member, BREX_CARDS_CONTROLS_DEFAULTS as never),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.prisma.brexCardsConnection.update).not.toHaveBeenCalled();
  });
});

describe("token ownership and the Brex account", () => {
  it("refuses a replacement token from another Brex company and changes nothing", async () => {
    const db = connectedDb();
    db.state.connections[0] = { ...db.state.connections[0], brexAccountId: "cmp_other" };
    const t = deps(db);
    await expect(brexCardsReplaceToken(t.deps, owner, NEW_TOKEN)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message:
        "This token is for a different Brex account. Disconnect Brex cards and connect again.",
    });
    expect(t.secrets.put).not.toHaveBeenCalled();
    expect(db.prisma.$transaction).not.toHaveBeenCalled();
    expect(db.state.servers[0]).toMatchObject({ secretId: "sec-old", revision: 3 });
    expect(db.state.connections[0]).toMatchObject({ brexAccountId: "cmp_other" });
  });

  const SOMEONE_ELSE = "Brex cards were connected by someone else. Disconnect and connect again.";
  it.each([
    [
      "replaceToken",
      (t: ReturnType<typeof deps>) => brexCardsReplaceToken(t.deps, owner, NEW_TOKEN),
    ],
    ["cards", (t: ReturnType<typeof deps>) => brexCardsCards(t.deps, owner)],
    ["getControls", (t: ReturnType<typeof deps>) => brexCardsGetControls(t.deps, owner)],
    [
      "setControls",
      (t: ReturnType<typeof deps>) =>
        brexCardsSetControls(t.deps, owner, BREX_CARDS_CONTROLS_DEFAULTS as never),
    ],
  ])("%s refuses the current owner when someone else connected the server", async (_name, call) => {
    const db = connectedDb({}, "former");
    const t = deps(db);
    t.callServerTool.mockResolvedValue({ content: [{ type: "text", text: '{"cards":[]}' }] });
    await expect(call(t)).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: SOMEONE_ELSE,
    });
    expect(t.callServerTool).not.toHaveBeenCalled();
    expect(t.brex.calls).toEqual([]);
    expect(t.secrets.put).not.toHaveBeenCalled();
    expect(db.prisma.brexCardsConnection.update).not.toHaveBeenCalled();
  });
});

describe("the stored secret when the transaction fails", () => {
  it("connect deletes the secret it stored, and keeps it on success", async () => {
    const failing = fakeDb();
    failing.prisma.$transaction.mockRejectedValueOnce(new Error("tx failed"));
    const t = deps(failing);
    await expect(brexCardsConnect(t.deps, owner, TOKEN)).rejects.toThrow("tx failed");
    expect(t.secrets.delete).toHaveBeenCalledTimes(1);
    expect(String(t.secrets.delete.mock.calls[0]?.[0])).toContain(TOKEN);

    const ok = deps(fakeDb());
    await brexCardsConnect(ok.deps, owner, TOKEN);
    expect(ok.secrets.delete).not.toHaveBeenCalled();
  });

  it("replace token deletes the new secret and keeps the old one", async () => {
    const db = connectedDb();
    db.state.secrets.push({ id: "sec-old", ciphertext: "old" });
    db.prisma.$transaction.mockRejectedValueOnce(new Error("tx failed"));
    const t = deps(db);
    await expect(brexCardsReplaceToken(t.deps, owner, NEW_TOKEN)).rejects.toThrow("tx failed");
    expect(t.secrets.delete).toHaveBeenCalledTimes(1);
    expect(String(t.secrets.delete.mock.calls[0]?.[0])).toContain(NEW_TOKEN);
    expect(db.state.servers[0]).toMatchObject({ secretId: "sec-old", revision: 3 });
  });
});

describe("the Brex agent", () => {
  const financeServer = {
    id: "fin",
    spaceId: "space",
    userId: "owner",
    endpoint: FINANCE_MCP_ENDPOINTS.brex,
    agentBotId: "bot-fin",
  };
  const financeBot = {
    id: "bot-fin",
    spaceId: "space",
    userId: "owner",
    spawnKey: "integration-agent:fin",
    archivedAt: null,
    instructions: "You work with the user's Brex account through its tools.",
  };

  function reuseSetup(
    servers = [financeServer],
    bots: Array<Record<string, unknown>> = [financeBot],
  ) {
    const cardsServer = {
      id: "cards",
      spaceId: "space",
      userId: "owner",
      endpoint: BREX_CARDS_MCP_ENDPOINT,
      name: "Brex cards",
      agentBotId: null,
    };
    const tx = {
      bot: { updateMany: vi.fn(async () => ({ count: 1 })) },
      botMcpServer: { upsert: vi.fn() },
      mcpServer: {
        findFirst: vi.fn(async () => cardsServer),
        updateMany: vi.fn(async () => ({ count: 1 })),
        findFirstOrThrow: vi.fn(async () => cardsServer),
      },
    };
    const prisma = {
      mcpServer: {
        findFirst: vi.fn(async () => cardsServer),
        findMany: vi.fn(async () => servers),
      },
      bot: {
        findFirst: vi.fn(
          async ({ where }: { where: { id?: string; spawnKey?: string } }) =>
            bots.find(
              (b) => b.id === where.id || (where.spawnKey && b.spawnKey === where.spawnKey),
            ) ?? null,
        ),
      },
      $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
    };
    const createBot = vi.fn(
      async (_actor: Actor, input: { spawnKey: string }) =>
        bots.find((b) => b.spawnKey === input.spawnKey) ?? {
          id: "bot-new",
          spaceId: "space",
          userId: "owner",
          spawnKey: input.spawnKey,
          archivedAt: null,
          instructions: (input as { instructions?: string }).instructions ?? "",
        },
    );
    const replaceBotInstructions = vi.fn();
    const archiveBot = vi.fn();
    return {
      prisma,
      tx,
      createBot,
      replaceBotInstructions,
      archiveBot,
      run: () =>
        ensureIntegrationAgent(
          { prisma, repos: { createBot, replaceBotInstructions }, archiveBot } as never,
          owner,
          "cards",
        ),
    };
  }

  it("attaches the cards server to the owner's existing Brex finance agent and adds the cards guidance", async () => {
    const t = reuseSetup();
    const { bot } = await t.run();
    expect(bot.id).toBe("bot-fin");
    expect(t.createBot.mock.calls[0]?.[1]).toMatchObject({ spawnKey: "integration-agent:fin" });
    expect(t.tx.botMcpServer.upsert).toHaveBeenCalled();
    const change = t.replaceBotInstructions.mock.calls[0]?.[2] as { from: string; to: string };
    expect(change.from).toBe(financeBot.instructions);
    expect(change.to.startsWith(financeBot.instructions)).toBe(true);
    expect(change.to).toContain("virtual vendor cards and spend limits");
    expect(t.archiveBot).not.toHaveBeenCalled();
  });

  it("creates a Brex agent with the cards guidance when the owner has none", async () => {
    const t = reuseSetup([], []);
    await t.run();
    const input = t.createBot.mock.calls[0]?.[1] as {
      spawnKey: string;
      name: string;
      instructions: string;
    };
    expect(input.spawnKey).toBe(integrationAgentSpawnKey("cards"));
    expect(input.name).toBe("Brex agent");
    expect(input.instructions).toContain("virtual vendor cards and spend limits");
    expect(t.replaceBotInstructions).not.toHaveBeenCalled();
  });

  it("does not reuse an agent that belongs to a server that is not Brex", async () => {
    const other = { ...financeServer, endpoint: "https://mcp.mercury.com/mcp" };
    const t = reuseSetup([other]);
    await t.run();
    expect(t.createBot.mock.calls[0]?.[1]).toMatchObject({
      spawnKey: integrationAgentSpawnKey("cards"),
    });
  });
});

describe("generic MCP routes on the Brex cards server", () => {
  /** A router over the same fake tables, so the real handlers run. */
  function routed(who: Actor, db = connectedDb()) {
    const prisma = Object.assign(db.prisma, {
      devinConnectionState: { findUnique: vi.fn(async () => null) },
    });
    const secrets = { put: vi.fn(), load: vi.fn() };
    const router = createRouter({
      prisma,
      env: {},
      secrets,
      sandbox: {},
      home: {},
      jobs: {},
    } as unknown as RouterDeps);
    return {
      client: createRouterClient(router, { context: { actor: who } as never }),
      db,
      secrets,
    };
  }
  const bearer = (client: ReturnType<typeof routed>["client"]) => client;

  it("refuses a replacement credential and points to Replace token, changing nothing", async () => {
    const { client, db, secrets } = routed(owner);
    await expect(
      bearer(client).mcp.servers.update({ id: "srv-existing", secret: "not-a-valid-token" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Replace token"),
    });
    expect(secrets.put).not.toHaveBeenCalled();
    expect(db.prisma.mcpServer.update).not.toHaveBeenCalled();
    expect(db.state.servers[0]).toMatchObject({ secretId: "sec-old", revision: 3 });
  });

  it("refuses the credential update for a former space owner who still owns the row", async () => {
    const former = { ...owner, userId: "former" } as Actor;
    const db = connectedDb();
    db.state.servers[0] = { ...db.state.servers[0], userId: "former" };
    const { client } = routed(former, db);
    await expect(
      client.mcp.servers.update({ id: "srv-existing", secret: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects exclusive: false through the generic exclusivity RPC", async () => {
    const { client, db } = routed(owner);
    await expect(
      client.integrationAgents.setExclusive({ serverId: "srv-existing", exclusive: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.state.servers[0]).not.toMatchObject({ agentExclusive: false });
  });

  it("refuses the write switch and exclusivity to a former space owner who still owns the row", async () => {
    const former = { ...owner, userId: "former" } as Actor;
    const db = connectedDb();
    db.state.servers[0] = { ...db.state.servers[0], userId: "former", agentExclusive: true };
    db.state.bots[0] = { ...db.state.bots[0], userId: "former" };
    const { client } = routed(former, db);
    await expect(
      client.mcp.servers.setWrites({ id: "srv-existing", enabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      client.integrationAgents.setExclusive({ serverId: "srv-existing", exclusive: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.state.servers[0]).toMatchObject({ writesEnabled: false });
  });
  it("after an ownership transfer, the new owner may turn writes off but not on, and the former owner may do neither", async () => {
    const former = { ...owner, userId: "former" } as Actor;
    const db = connectedDb({}, "former");
    db.state.servers[0] = { ...db.state.servers[0], writesEnabled: true };
    db.state.bots[0] = { ...db.state.bots[0], userId: "former" };
    const current = routed(owner, db).client;
    await expect(
      current.mcp.servers.setWrites({ id: "srv-existing", enabled: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      routed(former, db).client.mcp.servers.setWrites({ id: "srv-existing", enabled: false }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(db.state.servers[0]).toMatchObject({ writesEnabled: true });
    await current.mcp.servers.setWrites({ id: "srv-existing", enabled: false });
    expect(db.state.servers[0]).toMatchObject({ writesEnabled: false });
  });
});
