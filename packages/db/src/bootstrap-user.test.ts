import { describe, expect, it, vi } from "vitest";
import { bootstrapUserWorkspace } from "./bootstrap-user.js";
import type { PrismaClient } from "./client.js";

function makePrisma(settings: { id: string; ownerUserId: string | null } | null) {
  const create = () => vi.fn(async (_input: { data: Record<string, unknown> }) => ({}));
  const prisma = {
    organization: { create: create() },
    member: { create: create() },
    deploymentSettings: {
      findUnique: vi.fn(async () => settings),
      create: create(),
      update: create(),
    },
    memoryDocument: { create: create() },
    notificationPreference: { create: create() },
  };
  return prisma;
}

const env = { signupsEnabled: "false", signupAllowlist: "a@example.com, b@example.com" };

describe("bootstrapUserWorkspace", () => {
  it("creates a personal org, owner membership, and returns the workspace id", async () => {
    const prisma = makePrisma({ id: "default", ownerUserId: "user-1" });
    const result = await bootstrapUserWorkspace(
      prisma as unknown as PrismaClient,
      { id: "user-1" },
      env,
    );

    expect(prisma.organization.create).toHaveBeenCalledTimes(1);
    const orgData = prisma.organization.create.mock.calls[0]![0].data;
    expect(orgData.name).toBe("Personal");
    expect(orgData.slug).toBe("user-user-1".slice(0, 16));
    expect(result.workspaceId).toBe(orgData.id);

    const memberData = prisma.member.create.mock.calls[0]![0].data;
    expect(memberData.organizationId).toBe(orgData.id);
    expect(memberData.userId).toBe("user-1");
    expect(memberData.role).toBe("owner");
  });

  it("seeds deployment settings from the env policy when none exist", async () => {
    const prisma = makePrisma(null);
    await bootstrapUserWorkspace(prisma as unknown as PrismaClient, { id: "user-1" }, env);

    const data = prisma.deploymentSettings.create.mock.calls[0]![0].data;
    expect(data.id).toBe("default");
    expect(data.ownerUserId).toBe("user-1");
    expect(data.signupsEnabled).toBe(false);
    expect(data.signupAllowlist).toBe("a@example.com,b@example.com");
    expect(data.signupPolicyInitialized).toBe(true);
    expect(prisma.deploymentSettings.update).not.toHaveBeenCalled();
  });

  it("claims the deployment owner when settings exist without one", async () => {
    const prisma = makePrisma({ id: "default", ownerUserId: null });
    await bootstrapUserWorkspace(prisma as unknown as PrismaClient, { id: "user-1" }, env);

    expect(prisma.deploymentSettings.create).not.toHaveBeenCalled();
    expect(prisma.deploymentSettings.update).toHaveBeenCalledWith({
      where: { id: "default" },
      data: { ownerUserId: "user-1" },
    });
  });

  it("leaves existing owned settings untouched", async () => {
    const prisma = makePrisma({ id: "default", ownerUserId: "user-0" });
    await bootstrapUserWorkspace(prisma as unknown as PrismaClient, { id: "user-1" }, env);

    expect(prisma.deploymentSettings.create).not.toHaveBeenCalled();
    expect(prisma.deploymentSettings.update).not.toHaveBeenCalled();
  });

  it("never claims deployment ownership when claimDeploymentOwner is false", async () => {
    const prisma = makePrisma({ id: "default", ownerUserId: null });
    await bootstrapUserWorkspace(prisma as unknown as PrismaClient, { id: "user-1" }, env, {
      claimDeploymentOwner: false,
    });

    expect(prisma.deploymentSettings.update).not.toHaveBeenCalled();
  });

  it("seeds settings without an owner when claimDeploymentOwner is false", async () => {
    const prisma = makePrisma(null);
    await bootstrapUserWorkspace(prisma as unknown as PrismaClient, { id: "user-1" }, env, {
      claimDeploymentOwner: false,
    });

    const data = prisma.deploymentSettings.create.mock.calls[0]![0].data;
    expect(data.ownerUserId).toBeNull();
  });

  it("creates the user memory document and notification preference in the new workspace", async () => {
    const prisma = makePrisma({ id: "default", ownerUserId: "user-1" });
    const { workspaceId } = await bootstrapUserWorkspace(
      prisma as unknown as PrismaClient,
      { id: "user-1" },
      env,
    );

    const memoryData = prisma.memoryDocument.create.mock.calls[0]![0].data;
    expect(memoryData.workspaceId).toBe(workspaceId);
    expect(memoryData.userId).toBe("user-1");
    expect(memoryData.scope).toBe("user");
    expect(memoryData.path).toBe("MEMORY.md");

    const prefData = prisma.notificationPreference.create.mock.calls[0]![0].data;
    expect(prefData.workspaceId).toBe(workspaceId);
    expect(prefData.userId).toBe("user-1");
  });
});
