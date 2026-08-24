CREATE TABLE "promotions" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "discount_type" TEXT NOT NULL,
  "discount_value" DECIMAL(12,2) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "starts_at" TIMESTAMP(3),
  "ends_at" TIMESTAMP(3),
  "max_redemptions" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "promotion_redemptions" (
  "id" SERIAL NOT NULL,
  "promotion_id" INTEGER NOT NULL,
  "user_id" INTEGER NOT NULL,
  "release_id" INTEGER,
  "original_amount" DECIMAL(12,2) NOT NULL,
  "discount_amount" DECIMAL(12,2) NOT NULL,
  "final_amount" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" TEXT NOT NULL DEFAULT 'RESERVED',
  "campaign_source" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "redeemed_at" TIMESTAMP(3),
  CONSTRAINT "promotion_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "acquisition_events" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER,
  "anonymous_id" TEXT,
  "funnel" TEXT NOT NULL,
  "event" TEXT NOT NULL,
  "attribution" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "acquisition_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");
CREATE UNIQUE INDEX "promotion_redemptions_promotion_id_user_id_key" ON "promotion_redemptions"("promotion_id", "user_id");
CREATE INDEX "promotion_redemptions_status_created_at_idx" ON "promotion_redemptions"("status", "created_at");
CREATE INDEX "promotion_redemptions_release_id_idx" ON "promotion_redemptions"("release_id");
CREATE INDEX "acquisition_events_funnel_event_created_at_idx" ON "acquisition_events"("funnel", "event", "created_at");
CREATE INDEX "acquisition_events_user_id_created_at_idx" ON "acquisition_events"("user_id", "created_at");
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "promotions" ("code", "name", "product", "discount_type", "discount_value", "active", "updated_at")
VALUES ('FIRST_RELEASE_FREE', 'First Release Free', 'SINGLE_RELEASE', 'fixed_base_fee', 99.00, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
