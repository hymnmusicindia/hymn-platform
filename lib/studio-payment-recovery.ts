import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordStudioRefund, type RefundObservation } from "@/lib/studio-refunds";

type ProviderPayment = { id: string; order_id: string; status: string; amount: number; currency: string; amount_refunded?: number };
export type StudioGateway = {
  payments(orderId: string): Promise<ProviderPayment[]>;
  refunds(paymentId: string): Promise<RefundObservation[]>;
  refund(paymentId: string, amountMinor: number, intentId: string, publicId: string): Promise<RefundObservation>;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(`https://api.razorpay.com/v1/${path}`, { ...init, headers: { Authorization: `Basic ${Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64")}`, "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(8000), cache: "no-store" });
  if (!response.ok) throw new Error(`Studio provider request failed (${response.status}); no financial outcome is assumed.`);
  return response.json();
}

export function studioGateway(): StudioGateway | null {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return {
    payments: async orderId => (await request(`orders/${encodeURIComponent(orderId)}/payments`)).items,
    refunds: async paymentId => {
      const result: RefundObservation[] = [];
      for (let skip = 0; skip < 1000; skip += 100) {
        const page = await request(`payments/${encodeURIComponent(paymentId)}/refunds?count=100&skip=${skip}`);
        if (!Array.isArray(page.items)) throw new Error("Invalid refund provider response.");
        result.push(...page.items);
        if (page.items.length < 100) return result;
      }
      throw new Error("Refund history exceeds the reconciliation window; manual review required.");
    },
    refund: (paymentId, amountMinor, intentId, publicId) => request(`payments/${encodeURIComponent(paymentId)}/refund`, { method: "POST", headers: { "X-Refund-Idempotency": `hymn-studio-${intentId}` }, body: JSON.stringify({ amount: amountMinor, notes: { studioOrderId: publicId, hymnStudioRefundKey: intentId } }) }),
  };
}

// A missing response never means a failed payment/refund. Persist the request
// before contacting the provider and use the same request body/key on retries.
export async function recoverStudioPayments(deadline: number, gateway = studioGateway()) {
  if (!gateway) return { checked: 0, repaired: 0, issues: ["Studio provider reconciliation is not configured."] };
  const candidates = await prisma.studioPayment.findMany({ where: { status: { in: ["CREATED", "AUTHORIZED", "FAILED", "CAPTURED", "REFUND_PENDING", "DISPUTED", "REFUNDED"] } }, orderBy: [{ reconciledAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: 20 });
  let checked = 0, repaired = 0;
  const issues: string[] = [];
  for (const payment of candidates) {
    if (Date.now() >= deadline) break;
    try {
      const payments = await gateway.payments(payment.razorpayOrderId);
      const captured = payments.filter(p => ["captured", "refunded"].includes(p.status));
      if (captured.length > 1) throw new Error("Multiple captured payments require manual review.");
      const observed = captured[0];
      if (observed) {
        if (observed.order_id !== payment.razorpayOrderId || observed.amount !== Number(payment.amount.mul(100)) || observed.currency !== payment.currency || payment.razorpayPaymentId && payment.razorpayPaymentId !== observed.id) throw new Error("Provider payment identity, amount or currency mismatch.");
        if (!payment.capturedAt) {
          const { confirmStudioPayment } = await import("@/lib/studio-services");
          await confirmStudioPayment({ razorpayOrderId: payment.razorpayOrderId, paymentId: observed.id, amountMinor: observed.amount, currency: observed.currency, source: "webhook" });
          repaired++;
        }
        for (const refund of await gateway.refunds(observed.id)) await recordStudioRefund(payment.id, refund);
        const latest = await prisma.studioPayment.findUniqueOrThrow({ where: { id: payment.id } });
        if (observed.amount_refunded !== undefined && observed.amount_refunded !== Number(latest.refundedAmount.mul(100))) throw new Error("Provider refund total differs from the verified refund ledger.");
        const events = await prisma.paymentWebhookEvent.findMany({ where: { paymentId: observed.id, signatureValid: true, processingState: { in: ["received", "failed"] } }, orderBy: { id: "asc" }, take: 10 });
        if (events.length) {
          const { processRazorpayEvent } = await import("@/lib/payment-webhooks");
          for (const event of events) { if (Date.now() >= deadline) break; await processRazorpayEvent(event.id); }
        }
      } else if (payment.capturedAt) throw new Error("Previously captured payment is absent from provider history.");
      await prisma.adminTask.updateMany({ where: { eventKey: `studio-recovery:${payment.id}`, status: { not: "resolved" } }, data: { status: "resolved", resolvedAt: new Date() } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Studio reconciliation requires review.";
      issues.push(`Payment #${payment.id}: ${message}`);
      await prisma.adminTask.upsert({ where: { eventKey: `studio-recovery:${payment.id}` }, create: { eventKey: `studio-recovery:${payment.id}`, type: "Payment Mismatch", priority: "critical", title: "Studio payment recovery needs review", body: message, href: "/admin/studio/orders", entityType: "studio_order", entityId: String(payment.orderId) }, update: { body: message, status: "open", resolvedAt: null } });
    } finally {
      await prisma.studioPayment.update({ where: { id: payment.id }, data: { reconciledAt: new Date() } });
      checked++;
    }
  }
  return { checked, repaired, issues };
}

export async function processStudioRefunds(deadline: number, gateway = studioGateway()) {
  if (!gateway) return 0;
  const orders = await prisma.studioServiceOrder.findMany({ where: { status: "REFUND_PENDING" }, include: { payments: { where: { capturedAt: { not: null }, status: { not: "REFUNDED" } } } }, take: 20 });
  let refunded = 0;
  for (const order of orders) for (const payment of order.payments) {
    if (Date.now() >= deadline) return refunded;
    if (!payment.razorpayPaymentId) continue;
    try {
      for (const observed of await gateway.refunds(payment.razorpayPaymentId)) await recordStudioRefund(payment.id, observed);
      const intent = await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.publicId}))`;
        const fresh = await tx.studioPayment.findUniqueOrThrow({ where: { id: payment.id }, include: { refunds: true, order: true } });
        if (fresh.order.status !== "REFUND_PENDING") return null;
        const existing = fresh.refunds.find(r => r.status === "REQUESTED" && !r.providerRefundId);
        if (existing) return existing;
        if (fresh.refunds.some(r => r.status === "FAILED")) return null;
        const reserved = fresh.refunds.filter(r => ["REQUESTED", "PENDING", "PROCESSED"].includes(r.status)).reduce((sum, r) => sum + r.amountMinor, 0);
        const remaining = Number(fresh.amount.mul(100)) - reserved;
        if (remaining <= 0) return null;
        return tx.studioRefund.create({ data: { paymentId: fresh.id, amountMinor: remaining, currency: fresh.currency } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
      if (!intent) continue;
      const observed = await gateway.refund(payment.razorpayPaymentId, intent.amountMinor, intent.id, order.publicId);
      await recordStudioRefund(payment.id, { ...observed, notes: { hymnStudioRefundKey: intent.id } });
      if (observed.status === "processed") refunded++;
    } catch {
      await prisma.adminTask.upsert({ where: { eventKey: `studio-finance:${order.id}` }, create: { eventKey: `studio-finance:${order.id}`, type: "Payment Mismatch", priority: "critical", title: "Studio refund needs review", body: "Refund confirmation is unavailable. The durable request will be retried with the same provider key; do not issue a separate refund.", href: `/admin/studio/orders/${order.publicId}`, entityType: "studio_order", entityId: String(order.id) }, update: { status: "open", resolvedAt: null } });
    }
  }
  return refunded;
}
