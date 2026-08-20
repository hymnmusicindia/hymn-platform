CREATE TYPE "ReleaseSource" AS ENUM ('CUSTOMER_SUBMISSION', 'ADMIN_MANUAL', 'DIRENOTE_SYNC', 'MIGRATED');

ALTER TABLE "releases"
  ADD COLUMN "owner_user_id" INTEGER,
  ADD COLUMN "artist_profile_id" INTEGER,
  ADD COLUMN "release_source" "ReleaseSource" NOT NULL DEFAULT 'CUSTOMER_SUBMISSION',
  ADD COLUMN "customer_editable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "assigned_by_admin_id" INTEGER,
  ADD COLUMN "assigned_at" TIMESTAMP(3),
  ADD COLUMN "archived_at" TIMESTAMP(3);

ALTER TABLE "releases" ADD CONSTRAINT "releases_artist_profile_id_fkey" FOREIGN KEY ("artist_profile_id") REFERENCES "artist_cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "releases" SET "owner_user_id" = "user_id";
ALTER TABLE "releases" ADD CONSTRAINT "releases_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "releases" ADD CONSTRAINT "releases_assigned_by_admin_id_fkey" FOREIGN KEY ("assigned_by_admin_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "release_ownership_history" (
  "id" SERIAL NOT NULL,
  "release_id" INTEGER NOT NULL,
  "previous_owner_user_id" INTEGER,
  "new_owner_user_id" INTEGER NOT NULL,
  "changed_by_admin_id" INTEGER,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "release_ownership_history_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "release_ownership_history" ADD CONSTRAINT "release_ownership_history_release_id_fkey" FOREIGN KEY ("release_id") REFERENCES "releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "release_ownership_history_release_id_created_at_idx" ON "release_ownership_history"("release_id", "created_at");
CREATE INDEX "release_ownership_history_previous_owner_user_id_idx" ON "release_ownership_history"("previous_owner_user_id");
CREATE INDEX "release_ownership_history_new_owner_user_id_idx" ON "release_ownership_history"("new_owner_user_id");
CREATE INDEX "releases_release_source_archived_at_created_at_idx" ON "releases"("release_source", "archived_at", "created_at");
CREATE INDEX "releases_artist_profile_id_idx" ON "releases"("artist_profile_id");
