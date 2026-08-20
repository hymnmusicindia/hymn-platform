-- Preserve existing referral codes and relationships while upgrading the lifecycle.
ALTER TABLE "referrals"
  ADD COLUMN IF NOT EXISTS "referred_reward" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "attributed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "registered_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "qualified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversed_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "qualifying_transaction_type" TEXT,
  ADD COLUMN IF NOT EXISTS "qualifying_transaction_id" TEXT,
  ADD COLUMN IF NOT EXISTS "qualifying_payment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "risk_status" TEXT NOT NULL DEFAULT 'clear',
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "referrals"
SET
  "status" = CASE
    WHEN lower("status") = 'rewarded' THEN 'REWARDED'
    WHEN lower("status") IN ('signed_up', 'registered', 'pending') THEN 'PENDING'
    ELSE upper("status")
  END,
  "registered_at" = COALESCE("registered_at", "created_at"),
  "qualified_at" = CASE WHEN lower("status") = 'rewarded' THEN COALESCE("qualified_at", "rewarded_at") ELSE "qualified_at" END;

-- Historical data may contain more than one row for the same recipient. Preserve
-- the earliest attribution and explicitly reject the duplicates before enforcing
-- the one-recipient/one-referrer invariant.
WITH ranked AS (
  SELECT "id", row_number() OVER (PARTITION BY "referred_user_id" ORDER BY "created_at", "id") AS position
  FROM "referrals"
  WHERE "referred_user_id" IS NOT NULL
)
UPDATE "referrals" AS referral
SET "referred_user_id" = NULL,
    "status" = 'REJECTED',
    "rejection_reason" = 'Duplicate historical attribution removed during referral lifecycle migration'
FROM ranked
WHERE referral."id" = ranked."id" AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "referrals_referred_user_id_key" ON "referrals"("referred_user_id") WHERE "referred_user_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "referrals_qualifying_transaction_key" ON "referrals"("qualifying_transaction_type", "qualifying_transaction_id") WHERE "qualifying_transaction_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "referrals_status_created_at_idx" ON "referrals"("status", "created_at");

CREATE TABLE IF NOT EXISTS "credit_ledger_entries" (
  "id" SERIAL PRIMARY KEY,
  "user_id" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "direction" TEXT NOT NULL,
  "source_type" TEXT NOT NULL,
  "source_id" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "balance_after" DECIMAL(12,2) NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "credit_ledger_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_entries_idempotency_key_key" ON "credit_ledger_entries"("idempotency_key");
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_user_id_bucket_created_at_idx" ON "credit_ledger_entries"("user_id", "bucket", "created_at");
CREATE INDEX IF NOT EXISTS "credit_ledger_entries_source_type_source_id_idx" ON "credit_ledger_entries"("source_type", "source_id");

CREATE TABLE IF NOT EXISTS "referral_visits" (
  "id" SERIAL PRIMARY KEY,
  "referrer_id" INTEGER NOT NULL,
  "referral_code" TEXT NOT NULL,
  "visitor_hash" TEXT NOT NULL,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_visits_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "referral_visits_referrer_id_captured_at_idx" ON "referral_visits"("referrer_id", "captured_at");
CREATE INDEX IF NOT EXISTS "referral_visits_referral_code_captured_at_idx" ON "referral_visits"("referral_code", "captured_at");

-- Preserve pre-ledger checkout-credit balances as an explicit opening entry.
INSERT INTO "credit_ledger_entries" (
  "user_id", "type", "bucket", "amount", "direction", "source_type", "source_id",
  "description", "idempotency_key", "balance_after", "metadata"
)
SELECT "id", 'CREDIT_MIGRATION', 'HYMN_CREDIT', "referral_credits", 'credit',
       'migration', '20260808120000', 'Opening HYMN credit balance migrated from the legacy counter',
       'CREDIT_MIGRATION:' || "id"::text, "referral_credits", jsonb_build_object('migration', '20260808120000_referral_lifecycle')
FROM "users"
WHERE "referral_credits" > 0
ON CONFLICT ("idempotency_key") DO NOTHING;

-- Backfill permanent codes where missing and normalize existing codes without
-- allowing case-only duplicates to break the unique constraint.
UPDATE "users"
SET "referral_code" = upper(substr(regexp_replace("name", '[^A-Za-z0-9]', '', 'g'), 1, 6)) || substr(md5("id"::text || "email"), 1, 4)
WHERE "referral_code" IS NULL OR btrim("referral_code") = '';

WITH normalized AS (
  SELECT "id", upper(btrim("referral_code")) AS base_code,
         row_number() OVER (PARTITION BY upper(btrim("referral_code")) ORDER BY "id") AS position
  FROM "users"
  WHERE "referral_code" IS NOT NULL
)
UPDATE "users" AS account
SET "referral_code" = CASE
  WHEN normalized.position = 1 THEN normalized.base_code
  ELSE normalized.base_code || substr(md5(account."id"::text || account."email"), 1, 6)
END
FROM normalized
WHERE account."id" = normalized."id";
