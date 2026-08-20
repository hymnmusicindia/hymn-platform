CREATE TABLE "managed_service_requests" (
  "id" SERIAL NOT NULL, "user_id" INTEGER NOT NULL, "release_id" INTEGER NOT NULL, "track_id" INTEGER,
  "service_type" TEXT NOT NULL, "provider" TEXT, "status" TEXT NOT NULL DEFAULT 'submitted',
  "eligibility_answers" JSONB NOT NULL, "declarations" JSONB, "public_links" JSONB, "risk_flags" JSONB,
  "internal_notes" TEXT, "user_visible_update" TEXT, "assigned_admin_id" INTEGER, "external_reference" TEXT,
  "rejection_reason" TEXT, "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3), "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "managed_service_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "managed_service_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "managed_service_requests_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "managed_service_requests_user_id_service_type_submitted_at_idx" ON "managed_service_requests"("user_id","service_type","submitted_at");
CREATE INDEX "managed_service_requests_service_type_status_submitted_at_idx" ON "managed_service_requests"("service_type","status","submitted_at");
CREATE INDEX "managed_service_requests_release_id_track_id_idx" ON "managed_service_requests"("release_id","track_id");
