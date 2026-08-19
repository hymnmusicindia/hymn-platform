CREATE TABLE "direnote_logs" (
  "id" SERIAL NOT NULL,
  "release_id" INTEGER,
  "action" TEXT NOT NULL,
  "http_status" INTEGER,
  "success" BOOLEAN NOT NULL,
  "request_payload_redacted" JSONB,
  "response_raw" TEXT,
  "response_json" JSONB,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_admin_id" INTEGER,
  CONSTRAINT "direnote_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "direnote_logs_release_id_created_at_idx" ON "direnote_logs"("release_id", "created_at");
CREATE INDEX "direnote_logs_action_created_at_idx" ON "direnote_logs"("action", "created_at");
ALTER TABLE "direnote_logs" ADD CONSTRAINT "direnote_logs_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
