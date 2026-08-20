CREATE TABLE "royalty_statements" (
  "id" SERIAL NOT NULL, "provider" TEXT NOT NULL, "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL, "currency" TEXT NOT NULL, "file_checksum" TEXT NOT NULL,
  "original_file_name" TEXT NOT NULL, "stored_asset_id" INTEGER, "status" TEXT NOT NULL DEFAULT 'staged',
  "imported_by_user_id" INTEGER NOT NULL, "imported_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "royalty_statements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "royalty_statements_stored_asset_id_fkey" FOREIGN KEY ("stored_asset_id") REFERENCES "stored_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "royalty_statements_imported_by_user_id_fkey" FOREIGN KEY ("imported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "royalty_statements_file_checksum_key" ON "royalty_statements"("file_checksum");
CREATE UNIQUE INDEX "royalty_statements_stored_asset_id_key" ON "royalty_statements"("stored_asset_id");
CREATE INDEX "royalty_statements_provider_period_start_period_end_idx" ON "royalty_statements"("provider", "period_start", "period_end");

CREATE TABLE "royalty_import_jobs" (
  "id" SERIAL NOT NULL, "statement_id" INTEGER NOT NULL, "actor_user_id" INTEGER NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'staged', "idempotency_key" TEXT NOT NULL, "row_count" INTEGER NOT NULL DEFAULT 0,
  "matched_count" INTEGER NOT NULL DEFAULT 0, "unmatched_count" INTEGER NOT NULL DEFAULT 0, "error_count" INTEGER NOT NULL DEFAULT 0,
  "safe_error" TEXT, "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completed_at" TIMESTAMP(3),
  CONSTRAINT "royalty_import_jobs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "royalty_import_jobs_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "royalty_import_jobs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "royalty_import_jobs_idempotency_key_key" ON "royalty_import_jobs"("idempotency_key");
CREATE INDEX "royalty_import_jobs_state_started_at_idx" ON "royalty_import_jobs"("state", "started_at");

ALTER TABLE "royalty_line_items" ADD COLUMN "statement_id" INTEGER, ADD COLUMN "source_line_number" INTEGER, ADD COLUMN "original_values" JSONB;
ALTER TABLE "royalty_line_items" ADD CONSTRAINT "royalty_line_items_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "royalty_line_items_statement_id_source_line_number_idx" ON "royalty_line_items"("statement_id", "source_line_number");

CREATE TABLE "royalty_adjustments" (
  "id" SERIAL NOT NULL, "statement_id" INTEGER NOT NULL, "royalty_line_item_id" INTEGER,
  "amount" DECIMAL(18,6) NOT NULL, "currency" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL, "reversal_of_id" INTEGER, "created_by_user_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "royalty_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "royalty_adjustments_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "royalty_adjustments_royalty_line_item_id_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "royalty_adjustments_idempotency_key_key" ON "royalty_adjustments"("idempotency_key");
CREATE INDEX "royalty_adjustments_statement_id_created_at_idx" ON "royalty_adjustments"("statement_id", "created_at");

CREATE TABLE "royalty_allocations" (
  "id" SERIAL NOT NULL, "royalty_line_item_id" INTEGER NOT NULL, "user_id" INTEGER NOT NULL,
  "gross_amount" DECIMAL(18,6) NOT NULL, "commission_amount" DECIMAL(18,6) NOT NULL,
  "allocated_amount" DECIMAL(18,6) NOT NULL, "held_amount" DECIMAL(18,6) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL, "idempotency_key" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "royalty_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "royalty_allocations_royalty_line_item_id_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "royalty_allocations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "royalty_allocations_idempotency_key_key" ON "royalty_allocations"("idempotency_key");
CREATE INDEX "royalty_allocations_user_id_created_at_idx" ON "royalty_allocations"("user_id", "created_at");

ALTER TABLE "wallet_transactions" ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'credit', ADD COLUMN "idempotency_key" TEXT,
  ADD COLUMN "effective_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, ADD COLUMN "availability_status" TEXT NOT NULL DEFAULT 'available',
  ADD COLUMN "audit_metadata" JSONB;
CREATE UNIQUE INDEX "wallet_transactions_idempotency_key_key" ON "wallet_transactions"("idempotency_key");
