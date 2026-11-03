import { PrismaClient } from '@prisma/client';

// Read-only financial consistency report. No names, payment tokens, account
// destinations or credentials are included in the output.
const prisma = new PrismaClient({ log: [] });
async function main() {
  const url = new URL(process.env.DATABASE_URL || '');
  const local = ['127.0.0.1', 'localhost'].includes(url.hostname);
  if (!local && (!process.argv.includes('--production-read-only') || url.hostname !== process.env.EXPECTED_DATABASE_HOST || url.pathname.slice(1) !== process.env.EXPECTED_DATABASE_NAME)) throw Error('Explicit read-only mode and the configured database identity are required.');
  const report = await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const rows = await tx.$queryRaw<Array<{ check: string; count: bigint }>>`
      WITH refunds AS (
        SELECT payment_id, payload_redacted->'entity'->>'id' AS refund_id, MAX(amount_minor) AS amount
        FROM payment_webhook_events WHERE signature_valid AND event_type = 'refund.processed'
          AND amount_minor >= 0 AND payload_redacted->'entity'->>'id' IS NOT NULL
        GROUP BY payment_id, payload_redacted->'entity'->>'id'
      ), refunded AS (SELECT payment_id, SUM(amount) AS amount FROM refunds GROUP BY payment_id)
      SELECT 'negative_commission_amounts' AS check, COUNT(*) AS count FROM referral_commissions WHERE net_minor < 0 OR original_minor < 0 OR paid_minor <= 0
      UNION ALL SELECT 'duplicate_beneficiary_payment_allocations', COUNT(*) FROM (SELECT payment_id, referral_id FROM referral_commissions GROUP BY payment_id, referral_id HAVING COUNT(*) > 1) d
      UNION ALL SELECT 'fully_refunded_commissions_not_reversed', COUNT(*) FROM referral_commissions c JOIN refunded r ON r.payment_id = c.payment_id WHERE r.amount >= c.paid_minor AND c.net_minor > 0 AND c.status <> 'EXCLUDED'
      UNION ALL SELECT 'cached_available_with_unreconciled_evidence', COUNT(*) FROM referral_commissions c LEFT JOIN acquisition_revenue_evidence e ON e.payment_id = c.payment_id WHERE c.policy_version >= 2 AND c.status = 'AVAILABLE' AND (e.status IS DISTINCT FROM 'RECONCILED' OR e.eligible_net_revenue_minor IS DISTINCT FROM c.eligible_net_revenue_minor)
      UNION ALL SELECT 'cumulative_full_refunds_with_stale_order_status', COUNT(*) FROM (
        SELECT d.id FROM distribution_orders d JOIN refunded r ON r.payment_id = d.razorpay_payment_id WHERE r.amount >= d.amount * 100::bigint AND d.amount > 0 AND d.payment_status NOT IN ('refunded', 'charged_back')
        UNION ALL SELECT c.id FROM checkout_orders c JOIN refunded r ON r.payment_id = c.razorpay_payment_id WHERE r.amount >= c.final_amount * 100 AND c.final_amount > 0 AND c.payment_status NOT IN ('refunded', 'charged_back')
      ) stale
      UNION ALL SELECT 'multiple_pending_referral_payouts', COUNT(*) FROM (SELECT user_id FROM referral_commission_payouts WHERE status = 'REQUESTED' GROUP BY user_id HAVING COUNT(*) > 1) d
      UNION ALL SELECT 'invalid_payout_records', COUNT(*) FROM referral_commission_payouts WHERE amount_minor <= 0 OR (status = 'PAID' AND (payment_reference IS NULL OR TRIM(payment_reference) = '' OR paid_at IS NULL))
    `;
    return Object.fromEntries(rows.map(row => [row.check, Number(row.count)]));
  }, { timeout: 20000 });
  console.log(JSON.stringify({ mode: 'read-only', findings: report }, null, 2));
  if (Object.values(report).some(n => n > 0)) process.exitCode = 2;
}
main().catch(() => { console.error('Read-only financial inspection failed. Check database access and expected identity.'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
