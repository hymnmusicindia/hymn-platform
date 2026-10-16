ALTER TABLE "team_calendar_events" ADD COLUMN "scheduleRevision" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "team_appointment_messages" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "eventId" TEXT NOT NULL REFERENCES "team_calendar_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "revision" INTEGER NOT NULL,
  "kind" TEXT NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "notifiedAt" TIMESTAMP(3),
  "error" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "team_appointment_messages_eventId_revision_kind_key" ON "team_appointment_messages"("eventId", "revision", "kind");
CREATE INDEX "team_appointment_messages_status_dueAt_idx" ON "team_appointment_messages"("status", "dueAt");
-- Existing upcoming calls receive future reminders, not retroactive confirmations.
INSERT INTO "team_appointment_messages" ("id", "eventId", "revision", "kind", "dueAt", "updatedAt")
SELECT md5(e."id" || timing.kind), e."id", 1, timing.kind,
       e."startsAt" - timing.offset_minutes * INTERVAL '1 minute', CURRENT_TIMESTAMP
FROM "team_calendar_events" e
CROSS JOIN (VALUES ('CLIENT_REMINDER', 30), ('REP_REMINDER', 40)) timing(kind, offset_minutes)
WHERE e."kind" = 'CALL' AND e."status" = 'SCHEDULED' AND e."clientId" IS NOT NULL
  AND e."startsAt" - timing.offset_minutes * INTERVAL '1 minute' > CURRENT_TIMESTAMP;
