ALTER TABLE "data_room_items" ADD COLUMN "scannerRunId" TEXT;

CREATE INDEX "data_room_items_spaceId_userId_source_status_scannerRunId_createdAt_idx"
ON "data_room_items"("spaceId", "userId", "source", "status", "scannerRunId", "createdAt");
