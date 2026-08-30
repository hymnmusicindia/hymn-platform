ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'SUSPENDED';
ALTER TYPE "AccountStatus" ADD VALUE IF NOT EXISTS 'DELETION_SCHEDULED';

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "status_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deletion_scheduled_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "appeal_requested_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "appeal_message" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referral_prompt_completed_at" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "users_status_deletion_scheduled_at_idx" ON "users"("status", "deletion_scheduled_at");
