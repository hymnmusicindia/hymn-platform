ALTER TABLE "beats"
  ADD COLUMN "general_price_cents" INTEGER NOT NULL DEFAULT 25000,
  ADD COLUMN "exclusive_price_cents" INTEGER NOT NULL DEFAULT 210000,
  ADD COLUMN "description" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "subgenre" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tags" JSONB,
  ADD COLUMN "sample_declaration" TEXT NOT NULL DEFAULT 'NO_UNCONTROLLED_SAMPLES',
  ADD COLUMN "sample_disclosure" TEXT,
  ADD COLUMN "sample_declared_at" TIMESTAMP(3),
  ADD COLUMN "general_max_commercial_releases" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "general_streaming_limit" INTEGER,
  ADD COLUMN "general_video_limit" INTEGER,
  ADD COLUMN "general_performance_rights" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "general_monetization_allowed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "general_credit_required" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "general_content_id_policy" TEXT NOT NULL DEFAULT 'NOT_ALLOWED',
  ADD COLUMN "general_term_duration_months" INTEGER,
  ADD COLUMN "general_territory" TEXT NOT NULL DEFAULT 'Worldwide',
  ADD COLUMN "exclusive_legal_mode" TEXT NOT NULL DEFAULT 'EXCLUSIVE_LICENSE',
  ADD COLUMN "general_licenses_sold" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "exclusive_reserved_by_user_id" INTEGER,
  ADD COLUMN "exclusive_reservation_order_id" TEXT,
  ADD COLUMN "exclusive_reservation_expires_at" TIMESTAMP(3),
  ADD COLUMN "preview_upload_id" INTEGER;

UPDATE "beats"
SET "general_price_cents" = "price_cents",
    "exclusive_price_cents" = GREATEST("price_cents" * 8, "price_cents" + 10000),
    "status" = CASE WHEN "status" = 'APPROVED' THEN 'PUBLISHED' ELSE "status" END;

ALTER TABLE "beats" ADD CONSTRAINT "beats_preview_upload_id_fkey" FOREIGN KEY ("preview_upload_id") REFERENCES "uploads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "beats_status_enabled_idx" ON "beats"("status", "enabled");
CREATE INDEX "beats_exclusive_reservation_expires_at_idx" ON "beats"("exclusive_reservation_expires_at");

ALTER TABLE "beat_sales"
  ADD COLUMN "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "net_sale_amount" DECIMAL(12,2),
  ADD COLUMN "producer_rate_applied" DECIMAL(5,4) NOT NULL DEFAULT 0.70,
  ADD COLUMN "platform_rate_applied" DECIMAL(5,4) NOT NULL DEFAULT 0.30,
  ADD COLUMN "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
UPDATE "beat_sales" SET "net_sale_amount" = "gross_amount" WHERE "net_sale_amount" IS NULL;
ALTER TABLE "beat_sales" ALTER COLUMN "net_sale_amount" SET NOT NULL;

ALTER TABLE "beat_purchases"
  ADD COLUMN "license_version" TEXT,
  ADD COLUMN "license_terms_snapshot" JSONB,
  ADD COLUMN "downloaded_at" TIMESTAMP(3),
  ADD COLUMN "download_count" INTEGER NOT NULL DEFAULT 0;
