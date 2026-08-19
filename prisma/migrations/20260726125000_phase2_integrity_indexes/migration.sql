-- Phase 2 production integrity constraints and lookup indexes.
-- The foreign key and unique index intentionally fail closed if legacy data
-- contains orphan orders or duplicate non-null payment identifiers. Resolve
-- such records explicitly before retrying `prisma migrate deploy`.

CREATE INDEX "releases_distributor_release_id_idx" ON "releases"("distributor_release_id");
CREATE INDEX "releases_upc_code_idx" ON "releases"("upc_code");
CREATE INDEX "tracks_isrc_idx" ON "tracks"("isrc");
CREATE INDEX "royalty_line_items_isrc_idx" ON "royalty_line_items"("isrc");
CREATE INDEX "royalty_line_items_upc_idx" ON "royalty_line_items"("upc");
CREATE INDEX "audit_logs_entity_created_at_idx" ON "audit_logs"("entity", "created_at");
CREATE UNIQUE INDEX "distribution_orders_razorpay_payment_id_key" ON "distribution_orders"("razorpay_payment_id");
CREATE INDEX "distribution_orders_user_id_payment_status_idx" ON "distribution_orders"("user_id", "payment_status");

ALTER TABLE "distribution_orders"
ADD CONSTRAINT "distribution_orders_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
