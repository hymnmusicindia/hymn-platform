CREATE TABLE "purchase_reviews" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "checkout_order_id" INTEGER,
  "distribution_order_id" INTEGER,
  "subscription_payment_id" INTEGER,
  "purchase_type" TEXT NOT NULL,
  "purchase_label" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "body" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "featured_order" INTEGER NOT NULL DEFAULT 0,
  "moderated_by_id" INTEGER,
  "moderated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "purchase_reviews_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "purchase_reviews_exactly_one_purchase" CHECK (
    (("checkout_order_id" IS NOT NULL)::integer + ("distribution_order_id" IS NOT NULL)::integer + ("subscription_payment_id" IS NOT NULL)::integer) = 1
  ),
  CONSTRAINT "purchase_reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5),
  CONSTRAINT "purchase_reviews_status_values" CHECK ("status" IN ('pending', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX "purchase_reviews_checkout_order_id_key" ON "purchase_reviews"("checkout_order_id");
CREATE UNIQUE INDEX "purchase_reviews_distribution_order_id_key" ON "purchase_reviews"("distribution_order_id");
CREATE UNIQUE INDEX "purchase_reviews_subscription_payment_id_key" ON "purchase_reviews"("subscription_payment_id");
CREATE INDEX "purchase_reviews_status_featured_featured_order_idx" ON "purchase_reviews"("status", "featured", "featured_order");
CREATE INDEX "purchase_reviews_user_id_created_at_idx" ON "purchase_reviews"("user_id", "created_at");

ALTER TABLE "purchase_reviews" ADD CONSTRAINT "purchase_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_reviews" ADD CONSTRAINT "purchase_reviews_moderated_by_id_fkey" FOREIGN KEY ("moderated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_reviews" ADD CONSTRAINT "purchase_reviews_checkout_order_id_fkey" FOREIGN KEY ("checkout_order_id") REFERENCES "checkout_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_reviews" ADD CONSTRAINT "purchase_reviews_distribution_order_id_fkey" FOREIGN KEY ("distribution_order_id") REFERENCES "distribution_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_reviews" ADD CONSTRAINT "purchase_reviews_subscription_payment_id_fkey" FOREIGN KEY ("subscription_payment_id") REFERENCES "subscription_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
