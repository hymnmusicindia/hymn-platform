import { prisma } from "@/lib/prisma";
import { qualifyRecurringReferral } from "@/lib/referral-reward-policy";
import { accrueReferralCommission, refreshReferralCommission, type CommissionSource } from "@/lib/referral-commissions";

// Reward qualification is financial workflow, independent of analytics opt-in.
// Approval remains an explicit administrative action.
export async function reconcileReferralQualifications(deadline = Date.now() + 40000) {
  const program = await prisma.referralProgram.findUnique({ where: { id: 1 } });
  let commissions = 0;
  if (program) {
    const missing = await prisma.$queryRaw<Array<{ id: number; source: CommissionSource }>>`
      WITH candidates AS (
        SELECT d.id, 'distribution_order' AS source, d.razorpay_payment_id AS payment_id, d.created_at, d.user_id FROM distribution_orders d WHERE d.payment_status = 'paid' AND d.amount > 0 AND d.currency = 'INR' AND d.razorpay_order_id LIKE 'order_%' AND d.plan IN ('one_time','half_yearly','yearly','yearly_plus')
        UNION ALL SELECT c.id, 'checkout_order', c.razorpay_payment_id, c.created_at, c.user_id FROM checkout_orders c WHERE c.payment_status = 'paid' AND c.final_amount > 0 AND c.currency = 'INR'
        UNION ALL SELECT p.id, 'subscription_payment', p.razorpay_payment_id, p.created_at, sub.user_id FROM subscription_payments p JOIN subscriptions sub ON sub.id = p.subscription_id WHERE p.status = 'captured' AND p.amount > 0 AND p.currency = 'INR' AND COALESCE(p.plan_snapshot, sub.plan) IN ('half_yearly','yearly','yearly_plus')
        UNION ALL SELECT s.id, 'studio_payment', s.razorpay_payment_id, s.created_at, so.customer_id AS user_id FROM studio_payments s JOIN studio_service_orders so ON so.id = s.order_id WHERE s.status = 'CAPTURED' AND s.amount > 0 AND s.currency = 'INR'
      ) SELECT c.id, c.source FROM candidates c JOIN referrals ref ON ref.referred_user_id = c.user_id JOIN users owner ON owner.id = ref.user_id JOIN users buyer ON buyer.id = c.user_id WHERE owner.status = 'ACTIVE' AND buyer.status = 'ACTIVE' AND ref.user_id <> c.user_id AND ref.status <> 'REJECTED' AND c.created_at >= ref.created_at AND c.created_at >= ${program.effectiveAt}
      AND c.payment_id LIKE 'pay_%' AND NOT EXISTS (SELECT 1 FROM referral_commissions r WHERE r.payment_id = c.payment_id)
      ORDER BY c.created_at, c.id LIMIT 100`;
    for (const row of missing) { if (Date.now() >= deadline) break; await prisma.$transaction(tx => accrueReferralCommission(tx, row.source, row.id), { timeout: 20000 }); commissions++; }
    const due = await prisma.referralCommission.findMany({ where: { OR: [{ status: { in: ["PENDING", "HELD"] }, eligibleAt: { lte: new Date() } }, { status: "AVAILABLE", referral: { OR: [{ riskStatus: { not: "clear" } }, { status: "REJECTED" }, { owner: { status: { not: "ACTIVE" } } }, { referredUser: { status: { not: "ACTIVE" } } }] } }] }, orderBy: { updatedAt: "asc" }, take: 100 });
    for (const row of due) { if (Date.now() >= deadline) break; await prisma.$transaction(tx => refreshReferralCommission(tx, row.paymentId)); }
  }
  const payments = await prisma.$queryRaw<Array<{ id: number }>>`SELECT p.id FROM subscription_payments p
    JOIN subscriptions s ON s.id = p.subscription_id JOIN referrals r ON r.referred_user_id = s.user_id
    WHERE r.status = 'PENDING' AND r.reward_policy IS NOT NULL AND r.qualifying_transaction_id IS NULL
    AND COALESCE(r.reward_policy->'plans', '[]'::jsonb) ? s.plan
    AND NOT EXISTS (SELECT 1 FROM payment_webhook_events e WHERE e.payment_id = p.razorpay_payment_id AND e.signature_valid = true AND e.event_type IN ('refund.created','refund.processed','payment.dispute.created','payment.dispute.lost'))
    AND p.status = 'captured' AND p.amount > 0 AND p.currency = 'INR' AND p.created_at >= r.created_at
    ORDER BY p.id LIMIT 100`;
  let checked = 0;
  for (const payment of payments) { if (Date.now() >= deadline) break; await qualifyRecurringReferral(payment.id); checked++; }
  return { checked, commissions, budgetReached: Date.now() >= deadline };
}
