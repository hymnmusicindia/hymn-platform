ALTER TABLE "studio_messages" ADD COLUMN "metadata" JSONB;
ALTER TABLE "users" ADD COLUMN "studio_tips_enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "beat_purchases" ADD COLUMN "studio_nudge_sent_at" TIMESTAMP(3);
ALTER TABLE "studio_deliveries" ADD COLUMN "engineer_confirmed_at" TIMESTAMP(3), ADD COLUMN "customer_confirmed_at" TIMESTAMP(3);
ALTER TABLE "studio_reviews" ADD COLUMN "strengths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "studio_vouches" (
 "id" SERIAL PRIMARY KEY, "engineer_profile_id" INTEGER NOT NULL REFERENCES "engineer_profiles"("id") ON DELETE CASCADE,
 "author_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5), "comment" TEXT NOT NULL, "relationship" TEXT NOT NULL, "public_name" TEXT,
 "work_url" TEXT NOT NULL, "strengths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "status" TEXT NOT NULL DEFAULT 'PENDING',
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("engineer_profile_id", "author_id")
);
CREATE TABLE "studio_showcases" (
 "id" SERIAL PRIMARY KEY, "engineer_profile_id" INTEGER NOT NULL REFERENCES "engineer_profiles"("id") ON DELETE CASCADE,
 "artist_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "title" TEXT NOT NULL, "role" TEXT NOT NULL, "before_url" TEXT, "after_url" TEXT NOT NULL, "release_url" TEXT,
 "breakdown" TEXT NOT NULL, "rights_confirmed" BOOLEAN NOT NULL DEFAULT false, "artist_confirmed_at" TIMESTAMP(3),
 "status" TEXT NOT NULL DEFAULT 'PENDING', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "studio_consultations" (
 "id" SERIAL PRIMARY KEY, "engineer_profile_id" INTEGER NOT NULL REFERENCES "engineer_profiles"("id") ON DELETE CASCADE,
 "starts_at" TIMESTAMP(3) NOT NULL, "duration_minutes" INTEGER NOT NULL DEFAULT 15, "booked_by_id" INTEGER REFERENCES "users"("id") ON DELETE SET NULL,
 "phone" TEXT, "note" TEXT, "status" TEXT NOT NULL DEFAULT 'AVAILABLE', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE("engineer_profile_id", "starts_at")
);
CREATE TABLE "studio_trust_reports" (
 "id" SERIAL PRIMARY KEY, "reporter_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
 "target_type" TEXT NOT NULL, "target_id" INTEGER NOT NULL, "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'OPEN',
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE("reporter_id", "target_type", "target_id")
);
CREATE INDEX "studio_vouches_status_created_at_idx" ON "studio_vouches"("status", "created_at");
CREATE INDEX "studio_showcases_engineer_profile_id_status_idx" ON "studio_showcases"("engineer_profile_id", "status");
CREATE INDEX "studio_consultations_status_starts_at_idx" ON "studio_consultations"("status", "starts_at");
CREATE INDEX "studio_trust_reports_status_created_at_idx" ON "studio_trust_reports"("status", "created_at");
