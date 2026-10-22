ALTER TABLE "team_calendar_events" ADD COLUMN IF NOT EXISTS "follow_up_task_id" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "team_calendar_events_follow_up_task_id_key" ON "team_calendar_events"("follow_up_task_id");
CREATE TABLE "team_outreach_emails" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "memberId" TEXT NOT NULL, "clientId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL, "template" TEXT NOT NULL, "recipient" TEXT NOT NULL, "subject" TEXT NOT NULL, "body" TEXT NOT NULL,
 "senderName" TEXT NOT NULL, "senderRole" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'QUEUED', "attempt" INTEGER NOT NULL DEFAULT 0, "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "team_outreach_emails_requestKey_key" ON "team_outreach_emails"("requestKey");
CREATE INDEX "team_outreach_emails_workspaceId_memberId_createdAt_idx" ON "team_outreach_emails"("workspaceId", "memberId", "createdAt");
CREATE INDEX "team_outreach_emails_status_createdAt_idx" ON "team_outreach_emails"("status", "createdAt");
CREATE INDEX "team_outreach_emails_recipient_createdAt_idx" ON "team_outreach_emails"("recipient", "createdAt");
CREATE TABLE "team_outreach_suppressions" ("email" TEXT PRIMARY KEY, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
