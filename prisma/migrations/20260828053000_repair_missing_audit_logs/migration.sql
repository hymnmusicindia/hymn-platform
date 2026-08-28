-- Repair databases that predate the consolidated fresh baseline. Earlier
-- incremental migrations extended audit_logs but did not create its base table.
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" SERIAL NOT NULL,
  "actor_type" TEXT NOT NULL DEFAULT 'system',
  "actor_id" INTEGER,
  "actor_role" TEXT NOT NULL DEFAULT 'unknown',
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entity_id" TEXT,
  "previous_value" JSONB,
  "new_value" JSONB,
  "reason" TEXT,
  "request_id" TEXT,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "session_id" TEXT,
  "risk_level" TEXT NOT NULL DEFAULT 'normal',
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");
CREATE INDEX IF NOT EXISTS "audit_logs_entity_created_at_idx" ON "audit_logs"("entity", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_risk_level_created_at_idx" ON "audit_logs"("risk_level", "created_at");
CREATE INDEX IF NOT EXISTS "audit_logs_request_id_idx" ON "audit_logs"("request_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_actor_id_fkey'
  ) THEN
    ALTER TABLE "audit_logs"
      ADD CONSTRAINT "audit_logs_actor_id_fkey"
      FOREIGN KEY ("actor_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION hymn_reject_audit_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit logs are append-only';
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_no_update') THEN
    CREATE TRIGGER "audit_logs_no_update"
      BEFORE UPDATE ON "audit_logs"
      FOR EACH ROW EXECUTE FUNCTION hymn_reject_audit_mutation();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_no_delete') THEN
    CREATE TRIGGER "audit_logs_no_delete"
      BEFORE DELETE ON "audit_logs"
      FOR EACH ROW EXECUTE FUNCTION hymn_reject_audit_mutation();
  END IF;
END $$;
