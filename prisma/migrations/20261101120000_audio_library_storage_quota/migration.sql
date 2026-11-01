ALTER TABLE "stored_assets"
ADD COLUMN "library_visible" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "stored_assets_owner_library_visible_idx"
ON "stored_assets"("owner_user_id", "library_visible", "asset_type", "deleted_at");
