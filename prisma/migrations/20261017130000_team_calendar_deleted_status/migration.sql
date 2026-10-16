-- Calendar deletion retains the record and audit history, while removing it
-- from all schedule views and invalidating appointment reminders.
ALTER TABLE "team_calendar_events" DROP CONSTRAINT "team_calendar_events_status_check";
ALTER TABLE "team_calendar_events" ADD CONSTRAINT "team_calendar_events_status_check"
  CHECK ("status" IN ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'DELETED'));
