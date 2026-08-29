import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "./client.js";
import { provisionPhoneIdentity } from "./phone.js";

describe("provisionPhoneIdentity", () => {
  it("returns the existing identity without creating anything when already provisioned", async () => {
    const existing = {
      id: "pi-1",
      phoneE164: "+15551234567",
      userId: "user-1",
      workspaceId: "ws-1",
      botId: "bot-1",
      verifiedAt: null,
      lastInboundAt: null,
      outboundSinceInbound: 0,
      createdAt: new Date("2026-08-28T00:00:00.000Z"),
      updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    };
    const prisma = {
      phoneIdentity: { findUnique: vi.fn(async () => existing) },
      thread: { findFirst: vi.fn(async () => ({ id: "thread-1" })) },
      user: { create: vi.fn() },
    };
    const result = await provisionPhoneIdentity(prisma as unknown as PrismaClient, "+15551234567", {
      signupsEnabled: undefined,
      signupAllowlist: undefined,
    });

    expect(result).toEqual({
      phoneE164: "+15551234567",
      userId: "user-1",
      workspaceId: "ws-1",
      botId: "bot-1",
      threadId: "thread-1",
      created: false,
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
