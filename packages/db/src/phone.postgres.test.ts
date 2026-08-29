import { afterAll, describe, expect, it } from "vitest";
import { createDb, type PrismaClient } from "./client.js";
import { provisionPhoneIdentity } from "./phone.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("provisionPhoneIdentity (PostgreSQL)", () => {
  const phone = "+15550001111";
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  let provisioned: { userId: string; workspaceId: string; botId: string } | null = null;

  afterAll(async () => {
    if (provisioned) {
      await prisma.phoneIdentity.deleteMany({ where: { phoneE164: phone } });
      await prisma.organization.deleteMany({ where: { id: provisioned.workspaceId } });
      await prisma.user.deleteMany({ where: { id: provisioned.userId } });
    }
    await close?.();
  });

  it("provisions a user, workspace, bot, thread, and phone identity row", async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };

    const result = await provisionPhoneIdentity(prisma, phone, {
      signupsEnabled: undefined,
      signupAllowlist: undefined,
    });
    provisioned = result;

    expect(result.created).toBe(true);
    expect(result.phoneE164).toBe(phone);

    const user = await prisma.user.findUnique({
      where: { id: result.userId },
      include: { accounts: true, members: true },
    });
    expect(user).toBeTruthy();
    expect(user!.email).toBe("phone-15550001111@phone.invalid");
    expect(user!.accounts).toHaveLength(0);
    expect(user!.members).toHaveLength(1);
    expect(user!.members[0]!.organizationId).toBe(result.workspaceId);
    expect(user!.members[0]!.role).toBe("owner");

    const org = await prisma.organization.findUnique({ where: { id: result.workspaceId } });
    expect(org!.name).toBe("Personal");
    expect(org!.slug).toBe(`user-${result.userId.slice(0, 12)}`);

    const bot = await prisma.bot.findUnique({
      where: { id: result.botId },
      include: { thread: true },
    });
    expect(bot).toBeTruthy();
    expect(bot!.workspaceId).toBe(result.workspaceId);
    expect(bot!.userId).toBe(result.userId);
    expect(bot!.thread).toBeTruthy();
    expect(result.threadId).toBe(bot!.thread!.id);

    const identity = await prisma.phoneIdentity.findUnique({ where: { phoneE164: phone } });
    expect(identity).toBeTruthy();
    expect(identity!.userId).toBe(result.userId);
    expect(identity!.workspaceId).toBe(result.workspaceId);
    expect(identity!.botId).toBe(result.botId);
    expect(identity!.outboundSinceInbound).toBe(0);
    expect(identity!.verifiedAt).toBeNull();

    // bootstrap parity: same surrounding rows the auth signup hook creates
    const memories = await prisma.memoryDocument.findMany({
      where: { workspaceId: result.workspaceId, userId: result.userId },
    });
    expect(memories.some((m) => m.scope === "user" && m.path === "MEMORY.md")).toBe(true);
    expect(memories.some((m) => m.scope === "bot" && m.botId === result.botId)).toBe(true);
    const pref = await prisma.notificationPreference.findFirst({
      where: { workspaceId: result.workspaceId, userId: result.userId },
    });
    expect(pref).toBeTruthy();
  });

  it("is idempotent for a repeat inbound from the same number", async () => {
    const again = await provisionPhoneIdentity(prisma, phone, {
      signupsEnabled: undefined,
      signupAllowlist: undefined,
    });

    expect(again.created).toBe(false);
    expect(again.userId).toBe(provisioned!.userId);
    expect(again.workspaceId).toBe(provisioned!.workspaceId);
    expect(again.botId).toBe(provisioned!.botId);

    const users = await prisma.user.findMany({
      where: { email: "phone-15550001111@phone.invalid" },
    });
    expect(users).toHaveLength(1);
    const identities = await prisma.phoneIdentity.findMany({ where: { phoneE164: phone } });
    expect(identities).toHaveLength(1);
  });
});
