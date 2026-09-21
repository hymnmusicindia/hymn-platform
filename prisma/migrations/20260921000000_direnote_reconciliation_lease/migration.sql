-- A durable lease prevents overlapping cron invocations without holding a
-- database transaction open while DireNote HTTP requests are in flight.
CREATE TABLE IF NOT EXISTS "cron_leases" (
  "lease_key" TEXT PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "leased_until" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One current provider attempt per release is the canonical identity used by
-- reconciliation. Preserve the newest attempt and deterministically supersede
-- older duplicates before installing the invariant, so deployment is safe even
-- when an interrupted historic repair left duplicate current rows behind.
WITH ranked_current_attempts AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "release_id", "provider"
    ORDER BY "started_at" DESC, "id" DESC
  ) AS position
  FROM "distribution_submission_attempts"
  WHERE "is_current" = true
)
UPDATE "distribution_submission_attempts"
SET "is_current" = false, "provider_status" = 'superseded'
WHERE "id" IN (
  SELECT "id" FROM ranked_current_attempts WHERE position > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "distribution_submission_attempts_one_current_provider"
  ON "distribution_submission_attempts" ("release_id", "provider")
  WHERE "is_current" = true;
