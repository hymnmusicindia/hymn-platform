ALTER TYPE "PayoutRequestStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "PayoutRequestStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "PayoutRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "legal_name" TEXT;
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "country" TEXT;
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "tax_residency" TEXT;
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "pan_last_four" TEXT;
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "verification_note" TEXT;
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "submitted_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP(3);
ALTER TABLE "payout_credentials" ADD COLUMN IF NOT EXISTS "verified_by_admin_id" INTEGER;

ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "payment_reference" TEXT;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "payment_date" TIMESTAMP(3);
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "paid_amount" DECIMAL(12,2);
ALTER TABLE "payout_requests" ADD COLUMN IF NOT EXISTS "proof_asset_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "payout_requests_payment_reference_key"
  ON "payout_requests"("payment_reference");
