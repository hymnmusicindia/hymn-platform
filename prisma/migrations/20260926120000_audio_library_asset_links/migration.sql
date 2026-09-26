CREATE TABLE "release_asset_links" (
  "id" SERIAL NOT NULL,
  "asset_id" INTEGER NOT NULL,
  "release_id" INTEGER NOT NULL,
  "track_id" INTEGER,
  "role" TEXT NOT NULL DEFAULT 'TRACK_AUDIO_MASTER',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "release_asset_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "release_asset_links_asset_id_release_id_track_id_role_key" ON "release_asset_links"("asset_id", "release_id", "track_id", "role");
CREATE INDEX "release_asset_links_release_id_track_id_role_idx" ON "release_asset_links"("release_id", "track_id", "role");
ALTER TABLE "release_asset_links" ADD CONSTRAINT "release_asset_links_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "stored_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_asset_links" ADD CONSTRAINT "release_asset_links_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_asset_links" ADD CONSTRAINT "release_asset_links_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
