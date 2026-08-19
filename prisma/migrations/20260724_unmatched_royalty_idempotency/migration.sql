ALTER TABLE "unmatched_royalty_rows" ADD COLUMN "source_key" TEXT;

UPDATE "unmatched_royalty_rows"
SET "source_key" = md5("id"::text || ':' || COALESCE("import_reference", 'legacy'))
WHERE "source_key" IS NULL;

ALTER TABLE "unmatched_royalty_rows" ALTER COLUMN "source_key" SET NOT NULL;
CREATE UNIQUE INDEX "unmatched_royalty_rows_source_key_key" ON "unmatched_royalty_rows"("source_key");
