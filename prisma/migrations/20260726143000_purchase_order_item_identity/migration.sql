DROP INDEX "beat_purchases_user_id_beat_id_license_type_key";
ALTER TABLE "beat_purchases" ADD COLUMN "checkout_order_item_id" INTEGER;
CREATE UNIQUE INDEX "beat_purchases_checkout_order_item_id_key" ON "beat_purchases"("checkout_order_item_id");
CREATE INDEX "beat_purchases_user_id_beat_id_license_type_idx" ON "beat_purchases"("user_id", "beat_id", "license_type");
CREATE INDEX "beat_purchases_payment_id_idx" ON "beat_purchases"("payment_id");
ALTER TABLE "beat_purchases" ADD CONSTRAINT "beat_purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "beat_purchases" ADD CONSTRAINT "beat_purchases_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "beat_purchases" ADD CONSTRAINT "beat_purchases_checkout_order_item_id_fkey" FOREIGN KEY ("checkout_order_item_id") REFERENCES "checkout_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
