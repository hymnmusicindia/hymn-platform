-- AlterTable
ALTER TABLE "team_memberships" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "preferences" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "team_messages" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reactions" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "readMemberIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "team_projects" ADD COLUMN     "milestones" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "workflow" TEXT[] DEFAULT ARRAY['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'BLOCKED', 'COMPLETED', 'CANCELLED']::TEXT[];

-- AlterTable
ALTER TABLE "team_prospects" ADD COLUMN     "leadId" INTEGER;

-- AlterTable
ALTER TABLE "team_tasks" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "collaboratorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "recurrenceDays" INTEGER;

-- CreateTable
CREATE TABLE "team_attachments" (
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "taskId" TEXT,
    "projectId" TEXT,
    "assetId" INTEGER NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_approval_requests" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recordType" TEXT NOT NULL,
    "recordId" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decision" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_approval_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SOP',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_workflow_rules" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_workflow_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_workflow_events" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_saved_views" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_expenses" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "incurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_attachments_assetId_key" ON "team_attachments"("assetId");

-- CreateIndex
CREATE INDEX "team_attachments_workspaceId_taskId_projectId_idx" ON "team_attachments"("workspaceId", "taskId", "projectId");

-- CreateIndex
CREATE INDEX "team_approval_requests_workspaceId_approverId_status_idx" ON "team_approval_requests"("workspaceId", "approverId", "status");

-- CreateIndex
CREATE INDEX "team_documents_workspaceId_type_idx" ON "team_documents"("workspaceId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "team_workflow_rules_workspaceId_eventType_key" ON "team_workflow_rules"("workspaceId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "team_workflow_events_eventKey_key" ON "team_workflow_events"("eventKey");

-- CreateIndex
CREATE INDEX "team_workflow_events_workspaceId_createdAt_idx" ON "team_workflow_events"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "team_saved_views_memberId_idx" ON "team_saved_views"("memberId");

-- CreateIndex
CREATE INDEX "team_expenses_workspaceId_incurredAt_idx" ON "team_expenses"("workspaceId", "incurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "team_prospects_leadId_key" ON "team_prospects"("leadId");

-- AddForeignKey
ALTER TABLE "team_prospects" ADD CONSTRAINT "team_prospects_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "growth_leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
