CREATE TABLE "spotify_admin_connections" (
  "id" INTEGER NOT NULL,
  "spotify_user_id" TEXT NOT NULL,
  "display_name" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spotify_admin_connections_pkey" PRIMARY KEY ("id")
);

-- Legacy MySQL data is not read automatically. Operators must migrate the single
-- encrypted/provider refresh-token record through the dry-run backfill workflow.
