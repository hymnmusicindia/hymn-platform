-- MP3 was previously fixed at INR 120. Preserve that value for existing beats.
-- price_cents remains the existing stems price; no existing tier is overwritten.
ALTER TABLE "beats" ADD COLUMN "mp3_price_cents" INTEGER NOT NULL DEFAULT 12000;
ALTER TABLE "beats" ADD CONSTRAINT "beats_mp3_price_nonnegative" CHECK ("mp3_price_cents" >= 0);
