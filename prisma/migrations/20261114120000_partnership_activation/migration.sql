CREATE TABLE "partnership_invitations" (
  "id" TEXT PRIMARY KEY, "email" TEXT NOT NULL, "name" TEXT NOT NULL, "company" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL UNIQUE, "agreement_version" TEXT NOT NULL, "agreement_hash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'INVITED', "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3), "user_id" INTEGER UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "subscription_expires_at" TIMESTAMP(3), "ended_at" TIMESTAMP(3),
  "minimum_payout_minor" INTEGER NOT NULL DEFAULT 0 CHECK (minimum_payout_minor >= 0),
  "mail_status" TEXT NOT NULL DEFAULT 'WAITING', "mail_locked_at" TIMESTAMP(3), "mail_sent_at" TIMESTAMP(3),
  "mail_attempts" INTEGER NOT NULL DEFAULT 0, "mail_available_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
  "mail_error" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX "partnership_invitations_mail_status_mail_available_at_idx" ON "partnership_invitations"("mail_status", "mail_available_at");
