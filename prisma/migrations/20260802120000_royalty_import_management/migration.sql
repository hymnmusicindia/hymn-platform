ALTER TABLE "royalty_line_items" ADD COLUMN "sales_month" TIMESTAMP(3), ADD COLUMN "sales_type" TEXT, ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "royalty_statements" ADD COLUMN "reporting_month" TIMESTAMP(3), ADD COLUMN "rolled_back_at" TIMESTAMP(3), ADD COLUMN "rolled_back_by_user_id" INTEGER, ADD COLUMN "rollback_reason" TEXT;
ALTER TABLE "royalty_import_jobs" ADD COLUMN "ignored_count" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "manual_count" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "total_revenue" DECIMAL(18,6) NOT NULL DEFAULT 0, ADD COLUMN "progress" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'uploading';
CREATE TABLE "royalty_manual_mappings" ("id" SERIAL PRIMARY KEY, "isrc" TEXT, "upc" TEXT, "release_id" INTEGER NOT NULL, "track_id" INTEGER, "created_by_id" INTEGER NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL);
CREATE UNIQUE INDEX "royalty_manual_mappings_isrc_upc_key" ON "royalty_manual_mappings"("isrc", "upc");
CREATE INDEX "royalty_manual_mappings_isrc_idx" ON "royalty_manual_mappings"("isrc");
CREATE INDEX "royalty_manual_mappings_upc_idx" ON "royalty_manual_mappings"("upc");
