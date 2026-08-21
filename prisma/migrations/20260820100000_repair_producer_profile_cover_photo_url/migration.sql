-- Repair schema drift for producer profile cover photos.
ALTER TABLE "producer_profiles" ADD COLUMN IF NOT EXISTS "cover_photo_url" TEXT;
