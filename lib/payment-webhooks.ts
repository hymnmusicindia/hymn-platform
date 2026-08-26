import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { completeCheckoutOrder } from "@/lib/db";
import { qualifyReferralInTransaction, reverseReferralForTransactionInTransaction, sendReferralRewardEmails } from "@/lib/referrals";
import { synchronizeProviderSubscription, synchronizeSubscriptionPayment } from "@/lib/subscription-billing";

type RazorpayEntity = { id?: string; order_id?: string; payment_id?: string; subscription_id?: string; invoice_id?: string; plan_id?: string; amount?: number; currency?: string; status?: string; error_code?: string; error_description?: string; current_start?: number | null; current_end?: number | null; start_at?: number | null; ended_at?: number | null; charge_at?: number | null; created_at?: number; notes?: Record<string, unknown> };
type RazorpayPayload = { event?: string; id?: string; payload?: { payment?: { entity?: RazorpayEntity }; order?: { entity?: RazorpayEntity }; refund?: { entity?: RazorpayEntity }; subscription?: { entity?: RazorpayEntity } } };

export function validateObservedPayment(expected: { amountMinor: number; currency: string }, observed: { amountMinor?: number; currency?: string }) {
  if (observed.currency && observed.currency.toUpperCase() !== expected.currency.toUpperCase()) throw new Error("Payment currency does not match the persisted order.");
  if (observed.amountMinor !== undefined && observed.amountMinor !== expected.amountMinor) throw new Error("Payment amount does not match the persisted order.");
}

export function redactRazorpayPayload(payload: RazorpayPayload): Prisma.InputJsonObject {
  const entity = payload.payload?.payment?.entity ?? payload.payload?.order?.entity ?? payload.payload?.refund?.entity ?? {};
  const subscription = payload.payload?.subscription?.entity;
  const payment = payload.payload?.payment?.entity;
  return { event: payload.event ?? "unknown", entity: { id: entity.id ?? null, order_id: entity.order_id ?? null, amount: entity.amount ?? null, currency: entity.currency ?? null, status: entity.status ?? null, error_code: entity.error_code ?? null }, subscription: subscription ? { id: subscription.id ?? null, plan_id: subscription.plan_id ?? null, status: subscription.status ?? null, current_start: subscription.current_start ?? null, current_end: subscription.current_end ?? null, start_at: subscription.start_at ?? null, ended_at: subscription.ended_at ?? null, charge_at: subscription.charge_at ?? null } : null, payment: payment ? { id: payment.id ?? null, invoice_id: payment.invoice_id ?? null, amount: payment.amount ?? null, currency: payment.currency ?? null, status: payment.status ?? null, created_at: payment.created_at ?? null } : null };
}

export async function receiveRazorpayEvent(rawBody: Buffer, payload: RazorpayPayload) {
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const entity = payload.payload?.payment?.entity ?? payload.payload?.order?.entity ?? payload.payload?.refund?.entity ?? {};
  const subscriptionEntity = payload.payload?.subscription?.entity;
  const razorpaySubscriptionId = subscriptionEntity?.id ?? payload.payload?.payment?.entity?.subscription_id ?? null;
  const razorpayOrderId = entity.order_id ?? (payload.payload?.order?.entity?.id || null);
  const existing = await prisma.paymentWebhookEvent.findFirst({ where: { OR: [{ payloadHash }, ...(payload.id ? [{ providerEventId: payload.id }] : [])] } });
  if (existing) return existing;
  try {
    return await prisma.paymentWebhookEvent.create({ data: { providerEventId: payload.id || null, eventType: payload.event || "unknown", payloadHash, signatureValid: true, razorpayOrderId, razorpaySubscriptionId, paymentId: payload.payload?.payment?.entity?.id ?? payload.payload?.refund?.entity?.payment_id ?? null, amountMinor: entity.amount ?? null, currency: entity.currency?.toUpperCase() ?? null, payloadRedacted: redactRazorpayPayload(payload) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.paymentWebhookEvent.findFirstOrThrow({ where: { OR: [{ payloadHash }, ...(payload.id ? [{ providerEventId: payload.id }] : [])] } });
    }
    throw error;
  }
}

export async function processRazorpayEvent(eventId: number) {
  try {
    const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: eventId } });
    if (event.processingState === "processed") return event;
    const claim = await prisma.paymentWebhookEvent.updateMany({ where: { id: event.id, processingState: { in: ["received", "failed"] } }, data: { processingState: "processing" } });
    if (claim.count !== 1) return event;
    if (event.eventType.startsWith("subscription.")) {
      const snapshot = (event.payloadRedacted || {}) as Record<string, any>;
      if (!snapshot.subscription?.id || snapshot.subscription.id !== event.razorpaySubscriptionId) throw new Error("Subscription webhook does not identify a persisted provider subscription.");
      await synchronizeProviderSubscription(snapshot.subscription, snapshot.payment);
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date(), errorCode: null, errorMessage: null } });
    }
    if (event.razorpaySubscriptionId && ["payment.captured", "payment.failed"].includes(event.eventType)) {
      const snapshot = (event.payloadRedacted || {}) as Record<string, any>;
      if (!snapshot.payment?.id) throw new Error("Subscription payment webhook does not identify a payment.");
      await synchronizeSubscriptionPayment(event.razorpaySubscriptionId, snapshot.payment);
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date(), errorCode: null, errorMessage: null } });
    }
    const nonFulfilmentStates: Record<string, string> = {
      "payment.authorized": "authorized",
      "payment.failed": "failed",
      "refund.created": "refund_pending",
      "refund.processed": "refunded",
      "payment.dispute.created": "disputed",
      "payment.dispute.won": "paid",
      "payment.dispute.lost": "charged_back"
    };
    let resolvedOrderId = event.razorpayOrderId;
    if (!resolvedOrderId && event.paymentId) {
      const [distribution, checkout] = await Promise.all([
        prisma.distributionOrder.findUnique({ where: { razorpayPaymentId: event.paymentId }, select: { razorpayOrderId: true } }),
        prisma.checkoutOrder.findUnique({ where: { razorpayPaymentId: event.paymentId }, select: { razorpayOrderId: true } })
      ]);
      if (distribution && checkout) throw new Error("Ambiguous persisted Razorpay payment identifier.");
      resolvedOrderId = distribution?.razorpayOrderId ?? checkout?.razorpayOrderId ?? null;
    }
    if (event.eventType in nonFulfilmentStates) {
      if (resolvedOrderId) await applyPaymentState({ razorpayOrderId: resolvedOrderId, paymentId: event.paymentId, state: nonFulfilmentStates[event.eventType], eventId: event.id, amountMinor: event.amountMinor });
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date() } });
    }
    if (!["payment.captured", "order.paid"].includes(event.eventType)) {
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date() } });
    }
    if (!resolvedOrderId) throw new Error("Webhook does not identify an order.");
    if (!event.paymentId) throw new Error("Webhook does not identify a payment.");
    const result = await confirmPersistedPayment({ razorpayOrderId: resolvedOrderId, paymentId: event.paymentId, amountMinor: event.amountMinor ?? undefined, currency: event.currency ?? undefined, source: "webhook" });
    return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { distributionOrderId: result.kind === "distribution" ? result.order.id : null, checkoutOrderId: result.kind === "checkout" ? result.order.id : null, attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date(), errorCode: null, errorMessage: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Webhook processing failed.";
    await prisma.paymentWebhookEvent.update({ where: { id: eventId }, data: { processingState: "failed", attemptCount: { increment: 1 }, errorCode: "PROCESSING_FAILED", errorMessage: message.slice(0, 500) } });
    throw error;
  }
}

export async function confirmDistributionPayment(input: { razorpayOrderId: string; paymentId: string; userId?: number; amountMinor?: number; currency?: string; source: "browser" | "webhook" | "reconciliation" | "admin_replay" }) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.distributionOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
    if (!order) throw new Error("Persisted HYMN order was not found.");
    if (input.userId !== undefined && order.userId !== input.userId) throw new Error("Order does not belong to the authenticated user.");
    validateObservedPayment({ amountMinor: order.amount * 100, currency: order.currency }, input);
    const alreadyPaid = order.paymentStatus === "paid";
    if (alreadyPaid && order.razorpayPaymentId && order.razorpayPaymentId !== input.paymentId) throw new Error("Order was already paid with a different payment.");
    if (!alreadyPaid && !["created", "authorized"].includes(order.paymentStatus)) throw new Error(`Order cannot be fulfilled from ${order.paymentStatus}.`);
    const updated = alreadyPaid ? order : await tx.distributionOrder.update({ where: { id: order.id }, data: { paymentStatus: "paid", razorpayPaymentId: input.paymentId, fulfilledAt: new Date() } });
    if (!alreadyPaid) await tx.auditLog.create({ data: { actorId: input.userId ?? null, action: "DISTRIBUTION_PAYMENT_CONFIRMED", entity: "distribution_order", entityId: String(order.id), metadata: { source: input.source, paymentId: input.paymentId } } });
    const qualification = !alreadyPaid ? await qualifyReferralInTransaction(tx, { referredUserId: order.userId, transactionType: "distribution_order", transactionId: order.id, paymentId: input.paymentId, paidAmountInr: order.amount, source: input.source }) : { qualified: false as const, reason: "already_paid" as const };
    return { updated, qualification };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  if (result.qualification.qualified) await sendReferralRewardEmails(result.qualification.referralId).catch(() => undefined);
  return result.updated;
}

export async function confirmCheckoutPayment(input: { razorpayOrderId: string; paymentId: string; userId?: number; amountMinor?: number; currency?: string; source: "browser" | "webhook" | "reconciliation" | "admin_replay" }) {
  const persisted = await prisma.checkoutOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
  if (!persisted) throw new Error("Persisted HYMN checkout order was not found.");
  if (input.userId !== undefined && persisted.userId !== input.userId) throw new Error("Order does not belong to the authenticated user.");
  validateObservedPayment({ amountMinor: Number(persisted.finalAmount.mul(100)), currency: persisted.currency }, input);
  const order = await completeCheckoutOrder(input.razorpayOrderId, input.paymentId);
  if (!order) throw new Error("Checkout fulfilment did not return an order.");
  if (persisted.paymentStatus !== "paid") await prisma.auditLog.create({ data: { actorId: input.userId ?? null, action: "CHECKOUT_PAYMENT_CONFIRMED", entity: "checkout_order", entityId: String(order.id), metadata: { source: input.source, paymentId: input.paymentId } } });
  const purchases = await prisma.beatPurchase.findMany({ where: { userId: order.userId, paymentId: input.paymentId, licenseUrl: null } });
  if (purchases.length) {
    const { generateBeatLicense } = await import("@/lib/beat-license");
    for (const purchase of purchases) await generateBeatLicense(purchase.id, order.userId).catch(() => null);
  }
  return order;
}

export async function confirmPersistedPayment(input: { razorpayOrderId: string; paymentId: string; userId?: number; amountMinor?: number; currency?: string; source: "browser" | "webhook" | "reconciliation" | "admin_replay" }) {
  const [distribution, checkout] = await Promise.all([
    prisma.distributionOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, select: { id: true } }),
    prisma.checkoutOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, select: { id: true } })
  ]);
  if (distribution && checkout) throw new Error("Ambiguous persisted Razorpay order identifier.");
  if (distribution) return { kind: "distribution" as const, order: await confirmDistributionPayment(input) };
  if (checkout) return { kind: "checkout" as const, order: await confirmCheckoutPayment(input) };
  throw new Error("Persisted HYMN order was not found.");
}

async function applyPaymentState(input: { razorpayOrderId: string; paymentId: string | null; state: string; eventId: number; amountMinor: number | null }) {
  await prisma.$transaction(async tx => {
    const distribution = await tx.distributionOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
    const checkout = await tx.checkoutOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, include: { items: true } });
    if (distribution && checkout) throw new Error("Ambiguous persisted Razorpay order identifier.");
    if (distribution) {
      await tx.distributionOrder.update({ where: { id: distribution.id }, data: { paymentStatus: input.state } });
      if (["refunded", "charged_back"].includes(input.state) && distribution.plan !== "one_time") await tx.subscription.updateMany({ where: { userId: distribution.userId, status: "active" }, data: { status: "cancelled" } });
      if (["refunded", "charged_back"].includes(input.state)) await reverseReferralForTransactionInTransaction(tx, { transactionType: "distribution_order", transactionId: distribution.id, reason: input.state as "refunded" | "charged_back" });
      await tx.auditLog.create({ data: { action: `RAZORPAY_${input.state.toUpperCase()}`, entity: "distribution_order", entityId: String(distribution.id), metadata: { eventId: input.eventId, paymentId: input.paymentId } } });
      return;
    }
    if (!checkout) return;
    if (input.state === "failed") {
      for (const item of checkout.items.filter((entry) => entry.licenseType === "exclusive")) {
        await tx.beat.updateMany({ where: { id: item.beatId, status: "EXCLUSIVE_RESERVED", exclusiveReservationOrderId: checkout.razorpayOrderId }, data: { status: "PUBLISHED", exclusiveReservedByUserId: null, exclusiveReservationOrderId: null, exclusiveReservationExpiresAt: null } });
      }
    }
    const fullAmountMinor = Number(checkout.finalAmount.mul(100));
    const isFullReversal = ["refunded", "charged_back"].includes(input.state) && (input.amountMinor == null || input.amountMinor === fullAmountMinor);
    const state = ["refunded", "charged_back"].includes(input.state) && !isFullReversal ? "partial_refund_review" : input.state;
    await tx.checkoutOrder.update({ where: { id: checkout.id }, data: { paymentStatus: state } });
    if (isFullReversal && input.paymentId) {
      await reverseReferralForTransactionInTransaction(tx, { transactionType: "checkout_order", transactionId: checkout.id, reason: state as "refunded" | "charged_back" });
      await tx.beatPurchase.updateMany({ where: { paymentId: input.paymentId }, data: { hasAccess: false } });
      const sales = await tx.beatSale.findMany({ where: { paymentId: input.paymentId, status: "paid" } });
      for (const sale of sales) {
        const idempotencyKey = `beat-sale:${sale.id}:reversal:${state}`;
        if (await tx.walletTransaction.findUnique({ where: { idempotencyKey } })) continue;
        const latest = await tx.walletTransaction.findFirst({ where: { userId: sale.producerUserId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
        const amount = new Prisma.Decimal(sale.producerEarningAmount);
        await tx.walletTransaction.create({ data: { userId: sale.producerUserId, type: "beat_sale_reversal", amount, direction: "debit", referenceType: "beat_sale", referenceId: String(sale.id), idempotencyKey, balanceAfter: new Prisma.Decimal(latest?.balanceAfter ?? 0).sub(amount), note: `Compensating entry for ${state}.` } });
        await tx.artistPayoutBalance.updateMany({ where: { userId: sale.producerUserId }, data: { availableBalance: { decrement: amount }, lifetimeEarnings: { decrement: amount } } });
        await tx.beatSale.update({ where: { id: sale.id }, data: { status: state, refundedAmount: sale.netSaleAmount } });
      }
    }
    await tx.auditLog.create({ data: { action: `RAZORPAY_${state.toUpperCase()}`, entity: "checkout_order", entityId: String(checkout.id), metadata: { eventId: input.eventId, paymentId: input.paymentId, amountMinor: input.amountMinor } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
// vercel trigger 9
