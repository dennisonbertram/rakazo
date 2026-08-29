import { randomBytes } from "node:crypto";
import { bootstrapUserWorkspace, type SignupPolicyEnv } from "./bootstrap-user.js";
import type { PrismaClient } from "./client.js";
import { createRepos } from "./repos.js";

export interface ProvisionedPhoneIdentity {
  phoneE164: string;
  userId: string;
  workspaceId: string;
  botId: string;
  threadId: string;
  created: boolean;
}

function phoneEmail(phoneE164: string): string {
  return `phone-${phoneE164.replace(/[^0-9]/g, "")}@phone.invalid`;
}

/**
 * One phone number = one user + workspace + one bot ("their agent").
 * The synthetic `phone-…@phone.invalid` user has no Account row, so it
 * cannot log in until account linking lands; text is its only surface.
 */
export async function provisionPhoneIdentity(
  prisma: PrismaClient,
  phoneE164: string,
  env: SignupPolicyEnv,
): Promise<ProvisionedPhoneIdentity> {
  const existing = await prisma.phoneIdentity.findUnique({ where: { phoneE164 } });
  if (existing) {
    const thread = await prisma.thread.findFirst({ where: { botId: existing.botId } });
    return {
      phoneE164,
      userId: existing.userId,
      workspaceId: existing.workspaceId,
      botId: existing.botId,
      threadId: thread?.id ?? "",
      created: false,
    };
  }

  const user = await prisma.user.create({
    data: {
      id: randomBytes(16).toString("hex"),
      name: `Phone ${phoneE164.slice(-4)}`,
      email: phoneEmail(phoneE164),
      emailVerified: false,
    },
  });
  const { workspaceId } = await bootstrapUserWorkspace(prisma, user, env);
  const repos = createRepos(prisma);
  const bot = await repos.createBot(
    {
      userId: user.id,
      workspaceId,
      email: user.email,
      isDeploymentOwner: false,
    },
    {
      name: "Assistant",
      title: "",
      description: `Personal agent for ${phoneE164}, auto-created on first text.`,
      instructions:
        "You are the owner's personal agent. The owner reaches you by iMessage text; " +
        "keep replies concise and conversational. Your first reply doubles as onboarding: " +
        "briefly introduce yourself and what you can help with.",
      notifyOnFinish: true,
    },
  );
  const thread = await prisma.thread.findFirst({ where: { botId: bot.id } });
  if (!thread) throw new Error(`bot ${bot.id} has no thread after createBot`);

  const identity = await prisma.phoneIdentity.create({
    data: {
      phoneE164,
      userId: user.id,
      workspaceId,
      botId: bot.id,
    },
  });
  return {
    phoneE164,
    userId: identity.userId,
    workspaceId: identity.workspaceId,
    botId: identity.botId,
    threadId: thread.id,
    created: true,
  };
}
