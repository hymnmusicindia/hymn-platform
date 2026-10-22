CREATE TABLE "release_artist_identities" (
 "id" SERIAL PRIMARY KEY,
 "release_id" INTEGER NOT NULL REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "artist_card_id" INTEGER NOT NULL REFERENCES "artist_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "artist_name" TEXT NOT NULL,
 "spotify_url" TEXT,
 "apple_url" TEXT,
 "youtube_url" TEXT,
 "instagram_url" TEXT,
 "provider_artist_id" TEXT,
 "previous_provider_artist_id" TEXT,
 "source_fingerprint" TEXT NOT NULL,
 "selection_hash" TEXT NOT NULL,
 "confirmed_at" TIMESTAMP(3),
 "confirmed_by" INTEGER,
 "opened_spotify_url" TEXT,
 "corrected" BOOLEAN NOT NULL DEFAULT false,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "release_artist_identities_release_id_artist_card_id_key" UNIQUE ("release_id", "artist_card_id")
);
CREATE INDEX "release_artist_identities_artist_card_id_idx" ON "release_artist_identities"("artist_card_id");
