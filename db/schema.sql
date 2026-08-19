CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  google_id VARCHAR(190) NOT NULL UNIQUE,
  password_hash TEXT NULL,
  role ENUM('customer', 'producer', 'admin') NOT NULL DEFAULT 'customer',
  referral_code VARCHAR(40) NOT NULL UNIQUE,
  referral_credits DECIMAL(10, 2) NOT NULL DEFAULT 0,
  referred_by BIGINT NULL,
  first_payment_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_referred_by FOREIGN KEY (referred_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL UNIQUE,
  discount_type ENUM('flat', 'percentage') NOT NULL,
  discount_value DECIMAL(10, 2) NOT NULL,
  expiry_date TIMESTAMP NULL,
  usage_limit INT NULL,
  per_user_limit INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_coupons_code_active (code, active)
);

CREATE TABLE IF NOT EXISTS releases (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  artist_name VARCHAR(150) NOT NULL,
  track_name VARCHAR(190) NOT NULL,
  release_title VARCHAR(190) NOT NULL DEFAULT '',
  release_type ENUM('single', 'ep', 'album') NOT NULL,
  audio_url TEXT NOT NULL,
  artwork_url TEXT NOT NULL,
  release_date DATE NOT NULL,
  original_release_date DATE NULL,
  record_label_name VARCHAR(190) NULL,
  primary_genre VARCHAR(120) NULL,
  secondary_genre VARCHAR(120) NULL,
  language VARCHAR(80) NOT NULL DEFAULT 'English',
  mood VARCHAR(120) NULL,
  platforms JSON NOT NULL,
  youtube_content_id_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  youtube_content_id_channel_url TEXT NULL,
  monetisation_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  monetisation_clauses JSON NULL,
  territory VARCHAR(190) NULL,
  upc_code VARCHAR(120) NULL,
  release_timing VARCHAR(120) NULL,
  copyright_owner VARCHAR(190) NULL,
  publishing_rights TEXT NULL,
  payment_model ENUM('one_time', 'subscription') NULL,
  payment_status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  distribution_plan ENUM('basic', 'pro', 'elite', 'pay_per_release') NULL,
  ownership_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  no_unauthorized_samples BOOLEAN NOT NULL DEFAULT FALSE,
  collaborators_credited BOOLEAN NOT NULL DEFAULT FALSE,
  platform_compliant BOOLEAN NOT NULL DEFAULT FALSE,
  hymn_not_liable BOOLEAN NOT NULL DEFAULT FALSE,
  agreed_to_terms BOOLEAN NOT NULL DEFAULT FALSE,
  false_metadata_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  status ENUM('submitted', 'in_queue', 'under_review', 'approved', 'sent', 'live') NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_releases_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS tracks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_id BIGINT NOT NULL,
  title VARCHAR(190) NOT NULL,
  version VARCHAR(120) NULL,
  track_number INT NOT NULL,
  primary_artist VARCHAR(190) NOT NULL,
  featured_artists TEXT NULL,
  additional_primary_artist TEXT NULL,
  songwriters TEXT NOT NULL,
  composers TEXT NOT NULL,
  producers TEXT NOT NULL,
  isrc VARCHAR(120) NULL,
  is_cover BOOLEAN NOT NULL DEFAULT FALSE,
  original_artist VARCHAR(190) NULL,
  original_track_link TEXT NULL,
  cover_license_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  cover_license_url TEXT NULL,
  contributor_credits JSON NULL,
  audio_url TEXT NOT NULL,
  duration VARCHAR(50) NOT NULL,
  bpm INT NULL,
  musical_key VARCHAR(50) NULL,
  explicit_content BOOLEAN NOT NULL DEFAULT FALSE,
  dolby_atmos BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tracks_release FOREIGN KEY (release_id) REFERENCES releases(id)
);

CREATE TABLE IF NOT EXISTS release_queue (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_id BIGINT NOT NULL UNIQUE,
  position INT NOT NULL,
  estimated_review_time VARCHAR(120) NOT NULL DEFAULT '24-48 hours',
  status ENUM('submitted', 'in_queue', 'under_review', 'approved') NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_queue_release FOREIGN KEY (release_id) REFERENCES releases(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL UNIQUE,
  plan ENUM('basic', 'pro', 'elite', 'pay_per_release') NOT NULL,
  expiry TIMESTAMP NOT NULL,
  releases_used INT NOT NULL DEFAULT 0,
  release_limit INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_subscriptions_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS distribution_orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  release_id BIGINT NULL,
  plan ENUM('basic', 'pro', 'elite', 'pay_per_release') NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  razorpay_order_id VARCHAR(190) NOT NULL UNIQUE,
  razorpay_payment_id VARCHAR(190) NULL,
  payment_status ENUM('created', 'paid', 'failed') NOT NULL DEFAULT 'created',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_distribution_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_distribution_orders_release FOREIGN KEY (release_id) REFERENCES releases(id)
);

CREATE TABLE IF NOT EXISTS admin_notes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_id BIGINT NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_release FOREIGN KEY (release_id) REFERENCES releases(id)
);

CREATE TABLE IF NOT EXISTS beats (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  producer_id BIGINT NOT NULL,
  title VARCHAR(190) NOT NULL,
  bpm INT NOT NULL,
  genre VARCHAR(100) NOT NULL,
  mood VARCHAR(100) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  audio_preview_url TEXT NOT NULL,
  file_url TEXT NOT NULL,
  artwork_url TEXT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_beats_producer FOREIGN KEY (producer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  product_id VARCHAR(190) NULL,
  original_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_applied DECIMAL(10, 2) NOT NULL DEFAULT 0,
  referral_credits_used DECIMAL(10, 2) NOT NULL DEFAULT 0,
  final_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  coupon_code VARCHAR(64) NULL,
  razorpay_order_id VARCHAR(190) NOT NULL UNIQUE,
  razorpay_payment_id VARCHAR(190) NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_status ENUM('created', 'paid', 'failed') NOT NULL DEFAULT 'created',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_id BIGINT NOT NULL,
  beat_id BIGINT NOT NULL,
  license_type ENUM('basic', 'premium', 'exclusive') NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  license_url TEXT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_order_items_beat FOREIGN KEY (beat_id) REFERENCES beats(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  title VARCHAR(190) NOT NULL,
  body TEXT NOT NULL,
  type ENUM('release', 'beat', 'order', 'payout', 'account', 'system') NOT NULL DEFAULT 'system',
  href TEXT NULL,
  action_label VARCHAR(120) NULL,
  priority ENUM('low', 'normal', 'high') NOT NULL DEFAULT 'normal',
  metadata JSON NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notifications_user_read (user_id, read_at),
  INDEX idx_notifications_user_created (user_id, created_at),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  subject VARCHAR(190) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open', 'in_progress', 'resolved', 'closed') NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_support_tickets_user_status (user_id, status),
  INDEX idx_support_tickets_status_created (status, created_at),
  CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  referred_user_id BIGINT NULL,
  referral_code VARCHAR(40) NOT NULL,
  signup_email VARCHAR(190) NOT NULL,
  status ENUM('signed_up', 'rewarded') NOT NULL DEFAULT 'signed_up',
  purchase_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  earnings DECIMAL(10, 2) NOT NULL DEFAULT 0,
  rewarded_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_referrals_referred_user (referred_user_id),
  CONSTRAINT fk_referrals_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_referrals_referred_user FOREIGN KEY (referred_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  coupon_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_coupon_order (coupon_id, order_id),
  INDEX idx_coupon_redemptions_user_coupon (user_id, coupon_id),
  CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  CONSTRAINT fk_coupon_redemptions_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  service_interest VARCHAR(150) NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS partnership_leads (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  company VARCHAR(190) NULL,
  collaboration_type VARCHAR(150) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS producer_applications (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(190) NOT NULL,
  artist_name VARCHAR(150) NOT NULL,
  genre_focus VARCHAR(150) NOT NULL,
  beat_catalog_size INT NOT NULL,
  experience TEXT NOT NULL,
  links TEXT NOT NULL,
  message TEXT NOT NULL,
  status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reviewed_by BIGINT NULL,
  reviewed_at TIMESTAMP NULL,
  review_note TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_producer_applications_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_producer_applications_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS artist_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  name VARCHAR(190) NOT NULL,
  normalized_name VARCHAR(190) NOT NULL,
  spotify_artist_id VARCHAR(190) NULL,
  spotify_url TEXT NULL,
  apple_artist_id VARCHAR(190) NULL,
  apple_url TEXT NULL,
  instagram_url TEXT NULL,
  youtube_url TEXT NULL,
  image_url TEXT NULL,
  followers BIGINT NULL,
  is_linked BOOLEAN NOT NULL DEFAULT FALSE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  archived_at TIMESTAMP NULL,
  last_used_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_artist_profiles_user_name (user_id, normalized_name),
  UNIQUE KEY uq_artist_profiles_user_spotify (user_id, spotify_artist_id),
  CONSTRAINT fk_artist_profiles_user FOREIGN KEY (user_id) REFERENCES users(id)
);





CREATE TABLE IF NOT EXISTS producer_profiles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  slug VARCHAR(190) NOT NULL UNIQUE,
  name VARCHAR(190) NOT NULL,
  description TEXT NOT NULL,
  specialty VARCHAR(190) NOT NULL,
  image_url TEXT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS site_settings (
  id BIGINT PRIMARY KEY,
  home_hero_image_url TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

/* vercel trigger */
