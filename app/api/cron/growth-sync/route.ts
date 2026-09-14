import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { growthEnabled, recordGrowthEvent } from "@/lib/growth";
import { qualifyRecurringReferral } from "@/lib/referral-reward-policy";
import { qualifyPartnerPayment } from "@/lib/growth-partners";
import { queueGrowthNudges, deliverGrowthNudges } from "@/lib/growth-retention";

export const maxDuration = 60;
export async function GET(request: Request) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`); const actual = Buffer.from(request.headers.get("authorization") || "");
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return new NextResponse(null, { status: 401 });
  if (!growthEnabled()) return NextResponse.json({ enabled: false });
  const deadline = Date.now() + 45000; let processed = 0;
  try {
    const policy = await prisma.growthRewardPolicy.findUniqueOrThrow({ where: { id: 1 } });
    const start = policy.createdAt;
    // Anti-joins recover missing observations without relying on a fragile timestamp cursor.
    const releases = await prisma.$queryRaw<Array<{ id: number; user_id: number; created_at: Date }>>`
      SELECT r.id, r.user_id, r.created_at FROM releases r
      WHERE r.created_at >= ${start} AND r.release_source = 'CUSTOMER_SUBMISSION' AND r.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM growth_events e WHERE e.key = 'release-observed:' || r.id)
      ORDER BY r.id LIMIT 50`;
    for (const release of releases) {
      if (Date.now() >= deadline) break;
      const previous = await prisma.release.count({ where: { userId: release.user_id, createdAt: { lt: release.created_at }, status: { notIn: ["DRAFT", "AWAITING_PAYMENT"] }, releaseSource: "CUSTOMER_SUBMISSION", archivedAt: null } });
      await recordGrowthEvent({ event: "release_started", key: `release-start:${release.id}`, userId: release.user_id, createdAt: release.created_at, strict: true, properties: { release_id: release.id } });
      if (previous >= 1) await recordGrowthEvent({ event: "second_release_started", key: `second-release:${release.user_id}`, userId: release.user_id, createdAt: release.created_at, strict: true });
      if (previous >= 2) await recordGrowthEvent({ event: "third_release_started", key: `third-release:${release.user_id}`, userId: release.user_id, createdAt: release.created_at, strict: true });
      await recordGrowthEvent({ event: "release_observation_completed", key: `release-observed:${release.id}`, userId: release.user_id, createdAt: release.created_at, strict: true });
      processed++;
    }
    const transitions = await prisma.$queryRaw<Array<{ id: number; release_id: number; user_id: number; new_status: string; created_at: Date }>>`
      SELECT t.id, t.release_id, r.user_id, t.new_status, t.created_at FROM release_status_transitions t JOIN releases r ON r.id = t.release_id
      WHERE t.created_at >= ${start} AND r.release_source = 'CUSTOMER_SUBMISSION'
      AND NOT EXISTS (SELECT 1 FROM growth_events e WHERE e.key = 'transition-observed:' || t.id)
      ORDER BY t.id LIMIT 50`;
    for (const transition of transitions) {
      if (Date.now() >= deadline) break;
      const event = ({ SUBMITTED: "release_submitted", UNDER_REVIEW: "release_submitted", APPROVED: "release_approved", DELIVERED: "release_delivered", LIVE: "release_live" } as Record<string, string>)[transition.new_status];
      if (event === "release_live") await queueGrowthNudges(transition.user_id, transition.release_id, transition.created_at);
      if (event) await recordGrowthEvent({ event, key: event === "release_submitted" ? `release-submit:${transition.release_id}` : `${event}:${transition.release_id}`, userId: transition.user_id, createdAt: transition.created_at, strict: true, properties: { release_id: transition.release_id } });
      await recordGrowthEvent({ event: "transition_observation_completed", key: `transition-observed:${transition.id}`, userId: transition.user_id, createdAt: transition.created_at, strict: true });
      processed++;
    }
    const payments = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT p.id FROM subscription_payments p WHERE p.created_at >= ${start} AND p.status = 'captured'
      AND NOT EXISTS (SELECT 1 FROM growth_events e WHERE e.key = 'subscription-observed:' || p.id) ORDER BY p.id LIMIT 50`;
    for (const row of payments) {
      if (Date.now() >= deadline) break;
      const payment = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { id: row.id }, include: { subscription: true } });
      await qualifyRecurringReferral(payment.id); await qualifyPartnerPayment(payment.id);
      if (payment.amount > 0) {
        await recordGrowthEvent({ event: "payment_success", key: `subscription-payment:${payment.id}`, userId: payment.subscription.userId, createdAt: payment.createdAt, strict: true, properties: { amount_cents: payment.amount, currency: payment.currency, plan_id: payment.subscription.plan } });
        const previous = await prisma.subscriptionPayment.count({ where: { subscriptionId: payment.subscriptionId, status: "captured", id: { lt: payment.id } } });
        await recordGrowthEvent({ event: previous ? "plan_renewed" : "plan_purchased", key: `subscription-conversion:${payment.id}`, userId: payment.subscription.userId, createdAt: payment.createdAt, strict: true, properties: { plan_id: payment.subscription.plan } });
      }
      await recordGrowthEvent({ event: "subscription_observation_completed", key: `subscription-observed:${payment.id}`, userId: payment.subscription.userId, strict: true }); processed++;
    }
    const orders = await prisma.$queryRaw<Array<{ id: number; user_id: number; amount: number; currency: string; plan: string; created_at: Date }>>`
      SELECT o.id, o.user_id, o.amount, o.currency, o.plan, o.created_at FROM distribution_orders o
      WHERE o.created_at >= ${start} AND o.payment_status = 'paid' AND o.amount > 0 AND o.razorpay_payment_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM growth_events e WHERE e.key = 'distribution-payment:' || o.id) ORDER BY o.id LIMIT 50`;
    for (const order of orders) {
      if (Date.now() >= deadline) break;
      await recordGrowthEvent({ event: "payment_success", key: `distribution-payment:${order.id}`, userId: order.user_id, createdAt: order.created_at, strict: true, properties: { amount_cents: order.amount * 100, currency: order.currency, plan_id: order.plan } }); processed++;
    }
    await deliverGrowthNudges(deadline);
    await prisma.auditLog.create({ data: { actorType: "system", action: "GROWTH_SYNC_COMPLETED", entity: "growth_sync", entityId: "scheduled", metadata: { processed, budgetReached: Date.now() >= deadline } } });
    return NextResponse.json({ processed, budgetReached: Date.now() >= deadline });
  } catch { console.error(JSON.stringify({ scope: "growth", event: "sync", status: "failed", processed })); return NextResponse.json({ error: "Growth sync failed; safe to retry.", processed }, { status: 503 }); }
}
