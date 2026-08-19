CREATE TABLE "release_change_requests" (
  "id" SERIAL NOT NULL, "release_id" INTEGER NOT NULL, "requested_by_user_id" INTEGER NOT NULL,
  "request_type" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'submitted', "reason" TEXT NOT NULL,
  "desired_effective_at" TIMESTAMP(3), "requested_changes" JSONB, "provider_reference" TEXT,
  "admin_note" TEXT, "reviewed_by_admin_id" INTEGER, "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3), "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "release_change_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "release_change_requests_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "release_change_requests_release_id_request_type_status_idx" ON "release_change_requests"("release_id", "request_type", "status");
CREATE INDEX "release_change_requests_status_submitted_at_idx" ON "release_change_requests"("status", "submitted_at");
