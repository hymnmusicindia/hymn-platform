ALTER TABLE "users"
ADD COLUMN "presence_status" TEXT NOT NULL DEFAULT 'online';

ALTER TABLE "users"
ADD CONSTRAINT "users_presence_status_check"
CHECK ("presence_status" IN ('online', 'invisible', 'do_not_disturb'));
