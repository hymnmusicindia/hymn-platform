-- A durable lease prevents overlapping cron invocations without holding a
-- database transaction open while DireNote HTTP requests are in flight.
CREATE TABLE IF NOT EXISTS "cron_leases" (
  "lease_key" TEXT PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "leased_until" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One current provider attempt per release is the canonical identity used by
-- reconciliation. Existing duplicate rows are repaired before this migration
-- is deployed by the audit script.
CREATE UNIQUE INDEX IF NOT EXISTS "distribution_submission_attempts_one_current_provider"
  ON "distribution_submission_attempts" ("release_id", "provider")
  WHERE "is_current" = true;
