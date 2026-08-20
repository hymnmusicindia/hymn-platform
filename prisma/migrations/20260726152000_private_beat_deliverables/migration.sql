ALTER TABLE "stored_assets" ADD COLUMN "beat_id" INTEGER;
CREATE UNIQUE INDEX "stored_assets_beat_id_key" ON "stored_assets"("beat_id");
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_beat_id_fkey"
  FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
