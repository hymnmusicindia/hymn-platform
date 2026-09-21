-- Canonical contributor/producer identity foundation. Existing name-only
-- credits remain unlinked until the dry-run audit provides reliable evidence;
-- this migration never merges identities by name or email.
ALTER TABLE "producer_profiles" ADD COLUMN "contributor_party_id" INTEGER;
ALTER TABLE "artist_cards" ADD COLUMN "contributor_party_id" INTEGER;
ALTER TABLE "beats" ADD COLUMN "producer_party_id" INTEGER;
ALTER TABLE "beat_sales" ADD COLUMN "producer_party_id" INTEGER;
ALTER TABLE "beat_purchases" ADD COLUMN "producer_party_id" INTEGER;
ALTER TABLE "split_recipients" ADD COLUMN "contributor_party_id" INTEGER;

CREATE TABLE "contributor_parties" (
  "id" SERIAL NOT NULL,
  "public_id" TEXT NOT NULL,
  "party_type" TEXT NOT NULL DEFAULT 'PERSON',
  "professional_name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "legal_name" TEXT,
  "country" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "identity_state" TEXT NOT NULL DEFAULT 'UNCLAIMED',
  "claimed_by_user_id" INTEGER,
  "created_by_user_id" INTEGER,
  "verified_at" TIMESTAMP(3),
  "merged_into_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contributor_parties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contributor_parties_public_id_key" ON "contributor_parties"("public_id");
CREATE UNIQUE INDEX "contributor_parties_claimed_by_user_id_key" ON "contributor_parties"("claimed_by_user_id");
CREATE INDEX "contributor_parties_professional_name_idx" ON "contributor_parties"("professional_name");
CREATE INDEX "contributor_parties_claimed_by_user_id_identity_state_idx" ON "contributor_parties"("claimed_by_user_id", "identity_state");
CREATE INDEX "contributor_parties_merged_into_id_idx" ON "contributor_parties"("merged_into_id");

CREATE TABLE "contributor_external_identifiers" (
  "id" SERIAL NOT NULL,
  "party_id" INTEGER NOT NULL,
  "scheme" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contributor_external_identifiers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contributor_external_identifiers_scheme_value_key" ON "contributor_external_identifiers"("scheme", "value");
CREATE INDEX "contributor_external_identifiers_party_id_scheme_idx" ON "contributor_external_identifiers"("party_id", "scheme");

CREATE TABLE "contributor_name_history" (
  "id" SERIAL NOT NULL,
  "party_id" INTEGER NOT NULL,
  "professional_name" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "changed_by_user_id" INTEGER,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contributor_name_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "contributor_name_history_party_id_created_at_idx" ON "contributor_name_history"("party_id", "created_at");

CREATE TABLE "track_contributions" (
  "id" SERIAL NOT NULL,
  "track_id" INTEGER NOT NULL,
  "party_id" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "credited_name" TEXT NOT NULL,
  "legal_name_snapshot" TEXT,
  "provider_role" TEXT,
  "sequence" INTEGER NOT NULL DEFAULT 0,
  "source" TEXT NOT NULL DEFAULT 'RELEASE_FORM',
  "created_by_user_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "track_contributions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "track_contributions_track_id_party_id_role_key" ON "track_contributions"("track_id", "party_id", "role");
CREATE INDEX "track_contributions_party_id_role_created_at_idx" ON "track_contributions"("party_id", "role", "created_at");
CREATE INDEX "track_contributions_track_id_sequence_idx" ON "track_contributions"("track_id", "sequence");

CREATE TABLE "track_contribution_snapshots" (
  "id" SERIAL NOT NULL,
  "submission_attempt_id" INTEGER NOT NULL,
  "track_id" INTEGER NOT NULL,
  "party_id" INTEGER NOT NULL,
  "role" TEXT NOT NULL,
  "credited_name" TEXT NOT NULL,
  "provider_role" TEXT,
  "payload" JSONB,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "track_contribution_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "track_contribution_snapshots_attempt_track_party_role_key" ON "track_contribution_snapshots"("submission_attempt_id", "track_id", "party_id", "role");
CREATE INDEX "track_contribution_snapshots_party_id_submitted_at_idx" ON "track_contribution_snapshots"("party_id", "submitted_at");

CREATE TABLE "contributor_invitations" (
  "id" SERIAL NOT NULL,
  "party_id" INTEGER NOT NULL,
  "email" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "invited_by_user_id" INTEGER NOT NULL,
  "claimed_by_user_id" INTEGER,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contributor_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "contributor_invitations_token_hash_key" ON "contributor_invitations"("token_hash");
CREATE INDEX "contributor_invitations_party_id_status_idx" ON "contributor_invitations"("party_id", "status");
CREATE INDEX "contributor_invitations_email_status_idx" ON "contributor_invitations"("email", "status");
CREATE INDEX "contributor_invitations_expires_at_status_idx" ON "contributor_invitations"("expires_at", "status");

CREATE TABLE "producer_identity_merges" (
  "id" SERIAL NOT NULL,
  "source_party_id" INTEGER NOT NULL,
  "target_party_id" INTEGER NOT NULL,
  "merged_by_user_id" INTEGER,
  "evidence" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "producer_identity_merges_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "producer_identity_merges_source_party_id_created_at_idx" ON "producer_identity_merges"("source_party_id", "created_at");
CREATE INDEX "producer_identity_merges_target_party_id_created_at_idx" ON "producer_identity_merges"("target_party_id", "created_at");

CREATE TABLE "release_track_beat_links" (
  "id" SERIAL NOT NULL,
  "track_id" INTEGER NOT NULL,
  "beat_id" INTEGER NOT NULL,
  "beat_purchase_id" INTEGER,
  "producer_party_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "release_track_beat_links_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "release_track_beat_links_track_id_key" ON "release_track_beat_links"("track_id");
CREATE UNIQUE INDEX "release_track_beat_links_beat_purchase_id_key" ON "release_track_beat_links"("beat_purchase_id");
CREATE INDEX "release_track_beat_links_beat_id_producer_party_id_idx" ON "release_track_beat_links"("beat_id", "producer_party_id");

-- Safe backfill: authenticated producer-owned objects share one claimed Party.
INSERT INTO "contributor_parties" ("public_id", "professional_name", "display_name", "identity_state", "claimed_by_user_id", "created_by_user_id", "created_at", "updated_at")
SELECT 'HYM_' || UPPER(SUBSTRING(MD5('hymn-party:' || u."id"::text || ':' || u."created_at"::text), 1, 24)),
       COALESCE(pp."display_name", u."name"), COALESCE(pp."display_name", u."name"), 'CLAIMED', u."id", u."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "users" u
LEFT JOIN "producer_profiles" pp ON pp."user_id" = u."id"
WHERE u."role" = 'PRODUCER' OR pp."id" IS NOT NULL
ON CONFLICT ("claimed_by_user_id") DO NOTHING;

INSERT INTO "contributor_name_history" ("party_id", "professional_name", "display_name", "changed_by_user_id", "reason")
SELECT cp."id", cp."professional_name", cp."display_name", cp."claimed_by_user_id", 'Canonical identity migration'
FROM "contributor_parties" cp;

UPDATE "producer_profiles" pp SET "contributor_party_id" = cp."id" FROM "contributor_parties" cp WHERE cp."claimed_by_user_id" = pp."user_id";
UPDATE "beats" b SET "producer_party_id" = cp."id" FROM "contributor_parties" cp WHERE cp."claimed_by_user_id" = b."user_id";
UPDATE "beat_sales" bs SET "producer_party_id" = cp."id" FROM "contributor_parties" cp WHERE cp."claimed_by_user_id" = bs."producer_user_id";
UPDATE "beat_purchases" bp SET "producer_party_id" = b."producer_party_id" FROM "beats" b WHERE b."id" = bp."beat_id";
UPDATE "split_recipients" sr SET "contributor_party_id" = cp."id" FROM "contributor_parties" cp WHERE cp."claimed_by_user_id" = sr."recipient_user_id";

CREATE UNIQUE INDEX "producer_profiles_contributor_party_id_key" ON "producer_profiles"("contributor_party_id");
CREATE INDEX "artist_cards_contributor_party_id_idx" ON "artist_cards"("contributor_party_id");
CREATE INDEX "beats_producer_party_id_enabled_idx" ON "beats"("producer_party_id", "enabled");
CREATE INDEX "beat_sales_producer_party_id_created_at_idx" ON "beat_sales"("producer_party_id", "created_at");
CREATE INDEX "beat_purchases_producer_party_id_purchased_at_idx" ON "beat_purchases"("producer_party_id", "purchased_at");
CREATE INDEX "split_recipients_contributor_party_id_invite_status_idx" ON "split_recipients"("contributor_party_id", "invite_status");

ALTER TABLE "contributor_parties" ADD CONSTRAINT "contributor_parties_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contributor_parties" ADD CONSTRAINT "contributor_parties_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contributor_parties" ADD CONSTRAINT "contributor_parties_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "contributor_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contributor_external_identifiers" ADD CONSTRAINT "contributor_external_identifiers_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "contributor_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contributor_name_history" ADD CONSTRAINT "contributor_name_history_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "contributor_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "track_contributions" ADD CONSTRAINT "track_contributions_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "track_contributions" ADD CONSTRAINT "track_contributions_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "track_contribution_snapshots" ADD CONSTRAINT "track_contribution_snapshots_submission_attempt_id_fkey" FOREIGN KEY ("submission_attempt_id") REFERENCES "distribution_submission_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "track_contribution_snapshots" ADD CONSTRAINT "track_contribution_snapshots_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "track_contribution_snapshots" ADD CONSTRAINT "track_contribution_snapshots_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contributor_invitations" ADD CONSTRAINT "contributor_invitations_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "contributor_parties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contributor_invitations" ADD CONSTRAINT "contributor_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contributor_invitations" ADD CONSTRAINT "contributor_invitations_claimed_by_user_id_fkey" FOREIGN KEY ("claimed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "producer_identity_merges" ADD CONSTRAINT "producer_identity_merges_source_party_id_fkey" FOREIGN KEY ("source_party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "producer_identity_merges" ADD CONSTRAINT "producer_identity_merges_target_party_id_fkey" FOREIGN KEY ("target_party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "release_track_beat_links" ADD CONSTRAINT "release_track_beat_links_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_track_beat_links" ADD CONSTRAINT "release_track_beat_links_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "release_track_beat_links" ADD CONSTRAINT "release_track_beat_links_beat_purchase_id_fkey" FOREIGN KEY ("beat_purchase_id") REFERENCES "beat_purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "release_track_beat_links" ADD CONSTRAINT "release_track_beat_links_producer_party_id_fkey" FOREIGN KEY ("producer_party_id") REFERENCES "contributor_parties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "producer_profiles" ADD CONSTRAINT "producer_profiles_contributor_party_id_fkey" FOREIGN KEY ("contributor_party_id") REFERENCES "contributor_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "artist_cards" ADD CONSTRAINT "artist_cards_contributor_party_id_fkey" FOREIGN KEY ("contributor_party_id") REFERENCES "contributor_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "beats" ADD CONSTRAINT "beats_producer_party_id_fkey" FOREIGN KEY ("producer_party_id") REFERENCES "contributor_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "beat_sales" ADD CONSTRAINT "beat_sales_producer_party_id_fkey" FOREIGN KEY ("producer_party_id") REFERENCES "contributor_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "beat_purchases" ADD CONSTRAINT "beat_purchases_producer_party_id_fkey" FOREIGN KEY ("producer_party_id") REFERENCES "contributor_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "split_recipients" ADD CONSTRAINT "split_recipients_contributor_party_id_fkey" FOREIGN KEY ("contributor_party_id") REFERENCES "contributor_parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
