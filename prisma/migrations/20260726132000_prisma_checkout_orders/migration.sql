ALTER TABLE "coupons"
  ADD COLUMN "discount_type" TEXT NOT NULL DEFAULT 'percentage',
  ADD COLUMN "discount_value" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "expiry_date" TIMESTAMP(3),
  ADD COLUMN "usage_limit" INTEGER,
  ADD COLUMN "per_user_limit" INTEGER NOT NULL DEFAULT 1;

UPDATE "coupons" SET "discount_value" = "discount_percentage";

CREATE TABLE "checkout_orders" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "product_id" TEXT NOT NULL DEFAULT 'beatstore',
  "original_price" DECIMAL(12,2) NOT NULL,
  "discount_applied" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "referral_credits_used" INTEGER NOT NULL DEFAULT 0,
  "final_amount" DECIMAL(12,2) NOT NULL,
  "coupon_code" TEXT,
  "razorpay_order_id" TEXT NOT NULL,
  "razorpay_payment_id" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "payment_status" TEXT NOT NULL DEFAULT 'created',
  "fulfilled_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "checkout_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "checkout_order_items" (
  "id" SERIAL NOT NULL,
  "order_id" INTEGER NOT NULL,
  "beat_id" INTEGER NOT NULL,
  "license_type" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "license_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_order_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon_redemptions" (
  "id" SERIAL NOT NULL,
  "coupon_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "order_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "checkout_orders_razorpay_order_id_key" ON "checkout_orders"("razorpay_order_id");
CREATE UNIQUE INDEX "checkout_orders_razorpay_payment_id_key" ON "checkout_orders"("razorpay_payment_id");
CREATE INDEX "checkout_orders_user_id_payment_status_created_at_idx" ON "checkout_orders"("user_id", "payment_status", "created_at");
CREATE INDEX "checkout_orders_payment_status_created_at_idx" ON "checkout_orders"("payment_status", "created_at");
CREATE UNIQUE INDEX "checkout_order_items_order_id_beat_id_license_type_key" ON "checkout_order_items"("order_id", "beat_id", "license_type");
CREATE INDEX "checkout_order_items_beat_id_created_at_idx" ON "checkout_order_items"("beat_id", "created_at");
CREATE UNIQUE INDEX "coupon_redemptions_order_id_key" ON "coupon_redemptions"("order_id");
CREATE INDEX "coupon_redemptions_coupon_id_user_id_idx" ON "coupon_redemptions"("coupon_id", "user_id");

ALTER TABLE "checkout_orders" ADD CONSTRAINT "checkout_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "checkout_order_items" ADD CONSTRAINT "checkout_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "checkout_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checkout_order_items" ADD CONSTRAINT "checkout_order_items_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "checkout_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
