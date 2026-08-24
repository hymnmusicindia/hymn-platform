CREATE TABLE IF NOT EXISTS "payout_request_events" (
  "id" SERIAL NOT NULL,
  "payout_request_id" INTEGER NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" INTEGER,
  "previous_status" TEXT,
  "new_status" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_request_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "payout_request_events_payout_request_id_created_at_idx"
  ON "payout_request_events"("payout_request_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "payout_requests_proof_asset_id_key"
  ON "payout_requests"("proof_asset_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payout_request_events_payout_request_id_fkey'
  ) THEN
    ALTER TABLE "payout_request_events"
      ADD CONSTRAINT "payout_request_events_payout_request_id_fkey"
      FOREIGN KEY ("payout_request_id") REFERENCES "payout_requests"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'payout_requests_proof_asset_id_fkey'
  ) THEN
    ALTER TABLE "payout_requests"
      ADD CONSTRAINT "payout_requests_proof_asset_id_fkey"
      FOREIGN KEY ("proof_asset_id") REFERENCES "stored_assets"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
