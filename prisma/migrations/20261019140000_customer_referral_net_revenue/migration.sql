ALTER TABLE "referral_commissions"
  ADD COLUMN "eligible_net_revenue_minor" INTEGER,
  ADD COLUMN "policy_version" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "referral_commissions"
  ADD CONSTRAINT "referral_commissions_eligible_net_revenue_nonnegative"
  CHECK ("eligible_net_revenue_minor" IS NULL OR "eligible_net_revenue_minor" >= 0);

ALTER TABLE "referral_program" ADD COLUMN "net_revenue_effective_at" TIMESTAMP(3);
UPDATE "referral_program" SET "net_revenue_effective_at" = CURRENT_TIMESTAMP;
ALTER TABLE "acquisition_revenue_evidence" ALTER COLUMN "workspace_id" DROP NOT NULL;
ALTER TABLE "acquisition_program_settings"
  ADD COLUMN "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "eligible_source_types" TEXT[] NOT NULL DEFAULT ARRAY['distribution_order','checkout_order','subscription_payment','studio_payment'];
CREATE TABLE "referral_commission_adjustments" (
  "id" SERIAL PRIMARY KEY,
  "commission_id" INTEGER NOT NULL REFERENCES "referral_commissions"("id") ON DELETE RESTRICT,
  "previous_minor" INTEGER NOT NULL,
  "amount_minor" INTEGER NOT NULL,
  "resulting_minor" INTEGER NOT NULL,
  "eligible_net_revenue_minor" INTEGER,
  "rate_bps" INTEGER NOT NULL,
  "policy_version" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "referral_adjustment_balanced" CHECK ("previous_minor" + "amount_minor" = "resulting_minor")
);
CREATE INDEX "referral_commission_adjustments_commission_id_id_idx" ON "referral_commission_adjustments"("commission_id", "id");
