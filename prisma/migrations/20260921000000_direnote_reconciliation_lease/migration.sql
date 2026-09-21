-- A durable lease prevents overlapping cron invocations without holding a
-- database transaction open while DireNote HTTP requests are in flight.
CREATE TABLE IF NOT EXISTS "cron_leases" (
  "lease_key" TEXT PRIMARY KEY,
  "run_id" TEXT NOT NULL,
  "leased_until" TIMESTAMPTZ NOT NULL,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bounded run-level observability. Per-release provider diagnostics remain in
-- DireNoteLog, rather than accumulating an unbounded result array in one row.
CREATE TABLE IF NOT EXISTS "direnote_sync_runs" (
  "id" SERIAL PRIMARY KEY,
  "run_id" TEXT NOT NULL UNIQUE,
  "status" TEXT NOT NULL DEFAULT 'running',
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMPTZ,
  "candidate_count" INTEGER NOT NULL DEFAULT 0,
  "provider_request_count" INTEGER NOT NULL DEFAULT 0,
  "processed_count" INTEGER NOT NULL DEFAULT 0,
  "changed_count" INTEGER NOT NULL DEFAULT 0,
  "identifier_repair_count" INTEGER NOT NULL DEFAULT 0,
  "status_repair_count" INTEGER NOT NULL DEFAULT 0,
  "correction_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "deferred_count" INTEGER NOT NULL DEFAULT 0,
  "duration_ms" INTEGER,
  "summary" JSONB
);
CREATE INDEX IF NOT EXISTS "direnote_sync_runs_started_at_idx" ON "direnote_sync_runs" ("started_at");

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
