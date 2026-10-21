ALTER TABLE "team_tasks" ADD COLUMN "client_id" TEXT, ADD COLUMN "follow_up_context" JSONB;
ALTER TABLE "team_prospects" ADD COLUMN "client_id" TEXT;
CREATE UNIQUE INDEX "team_prospects_client_id_key" ON "team_prospects"("client_id");
CREATE INDEX "team_tasks_client_id_idx" ON "team_tasks"("client_id");
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "team_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_prospects" ADD CONSTRAINT "team_prospects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "team_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "team_workspaces" ADD COLUMN "customer_followup_cursor" JSONB NOT NULL DEFAULT '{}';
