CREATE TABLE "engineer_applications" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "professional_name" TEXT NOT NULL,
  "bio" TEXT NOT NULL,
  "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "genres" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "portfolio_url" TEXT NOT NULL,
  "instagram_url" TEXT,
  "experience_level" TEXT NOT NULL,
  "starting_price" DECIMAL(12,2) NOT NULL,
  "turnaround_days" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "review_note" TEXT,
  "reviewed_by_id" INTEGER,
  "reviewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "engineer_applications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "engineer_applications_user_id_key" ON "engineer_applications"("user_id");
CREATE INDEX "engineer_applications_status_created_at_idx" ON "engineer_applications"("status", "created_at");
ALTER TABLE "engineer_applications" ADD CONSTRAINT "engineer_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "engineer_applications" ADD CONSTRAINT "engineer_applications_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
