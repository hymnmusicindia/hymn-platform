CREATE TABLE IF NOT EXISTS "exchange_rates" (
  "id" SERIAL NOT NULL, "base_currency" TEXT NOT NULL, "quote_currency" TEXT NOT NULL,
  "rate" DECIMAL(18,8) NOT NULL, "provider" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "fetched_at" TIMESTAMP(3) NOT NULL, "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "exchange_rates_base_currency_quote_currency_status_fetched_at_idx" ON "exchange_rates"("base_currency", "quote_currency", "status", "fetched_at");
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "requested_amount_usd" DECIMAL(18,6);
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "requested_amount_inr" DECIMAL(18,6);
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "minimum_payout_usd" DECIMAL(12,2);
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "usd_to_inr_rate" DECIMAL(18,8);
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "exchange_rate_id" INTEGER;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "exchange_rate_provider" TEXT;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "exchange_rate_fetched_at" TIMESTAMP(3);
