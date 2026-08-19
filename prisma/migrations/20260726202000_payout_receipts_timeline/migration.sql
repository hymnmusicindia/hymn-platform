CREATE TABLE "payout_request_events" (
  "id" SERIAL NOT NULL,
  "payout_request_id" INTEGER NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_id" INTEGER,
  "previous_status" TEXT,
  "new_status" TEXT NOT NULL,
  "note" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_request_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payout_request_events_payout_request_id_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "payout_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "payout_request_events_payout_request_id_created_at_idx" ON "payout_request_events"("payout_request_id", "created_at");
CREATE UNIQUE INDEX "payout_requests_proof_asset_id_key" ON "payout_requests"("proof_asset_id");
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_proof_asset_id_fkey" FOREIGN KEY ("proof_asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
