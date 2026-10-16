ALTER TABLE "team_clients" ADD COLUMN "secondaryEmail" TEXT NOT NULL DEFAULT '';
ALTER TABLE "team_clients" ADD COLUMN "interests" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "team_clients" ADD COLUMN "state" TEXT NOT NULL DEFAULT '';
ALTER TABLE "team_clients" ADD COLUMN "city" TEXT NOT NULL DEFAULT '';
ALTER TABLE "team_calendar_events" ALTER COLUMN "endsAt" DROP NOT NULL;
ALTER TABLE "team_calendar_events" ADD CONSTRAINT "team_event_optional_end" CHECK ("endsAt" IS NULL OR "endsAt" > "startsAt");
CREATE TABLE "team_client_welcomes" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "clientId" TEXT NOT NULL REFERENCES "team_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "email" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'PENDING',
 "error" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "team_client_welcomes_email_key" ON "team_client_welcomes"("email");
CREATE INDEX "team_client_welcomes_status_createdAt_idx" ON "team_client_welcomes"("status","createdAt");
