ALTER TABLE "distribution_submission_attempts"
  ADD COLUMN IF NOT EXISTS "payload_redacted" JSONB,
  ADD COLUMN IF NOT EXISTS "payload_diff" JSONB;
