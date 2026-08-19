CREATE TABLE "release_change_request_events" (
  "id" SERIAL NOT NULL, "request_id" INTEGER NOT NULL, "actor_type" TEXT NOT NULL,
  "actor_id" INTEGER, "previous_status" TEXT, "new_status" TEXT NOT NULL,
  "note" TEXT NOT NULL, "provider_reference" TEXT, "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "release_change_request_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "release_change_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "release_change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "release_change_request_events_request_id_created_at_idx" ON "release_change_request_events"("request_id", "created_at");
