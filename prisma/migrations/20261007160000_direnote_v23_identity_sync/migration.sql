ALTER TABLE "contributor_parties"
  ADD COLUMN "ipi" TEXT,
  ADD COLUMN "iprs_member" TEXT,
  ADD COLUMN "instagram_url" TEXT,
  ADD COLUMN "x_url" TEXT,
  ADD COLUMN "direnote_songwriter_id" TEXT,
  ADD COLUMN "direnote_last_synced_at" TIMESTAMP(3);

CREATE INDEX "contributor_parties_direnote_songwriter_id_idx"
  ON "contributor_parties"("direnote_songwriter_id");
