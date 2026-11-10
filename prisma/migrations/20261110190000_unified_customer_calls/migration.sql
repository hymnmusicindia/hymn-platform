-- AlterTable
ALTER TABLE "team_tasks" ADD COLUMN     "callAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "callPhase" TEXT,
ADD COLUMN     "conversationCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "team_calendar_events" ADD COLUMN     "googleCalendarUrl" TEXT,
ADD COLUMN     "googleEventId" TEXT,
ADD COLUMN     "googleMeetUrl" TEXT,
ADD COLUMN     "googleSyncAfter" TIMESTAMP(3),
ADD COLUMN     "googleSyncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "googleSyncError" TEXT,
ADD COLUMN     "googleSyncLease" TIMESTAMP(3),
ADD COLUMN     "googleSyncStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "googleSyncedRevision" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "consultation_requests" ADD COLUMN     "taskId" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "team_google_calendars" (
    "workspaceId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "accountEmail" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "connectedById" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_google_calendars_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "team_work_handoffs" (
    "taskVersion" INTEGER NOT NULL,
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "team" TEXT NOT NULL DEFAULT '',
    "mode" TEXT NOT NULL DEFAULT 'TRANSFER',
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "team_work_handoffs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_work_handoffs_requestKey_key" ON "team_work_handoffs"("requestKey");

-- CreateIndex
CREATE INDEX "team_work_handoffs_toId_status_createdAt_idx" ON "team_work_handoffs"("toId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "team_work_handoffs_taskId_status_idx" ON "team_work_handoffs"("taskId", "status");

-- CreateIndex
CREATE INDEX "team_tasks_workspaceId_callPhase_status_dueAt_idx" ON "team_tasks"("workspaceId", "callPhase", "status", "dueAt");

-- CreateIndex
CREATE INDEX "team_calendar_events_googleSyncStatus_googleSyncAfter_idx" ON "team_calendar_events"("googleSyncStatus", "googleSyncAfter");

-- CreateIndex
CREATE UNIQUE INDEX "consultation_requests_taskId_key" ON "consultation_requests"("taskId");

-- AddForeignKey
ALTER TABLE "team_google_calendars" ADD CONSTRAINT "team_google_calendars_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_work_handoffs" ADD CONSTRAINT "team_work_handoffs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "team_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "team_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing call history while classifying legacy call work.
UPDATE "team_tasks" t SET
  "callAttempts" = CASE WHEN (t."follow_up_context"->>'attempts') ~ '^[0-9]{1,6}$' THEN (t."follow_up_context"->>'attempts')::integer ELSE 0 END,
  "conversationCount" = CASE WHEN t."follow_up_context"->>'outcome' IN ('TALKED','RESOLVED','INTERESTED','CALLBACK') OR t."follow_up_context"->'workActivity'->>'outcome' IN ('COMPLETED','FOLLOW_UP') THEN 1 ELSE 0 END,
  "callPhase" = CASE WHEN t."follow_up_context"->>'consultationId' IS NOT NULL THEN 'CONSULTATION'
    WHEN t."follow_up_context"->>'outcome' IN ('TALKED','RESOLVED','INTERESTED','CALLBACK') OR t."follow_up_context"->'workActivity'->>'outcome' IN ('COMPLETED','FOLLOW_UP') THEN 'FOLLOW_UP'
    ELSE 'FIRST_CONVERSATION' END
WHERE t."eventKey" LIKE 'support-call:%' OR t."eventKey" LIKE '%:call'
  OR t."follow_up_context"->>'kind' IN ('CALL','SUPPORT_CALLBACK','FRIENDLY_INTRO');

-- Existing booked consultations join the durable sync queue after owner connection.
UPDATE "team_calendar_events" e SET "googleSyncStatus" = 'PENDING'
WHERE e."kind" = 'CALL' AND e."status" = 'SCHEDULED' AND e."startsAt" > CURRENT_TIMESTAMP
  AND EXISTS (SELECT 1 FROM "consultation_requests" c WHERE c."calendar_event_id" = e."id");

-- A later missed attempt must not erase a previously completed conversation.
WITH recorded AS (
  SELECT "workspaceId", "detail"->>'taskId' AS task_id,
    COUNT(*)::integer AS attempts,
    COUNT(*) FILTER (WHERE "detail"->>'outcome' IN ('TALKED','FOLLOW_UP','COMPLETED','INTERESTED','CALLBACK','RESOLVED'))::integer AS conversations
  FROM "team_activity_logs"
  WHERE "action" = 'contact.call_report' AND "detail"->>'taskId' IS NOT NULL
  GROUP BY "workspaceId", "detail"->>'taskId'
)
UPDATE "team_tasks" t SET
  "callAttempts" = GREATEST(t."callAttempts", recorded.attempts),
  "conversationCount" = GREATEST(t."conversationCount", recorded.conversations),
  "callPhase" = CASE WHEN t."callPhase" IN ('CONSULTATION','ASSISTANCE') THEN t."callPhase"
    WHEN recorded.conversations > 0 THEN 'FOLLOW_UP' ELSE COALESCE(t."callPhase", 'FIRST_CONVERSATION') END
FROM recorded WHERE t."id" = recorded.task_id AND t."workspaceId" = recorded."workspaceId";
