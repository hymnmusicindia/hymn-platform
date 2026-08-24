CREATE TABLE IF NOT EXISTS "financial_adjustments" (
  "id" SERIAL NOT NULL, "user_id" INTEGER NOT NULL, "amount" DECIMAL(18,6) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR', "reason" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'pending',
  "requested_by" INTEGER NOT NULL, "approved_by" INTEGER, "decision_note" TEXT,
  "idempotency_key" TEXT NOT NULL, "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decided_at" TIMESTAMP(3), "applied_at" TIMESTAMP(3), CONSTRAINT "financial_adjustments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "financial_adjustments_idempotency_key_key" ON "financial_adjustments"("idempotency_key");
CREATE INDEX IF NOT EXISTS "financial_adjustments_state_requested_at_idx" ON "financial_adjustments"("state","requested_at");
CREATE INDEX IF NOT EXISTS "financial_adjustments_user_id_requested_at_idx" ON "financial_adjustments"("user_id","requested_at");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_adjustments_user_id_fkey') THEN
    ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_adjustments_requested_by_fkey') THEN
    ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'financial_adjustments_approved_by_fkey') THEN
    ALTER TABLE "financial_adjustments" ADD CONSTRAINT "financial_adjustments_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hymn_reject_audit_mutation() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'audit logs are append-only'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "audit_logs_no_update" ON "audit_logs";
CREATE TRIGGER "audit_logs_no_update" BEFORE UPDATE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION hymn_reject_audit_mutation();
DROP TRIGGER IF EXISTS "audit_logs_no_delete" ON "audit_logs";
CREATE TRIGGER "audit_logs_no_delete" BEFORE DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION hymn_reject_audit_mutation();
