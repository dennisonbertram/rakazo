import { randomBytes } from "node:crypto";
import { signupPolicyFromEnv } from "@rakazo/core";
import type { PrismaClient } from "./client.js";

export interface SignupPolicyEnv {
  signupsEnabled: string | undefined;
  signupAllowlist: string | undefined;
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Everything a brand-new user needs around their account row: personal
 * workspace + owner membership, deployment-owner claim, user memory, and
 * notification preferences. Shared by the Better Auth `user.create.after`
 * hook and phone-identity provisioning so both paths stay in lockstep.
 *
 * `claimDeploymentOwner: false` is for identities that did not sign up
 * through the app (phone provisioning): a first texter must never become
 * the deployment owner.
 */
export async function bootstrapUserWorkspace(
  prisma: PrismaClient,
  user: { id: string },
  env: SignupPolicyEnv,
  options: { claimDeploymentOwner?: boolean } = {},
): Promise<{ workspaceId: string }> {
  const claimDeploymentOwner = options.claimDeploymentOwner ?? true;
  const orgId = newId();
  await prisma.organization.create({
    data: {
      id: orgId,
      name: "Personal",
      slug: `user-${user.id.slice(0, 12)}`,
      createdAt: new Date(),
    },
  });
  await prisma.member.create({
    data: {
      id: newId(),
      organizationId: orgId,
      userId: user.id,
      role: "owner",
      createdAt: new Date(),
    },
  });
  const existing = await prisma.deploymentSettings.findUnique({
    where: { id: "default" },
  });
  if (!existing) {
    const policy = signupPolicyFromEnv(env);
    await prisma.deploymentSettings.create({
      data: {
        id: "default",
        ownerUserId: claimDeploymentOwner ? user.id : null,
        signupsEnabled: policy.enabled,
        signupAllowlist: policy.allowlist.join(","),
        signupPolicyInitialized: true,
      },
    });
  } else if (!existing.ownerUserId && claimDeploymentOwner) {
    await prisma.deploymentSettings.update({
      where: { id: "default" },
      data: { ownerUserId: user.id },
    });
  }
  await prisma.memoryDocument.create({
    data: {
      workspaceId: orgId,
      userId: user.id,
      scope: "user",
      path: "MEMORY.md",
      content: "# User memory\n\nAccount-wide preferences live here.\n",
    },
  });
  await prisma.notificationPreference.create({
    data: {
      workspaceId: orgId,
      userId: user.id,
    },
  });
  return { workspaceId: orgId };
}
