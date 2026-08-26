-- Add provider-backed subscription plan versions without altering legacy entitlement rows.
CREATE TABLE "subscription_plan_versions" (
  "id" SERIAL NOT NULL,
  "product" TEXT NOT NULL,
  "razorpay_plan_id" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "billing_interval" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_plan_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_plan_versions_razorpay_plan_id_key" ON "subscription_plan_versions"("razorpay_plan_id");
CREATE INDEX "subscription_plan_versions_product_active_created_at_idx" ON "subscription_plan_versions"("product", "active", "created_at");

ALTER TABLE "subscriptions"
  ADD COLUMN "plan_version_id" INTEGER,
  ADD COLUMN "razorpay_plan_id" TEXT,
  ADD COLUMN "razorpay_subscription_id" TEXT,
  ADD COLUMN "current_period_start" TIMESTAMP(3),
  ADD COLUMN "current_period_end" TIMESTAMP(3),
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "provider_synced_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "subscriptions_razorpay_subscription_id_key" ON "subscriptions"("razorpay_subscription_id");
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_version_id_fkey" FOREIGN KEY ("plan_version_id") REFERENCES "subscription_plan_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payment_webhook_events" ADD COLUMN "razorpay_subscription_id" TEXT;
CREATE INDEX "payment_webhook_events_razorpay_subscription_id_idx" ON "payment_webhook_events"("razorpay_subscription_id");

CREATE TABLE "subscription_payments" (
  "id" SERIAL NOT NULL,
  "subscription_id" INTEGER NOT NULL,
  "razorpay_payment_id" TEXT NOT NULL,
  "razorpay_invoice_id" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL,
  "billing_period_start" TIMESTAMP(3),
  "billing_period_end" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "subscription_payments_razorpay_payment_id_key" ON "subscription_payments"("razorpay_payment_id");
CREATE INDEX "subscription_payments_subscription_id_created_at_idx" ON "subscription_payments"("subscription_id", "created_at");
CREATE INDEX "subscription_payments_razorpay_invoice_id_idx" ON "subscription_payments"("razorpay_invoice_id");
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "subscription_release_usages" (
  "id" SERIAL NOT NULL,
  "subscription_id" INTEGER NOT NULL,
  "release_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "subscription_release_usages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "subscription_release_usages_release_id_key" ON "subscription_release_usages"("release_id");
CREATE INDEX "subscription_release_usages_subscription_id_created_at_idx" ON "subscription_release_usages"("subscription_id", "created_at");
ALTER TABLE "subscription_release_usages" ADD CONSTRAINT "subscription_release_usages_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_release_usages" ADD CONSTRAINT "subscription_release_usages_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing subscriptions remain valid as legacy/manual entitlements. Provider IDs are
-- populated only after a real Razorpay Subscription is created or synchronized.
