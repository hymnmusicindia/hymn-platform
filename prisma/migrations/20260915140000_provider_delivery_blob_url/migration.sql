ALTER TABLE "stored_assets" ADD COLUMN IF NOT EXISTS "provider_delivery_url" TEXT;
ALTER TABLE "stored_assets" ADD COLUMN IF NOT EXISTS "provider_delivery_at" TIMESTAMP(3);
