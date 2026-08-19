ALTER TYPE "PayoutRequestStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "PayoutRequestStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "PayoutRequestStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TABLE "payout_credentials" ADD COLUMN "legal_name" TEXT, ADD COLUMN "country" TEXT,
  ADD COLUMN "tax_residency" TEXT, ADD COLUMN "pan_last_four" TEXT, ADD COLUMN "rejection_reason" TEXT,
  ADD COLUMN "verification_note" TEXT, ADD COLUMN "submitted_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "verified_at" TIMESTAMP(3), ADD COLUMN "verified_by_admin_id" INTEGER;
ALTER TABLE "payout_requests" ADD COLUMN "payment_reference" TEXT, ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "payment_date" TIMESTAMP(3), ADD COLUMN "paid_amount" DECIMAL(12,2), ADD COLUMN "proof_asset_id" INTEGER;
CREATE UNIQUE INDEX "payout_requests_payment_reference_key" ON "payout_requests"("payment_reference");
