-- Producer identity extensions. All additions are nullable or defaulted.
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "cover_photo_url" TEXT;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "avatar_url" TEXT;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "instagram_url" TEXT;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "youtube_url" TEXT;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "spotify_url" TEXT;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "website_url" TEXT;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "tags" JSONB;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending_setup';

-- Source-label payout records without changing existing artist payouts.
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "source_type" TEXT NOT NULL DEFAULT 'artist_royalty';

-- Immutable, idempotent beat-sale allocation records.
CREATE TABLE IF NOT EXISTS "beat_sales" (
  "id" SERIAL PRIMARY KEY,
  "beat_id" INTEGER NOT NULL,
  "producer_user_id" INTEGER NOT NULL,
  "buyer_user_id" INTEGER NOT NULL,
  "order_id" INTEGER NOT NULL,
  "payment_id" TEXT NOT NULL,
  "gross_amount" DECIMAL(12,2) NOT NULL,
  "hymn_commission_amount" DECIMAL(12,2) NOT NULL,
  "producer_earning_amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "license_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'paid',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "beat_sales_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "beat_sales_producer_user_id_fkey" FOREIGN KEY ("producer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "beat_sales_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "beat_sales_order_id_beat_id_license_type_key" ON "beat_sales"("order_id", "beat_id", "license_type");
CREATE INDEX IF NOT EXISTS "beat_sales_producer_user_id_created_at_idx" ON "beat_sales"("producer_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "beat_sales_buyer_user_id_created_at_idx" ON "beat_sales"("buyer_user_id", "created_at");
