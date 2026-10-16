CREATE TABLE "team_clients" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "phone" TEXT NOT NULL DEFAULT '', "email" TEXT NOT NULL DEFAULT '',
  "notes" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'ACTIVE', "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_clients_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_clients_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_clients_status_check" CHECK ("status" IN ('ACTIVE','DO_NOT_CONTACT','ARCHIVED'))
);
CREATE INDEX "team_clients_workspaceId_status_idx" ON "team_clients"("workspaceId","status");
CREATE TABLE "team_calendar_events" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL, "creatorId" TEXT NOT NULL, "assigneeId" TEXT NOT NULL, "clientId" TEXT,
  "title" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'EVENT', "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '', "outcome" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "reminderMinutes" INTEGER NOT NULL DEFAULT 30, "remindedAt" TIMESTAMP(3), "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_calendar_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_calendar_events_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_calendar_events_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_calendar_events_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "team_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_calendar_events_range_check" CHECK ("endsAt">"startsAt"),
  CONSTRAINT "team_calendar_events_kind_check" CHECK ("kind" IN ('CALL','EMAIL','MEETING','FOLLOW_UP','EVENT')),
  CONSTRAINT "team_calendar_events_status_check" CHECK ("status" IN ('SCHEDULED','COMPLETED','CANCELLED'))
);
CREATE INDEX "team_calendar_events_workspaceId_startsAt_endsAt_idx" ON "team_calendar_events"("workspaceId","startsAt","endsAt");
CREATE INDEX "team_calendar_events_assigneeId_status_startsAt_idx" ON "team_calendar_events"("assigneeId","status","startsAt");
-- Only upgrade built-in templates, never overwrite custom role powers.
UPDATE "team_roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['calendar.view','clients.view','calendar.manage','clients.manage']))
WHERE "name" IN ('Admin','Team Manager','Growth Executive','Marketplace Executive','Operations Executive','Team Member');
UPDATE "team_roles" SET "permissions" = ARRAY(SELECT DISTINCT unnest("permissions" || ARRAY['calendar.view','clients.view'])) WHERE "name" = 'Viewer';
