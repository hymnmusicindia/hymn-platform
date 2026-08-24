ALTER TABLE "managed_service_requests" ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT;
UPDATE "managed_service_requests" SET "idempotency_key" = md5('managed-service:' || "id"::text) WHERE "idempotency_key" IS NULL;
ALTER TABLE "managed_service_requests" ALTER COLUMN "idempotency_key" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "managed_service_requests_idempotency_key_key" ON "managed_service_requests"("idempotency_key");
CREATE TABLE IF NOT EXISTS "managed_service_provider_statuses" (
  "id" SERIAL NOT NULL,
  "request_id" INTEGER NOT NULL,
  "provider" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "managed_service_provider_statuses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "managed_service_provider_statuses_request_id_provider_key" ON "managed_service_provider_statuses"("request_id", "provider");
CREATE INDEX IF NOT EXISTS "managed_service_provider_statuses_status_updated_at_idx" ON "managed_service_provider_statuses"("status", "updated_at");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'managed_service_provider_statuses_request_id_fkey') THEN
    ALTER TABLE "managed_service_provider_statuses" ADD CONSTRAINT "managed_service_provider_statuses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "managed_service_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
