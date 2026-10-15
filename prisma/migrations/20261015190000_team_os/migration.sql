-- CreateTable
CREATE TABLE "team_workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'HYMN Team OS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_roles" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "owner" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "team_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_memberships" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "department" TEXT NOT NULL DEFAULT 'Operations',
    "jobTitle" TEXT NOT NULL DEFAULT 'Team member',
    "responsibilities" TEXT NOT NULL DEFAULT '',
    "availability" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_invitations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_projects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL,
    "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dueAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "creatorId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "evidence" TEXT NOT NULL DEFAULT '',
    "blocker" TEXT NOT NULL DEFAULT '',
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "dependencyIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "recordType" TEXT,
    "recordId" INTEGER,
    "eventKey" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_task_comments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_task_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_channels" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "private" BOOLEAN NOT NULL DEFAULT true,
    "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_messages" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_notifications" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_activity_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_prospects" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "contactUrl" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "buyingSignal" TEXT NOT NULL DEFAULT '',
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "score" JSONB NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "suppressed" BOOLEAN NOT NULL DEFAULT false,
    "followUpAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "customerUserId" INTEGER,
    "identityKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_prospects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_outreach_events" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_outreach_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_weekly_reports" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "metrics" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "blockers" TEXT NOT NULL,
    "nextWeek" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_roles_workspaceId_name_key" ON "team_roles"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "team_memberships_userId_status_idx" ON "team_memberships"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "team_memberships_workspaceId_userId_key" ON "team_memberships"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "team_invitations_tokenHash_key" ON "team_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "team_invitations_workspaceId_email_idx" ON "team_invitations"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "team_projects_workspaceId_status_idx" ON "team_projects"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "team_tasks_eventKey_key" ON "team_tasks"("eventKey");

-- CreateIndex
CREATE INDEX "team_tasks_workspaceId_status_dueAt_idx" ON "team_tasks"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "team_tasks_ownerId_status_idx" ON "team_tasks"("ownerId", "status");

-- CreateIndex
CREATE INDEX "team_tasks_recordType_recordId_idx" ON "team_tasks"("recordType", "recordId");

-- CreateIndex
CREATE INDEX "team_task_comments_taskId_createdAt_idx" ON "team_task_comments"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "team_channels_workspaceId_idx" ON "team_channels"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "team_messages_clientKey_key" ON "team_messages"("clientKey");

-- CreateIndex
CREATE INDEX "team_messages_channelId_createdAt_id_idx" ON "team_messages"("channelId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "team_notifications_memberId_readAt_createdAt_idx" ON "team_notifications"("memberId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "team_activity_logs_workspaceId_createdAt_idx" ON "team_activity_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "team_prospects_ownerId_stage_followUpAt_idx" ON "team_prospects"("ownerId", "stage", "followUpAt");

-- CreateIndex
CREATE UNIQUE INDEX "team_prospects_workspaceId_identityKey_key" ON "team_prospects"("workspaceId", "identityKey");

-- CreateIndex
CREATE INDEX "team_outreach_events_prospectId_occurredAt_idx" ON "team_outreach_events"("prospectId", "occurredAt");

-- CreateIndex
CREATE INDEX "team_outreach_events_actorId_kind_occurredAt_idx" ON "team_outreach_events"("actorId", "kind", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "team_weekly_reports_memberId_weekStart_key" ON "team_weekly_reports"("memberId", "weekStart");

-- AddForeignKey
ALTER TABLE "team_roles" ADD CONSTRAINT "team_roles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "team_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "team_roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_projects" ADD CONSTRAINT "team_projects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_tasks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "team_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_task_comments" ADD CONSTRAINT "team_task_comments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "team_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_task_comments" ADD CONSTRAINT "team_task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_channels" ADD CONSTRAINT "team_channels_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "team_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_messages" ADD CONSTRAINT "team_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_notifications" ADD CONSTRAINT "team_notifications_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_activity_logs" ADD CONSTRAINT "team_activity_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_prospects" ADD CONSTRAINT "team_prospects_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "team_workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_prospects" ADD CONSTRAINT "team_prospects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_outreach_events" ADD CONSTRAINT "team_outreach_events_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "team_prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_outreach_events" ADD CONSTRAINT "team_outreach_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_weekly_reports" ADD CONSTRAINT "team_weekly_reports_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "team_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Domain invariants complement server-validated permissions.
CREATE UNIQUE INDEX "team_one_owner_role_per_workspace" ON "team_roles"("workspaceId") WHERE "owner" = TRUE;
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_member_status_check" CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'REVOKED'));
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_task_status_check" CHECK ("status" IN ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED', 'CANCELLED'));
ALTER TABLE "team_tasks" ADD CONSTRAINT "team_task_record_pair_check" CHECK (("recordType" IS NULL AND "recordId" IS NULL) OR ("recordType" IN ('beat', 'release', 'engineer', 'studio') AND "recordId" > 0));
CREATE FUNCTION team_audit_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Team audit history is append-only';
END;
$$;
CREATE TRIGGER team_audit_immutable BEFORE UPDATE OR DELETE ON "team_activity_logs" FOR EACH ROW EXECUTE FUNCTION team_audit_immutable();
