ALTER TABLE "phone_outbound" ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMP(3);

DROP INDEX IF EXISTS "phone_outbound_status_idx";
CREATE INDEX IF NOT EXISTS "phone_outbound_status_nextAttemptAt_idx" ON "phone_outbound"("status", "nextAttemptAt");
