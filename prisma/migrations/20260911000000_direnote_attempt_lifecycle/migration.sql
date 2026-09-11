ALTER TABLE "distribution_submission_attempts"
  ADD COLUMN IF NOT EXISTS "attempt_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "reason" TEXT NOT NULL DEFAULT 'INITIAL_SUBMISSION',
  ADD COLUMN IF NOT EXISTS "superseded_at" TIMESTAMP(3);

WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "release_id", "provider" ORDER BY "started_at", "id") AS number
  FROM "distribution_submission_attempts"
)
UPDATE "distribution_submission_attempts" attempt
SET "attempt_number" = numbered.number
FROM numbered
WHERE attempt."id" = numbered."id";

CREATE UNIQUE INDEX IF NOT EXISTS "distribution_submission_attempts_release_provider_attempt_number_key"
  ON "distribution_submission_attempts" ("release_id", "provider", "attempt_number");
