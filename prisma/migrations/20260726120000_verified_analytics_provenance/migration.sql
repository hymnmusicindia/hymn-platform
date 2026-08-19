ALTER TABLE "analytics"
  ADD COLUMN "data_source" TEXT NOT NULL DEFAULT 'legacy_unverified',
  ADD COLUMN "statement_period" TEXT,
  ADD COLUMN "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "is_verified" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "analytics_is_verified_period_start_period_end_idx"
  ON "analytics"("is_verified", "period_start", "period_end");

-- Existing rows cannot be proven authoritative automatically and deliberately remain unverified.
