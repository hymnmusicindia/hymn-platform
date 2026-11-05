CREATE TABLE "team_push_subscriptions" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "team_push_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "team_push_subscriptions_endpoint_key" ON "team_push_subscriptions"("endpoint");
CREATE INDEX "team_push_subscriptions_memberId_updatedAt_idx" ON "team_push_subscriptions"("memberId", "updatedAt");
ALTER TABLE "team_push_subscriptions" ADD CONSTRAINT "team_push_subscriptions_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "team_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "team_push_deliveries" (
    "notificationId" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_push_deliveries_pkey" PRIMARY KEY ("notificationId")
);

CREATE INDEX "team_push_deliveries_deliveredAt_lockedUntil_createdAt_idx" ON "team_push_deliveries"("deliveredAt", "lockedUntil", "createdAt");
ALTER TABLE "team_push_deliveries" ADD CONSTRAINT "team_push_deliveries_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "team_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE FUNCTION queue_team_notification_push() RETURNS trigger AS $$
BEGIN
  INSERT INTO "team_push_deliveries" ("notificationId") VALUES (NEW."id") ON CONFLICT ("notificationId") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "team_notifications_queue_push"
AFTER INSERT ON "team_notifications"
FOR EACH ROW EXECUTE FUNCTION queue_team_notification_push();

INSERT INTO "team_push_deliveries" ("notificationId", "deliveredAt")
SELECT "id", CURRENT_TIMESTAMP FROM "team_notifications"
ON CONFLICT ("notificationId") DO NOTHING;
