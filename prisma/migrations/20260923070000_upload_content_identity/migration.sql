-- Nullable for existing sessions. Legacy sessions remain readable but are not
-- selected for automatic resume by filename/size alone.
ALTER TABLE "upload_sessions" ADD COLUMN IF NOT EXISTS "chunk_hashes" JSONB;
ALTER TABLE "upload_sessions" ADD COLUMN IF NOT EXISTS "file_fingerprint" TEXT;
