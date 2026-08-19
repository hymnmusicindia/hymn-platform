-- Migration: Add subscription improvements and new features

-- Alter subscriptions table to add missing fields
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_name VARCHAR(100);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS artist_limit INTEGER DEFAULT 5;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS available_features TEXT DEFAULT '[]';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS days_remaining INTEGER DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS auto_renewal BOOLEAN DEFAULT true;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS next_renewal_date TIMESTAMP NULL;

-- Rename expiry to expiry_date if needed (PostgreSQL)
-- ALTER TABLE subscriptions RENAME COLUMN expiry TO expiry_date;

-- Create artist_cards table
CREATE TABLE IF NOT EXISTS artist_cards (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  artist_name VARCHAR(255) NOT NULL,
  spotify_profile_url TEXT,
  apple_music_profile_url TEXT,
  role VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, artist_name),
  INDEX idx_artist_cards_user_id (user_id)
);

-- Create beat_purchases table
CREATE TABLE IF NOT EXISTS beat_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  beat_id INTEGER NOT NULL,
  license_type VARCHAR(50) NOT NULL,
  purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  license_uploaded_at TIMESTAMP NULL,
  license_url TEXT,
  has_access BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, beat_id, license_type),
  INDEX idx_beat_purchases_user (user_id, purchased_at)
);

-- Create distribution_queue_entries table
CREATE TABLE IF NOT EXISTS distribution_queue_entries (
  id SERIAL PRIMARY KEY,
  release_id INTEGER NOT NULL UNIQUE REFERENCES releases(id) ON DELETE CASCADE,
  current_stage VARCHAR(100) NOT NULL DEFAULT 'DRAFT_SUBMITTED',
  quality_check_notes TEXT,
  approval_notes TEXT,
  direnote_request_id VARCHAR(255),
  direnote_response JSON,
  submission_id VARCHAR(255),
  api_error_message TEXT,
  stage_history JSON,
  timestamps JSON,
  operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_queue_current_stage (current_stage, updated_at),
  INDEX idx_queue_release_id (release_id)
);

-- Create distribution_queue_logs table
CREATE TABLE IF NOT EXISTS distribution_queue_logs (
  id SERIAL PRIMARY KEY,
  queue_entry_id INTEGER NOT NULL REFERENCES distribution_queue_entries(id) ON DELETE CASCADE,
  stage VARCHAR(100) NOT NULL,
  stage_start_time TIMESTAMP NOT NULL,
  stage_end_time TIMESTAMP,
  operator_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_queue_logs_entry (queue_entry_id, stage_start_time)
);

-- Add indices for better performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_status_expiry ON subscriptions(status, expiry_date);
