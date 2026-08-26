ALTER TABLE "stored_assets"
  ADD COLUMN "track_id" INTEGER,
  ADD COLUMN "storage_root" TEXT,
  ADD COLUMN "relative_path" TEXT,
  ADD COLUMN "stored_filename" TEXT,
  ADD COLUMN "category" TEXT,
  ADD COLUMN "entity_type" TEXT,
  ADD COLUMN "entity_id" TEXT,
  ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "releases"
  ADD COLUMN "review_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "review_confirmed_by" INTEGER,
  ADD COLUMN "review_metadata_hash" TEXT;

CREATE TABLE "upload_sessions" (
  "id" TEXT NOT NULL,
  "user_id" INTEGER NOT NULL,
  "release_id" INTEGER NOT NULL,
  "track_id" INTEGER,
  "client_track_id" TEXT,
  "asset_category" TEXT NOT NULL,
  "original_filename" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "total_size" INTEGER NOT NULL,
  "chunk_size" INTEGER NOT NULL,
  "total_chunks" INTEGER NOT NULL,
  "uploaded_chunks" JSONB NOT NULL DEFAULT '[]',
  "bytes_uploaded" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "temp_path" TEXT NOT NULL,
  "final_asset_id" INTEGER,
  "error_message" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "upload_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "upload_sessions_temp_path_key" ON "upload_sessions"("temp_path");
CREATE INDEX "upload_sessions_user_id_status_updated_at_idx" ON "upload_sessions"("user_id", "status", "updated_at");
CREATE INDEX "upload_sessions_release_id_status_idx" ON "upload_sessions"("release_id", "status");
CREATE INDEX "upload_sessions_expires_at_status_idx" ON "upload_sessions"("expires_at", "status");
CREATE INDEX "stored_assets_track_id_category_idx" ON "stored_assets"("track_id", "category");
ALTER TABLE "stored_assets" ADD CONSTRAINT "stored_assets_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "upload_sessions" ADD CONSTRAINT "upload_sessions_final_asset_id_fkey" FOREIGN KEY ("final_asset_id") REFERENCES "stored_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
