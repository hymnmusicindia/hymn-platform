ALTER TABLE releases
  MODIFY status ENUM(
    'draft',
    'submitted',
    'in_queue',
    'under_review',
    'changes_requested',
    'approved',
    'queued_for_distribution',
    'sent',
    'sent_to_distributor',
    'processing',
    'delivered',
    'live',
    'rejected',
    'failed'
  ) NOT NULL DEFAULT 'submitted',
  ADD COLUMN album_name VARCHAR(190) NULL AFTER release_title,
  ADD COLUMN album_version VARCHAR(120) NULL AFTER album_name,
  ADD COLUMN content_type ENUM('original_exclusive_licensed', 'ai_generated', 'non_exclusive_licensed') NULL AFTER language,
  ADD COLUMN distributor_release_id VARCHAR(190) NULL AFTER upc_code,
  ADD COLUMN submitted_at TIMESTAMP NULL AFTER distributor_release_id,
  ADD COLUMN approved_at TIMESTAMP NULL AFTER submitted_at,
  ADD COLUMN distributed_at TIMESTAMP NULL AFTER approved_at,
  ADD COLUMN live_at TIMESTAMP NULL AFTER distributed_at,
  ADD COLUMN spotify_presave_date DATE NULL AFTER original_release_date,
  ADD COLUMN apple_presave_date DATE NULL AFTER spotify_presave_date,
  ADD COLUMN spotify_exclusive_date DATE NULL AFTER apple_presave_date,
  ADD COLUMN apple_exclusive_date DATE NULL AFTER spotify_exclusive_date,
  ADD COLUMN copyright_line TEXT NULL AFTER copyright_owner,
  ADD COLUMN phonographic_copyright_line TEXT NULL AFTER copyright_line,
  ADD COLUMN previously_released BOOLEAN NOT NULL DEFAULT FALSE AFTER phonographic_copyright_line,
  ADD COLUMN owner_email VARCHAR(190) NULL AFTER previously_released,
  ADD COLUMN additional_notes TEXT NULL AFTER owner_email,
  ADD COLUMN license_document_url TEXT NULL AFTER additional_notes,
  ADD COLUMN suno_receipt_url TEXT NULL AFTER license_document_url,
  ADD COLUMN suno_link TEXT NULL AFTER suno_receipt_url;

ALTER TABLE tracks
  ADD COLUMN track_genre VARCHAR(120) NULL AFTER title,
  ADD COLUMN track_subgenre VARCHAR(120) NULL AFTER track_genre,
  ADD COLUMN track_language VARCHAR(80) NULL AFTER track_subgenre,
  ADD COLUMN preview_start VARCHAR(20) NULL AFTER version,
  ADD COLUMN vocalist VARCHAR(190) NULL AFTER preview_start,
  ADD COLUMN lyrics TEXT NULL AFTER explicit_content,
  ADD COLUMN previously_released BOOLEAN NOT NULL DEFAULT FALSE AFTER lyrics,
  ADD COLUMN distributor_status VARCHAR(120) NULL AFTER isrc;

CREATE TABLE IF NOT EXISTS distribution_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_id BIGINT NOT NULL,
  request_payload JSON NULL,
  response_payload JSON NULL,
  warnings JSON NULL,
  errors JSON NULL,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_distribution_logs_release_created (release_id, created_at),
  CONSTRAINT fk_distribution_logs_release FOREIGN KEY (release_id) REFERENCES releases(id)
);

CREATE TABLE IF NOT EXISTS release_audit_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  release_id BIGINT NOT NULL,
  user_id BIGINT NULL,
  action VARCHAR(120) NOT NULL,
  details JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_release_audit_logs_release_created (release_id, created_at),
  CONSTRAINT fk_release_audit_logs_release FOREIGN KEY (release_id) REFERENCES releases(id),
  CONSTRAINT fk_release_audit_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
);
