ALTER TABLE "unmatched_royalty_rows" ADD COLUMN "statement_id" INTEGER;
ALTER TABLE "unmatched_royalty_rows" ADD COLUMN "source_line_number" INTEGER;
ALTER TABLE "unmatched_royalty_rows" ADD COLUMN "matched_release_id" INTEGER;
ALTER TABLE "unmatched_royalty_rows" ADD COLUMN "matched_track_id" INTEGER;
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_statement_id_fkey" FOREIGN KEY ("statement_id") REFERENCES "royalty_statements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_matched_release_id_fkey" FOREIGN KEY ("matched_release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_matched_track_id_fkey" FOREIGN KEY ("matched_track_id") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "unmatched_royalty_rows_statement_id_source_line_number_idx" ON "unmatched_royalty_rows"("statement_id", "source_line_number");
