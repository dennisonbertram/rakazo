import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SendBlueEmulator, SendBlueMessagingProvider } from "@rakazo/adapters";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.WAKEUP_DRIVER = "memory";
process.env.SANDBOX_PROVIDER = "fake";
process.env.AGENT_RUNTIME = "scripted";

const hasDb = process.env.VERIFY_DATABASE === "1" && Boolean(process.env.DATABASE_URL);
const describePhone = hasDb ? describe.sequential : describe.skip;

type App = { request: (input: string | Request, init?: RequestInit) => Promise<Response> };

describePhone("phone surface journeys", () => {
  let app: App;
  let stop: () => Promise<void>;
  let prisma: any;
  const emulator = new SendBlueEmulator();
  const dataDir = mkdtempSync(path.join(tmpdir(), "rakazo-phone-"));
  // Unique per run: identities, threads, and outbox rows persist in the dev database.
  const stamp = Date.now();
  const sender = `+1555${String(stamp).slice(-7)}`;
  const dmHandle = `journey-dm-${stamp}`;

  beforeAll(async () => {
    const { createApp } = await import("../../../apps/api/src/app.ts");
    const handles = await createApp({
      databaseUrl: process.env.DATABASE_URL!,
      dataDir,
      sandboxProvider: "fake",
      agentRuntime: "scripted",
      messaging: new SendBlueMessagingProvider(
        {
          apiKeyId: "emulated",
          apiSecret: "emulated",
          signingSecret: emulator.signingSecret,
          phoneNumber: emulator.phoneNumber,
        },
        { fetch: emulator.fetch },
      ),
      sendblueSigningSecret: emulator.signingSecret,
    });
    app = handles.app;
    stop = handles.stop;
    prisma = handles.prisma;
  });

  afterAll(async () => {
    await stop?.();
  });

  it("provisions on first text, runs the bot, and mirrors the reply back out", async () => {
    const res = await app.request(
      emulator.buildInboundRequest({
        fromNumber: sender,
        content: "hello there",
        handle: dmHandle,
      }),
    );
    expect(res.status).toBe(200);

    await waitForDatabase(async () =>
      Boolean(await prisma.phoneIdentity.findUnique({ where: { phoneE164: sender } })),
    );
    // The outbox row flips to sent after the provider call and counter update,
    // so it is the last durable signal of the whole mirror loop.
    await waitForDatabase(async () =>
      Boolean(
        await prisma.phoneOutbound.findFirst({
          where: { toNumber: sender, kind: "dm", status: "sent" },
        }),
      ),
    );
    expect(emulator.sent.some((send) => send.kind === "dm" && send.to === sender)).toBe(true);

    const identity = await prisma.phoneIdentity.findUnique({ where: { phoneE164: sender } });
    expect(identity.outboundSinceInbound).toBe(1);
    const outbound = await prisma.phoneOutbound.findMany({
      where: { toNumber: sender, kind: "dm" },
    });
    expect(outbound).toHaveLength(1);
    expect(outbound[0].providerHandle).toBeTruthy();

    const userMessage = await prisma.message.findFirst({
      where: {
        threadId: (await prisma.thread.findFirst({ where: { botId: identity.botId } })).id,
        role: "user",
      },
    });
    expect(userMessage.clientNonce).toMatch(/^phone:/);
  });

  it("replays the same handle without a duplicate message or send", async () => {
    const replay = await app.request(
      emulator.buildInboundRequest({
        fromNumber: sender,
        content: "hello there",
        handle: dmHandle,
      }),
    );
    expect(replay.status).toBe(200);

    // Give any erroneous duplicate work a chance to appear.
    await new Promise((resolve) => setTimeout(resolve, 500));

    const identity = await prisma.phoneIdentity.findUnique({ where: { phoneE164: sender } });
    const thread = await prisma.thread.findFirst({ where: { botId: identity.botId } });
    const userMessages = await prisma.message.findMany({
      where: { threadId: thread.id, role: "user" },
    });
    expect(userMessages).toHaveLength(1);
    const outbound = await prisma.phoneOutbound.findMany({
      where: { toNumber: sender, kind: "dm" },
    });
    expect(outbound).toHaveLength(1);
    expect(emulator.sent.filter((send) => send.kind === "dm" && send.to === sender)).toHaveLength(
      1,
    );
  });

  it("rejects a bad signing secret", async () => {
    const request = emulator.buildInboundRequest({
      fromNumber: "+15550000001",
      content: "intruder",
    });
    const res = await app.request(request.url, {
      method: "POST",
      headers: { "content-type": "application/json", "sb-signing-secret": "wrong" },
      body: await request.text(),
    });
    expect(res.status).toBe(401);
    expect(
      await prisma.phoneIdentity.findUnique({ where: { phoneE164: "+15550000001" } }),
    ).toBeNull();
  });
});

async function waitForDatabase(pred: () => Promise<boolean>) {
  const start = Date.now();
  while (Date.now() - start < 15_000) {
    if (await pred()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timeout waiting for database state");
}
