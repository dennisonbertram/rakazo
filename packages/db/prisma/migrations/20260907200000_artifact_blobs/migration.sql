-- Artifact bytes in the database, for deployments where the api and the
-- worker run on separate disks and cannot share the local artifact store.
CREATE TABLE "artifact_blobs" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artifact_blobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "artifact_blobs_spaceId_idx" ON "artifact_blobs"("spaceId");
