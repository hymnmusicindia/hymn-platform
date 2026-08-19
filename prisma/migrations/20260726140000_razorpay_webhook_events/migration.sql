ALTER TABLE "distribution_orders"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN "fulfilled_at" TIMESTAMP(3);

CREATE TABLE "payment_webhook_events" (
  "id" SERIAL NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'razorpay',
  "provider_event_id" TEXT,
  "event_type" TEXT NOT NULL,
  "payload_hash" TEXT NOT NULL,
  "signature_valid" BOOLEAN NOT NULL,
  "processing_state" TEXT NOT NULL DEFAULT 'received',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "distribution_order_id" INTEGER,
  "razorpay_order_id" TEXT,
  "payment_id" TEXT,
  "amount_minor" INTEGER,
  "currency" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "payload_redacted" JSONB,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payment_webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_webhook_events_distribution_order_id_fkey" FOREIGN KEY ("distribution_order_id") REFERENCES "distribution_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "payment_webhook_events_provider_event_id_key" ON "payment_webhook_events"("provider_event_id");
CREATE UNIQUE INDEX "payment_webhook_events_payload_hash_key" ON "payment_webhook_events"("payload_hash");
CREATE INDEX "payment_webhook_events_processing_state_received_at_idx" ON "payment_webhook_events"("processing_state", "received_at");
CREATE INDEX "payment_webhook_events_razorpay_order_id_idx" ON "payment_webhook_events"("razorpay_order_id");
