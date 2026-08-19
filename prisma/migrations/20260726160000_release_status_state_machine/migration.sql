ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'IN_QC_QUEUE';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'RESUBMITTED';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'SUBMITTING_TO_DISTRIBUTOR';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR_PROCESSING';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'DISTRIBUTOR_CHANGES_REQUIRED';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'DELIVERY_FAILED';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'TAKEDOWN_REQUESTED';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'TAKEDOWN_PROCESSING';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'TAKEN_DOWN';
ALTER TYPE "ReleaseStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';
ALTER TABLE "releases" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "release_status_transitions" (
  "id" SERIAL NOT NULL, "release_id" INTEGER NOT NULL, "previous_status" "ReleaseStatus" NOT NULL,
  "new_status" "ReleaseStatus" NOT NULL, "actor_id" INTEGER, "actor_type" TEXT NOT NULL,
  "reason" TEXT, "request_id" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "release_status_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "release_status_transitions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "release_status_transitions_release_id_created_at_idx" ON "release_status_transitions"("release_id", "created_at");
