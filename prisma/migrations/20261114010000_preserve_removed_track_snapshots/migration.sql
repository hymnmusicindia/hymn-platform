-- Submission evidence belongs to the attempt, even after a recording is removed.
-- Preserve the original identity before allowing the live track link to detach.
UPDATE "track_contribution_snapshots"
SET "payload" = COALESCE("payload", '{}'::jsonb) || jsonb_build_object('originalTrackId', "track_id");

ALTER TABLE "track_contribution_snapshots" ALTER COLUMN "track_id" DROP NOT NULL;
ALTER TABLE "track_contribution_snapshots" DROP CONSTRAINT "track_contribution_snapshots_track_id_fkey";
ALTER TABLE "track_contribution_snapshots" ADD CONSTRAINT "track_contribution_snapshots_track_id_fkey"
  FOREIGN KEY ("track_id") REFERENCES "tracks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
