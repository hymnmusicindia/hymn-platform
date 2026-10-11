import { prisma } from "@/lib/prisma";
import { qualifyRecurringReferral } from "@/lib/referral-reward-policy";

// Reward qualification is financial workflow, independent of analytics opt-in.
// Approval remains an explicit administrative action.
export async function reconcileReferralQualifications(deadline = Date.now() + 40000) {
  const payments = await prisma.$queryRaw<Array<{ id: number }>>`SELECT p.id FROM subscription_payments p
    JOIN subscriptions s ON s.id = p.subscription_id JOIN referrals r ON r.referred_user_id = s.user_id
    WHERE r.status = 'PENDING' AND r.reward_policy IS NOT NULL AND r.qualifying_transaction_id IS NULL
    AND COALESCE(r.reward_policy->'plans', '[]'::jsonb) ? s.plan
    AND NOT EXISTS (SELECT 1 FROM payment_webhook_events e WHERE e.payment_id = p.razorpay_payment_id AND e.signature_valid = true AND e.event_type IN ('refund.created','refund.processed','payment.dispute.created','payment.dispute.lost'))
    AND p.status = 'captured' AND p.amount > 0 AND p.currency = 'INR' AND p.created_at >= r.created_at
    ORDER BY p.id LIMIT 100`;
  let checked = 0;
  for (const payment of payments) { if (Date.now() >= deadline) break; await qualifyRecurringReferral(payment.id); checked++; }
  return { checked, budgetReached: Date.now() >= deadline };
}
