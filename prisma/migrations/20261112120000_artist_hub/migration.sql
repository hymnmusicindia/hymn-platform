-- AlterTable
ALTER TABLE "artist_cards" ADD COLUMN     "hub_identity_id" INTEGER;

-- CreateTable
CREATE TABLE "artist_hub_identities" (
    "id" SERIAL NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "source_card_id" INTEGER NOT NULL,
    "display_name" TEXT NOT NULL,
    "spotify_id" TEXT,
    "apple_id" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_hub_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_hub_participations" (
    "id" SERIAL NOT NULL,
    "release_id" INTEGER NOT NULL,
    "identity_id" INTEGER NOT NULL,
    "owner_user_id" INTEGER NOT NULL,
    "recipient_user_id" INTEGER NOT NULL,
    "revision" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reason" TEXT,
    "decided_at" TIMESTAMP(3),
    "intervention" TEXT NOT NULL DEFAULT 'none',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_hub_participations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_hub_cases" (
    "id" SERIAL NOT NULL,
    "event_key" TEXT NOT NULL,
    "requester_user_id" INTEGER NOT NULL,
    "identity_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artist_hub_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_hub_endorsements" (
    "id" SERIAL NOT NULL,
    "identity_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "release_id" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_hub_endorsements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_hub_mail" (
    "id" SERIAL NOT NULL,
    "event_key" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "artist_hub_mail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_verifications" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "document_type" TEXT NOT NULL DEFAULT 'government_id',
    "identity_asset_id" INTEGER,
    "beneficiary_asset_id" INTEGER,
    "consent_at" TIMESTAMP(3),
    "credential_updated_at" TIMESTAMP(3),
    "checks" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "artist_hub_identities_source_card_id_key" ON "artist_hub_identities"("source_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_hub_identities_spotify_id_key" ON "artist_hub_identities"("spotify_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_hub_identities_apple_id_key" ON "artist_hub_identities"("apple_id");

-- CreateIndex
CREATE INDEX "artist_hub_identities_owner_user_id_idx" ON "artist_hub_identities"("owner_user_id");

-- CreateIndex
CREATE INDEX "artist_hub_participations_recipient_user_id_status_idx" ON "artist_hub_participations"("recipient_user_id", "status");

-- CreateIndex
CREATE INDEX "artist_hub_participations_intervention_updated_at_idx" ON "artist_hub_participations"("intervention", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "artist_hub_participations_release_id_identity_id_key" ON "artist_hub_participations"("release_id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_hub_cases_event_key_key" ON "artist_hub_cases"("event_key");

-- CreateIndex
CREATE INDEX "artist_hub_cases_requester_user_id_status_idx" ON "artist_hub_cases"("requester_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "artist_hub_endorsements_identity_id_user_id_key" ON "artist_hub_endorsements"("identity_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "artist_hub_mail_event_key_key" ON "artist_hub_mail"("event_key");

-- CreateIndex
CREATE INDEX "artist_hub_mail_status_next_attempt_at_idx" ON "artist_hub_mail"("status", "next_attempt_at");

-- CreateIndex
CREATE UNIQUE INDEX "payout_verifications_user_id_key" ON "payout_verifications"("user_id");

-- CreateIndex
CREATE INDEX "artist_cards_hub_identity_id_idx" ON "artist_cards"("hub_identity_id");
