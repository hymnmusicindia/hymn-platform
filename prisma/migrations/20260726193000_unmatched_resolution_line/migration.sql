ALTER TABLE "unmatched_royalty_rows" ADD COLUMN "royalty_line_item_id" INTEGER;
ALTER TABLE "unmatched_royalty_rows" ADD CONSTRAINT "unmatched_royalty_rows_royalty_line_item_id_fkey" FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "unmatched_royalty_rows_royalty_line_item_id_idx" ON "unmatched_royalty_rows"("royalty_line_item_id");
