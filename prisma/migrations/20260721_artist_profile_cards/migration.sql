ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS spotify_artist_id TEXT;
ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS apple_artist_id TEXT;
ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS instagram_url TEXT;
ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS youtube_url TEXT;
ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS followers INTEGER;
ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE artist_cards ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_artist_cards_user_archived ON artist_cards(user_id, archived_at);
