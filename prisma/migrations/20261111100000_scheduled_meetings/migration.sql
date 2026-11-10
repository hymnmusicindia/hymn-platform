ALTER TABLE "team_calendar_events"
  ADD COLUMN "meetingRequestKey" TEXT,
  ADD COLUMN "meetingAttendees" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "meetingDescription" TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX "team_calendar_events_meetingRequestKey_key"
  ON "team_calendar_events"("meetingRequestKey");
