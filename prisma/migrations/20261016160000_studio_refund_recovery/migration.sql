ALTER TABLE "studio_payments" ADD COLUMN "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "studio_payments" ADD COLUMN "reconciled_at" TIMESTAMP(3);
ALTER TABLE "studio_earnings" ADD COLUMN "reversed_net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "studio_earnings" ADD COLUMN "held_net_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "studio_earnings" ADD COLUMN "reversed_commission_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;
CREATE TABLE "studio_refunds" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payment_id" INTEGER NOT NULL REFERENCES "studio_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "provider_refund_id" TEXT,
  "amount_minor" INTEGER NOT NULL CHECK ("amount_minor" > 0),
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','PENDING','PROCESSED','FAILED')),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "studio_refunds_provider_refund_id_key" ON "studio_refunds"("provider_refund_id");
CREATE INDEX "studio_refunds_payment_id_status_idx" ON "studio_refunds"("payment_id","status");
ALTER TABLE "studio_payments" ADD CONSTRAINT "studio_payment_refunded_amount_check" CHECK ("refunded_amount" >= 0 AND "refunded_amount" <= "amount");
ALTER TABLE "studio_earnings" ADD CONSTRAINT "studio_earning_reversal_check" CHECK ("reversed_net_amount" >= 0 AND "reversed_net_amount" <= "net_amount" AND "held_net_amount" >= 0 AND "held_net_amount" <= "net_amount" - "reversed_net_amount" AND "reversed_commission_amount" >= 0 AND "reversed_commission_amount" <= "commission_amount");
