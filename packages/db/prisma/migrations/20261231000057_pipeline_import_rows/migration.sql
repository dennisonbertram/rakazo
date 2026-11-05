-- One row per firm of a list import: staged, then applied one at a time, so a retry, a restart or a
-- second worker can never apply a row twice, and a failed row is reported on its own.

ALTER TABLE "pipeline_imports" DROP COLUMN "rows";
ALTER TABLE "pipeline_imports" RENAME COLUMN "cardMessageId" TO "effectId";
ALTER TABLE "pipeline_imports" ADD COLUMN "runId" TEXT;
ALTER TABLE "pipeline_imports" ADD COLUMN "botId" TEXT;
ALTER TABLE "pipeline_imports" ADD COLUMN "created" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "pipeline_imports" ADD COLUMN "result" JSONB;

-- One open import per user, so stage calls and retries cannot start a second one.
CREATE UNIQUE INDEX "pipeline_imports_one_open_key" ON "pipeline_imports"("spaceId", "userId", "pipeline")
  WHERE "status" IN ('staging', 'reviewing');
CREATE UNIQUE INDEX "pipeline_imports_id_spaceId_userId_key" ON "pipeline_imports"("id", "spaceId", "userId");
CREATE INDEX "pipeline_imports_status_updatedAt_idx" ON "pipeline_imports"("status", "updatedAt");

CREATE TABLE "pipeline_import_rows" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "normalizedFirm" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'staged',
    "plan" JSONB,
    "outcome" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pipeline_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pipeline_import_rows_importId_normalizedFirm_key" ON "pipeline_import_rows"("importId", "normalizedFirm");
CREATE UNIQUE INDEX "pipeline_import_rows_importId_position_key" ON "pipeline_import_rows"("importId", "position");
CREATE INDEX "pipeline_import_rows_importId_state_position_idx" ON "pipeline_import_rows"("importId", "state", "position");

ALTER TABLE "pipeline_import_rows" ADD CONSTRAINT "pipeline_import_rows_importId_spaceId_userId_fkey"
  FOREIGN KEY ("importId", "spaceId", "userId") REFERENCES "pipeline_imports"("id", "spaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security, as for the other pipeline tables.
ALTER TABLE "pipeline_import_rows" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pipeline_import_rows_tenant" ON "pipeline_import_rows"
  USING ("spaceId" = NULLIF(current_setting('app.space_id', true), ''));
CREATE POLICY "pipeline_import_rows_system" ON "pipeline_import_rows"
  USING (current_setting('app.rls_bypass', true) = 'on');
