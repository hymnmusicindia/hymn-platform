import webpush from "web-push";
import { prisma } from "@/lib/prisma";

type Claimed = { notificationId: string };

export async function dispatchTeamPush(limit = 100) {
  const publicKey = process.env.TEAM_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.TEAM_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.TEAM_PUSH_VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return { enabled: false, sent: 0, failed: 0, reason: "VAPID configuration missing" };
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const claimed = await prisma.$queryRaw<Claimed[]>`
    WITH picked AS (
      SELECT "notificationId" FROM "team_push_deliveries"
      WHERE "deliveredAt" IS NULL AND ("lockedUntil" IS NULL OR "lockedUntil" < NOW()) AND "attempts" < 8
      ORDER BY "createdAt" ASC LIMIT ${limit} FOR UPDATE SKIP LOCKED
    )
    UPDATE "team_push_deliveries" AS delivery
    SET "lockedUntil" = NOW() + INTERVAL '2 minutes', "attempts" = delivery."attempts" + 1
    FROM picked WHERE delivery."notificationId" = picked."notificationId"
    RETURNING delivery."notificationId"
  `;
  let sent = 0, failed = 0;
  for (const row of claimed) {
    const notification = await prisma.teamNotification.findUnique({
      where: { id: row.notificationId },
      include: { member: { select: { id: true, status: true, preferences: true, pushSubscriptions: true } } }
    });
    if (!notification) continue;
    const preferences = notification.member.preferences && typeof notification.member.preferences === "object" ? notification.member.preferences as Record<string, unknown> : {};
    if (notification.member.status !== "ACTIVE" || preferences.notifications === false || !notification.member.pushSubscriptions.length) {
      await prisma.teamPushDelivery.update({ where: { notificationId: row.notificationId }, data: { deliveredAt: new Date(), lockedUntil: null, lastError: null } });
      continue;
    }
    const payload = JSON.stringify({ title: notification.title, body: "Open HYMN Team OS to view this update.", url: new URL(notification.href.startsWith("/") ? notification.href : "/team", process.env.NEXT_PUBLIC_APP_URL || "https://hymnmusic.fun").toString(), tag: `team-${notification.id}` });
    let hadError = false;
    for (const subscription of notification.member.pushSubscriptions) {
      try {
        await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 3600 });
        sent++;
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) await prisma.teamPushSubscription.deleteMany({ where: { id: subscription.id } });
        else hadError = true;
      }
    }
    if (hadError) {
      failed++;
      await prisma.teamPushDelivery.update({ where: { notificationId: row.notificationId }, data: { lockedUntil: null, lastError: "One or more push delivery attempts failed." } });
    } else {
      await prisma.teamPushDelivery.update({ where: { notificationId: row.notificationId }, data: { deliveredAt: new Date(), lockedUntil: null, lastError: null } });
    }
  }
  return { enabled: true, claimed: claimed.length, sent, failed };
}
