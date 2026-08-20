CREATE TABLE "stored_assets" (
  "id" SERIAL NOT NULL, "owner_user_id" INTEGER NOT NULL, "release_id" INTEGER,
  "asset_type" TEXT NOT NULL, "storage_provider" TEXT NOT NULL, "object_key" TEXT NOT NULL,
  "original_filename" TEXT NOT NULL, "safe_filename" TEXT NOT NULL, "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL, "checksum" TEXT NOT NULL, "access_classification" TEXT NOT NULL,
  "upload_status" TEXT NOT NULL DEFAULT 'ready', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at" TIMESTAMP(3), "retention_until" TIMESTAMP(3),
  CONSTRAINT "stored_assets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "stored_assets_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "stored_assets_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "stored_assets_object_key_key" ON "stored_assets"("object_key");
CREATE INDEX "stored_assets_owner_user_id_asset_type_created_at_idx" ON "stored_assets"("owner_user_id", "asset_type", "created_at");
CREATE INDEX "stored_assets_release_id_asset_type_idx" ON "stored_assets"("release_id", "asset_type");
CREATE INDEX "stored_assets_deleted_at_retention_until_idx" ON "stored_assets"("deleted_at", "retention_until");
