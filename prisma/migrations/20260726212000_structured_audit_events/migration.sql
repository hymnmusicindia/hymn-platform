ALTER TABLE "audit_logs"
  ADD COLUMN "actor_type" TEXT NOT NULL DEFAULT 'system',
  ADD COLUMN "actor_role" TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN "previous_value" JSONB,
  ADD COLUMN "new_value" JSONB,
  ADD COLUMN "reason" TEXT,
  ADD COLUMN "request_id" TEXT,
  ADD COLUMN "user_agent" TEXT,
  ADD COLUMN "session_id" TEXT,
  ADD COLUMN "risk_level" TEXT NOT NULL DEFAULT 'normal';
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");
CREATE INDEX "audit_logs_risk_level_created_at_idx" ON "audit_logs"("risk_level", "created_at");
CREATE INDEX "audit_logs_request_id_idx" ON "audit_logs"("request_id");
