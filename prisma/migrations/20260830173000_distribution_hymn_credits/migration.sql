ALTER TABLE "distribution_orders"
ADD COLUMN "credits_used" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "distribution_orders"
ADD CONSTRAINT "distribution_orders_credits_used_nonnegative"
CHECK ("credits_used" >= 0);
