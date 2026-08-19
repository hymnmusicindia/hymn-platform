ALTER TABLE "stored_assets" ADD COLUMN "beat_purchase_id" INTEGER;
CREATE UNIQUE INDEX "stored_assets_beat_purchase_id_key" ON "stored_assets"("beat_purchase_id");
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_beat_purchase_id_fkey"
  FOREIGN KEY ("beat_purchase_id") REFERENCES "beat_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
