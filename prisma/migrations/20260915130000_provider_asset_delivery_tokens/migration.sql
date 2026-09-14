-- Provider delivery URLs must remain valid through application secret rotation.
-- Tokens are created lazily when a private asset is supplied to DireNote.
ALTER TABLE "stored_assets" ADD COLUMN IF NOT EXISTS "provider_delivery_token" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "stored_assets_provider_delivery_token_key"
  ON "stored_assets"("provider_delivery_token");
