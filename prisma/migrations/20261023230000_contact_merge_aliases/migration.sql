ALTER TABLE "team_clients" ADD COLUMN "additionalEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "alternatePhones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], ADD COLUMN "merged_into_id" TEXT;
CREATE INDEX "team_clients_workspaceId_merged_into_id_idx" ON "team_clients"("workspaceId", "merged_into_id");
