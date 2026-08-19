ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'SCHEDULED';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'AWAITING_LIVE_CONFIRMATION';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_LIVE';

CREATE TABLE "admin_tasks" (
    "id" SERIAL NOT NULL,
    "event_key" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigned_to" INTEGER,
    "resolution_note" TEXT,
    "snoozed_until" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_tasks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_tasks_event_key_key" ON "admin_tasks"("event_key");
CREATE INDEX "admin_tasks_status_priority_created_at_idx" ON "admin_tasks"("status", "priority", "created_at");
CREATE INDEX "admin_tasks_entity_type_entity_id_idx" ON "admin_tasks"("entity_type", "entity_id");

ALTER TABLE "support_tickets"
  ADD COLUMN "category" TEXT NOT NULL DEFAULT 'general',
  ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN "related_release_id" INTEGER,
  ADD COLUMN "related_purchase_id" INTEGER,
  ADD COLUMN "related_payout_id" INTEGER;
CREATE INDEX "support_tickets_category_priority_idx" ON "support_tickets"("category", "priority");

ALTER TABLE "beats"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
  ADD COLUMN "review_issues" JSONB;

ALTER TABLE "beat_purchases"
  ADD COLUMN "release_id" INTEGER,
  ADD COLUMN "payment_id" TEXT;
CREATE UNIQUE INDEX "beat_purchases_release_id_key" ON "beat_purchases"("release_id");

CREATE TABLE "admin_task_history" (
  "id" SERIAL NOT NULL,
  "task_id" INTEGER NOT NULL,
  "actor_id" INTEGER,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_task_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "admin_task_history_task_id_created_at_idx" ON "admin_task_history"("task_id", "created_at");

ALTER TABLE "releases"
  ADD COLUMN "draft_completion_percent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_edited_at" TIMESTAMP(3),
  ADD COLUMN "missing_fields" JSONB;
