import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "./client.js";
import { IsolationError } from "./scope.js";

type Scope = { spaceId: string; userId: string };
type Db = Pick<PrismaClient, "$transaction" | "artifact" | "artifactShare">;

/** A link lasts 30 days from the day it was made. */
export const ARTIFACT_SHARE_TTL_MS = 30 * 24 * 60 * 60_000;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type ActiveShare = { artifactId: string; version: number; expiresAt: Date };

/** The owner's artifact row (any version), or an IsolationError. */
async function ownedVersion(db: Pick<PrismaClient, "artifact">, scope: Scope, artifactId: string) {
  const row = await db.artifact.findFirst({
    where: { id: artifactId, spaceId: scope.spaceId, userId: scope.userId },
    select: { id: true, rootArtifactId: true, mimeType: true },
  });
  if (!row) throw new IsolationError();
  return { ...row, familyId: row.rootArtifactId ?? row.id };
}

const inFamily = (familyId: string) => ({ OR: [{ id: familyId }, { rootArtifactId: familyId }] });

/** The family's live link, which points at one version. Never the token. */
export async function getArtifactShare(
  prisma: Db,
  scope: Scope,
  artifactId: string,
  now = new Date(),
): Promise<ActiveShare | null> {
  const { familyId } = await ownedVersion(prisma, scope, artifactId);
  const share = await prisma.artifactShare.findFirst({
    where: {
      spaceId: scope.spaceId,
      revokedAt: null,
      expiresAt: { gt: now },
      artifact: { spaceId: scope.spaceId, userId: scope.userId, ...inFamily(familyId) },
    },
    include: { artifact: { select: { version: true } } },
  });
  return share
    ? { artifactId: share.artifactId, version: share.artifact.version, expiresAt: share.expiresAt }
    : null;
}

/** Makes a link to this version and ends any live link of the same artifact. Returns the token once. */
export async function createArtifactShare(
  prisma: Db,
  scope: Scope,
  artifactId: string,
  isShareable: (mimeType: string) => boolean,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const { familyId, mimeType } = await ownedVersion(prisma, scope, artifactId);
  if (!isShareable(mimeType)) throw new UnshareableArtifactError();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + ARTIFACT_SHARE_TTL_MS);
  await prisma.$transaction(async (tx) => {
    await tx.artifactShare.updateMany({
      where: {
        spaceId: scope.spaceId,
        revokedAt: null,
        artifact: { spaceId: scope.spaceId, userId: scope.userId, ...inFamily(familyId) },
      },
      data: { revokedAt: now },
    });
    await tx.artifactShare.create({
      data: {
        spaceId: scope.spaceId,
        artifactId,
        tokenHash: sha256(token),
        createdByUserId: scope.userId,
        expiresAt,
      },
    });
  });
  return { token, expiresAt };
}

export async function revokeArtifactShare(
  prisma: Db,
  scope: Scope,
  artifactId: string,
  now = new Date(),
): Promise<void> {
  const { familyId } = await ownedVersion(prisma, scope, artifactId);
  await prisma.artifactShare.updateMany({
    where: {
      spaceId: scope.spaceId,
      revokedAt: null,
      artifact: { spaceId: scope.spaceId, userId: scope.userId, ...inFamily(familyId) },
    },
    data: { revokedAt: now },
  });
}

export class UnshareableArtifactError extends Error {
  constructor() {
    super("This file type cannot be shared by link.");
    this.name = "UnshareableArtifactError";
  }
}

/**
 * The public lookup: only the row the token names. Null for an unknown, expired or revoked token.
 * No caller-supplied id reaches the query; the space comes from the share row itself.
 */
export async function openArtifactShare(
  prisma: Pick<PrismaClient, "artifactShare">,
  token: string,
  now = new Date(),
) {
  const share = await prisma.artifactShare.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      artifact: {
        select: {
          id: true,
          spaceId: true,
          userId: true,
          name: true,
          mimeType: true,
          storageKey: true,
        },
      },
    },
  });
  if (!share || share.revokedAt || share.expiresAt <= now) return null;
  // A share row and its artifact always agree on the space; refuse if they ever do not.
  if (share.artifact.spaceId !== share.spaceId) return null;
  await prisma.artifactShare.update({ where: { id: share.id }, data: { lastOpenedAt: now } });
  return share.artifact;
}
