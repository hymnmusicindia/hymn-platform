-- Canonical password authentication belongs in PostgreSQL. This nullable
-- column preserves OAuth-only accounts. The unique index intentionally fails
-- closed if legacy accounts contain duplicate emails that require review.
ALTER TABLE "users" ADD COLUMN "password_hash" TEXT;
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
