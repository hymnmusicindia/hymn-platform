CREATE TABLE "beat_engagements" (
  "beat_id" INTEGER NOT NULL,
  "visitor_key" TEXT NOT NULL,
  "liked" BOOLEAN NOT NULL DEFAULT false,
  "viewed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "beat_engagements_pkey" PRIMARY KEY ("beat_id", "visitor_key"),
  CONSTRAINT "beat_engagements_beat_id_fkey" FOREIGN KEY ("beat_id") REFERENCES "beats"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "beat_engagements_beat_id_liked_idx" ON "beat_engagements"("beat_id", "liked");
