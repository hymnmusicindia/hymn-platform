ALTER TABLE "notifications" ADD COLUMN "event_key" TEXT;
CREATE UNIQUE INDEX "notifications_event_key_key" ON "notifications"("event_key");
