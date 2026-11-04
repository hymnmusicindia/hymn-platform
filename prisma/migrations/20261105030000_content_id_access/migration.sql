CREATE TABLE "content_id_access" (
  "id" SERIAL NOT NULL,
  "user_id" INTEGER NOT NULL,
  "release_id" INTEGER NOT NULL,
  "distribution_order_id" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "channel_url" TEXT,
  "fee_amount" INTEGER NOT NULL DEFAULT 200,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewed_at" TIMESTAMP(3),
  "reviewed_by_id" INTEGER,
  "review_reason" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "content_id_access_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "content_id_access_status_check" CHECK ("status" IN ('pending', 'approved', 'declined')),
  CONSTRAINT "content_id_access_fee_amount_check" CHECK ("fee_amount" >= 0),
  CONSTRAINT "content_id_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "content_id_access_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_id_access_distribution_order_id_fkey" FOREIGN KEY ("distribution_order_id") REFERENCES "distribution_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_id_access_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "content_id_access_user_id_key" ON "content_id_access"("user_id");
CREATE UNIQUE INDEX "content_id_access_distribution_order_id_key" ON "content_id_access"("distribution_order_id");
CREATE INDEX "content_id_access_status_requested_at_idx" ON "content_id_access"("status", "requested_at");

INSERT INTO "content_id_access" (
  "user_id", "release_id", "distribution_order_id", "status", "channel_url",
  "fee_amount", "requested_at", "reviewed_at", "review_reason", "updated_at"
)
SELECT DISTINCT ON (r."user_id")
  r."user_id", r."id", d."id", 'approved', r."youtube_content_id_channel_url",
  0, r."created_at", r."updated_at", 'Previously enabled before approval review was introduced.', CURRENT_TIMESTAMP
FROM "releases" r
LEFT JOIN "distribution_orders" d ON d."release_id" = r."id" AND d."payment_status" = 'paid'
WHERE r."youtube_content_id_enabled" = TRUE
ORDER BY r."user_id", r."created_at" DESC
ON CONFLICT ("user_id") DO NOTHING;
