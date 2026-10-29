-- A bot can run on one specific model connection instead of the space default.
ALTER TABLE "bots" ADD COLUMN "modelCredentialId" TEXT;
ALTER TABLE "bots" ADD CONSTRAINT "bots_modelCredentialId_fkey" FOREIGN KEY ("modelCredentialId") REFERENCES "user_model_credentials"("id") ON DELETE SET NULL ON UPDATE CASCADE;
