-- Additive quarterly reporting and carry-forward persistence. No financial history is modified.
ALTER TABLE "royalty_line_items" ADD COLUMN "source_key" TEXT;
CREATE UNIQUE INDEX "royalty_line_items_source_key_key" ON "royalty_line_items"("source_key");

CREATE TABLE "payout_periods" (
  "id" SERIAL PRIMARY KEY, "type" TEXT NOT NULL, "month" INTEGER, "quarter" INTEGER, "year" INTEGER NOT NULL,
  "start_date" DATE NOT NULL, "end_date" DATE NOT NULL, "status" TEXT NOT NULL DEFAULT 'open',
  "total_gross_revenue" DECIMAL(14,2) NOT NULL DEFAULT 0, "total_artist_pool" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_split_earnings" DECIMAL(14,2) NOT NULL DEFAULT 0, "total_held_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_requested_payout" DECIMAL(14,2) NOT NULL DEFAULT 0, "total_paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "total_carry_forward" DECIMAL(14,2) NOT NULL DEFAULT 0, "generated_report_url" TEXT, "closed_at" TIMESTAMP(3),
  "closed_by_admin_id" INTEGER, "close_note" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "payout_periods_type_month_quarter_year_key" ON "payout_periods"("type", "month", "quarter", "year");
CREATE INDEX "payout_periods_type_year_status_idx" ON "payout_periods"("type", "year", "status");

CREATE TABLE "quarter_carry_forwards" (
  "id" SERIAL PRIMARY KEY, "user_id" INTEGER NOT NULL, "from_quarter" INTEGER NOT NULL, "from_year" INTEGER NOT NULL,
  "to_quarter" INTEGER NOT NULL, "to_year" INTEGER NOT NULL, "amount" DECIMAL(14,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR', "reason" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quarter_carry_forwards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX "quarter_carry_forwards_user_id_from_quarter_from_year_to_quarter_to_year_key" ON "quarter_carry_forwards"("user_id", "from_quarter", "from_year", "to_quarter", "to_year");
CREATE INDEX "quarter_carry_forwards_user_id_to_year_to_quarter_idx" ON "quarter_carry_forwards"("user_id", "to_year", "to_quarter");

CREATE TABLE "payout_reports" (
  "id" SERIAL PRIMARY KEY, "type" TEXT NOT NULL, "user_id" INTEGER, "month" INTEGER, "quarter" INTEGER,
  "year" INTEGER NOT NULL, "file_name" TEXT NOT NULL, "storage_path" TEXT, "generated_by_admin_id" INTEGER,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "status" TEXT NOT NULL DEFAULT 'generated',
  "checksum" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "payout_reports_type_year_quarter_month_idx" ON "payout_reports"("type", "year", "quarter", "month");
CREATE INDEX "payout_reports_user_id_generated_at_idx" ON "payout_reports"("user_id", "generated_at");

CREATE TABLE "unmatched_royalty_rows" (
  "id" SERIAL PRIMARY KEY, "import_reference" TEXT, "statement_month" TIMESTAMP(3), "upc" TEXT, "isrc" TEXT,
  "raw_data" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'unmatched', "resolution_note" TEXT,
  "resolved_at" TIMESTAMP(3), "resolved_by_id" INTEGER, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "unmatched_royalty_rows_status_statement_month_idx" ON "unmatched_royalty_rows"("status", "statement_month");
