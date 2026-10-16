import { accrueReferralCommission, refreshReferralCommission } from "@/lib/referral-commissions";
import { reviewSubscriptionReferralPayment } from "@/lib/referral-payment-review";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { completeCheckoutOrder } from "@/lib/db";
import { qualifyReferralInTransaction, reverseReferralForTransactionInTransaction, sendReferralRewardEmails } from "@/lib/referrals";
import { synchronizeProviderSubscription, synchronizeSubscriptionPayment } from "@/lib/subscription-billing";
import { normalizeBeatLicenseType } from "@/lib/beat-store";
import { confirmStudioPayment } from "@/lib/studio-services";
import { applyStudioDispute, recordStudioRefund } from "@/lib/studio-refunds";
import { syncSettlement } from "@/lib/gateway-settlements";
import { refreshRouteSettlement, refreshRouteTransfer } from "@/lib/razorpay-route";

type RazorpayEntity = { id?: string; order_id?: string; payment_id?: string; subscription_id?: string; invoice_id?: string; plan_id?: string; amount?: number; currency?: string; status?: string; error_code?: string; error_description?: string; current_start?: number | null; current_end?: number | null; start_at?: number | null; ended_at?: number | null; charge_at?: number | null; created_at?: number; notes?: Record<string, unknown> };
type RazorpayPayload = { event?: string; id?: string; payload?: { dispute?: { entity?: RazorpayEntity }; settlement?: { entity?: RazorpayEntity }; transfer?: { entity?: RazorpayEntity }; payment?: { entity?: RazorpayEntity }; order?: { entity?: RazorpayEntity }; refund?: { entity?: RazorpayEntity }; subscription?: { entity?: RazorpayEntity } } };

export function validateObservedPayment(expected: { amountMinor: number; currency: string }, observed: { amountMinor?: number; currency?: string }) {
  if (observed.currency && observed.currency.toUpperCase() !== expected.currency.toUpperCase()) throw new Error("Payment currency does not match the persisted order.");
  if (observed.amountMinor !== undefined && observed.amountMinor !== expected.amountMinor) throw new Error("Payment amount does not match the persisted order.");
}

export function redactRazorpayPayload(payload: RazorpayPayload): Prisma.InputJsonObject {
  if (payload.event?.startsWith("settlement.") || payload.event?.startsWith("transfer.")) return { event: payload.event, financeEntityId: payload.payload?.settlement?.entity?.id || payload.payload?.transfer?.entity?.id || null };
  const entity = payload.event?.startsWith("refund.") ? payload.payload?.refund?.entity ?? {} : payload.event?.startsWith("payment.dispute.") ? payload.payload?.dispute?.entity ?? payload.payload?.payment?.entity ?? {} : payload.payload?.payment?.entity ?? payload.payload?.order?.entity ?? {};
  const subscription = payload.payload?.subscription?.entity;
  const payment = payload.payload?.payment?.entity;
  return { event: payload.event ?? "unknown", entity: { id: entity.id ?? null, order_id: entity.order_id ?? null, amount: entity.amount ?? null, currency: entity.currency ?? null, status: entity.status ?? null, error_code: entity.error_code ?? null, refundKey: typeof entity.notes?.hymnStudioRefundKey === "string" ? entity.notes.hymnStudioRefundKey : null }, subscription: subscription ? { id: subscription.id ?? null, plan_id: subscription.plan_id ?? null, status: subscription.status ?? null, current_start: subscription.current_start ?? null, current_end: subscription.current_end ?? null, start_at: subscription.start_at ?? null, ended_at: subscription.ended_at ?? null, charge_at: subscription.charge_at ?? null } : null, payment: payment ? { id: payment.id ?? null, invoice_id: payment.invoice_id ?? null, amount: payment.amount ?? null, currency: payment.currency ?? null, status: payment.status ?? null, created_at: payment.created_at ?? null } : null };
}

export async function receiveRazorpayEvent(rawBody: Buffer, payload: RazorpayPayload) {
  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const entity = payload.event?.startsWith("refund.") ? payload.payload?.refund?.entity ?? {} : payload.event?.startsWith("payment.dispute.") ? payload.payload?.dispute?.entity ?? payload.payload?.payment?.entity ?? {} : payload.payload?.payment?.entity ?? payload.payload?.order?.entity ?? {};
  const subscriptionEntity = payload.payload?.subscription?.entity;
  const razorpaySubscriptionId = subscriptionEntity?.id ?? payload.payload?.payment?.entity?.subscription_id ?? null;
  const razorpayOrderId = entity.order_id ?? (payload.payload?.order?.entity?.id || null);
  const existing = await prisma.paymentWebhookEvent.findFirst({ where: { OR: [{ payloadHash }, ...(payload.id ? [{ providerEventId: payload.id }] : [])] } });
  if (existing) return existing;
  try {
    return await prisma.paymentWebhookEvent.create({ data: { providerEventId: payload.id || null, eventType: payload.event || "unknown", payloadHash, signatureValid: true, razorpayOrderId, razorpaySubscriptionId, paymentId: payload.payload?.dispute?.entity?.payment_id ?? payload.payload?.payment?.entity?.id ?? payload.payload?.refund?.entity?.payment_id ?? null, amountMinor: entity.amount ?? null, currency: entity.currency?.toUpperCase() ?? null, payloadRedacted: redactRazorpayPayload(payload) } });
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
    if (event.eventType.startsWith("settlement.") || event.eventType.startsWith("transfer.")) {
      const snapshot = event.payloadRedacted as Record<string, unknown>;
      if (typeof snapshot.financeEntityId !== "string") throw new Error("Financial webhook is missing its entity identifier.");
      if (event.eventType.startsWith("settlement.")) {
        if (!await refreshRouteSettlement(snapshot.financeEntityId)) await syncSettlement(snapshot.financeEntityId);
      }
      else {
        const transfer = await prisma.routeTransfer.findUnique({ where: { transferId: snapshot.financeEntityId } });
        if (transfer) await refreshRouteTransfer(transfer.id);
      }
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date(), errorCode: null, errorMessage: null } });
    }
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
      "refund.failed": "refund_failed",
      "payment.dispute.created": "disputed",
      "payment.dispute.won": "paid",
      "payment.dispute.lost": "charged_back"
    };
    let resolvedOrderId = event.razorpayOrderId;
    if (!resolvedOrderId && event.paymentId) {
      const [distribution, checkout, studio] = await Promise.all([
        prisma.distributionOrder.findUnique({ where: { razorpayPaymentId: event.paymentId }, select: { razorpayOrderId: true } }),
        prisma.checkoutOrder.findUnique({ where: { razorpayPaymentId: event.paymentId }, select: { razorpayOrderId: true } }),
        prisma.studioPayment.findUnique({ where: { razorpayPaymentId: event.paymentId }, select: { razorpayOrderId: true } })
      ]);
      if ([distribution, checkout, studio].filter(Boolean).length > 1) throw new Error("Ambiguous persisted Razorpay payment identifier.");
      resolvedOrderId = distribution?.razorpayOrderId ?? checkout?.razorpayOrderId ?? studio?.razorpayOrderId ?? null;
    }
    if (event.eventType in nonFulfilmentStates) {
      if (resolvedOrderId) await applyPaymentState({ razorpayOrderId: resolvedOrderId, paymentId: event.paymentId, state: nonFulfilmentStates[event.eventType], eventId: event.id, amountMinor: event.amountMinor });
      await prisma.$transaction(async tx => {
        if (event.paymentId) await refreshReferralCommission(tx, event.paymentId);
        await reviewSubscriptionReferralPayment(tx, event);
      });
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date() } });
    }
    if (!["payment.captured", "order.paid"].includes(event.eventType)) {
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date() } });
    }
    if (!resolvedOrderId) throw new Error("Webhook does not identify an order.");
    if (!event.paymentId) throw new Error("Webhook does not identify a payment.");
    // A subscription charge is paid against Razorpay's own invoice order, which HYMN never created.
    // subscription.charged carries the same payment and records it, so there is nothing to fulfil here;
    // failing would only make Razorpay retry an event that can never succeed.
    const invoiceId = (event.payloadRedacted as Record<string, any> | null)?.payment?.invoice_id;
    if (invoiceId && !(await persistedOrderExists(resolvedOrderId))) {
      return prisma.paymentWebhookEvent.update({ where: { id: event.id }, data: { attemptCount: { increment: 1 }, processingState: "processed", processedAt: new Date(), errorCode: null, errorMessage: null } });
    }
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
    if (!alreadyPaid && order.creditsUsed > 0) {
      const debited = await tx.user.updateMany({ where: { id: order.userId, referralCredits: { gte: order.creditsUsed } }, data: { referralCredits: { decrement: order.creditsUsed } } });
      if (debited.count !== 1) throw new Error("HYMN credit balance changed. Please recreate checkout; no additional payment was requested.");
      const balance = await tx.user.findUniqueOrThrow({ where: { id: order.userId }, select: { referralCredits: true } });
      await tx.creditLedgerEntry.create({ data: { userId: order.userId, type: "DISTRIBUTION_PURCHASE", bucket: "HYMN_CREDIT", amount: order.creditsUsed, direction: "debit", sourceType: "distribution_order", sourceId: String(order.id), description: "HYMN credits applied to distribution", idempotencyKey: `distribution-order:${order.id}:credit-debit`, balanceAfter: balance.referralCredits, metadata: { razorpayOrderId: order.razorpayOrderId, plan: order.plan } } });
    }
    const updated = alreadyPaid ? order : await tx.distributionOrder.update({ where: { id: order.id }, data: { paymentStatus: "paid", razorpayPaymentId: input.paymentId } });
    if (!alreadyPaid) await tx.auditLog.create({ data: { actorId: input.userId ?? null, action: "DISTRIBUTION_PAYMENT_CONFIRMED", entity: "distribution_order", entityId: String(order.id), metadata: { source: input.source, paymentId: input.paymentId } } });
    await accrueReferralCommission(tx, "distribution_order", order.id);
    const qualification = !alreadyPaid ? await qualifyReferralInTransaction(tx, { referredUserId: order.userId, transactionType: "distribution_order", transactionId: order.id, paymentId: input.paymentId, paidAmountInr: order.amount, source: input.source }) : { qualified: false as const, reason: "already_paid" as const };
    return { updated, qualification };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
  if (result.qualification.qualified) await sendReferralRewardEmails(result.qualification.referralId).catch(() => undefined);
  return result.updated;
}

export async function confirmDistributionEntitlement(input: { razorpayOrderId: string; userId: number; paymentId: string }) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.distributionOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
    if (!order || order.userId !== input.userId) throw new Error("Distribution entitlement order was not found.");
    if (order.amount !== 0 || order.currency !== "INR") throw new Error("A paid order cannot use an entitlement checkout.");
    if (order.fulfilledAt) throw new Error("This distribution entitlement has already been used.");
    return tx.distributionOrder.update({ where: { id: order.id }, data: { paymentStatus: "paid", razorpayPaymentId: input.paymentId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export async function claimDistributionOrderForSubmission(input: { razorpayOrderId: string; userId: number }) {
  const claimed = await prisma.distributionOrder.updateMany({ where: { razorpayOrderId: input.razorpayOrderId, userId: input.userId, paymentStatus: "paid", fulfilledAt: null }, data: { fulfilledAt: new Date() } });
  if (claimed.count !== 1) throw new Error("This payment or entitlement has already been used for a release.");
}

export async function releaseDistributionOrderClaim(input: { razorpayOrderId: string; userId: number }) {
  await prisma.distributionOrder.updateMany({ where: { razorpayOrderId: input.razorpayOrderId, userId: input.userId }, data: { fulfilledAt: null } });
}

export async function attachDistributionOrderRelease(input: { razorpayOrderId: string; userId: number; releaseId: number }) {
  const attached = await prisma.distributionOrder.updateMany({ where: { razorpayOrderId: input.razorpayOrderId, userId: input.userId, fulfilledAt: { not: null }, OR: [{ releaseId: null }, { releaseId: input.releaseId }] }, data: { releaseId: input.releaseId } });
  if (attached.count !== 1) throw new Error("The distribution order could not be linked to this release.");
  await prisma.auditLog.create({ data: { actorId: input.userId, action: "DISTRIBUTION_RELEASE_FULFILLED", entity: "distribution_order", entityId: input.razorpayOrderId, metadata: { releaseId: input.releaseId } } });
}

export async function confirmCheckoutPayment(input: { razorpayOrderId: string; paymentId: string; userId?: number; amountMinor?: number; currency?: string; source: "browser" | "webhook" | "reconciliation" | "admin_replay" }) {
  const persisted = await prisma.checkoutOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
  if (!persisted) throw new Error("Persisted HYMN checkout order was not found.");
  if (input.userId !== undefined && persisted.userId !== input.userId) throw new Error("Order does not belong to the authenticated user.");
  validateObservedPayment({ amountMinor: Number(persisted.finalAmount.mul(100)), currency: persisted.currency }, input);
  const order = await completeCheckoutOrder(input.razorpayOrderId, input.paymentId);
  if (!order) throw new Error("Checkout fulfilment did not return an order.");
  if (persisted.paymentStatus !== "paid") await prisma.auditLog.create({ data: { actorId: input.userId ?? null, action: "CHECKOUT_PAYMENT_CONFIRMED", entity: "checkout_order", entityId: String(order.id), metadata: { source: input.source, paymentId: input.paymentId } } });
  const purchases = await prisma.beatPurchase.findMany({ where: { userId: order.userId, paymentId: input.paymentId, hasAccess: true }, include: { user: true, beat: true } });
  if (purchases.length) {
    const { generateBeatLicense } = await import("@/lib/beat-license");
    const { sendBeatEmailEvent, emailAppUrl } = await import("@/lib/email/email-events");
    for (const purchase of purchases) {
      if (!purchase.licenseUrl) await generateBeatLicense(purchase.id, order.userId).catch(() => null);
      await sendBeatEmailEvent({ event: "beat_purchase_success", purchaseId: purchase.id, userId: order.userId, to: purchase.user.email, userName: purchase.user.name, beatTitle: purchase.beat.title, url: emailAppUrl("/dashboard?module=purchases") }).catch(() => null);
    }
  }
  return order;
}

async function persistedOrderExists(razorpayOrderId: string) {
  const [distribution, checkout, studio] = await Promise.all([
    prisma.distributionOrder.findUnique({ where: { razorpayOrderId }, select: { id: true } }),
    prisma.checkoutOrder.findUnique({ where: { razorpayOrderId }, select: { id: true } }),
    prisma.studioPayment.findUnique({ where: { razorpayOrderId }, select: { id: true } })
  ]);
  return Boolean(distribution || checkout || studio);
}

export async function confirmPersistedPayment(input: { razorpayOrderId: string; paymentId: string; userId?: number; amountMinor?: number; currency?: string; source: "browser" | "webhook" | "reconciliation" | "admin_replay" }) {
  const [distribution, checkout, studio] = await Promise.all([
    prisma.distributionOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, select: { id: true } }),
    prisma.checkoutOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, select: { id: true } }),
    prisma.studioPayment.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, select: { id: true } })
  ]);
  if ([distribution, checkout, studio].filter(Boolean).length > 1) throw new Error("Ambiguous persisted Razorpay order identifier.");
  if (distribution) return { kind: "distribution" as const, order: await confirmDistributionPayment(input) };
  if (checkout) return { kind: "checkout" as const, order: await confirmCheckoutPayment(input) };
  if (studio) return { kind: "studio" as const, order: await confirmStudioPayment({ razorpayOrderId: input.razorpayOrderId, paymentId: input.paymentId, customerId: input.userId, amountMinor: input.amountMinor, currency: input.currency, source: "webhook" }) };
  throw new Error("Persisted HYMN order was not found.");
}

async function applyPaymentState(input: { razorpayOrderId: string; paymentId: string | null; state: string; eventId: number; amountMinor: number | null }) {
  const studioPayment = await prisma.studioPayment.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
  if (studioPayment) {
    if (await prisma.distributionOrder.count({ where: { razorpayOrderId: input.razorpayOrderId } }) || await prisma.checkoutOrder.count({ where: { razorpayOrderId: input.razorpayOrderId } })) throw new Error("Ambiguous persisted Razorpay order identifier.");
    if (!input.paymentId || studioPayment.razorpayPaymentId && studioPayment.razorpayPaymentId !== input.paymentId) throw new Error("Payment event does not match the captured Studio payment.");
    const event = await prisma.paymentWebhookEvent.findUniqueOrThrow({ where: { id: input.eventId } });
    const entity = (event.payloadRedacted as { entity?: { id?: string; currency?: string; refundKey?: string } })?.entity;
    if (["refunded", "refund_pending", "refund_failed", "charged_back"].includes(input.state)) {
      await recordStudioRefund(studioPayment.id, { id: input.state === "charged_back" ? `chargeback-${studioPayment.id}` : entity?.id || "", payment_id: input.paymentId, amount: input.amountMinor ?? 0, currency: entity?.currency || "", status: input.state === "refund_pending" ? "pending" : input.state === "refund_failed" ? "failed" : "processed", notes: { hymnStudioRefundKey: entity?.refundKey } });
    } else if (["disputed", "paid"].includes(input.state)) await applyStudioDispute(studioPayment.id, input.state, String(event.id));
    else if (["authorized", "failed"].includes(input.state) && !studioPayment.capturedAt) await prisma.studioPayment.updateMany({ where: { id: studioPayment.id, capturedAt: null, status: { in: ["CREATED", "AUTHORIZED", "FAILED"] } }, data: { status: input.state.toUpperCase() } });
    return;
  }
  if (input.state === "refund_failed") return;
  await prisma.$transaction(async tx => {
    const distribution = await tx.distributionOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId } });
    const checkout = await tx.checkoutOrder.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, include: { items: true } });
    const studio = await tx.studioPayment.findUnique({ where: { razorpayOrderId: input.razorpayOrderId }, include: { order: true } });
    if ([distribution, checkout, studio].filter(Boolean).length > 1) throw new Error("Ambiguous persisted Razorpay order identifier.");
    if (distribution) {
      if (ignoreStalePaymentState(distribution.paymentStatus, input.state)) return;
      if (distribution.razorpayPaymentId && input.paymentId && distribution.razorpayPaymentId !== input.paymentId) throw new Error("Payment event does not match the captured order payment.");
      const fullReversal = ["refunded", "charged_back"].includes(input.state) && input.amountMinor === distribution.amount * 100;
      const state = ["refunded", "charged_back"].includes(input.state) && !fullReversal ? "partial_refund_review" : input.state;
      await tx.distributionOrder.update({ where: { id: distribution.id }, data: { paymentStatus: state } });
      if (fullReversal && distribution.plan !== "one_time") await tx.subscription.updateMany({ where: { userId: distribution.userId, status: "active" }, data: { status: "cancelled" } });
      if (fullReversal) await reverseReferralForTransactionInTransaction(tx, { transactionType: "distribution_order", transactionId: distribution.id, reason: input.state as "refunded" | "charged_back" });
      await tx.auditLog.create({ data: { action: `RAZORPAY_${input.state.toUpperCase()}`, entity: "distribution_order", entityId: String(distribution.id), metadata: { eventId: input.eventId, paymentId: input.paymentId } } });
      return;
    }
    if (studio) throw new Error("Studio payment changed during processing. Retry the event.");
    if (!checkout) return;
    if (ignoreStalePaymentState(checkout.paymentStatus, input.state)) return;
    if (checkout.razorpayPaymentId && input.paymentId && checkout.razorpayPaymentId !== input.paymentId) throw new Error("Payment event does not match the captured order payment.");
    if (input.state === "failed") {
      for (const item of checkout.items.filter((entry) => normalizeBeatLicenseType(entry.licenseType) === "exclusive")) {
        await tx.beat.updateMany({ where: { id: item.beatId, status: "EXCLUSIVE_RESERVED", exclusiveReservationOrderId: checkout.razorpayOrderId }, data: { status: "PUBLISHED", exclusiveReservedByUserId: null, exclusiveReservationOrderId: null, exclusiveReservationExpiresAt: null } });
      }
    }
    const fullAmountMinor = Number(checkout.finalAmount.mul(100));
    const isFullReversal = ["refunded", "charged_back"].includes(input.state) && input.amountMinor === fullAmountMinor;
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
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 20000 });
}

export function ignoreStalePaymentState(current: string, incoming: string) {
  if (["authorized", "failed"].includes(incoming)) return !["created", "authorized", "failed"].includes(current);
  if (incoming === "refund_pending") return ["refunded", "charged_back", "partial_refund_review"].includes(current);
  if (incoming === "paid") return current !== "disputed";
  return current === incoming;
}
// vercel trigger 9
