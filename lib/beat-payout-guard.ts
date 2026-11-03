import type { Prisma } from '@prisma/client';

// A partial refund is not a fully reversed sale. Keep its original ledger and
// block withdrawals while the retained seller share needs financial review.
export async function assertBeatPayoutClear(tx: Prisma.TransactionClient, userId: number) {
  const rows = await tx.$queryRaw<Array<{ blocked: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM beat_sales sale JOIN checkout_orders orders ON orders.id = sale.order_id
      WHERE sale.producer_user_id = ${userId} AND sale.status = 'paid' AND (
        orders.payment_status IN ('refund_pending', 'partial_refund_review', 'disputed')
        OR EXISTS (
          SELECT 1 FROM payment_webhook_events event WHERE event.payment_id = sale.payment_id
            AND event.signature_valid AND event.processing_state <> 'processed'
            AND event.event_type IN ('refund.created', 'refund.processed', 'payment.dispute.created', 'payment.dispute.lost')
        )
      )
    ) AS blocked`;
  if (rows[0]?.blocked) throw Error('Resolve Beat Store refund or dispute review before releasing payouts or Route transfers.');
}
