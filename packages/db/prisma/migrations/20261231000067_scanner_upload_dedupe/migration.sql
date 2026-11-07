CREATE UNIQUE INDEX "data_room_items_scan_sha256_key"
  ON "data_room_items"("spaceId", "userId", "sha256") WHERE "source" = 'scan';
