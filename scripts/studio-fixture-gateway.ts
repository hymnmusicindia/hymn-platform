import assert from "node:assert/strict";
import type { StudioGateway } from "../lib/studio-payment-recovery";
import { prisma } from "../lib/prisma";

export function studioFixtureGateway(): StudioGateway {
  assert.match(process.env.DATABASE_URL || "", /127\.0\.0\.1:\d+\/studio_fixture/);
  return {
    payments: async orderId => {
      const row = await prisma.studioPayment.findUniqueOrThrow({ where: { razorpayOrderId: orderId } });
      return row.razorpayPaymentId ? [{ id: row.razorpayPaymentId, order_id: orderId, status: "captured", amount: Number(row.amount.mul(100)), currency: row.currency, amount_refunded: Number(row.refundedAmount.mul(100)) }] : [];
    },
    refunds: async paymentId => {
      const rows = await prisma.studioRefund.findMany({ where: { payment: { razorpayPaymentId: paymentId }, providerRefundId: { not: null } } });
      return rows.map(row => ({ id: row.providerRefundId!, payment_id: paymentId, amount: row.amountMinor, currency: row.currency, status: row.status.toLowerCase(), notes: { hymnStudioRefundKey: row.id } }));
    },
    refund: async (paymentId, amount, intentId) => ({ id: `fixture-${intentId}`, payment_id: paymentId, amount, currency: "INR", status: "processed", notes: { hymnStudioRefundKey: intentId } }),
  };
}
