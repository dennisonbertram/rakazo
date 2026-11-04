-- Email thread agents start with Firewall on; turn it on for the ones that already exist.
UPDATE "bots" SET "firewall" = true WHERE "spawnKey" LIKE 'mail-thread:%' AND "firewall" = false;
