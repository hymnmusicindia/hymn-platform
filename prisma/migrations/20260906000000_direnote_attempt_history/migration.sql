ALTER TABLE "distribution_submission_attempts"
  ADD COLUMN IF NOT EXISTS "is_current" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "upc" TEXT,
  ADD COLUMN IF NOT EXISTS "track_identifiers" JSONB,
  ADD COLUMN IF NOT EXISTS "provider_status" TEXT,
  ADD COLUMN IF NOT EXISTS "last_checked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "raw_status_payload" JSONB,
  ADD COLUMN IF NOT EXISTS "payload_redacted" JSONB,
  ADD COLUMN IF NOT EXISTS "payload_diff" JSONB,
  ADD COLUMN IF NOT EXISTS "corrections" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "distribution_attempt_one_current"
  ON "distribution_submission_attempts" ("release_id", "provider")
  WHERE "is_current";
CREATE INDEX IF NOT EXISTS "distribution_submission_attempts_provider_is_current_last_checked_at_idx"
  ON "distribution_submission_attempts" ("provider", "is_current", "last_checked_at");
