CREATE TABLE "distribution_submission_attempts" (
  "id" SERIAL NOT NULL, "release_id" INTEGER NOT NULL, "provider" TEXT NOT NULL DEFAULT 'direnote',
  "idempotency_key" TEXT NOT NULL, "payload_hash" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'processing',
  "attempt_count" INTEGER NOT NULL DEFAULT 1, "provider_reference" TEXT, "http_status" INTEGER,
  "safe_error" TEXT, "response_redacted" JSONB, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3), "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "distribution_submission_attempts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "distribution_submission_attempts_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "distribution_submission_attempts_idempotency_key_key" ON "distribution_submission_attempts"("idempotency_key");
CREATE INDEX "distribution_submission_attempts_release_id_state_updated_at_idx" ON "distribution_submission_attempts"("release_id", "state", "updated_at");
CREATE INDEX "distribution_submission_attempts_provider_state_updated_at_idx" ON "distribution_submission_attempts"("provider", "state", "updated_at");
