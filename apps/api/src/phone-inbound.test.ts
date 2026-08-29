import { describe, expect, it, vi } from "vitest";
import { createPhoneInboundHandler, type PhoneInboundDeps } from "./phone-inbound.js";

const signupPolicy = { signupsEnabled: undefined, signupAllowlist: undefined };

function createDeps(overrides: Partial<PhoneInboundDeps> = {}) {
  const sendUserMessage = vi.fn(async () => ({ messageId: "msg-1", runId: "run-1", seq: 3 }));
  const enqueue = vi.fn(async () => undefined);
  const provision = vi.fn(async (phone: string) => ({
    phoneE164: phone,
    userId: "user-new",
    workspaceId: "ws-new",
    botId: "bot-new",
    threadId: "thread-new",
    created: true,
  }));
  const identity = {
    id: "pi-1",
    phoneE164: "+15551234567",
    userId: "user-1",
    workspaceId: "ws-1",
    botId: "bot-1",
    verifiedAt: null,
    lastInboundAt: null,
    outboundSinceInbound: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const prisma = {
    phoneIdentity: {
      findUnique: vi.fn(async () => identity),
      update: vi.fn(async () => identity),
    },
    thread: { findFirst: vi.fn(async () => ({ id: "thread-1" })) },
  };
  return {
    prisma,
    events: { sendUserMessage },
    jobs: { enqueue },
    provision,
    signupPolicy,
    sendUserMessage,
    enqueue,
    ...overrides,
  } as unknown as PhoneInboundDeps & {
    sendUserMessage: ReturnType<typeof vi.fn>;
    enqueue: ReturnType<typeof vi.fn>;
    provision: ReturnType<typeof vi.fn>;
  };
}

const dmEvent = {
  type: "message" as const,
  handle: "handle-1",
  fromNumber: "+15551234567",
  groupId: null,
  groupName: null,
  participants: ["+15551234567", "+15550009999"],
  content: "hello bot",
  mediaUrl: null,
};

describe("createPhoneInboundHandler", () => {
  it("delivers a known sender's text into their bot's existing thread", async () => {
    const deps = createDeps();
    const handle = createPhoneInboundHandler(deps);
    await handle(dmEvent);

    expect(deps.provision).not.toHaveBeenCalled();
    expect(deps.prisma.phoneIdentity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outboundSinceInbound: 0 }),
      }),
    );
    expect(deps.sendUserMessage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      threadId: "thread-1",
      botId: "bot-1",
      userId: "user-1",
      blocks: [{ kind: "text", text: "hello bot" }],
      prompt: "hello bot",
      trigger: "phone",
      clientNonce: "phone:handle-1",
    });
    expect(deps.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "run.continue",
        payload: { runId: "run-1" },
      }),
    );
  });

  it("provisions on first text and uses the new identity", async () => {
    const deps = createDeps();
    deps.prisma.phoneIdentity.findUnique = vi.fn(async () => null);
    const handle = createPhoneInboundHandler(deps);
    await handle(dmEvent);

    expect(deps.provision).toHaveBeenCalledWith("+15551234567", signupPolicy);
    expect(deps.sendUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-new",
        threadId: "thread-new",
        botId: "bot-new",
        userId: "user-new",
        clientNonce: "phone:handle-1",
      }),
    );
  });

  it("appends inbound media links to the message text", async () => {
    const deps = createDeps();
    const handle = createPhoneInboundHandler(deps);
    await handle({ ...dmEvent, content: "", mediaUrl: "https://cdn.example.com/pic.jpg" });

    expect(deps.sendUserMessage).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: "https://cdn.example.com/pic.jpg" }),
    );
  });

  it("ignores group messages until channels land", async () => {
    const deps = createDeps();
    const handle = createPhoneInboundHandler(deps);
    await handle({ ...dmEvent, groupId: "grp-1", groupName: "Family" });

    expect(deps.provision).not.toHaveBeenCalled();
    expect(deps.sendUserMessage).not.toHaveBeenCalled();
    expect(deps.enqueue).not.toHaveBeenCalled();
  });

  it("does not enqueue when the message created no run", async () => {
    const deps = createDeps({
      events: { sendUserMessage: vi.fn(async () => ({ messageId: "msg-1", runId: null, seq: 3 })) },
    } as Partial<PhoneInboundDeps>);
    const handle = createPhoneInboundHandler(deps);
    await handle(dmEvent);

    expect(deps.enqueue).not.toHaveBeenCalled();
  });
});
