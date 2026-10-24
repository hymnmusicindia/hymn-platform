CREATE TABLE "team_work_intakes" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "creatorId" TEXT NOT NULL,
  "clientKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "clientId" TEXT,
  "requestedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'WAITING',
  "reason" TEXT NOT NULL DEFAULT 'Waiting for an eligible employee with declared availability.',
  "taskId" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "team_work_intakes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "team_work_intakes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_work_intakes_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "team_work_intakes_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "team_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "team_work_intakes_workspaceId_creatorId_clientKey_key" ON "team_work_intakes"("workspaceId","creatorId","clientKey");
CREATE INDEX "team_work_intakes_workspaceId_status_createdAt_idx" ON "team_work_intakes"("workspaceId","status","createdAt");
