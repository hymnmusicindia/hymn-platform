ALTER TABLE "unmatched_royalty_rows" ADD COLUMN IF NOT EXISTS "royalty_line_item_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unmatched_royalty_rows_royalty_line_item_id_fkey'
  ) THEN
    ALTER TABLE "unmatched_royalty_rows"
      ADD CONSTRAINT "unmatched_royalty_rows_royalty_line_item_id_fkey"
      FOREIGN KEY ("royalty_line_item_id") REFERENCES "royalty_line_items"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "unmatched_royalty_rows_royalty_line_item_id_idx"
  ON "unmatched_royalty_rows"("royalty_line_item_id");
