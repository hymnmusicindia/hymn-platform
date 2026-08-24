CREATE TABLE IF NOT EXISTS "security_rate_limits" (
  "key_hash" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "window_start" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "security_rate_limits_pkey" PRIMARY KEY ("key_hash")
);
CREATE INDEX IF NOT EXISTS "security_rate_limits_expires_at_idx" ON "security_rate_limits"("expires_at");
