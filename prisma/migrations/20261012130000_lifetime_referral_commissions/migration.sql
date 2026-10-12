-- CreateTable
CREATE TABLE "referral_program" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_program_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_commissions" (
    "id" SERIAL NOT NULL,
    "referral_id" INTEGER NOT NULL,
    "payment_id" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "paid_minor" INTEGER NOT NULL,
    "base_minor" INTEGER NOT NULL,
    "rate_bps" INTEGER NOT NULL,
    "original_minor" INTEGER NOT NULL,
    "net_minor" INTEGER NOT NULL,
    "refunded_minor" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "eligible_at" TIMESTAMP(3) NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_commission_payouts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "destination" JSONB NOT NULL,
    "payment_reference" TEXT,
    "admin_note" TEXT,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_commission_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "referral_commissions_payment_id_key" ON "referral_commissions"("payment_id");

-- CreateIndex
CREATE INDEX "referral_commissions_status_eligible_at_idx" ON "referral_commissions"("status", "eligible_at");

-- CreateIndex
CREATE INDEX "referral_commissions_referral_id_id_idx" ON "referral_commissions"("referral_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_commissions_source_type_source_id_key" ON "referral_commissions"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_commission_payouts_payment_reference_key" ON "referral_commission_payouts"("payment_reference");

-- CreateIndex
CREATE INDEX "referral_commission_payouts_user_id_status_idx" ON "referral_commission_payouts"("user_id", "status");

-- AddForeignKey
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commissions_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_commission_payouts" ADD CONSTRAINT "referral_commission_payouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


INSERT INTO referral_program (id, effective_at) VALUES (1, CURRENT_TIMESTAMP AT TIME ZONE 'UTC') ON CONFLICT (id) DO NOTHING;

ALTER TABLE "subscription_payments" ADD COLUMN "plan_snapshot" TEXT;
ALTER TABLE "referrals" ADD COLUMN "commission_rates" JSONB;
UPDATE "referrals" SET "commission_rates" = '{"one_time":1000,"half_yearly":800,"yearly":700,"yearly_plus":500,"beats":2000,"studio":1500}'::jsonb WHERE "commission_rates" IS NULL;

ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commission_amounts_valid" CHECK (
  paid_minor > 0 AND base_minor >= 0 AND base_minor <= paid_minor
  AND rate_bps BETWEEN 0 AND 10000 AND original_minor BETWEEN 0 AND base_minor
  AND net_minor BETWEEN 0 AND original_minor AND refunded_minor BETWEEN 0 AND paid_minor
);
ALTER TABLE "referral_commissions" ADD CONSTRAINT "referral_commission_status_valid" CHECK (status IN ('PENDING', 'HELD', 'AVAILABLE', 'REVERSED', 'EXCLUDED'));
ALTER TABLE "referral_commission_payouts" ADD CONSTRAINT "referral_payout_amount_valid" CHECK (amount_minor >= 50000);
ALTER TABLE "referral_commission_payouts" ADD CONSTRAINT "referral_payout_status_valid" CHECK (status IN ('REQUESTED', 'PAID', 'REJECTED'));
CREATE UNIQUE INDEX "referral_one_pending_payout_per_user" ON "referral_commission_payouts" ("user_id") WHERE status = 'REQUESTED';
