-- Additive-only foundation for HYMN splits and payout automation.
CREATE TABLE "split_records" (
  "id" SERIAL PRIMARY KEY, "release_id" INTEGER NOT NULL, "track_id" INTEGER,
  "owner_user_id" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'draft',
  "total_share_percent" DECIMAL(5,2) NOT NULL DEFAULT 0, "effective_from_month" INTEGER,
  "effective_from_year" INTEGER, "locked_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "split_records_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_records_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_records_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "split_records_owner_user_id_status_idx" ON "split_records"("owner_user_id", "status");
CREATE INDEX "split_records_release_id_track_id_status_idx" ON "split_records"("release_id", "track_id", "status");

CREATE TABLE "split_recipients" (
  "id" SERIAL PRIMARY KEY, "split_record_id" INTEGER NOT NULL, "release_id" INTEGER NOT NULL, "track_id" INTEGER,
  "recipient_user_id" INTEGER, "recipient_email" TEXT, "recipient_name" TEXT NOT NULL, "role" TEXT NOT NULL,
  "share_percent" DECIMAL(5,2) NOT NULL, "payout_eligible" BOOLEAN NOT NULL DEFAULT true,
  "invite_method" TEXT NOT NULL, "invite_status" TEXT NOT NULL DEFAULT 'pending', "split_code_hash" TEXT,
  "split_code_display" TEXT, "split_code_expires_at" TIMESTAMP(3), "split_code_used_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3), "declined_at" TIMESTAMP(3), "revoked_at" TIMESTAMP(3), "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "split_recipients_split_record_id_fkey" FOREIGN KEY ("split_record_id") REFERENCES "split_records"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_recipients_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_recipients_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_recipients_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "split_recipients_split_code_hash_key" ON "split_recipients"("split_code_hash");
CREATE INDEX "split_recipients_recipient_user_id_invite_status_idx" ON "split_recipients"("recipient_user_id", "invite_status");
CREATE INDEX "split_recipients_recipient_email_invite_status_idx" ON "split_recipients"("recipient_email", "invite_status");
CREATE INDEX "split_recipients_split_record_id_invite_status_idx" ON "split_recipients"("split_record_id", "invite_status");

CREATE TABLE "payout_credentials" (
  "id" SERIAL PRIMARY KEY, "user_id" INTEGER NOT NULL, "method" TEXT NOT NULL, "upi_id_masked" TEXT,
  "upi_id_encrypted" TEXT, "account_holder_name" TEXT, "bank_account_masked" TEXT,
  "bank_account_encrypted" TEXT, "ifsc_masked" TEXT, "ifsc_encrypted" TEXT, "tax_info_encrypted" TEXT,
  "status" TEXT NOT NULL DEFAULT 'submitted', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payout_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "payout_credentials_user_id_key" ON "payout_credentials"("user_id");

CREATE TABLE "split_earning_line_items" (
  "id" SERIAL PRIMARY KEY, "royalty_line_item_id" INTEGER NOT NULL, "split_record_id" INTEGER NOT NULL,
  "recipient_user_id" INTEGER, "recipient_email" TEXT, "recipient_name" TEXT NOT NULL, "recipient_role" TEXT NOT NULL,
  "release_id" INTEGER NOT NULL, "track_id" INTEGER, "share_percent" DECIMAL(5,2) NOT NULL,
  "gross_share_amount" DECIMAL(12,2) NOT NULL, "net_share_amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR', "status" TEXT NOT NULL DEFAULT 'held', "reversal_of_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "split_earnings_royalty_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_earnings_split_fkey" FOREIGN KEY ("split_record_id") REFERENCES "split_records"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_earnings_user_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "split_earnings_release_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT,
  CONSTRAINT "split_earnings_track_fkey" FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "split_earning_line_items_royalty_line_item_id_split_record_id_recipient_email_key" ON "split_earning_line_items"("royalty_line_item_id", "split_record_id", "recipient_email");
CREATE INDEX "split_earning_line_items_recipient_user_id_status_idx" ON "split_earning_line_items"("recipient_user_id", "status");
CREATE INDEX "split_earning_line_items_release_id_track_id_idx" ON "split_earning_line_items"("release_id", "track_id");

CREATE TABLE "wallet_transactions" (
  "id" SERIAL PRIMARY KEY, "user_id" INTEGER NOT NULL, "type" TEXT NOT NULL, "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR', "reference_type" TEXT NOT NULL, "reference_id" TEXT NOT NULL,
  "balance_after" DECIMAL(12,2) NOT NULL, "note" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "wallet_transactions_user_id_type_reference_type_reference_id_key" ON "wallet_transactions"("user_id", "type", "reference_type", "reference_id");
CREATE INDEX "wallet_transactions_user_id_created_at_idx" ON "wallet_transactions"("user_id", "created_at");
