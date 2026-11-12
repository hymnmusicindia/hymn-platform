CREATE TABLE "producer_follows" (
  "follower_user_id" INTEGER NOT NULL,
  "producer_profile_id" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "producer_follows_pkey" PRIMARY KEY ("follower_user_id", "producer_profile_id"),
  CONSTRAINT "producer_follows_follower_user_id_fkey" FOREIGN KEY ("follower_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "producer_follows_producer_profile_id_fkey" FOREIGN KEY ("producer_profile_id") REFERENCES "producer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "producer_follows_producer_profile_id_idx" ON "producer_follows"("producer_profile_id");
