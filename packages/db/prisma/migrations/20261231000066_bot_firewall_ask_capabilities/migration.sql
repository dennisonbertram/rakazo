ALTER TABLE "bots" ADD COLUMN "firewallAskCapabilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
