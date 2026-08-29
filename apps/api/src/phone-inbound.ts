import type { JobPublisher } from "@rakazo/adapter-kit";
import { runContinueJob } from "@rakazo/adapter-kit";
import type { SendBlueInboundMessage } from "@rakazo/adapters";
import type {
  PrismaClient,
  ProvisionedPhoneIdentity,
  SignupPolicyEnv,
  ThreadEvents,
} from "@rakazo/db";

export interface PhoneInboundDeps {
  prisma: PrismaClient;
  events: Pick<ThreadEvents, "sendUserMessage">;
  jobs: Pick<JobPublisher, "enqueue">;
  provision: (phoneE164: string, env: SignupPolicyEnv) => Promise<ProvisionedPhoneIdentity>;
  signupPolicy: SignupPolicyEnv;
}

/**
 * 1:1 inbound routing: a text to the deployment line is a message to the
 * sender's own bot, in the same Thread the app uses. Unknown numbers are
 * provisioned first, so the bot's reply doubles as onboarding. Channel
 * (group) routing lands with the channels slice.
 */
export function createPhoneInboundHandler(deps: PhoneInboundDeps) {
  return async (event: SendBlueInboundMessage): Promise<void> => {
    if (event.groupId) return;

    // Inbound media arrives as a CDN URL (expires after 30 days); no
    // artifact ingestion in v1, so it rides along as text.
    const text = [event.content, event.mediaUrl].filter(Boolean).join("\n");

    const existing = await deps.prisma.phoneIdentity.findUnique({
      where: { phoneE164: event.fromNumber },
    });
    if (existing) {
      // Any reply — even a content-free tapback — ends the consecutive-
      // outbound streak, but only real text wakes the bot.
      await deps.prisma.phoneIdentity.update({
        where: { id: existing.id },
        data: { outboundSinceInbound: 0, lastInboundAt: new Date() },
      });
      if (!text) return;
    } else if (!text) {
      // Never provision a full account for a tapback or empty payload.
      return;
    }

    let ids: ProvisionedPhoneIdentity;
    if (existing) {
      const thread = await deps.prisma.thread.findFirst({ where: { botId: existing.botId } });
      if (!thread) throw new Error(`phone identity ${existing.id} has no thread`);
      ids = {
        phoneE164: existing.phoneE164,
        userId: existing.userId,
        workspaceId: existing.workspaceId,
        botId: existing.botId,
        threadId: thread.id,
        created: false,
      };
    } else {
      ids = await deps.provision(event.fromNumber, deps.signupPolicy);
    }

    const sent = await deps.events.sendUserMessage({
      workspaceId: ids.workspaceId,
      threadId: ids.threadId,
      botId: ids.botId,
      userId: ids.userId,
      blocks: [{ kind: "text", text }],
      prompt: text,
      trigger: "phone",
      clientNonce: `phone:${event.handle}`,
    });
    if (sent.runId) {
      await deps.jobs.enqueue(runContinueJob(sent.runId)).catch((error) => {
        console.error("phone inbound run enqueue error", error);
      });
    }
  };
}
