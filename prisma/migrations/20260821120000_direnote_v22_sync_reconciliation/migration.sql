ALTER TABLE "releases"
  ADD COLUMN "direnote_status" TEXT,
  ADD COLUMN "direnote_last_synced_at" TIMESTAMP(3),
  ADD COLUMN "direnote_last_attempted_at" TIMESTAMP(3),
  ADD COLUMN "direnote_sync_error" TEXT;

ALTER TABLE "artist_cards"
  ADD COLUMN "direnote_artist_id" TEXT,
  ADD COLUMN "direnote_last_synced_at" TIMESTAMP(3);

CREATE TABLE "direnote_reconciliation_discrepancies" (
  "id" SERIAL NOT NULL,
  "release_id" INTEGER NOT NULL,
  "track_id" INTEGER,
  "field" TEXT NOT NULL,
  "hymn_value" JSONB,
  "direnote_value" JSONB,
  "severity" TEXT NOT NULL DEFAULT 'warning',
  "status" TEXT NOT NULL DEFAULT 'open',
  "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  "resolved_by_id" INTEGER,
  "resolution" TEXT,
  CONSTRAINT "direnote_reconciliation_discrepancies_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "direnote_reconciliation_discrepancies" ADD CONSTRAINT "direnote_reconciliation_discrepancies_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direnote_reconciliation_discrepancies" ADD CONSTRAINT "direnote_reconciliation_discrepancies_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "direnote_reconciliation_discrepancies" ADD CONSTRAINT "direnote_reconciliation_discrepancies_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "direnote_reconciliation_discrepancies_release_id_status_detected_at_idx" ON "direnote_reconciliation_discrepancies"("release_id", "status", "detected_at");
CREATE INDEX "direnote_reconciliation_discrepancies_status_severity_detected_at_idx" ON "direnote_reconciliation_discrepancies"("status", "severity", "detected_at");

CREATE TABLE "external_identifier_history" (
  "id" SERIAL NOT NULL,
  "release_id" INTEGER,
  "track_id" INTEGER,
  "artist_card_id" INTEGER,
  "provider" TEXT NOT NULL,
  "identifier_type" TEXT NOT NULL,
  "previous_value" TEXT,
  "canonical_value" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_identifier_history_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "external_identifier_history" ADD CONSTRAINT "external_identifier_history_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_identifier_history" ADD CONSTRAINT "external_identifier_history_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "external_identifier_history" ADD CONSTRAINT "external_identifier_history_artist_card_id_fkey" FOREIGN KEY ("artist_card_id") REFERENCES "artist_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "external_identifier_history_release_id_identifier_type_created_at_idx" ON "external_identifier_history"("release_id", "identifier_type", "created_at");
CREATE INDEX "external_identifier_history_track_id_identifier_type_created_at_idx" ON "external_identifier_history"("track_id", "identifier_type", "created_at");
