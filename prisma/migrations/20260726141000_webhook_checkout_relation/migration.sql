ALTER TABLE "payment_webhook_events" ADD COLUMN "checkout_order_id" INTEGER;
CREATE INDEX "payment_webhook_events_checkout_order_id_idx" ON "payment_webhook_events"("checkout_order_id");
ALTER TABLE "payment_webhook_events" ADD CONSTRAINT "payment_webhook_events_checkout_order_id_fkey" FOREIGN KEY ("checkout_order_id") REFERENCES "checkout_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
