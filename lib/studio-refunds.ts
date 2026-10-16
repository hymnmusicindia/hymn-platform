import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { refreshReferralCommission } from "@/lib/referral-commissions";

export type RefundObservation = { id: string; payment_id: string; amount: number; currency: string; status: string; notes?: { hymnStudioRefundKey?: string } };
type Tx = Prisma.TransactionClient;

async function reviewTask(tx: Tx, orderId: number, publicId: string, reason: string) {
  const eventKey = `studio-finance:${orderId}`;
  const task = await tx.adminTask.upsert({ where: { eventKey }, create: { eventKey, type: "Payment Mismatch", priority: "critical", title: "Studio financial review required", body: reason, href: `/admin/studio/orders/${publicId}`, entityType: "studio_order", entityId: String(orderId) }, update: { status: "open", body: reason, resolvedAt: null } });
  return task;
}

async function walletChange(tx: Tx, input: { userId: number; orderId: number; available: Prisma.Decimal; pending: Prisma.Decimal; lifetime: Prisma.Decimal; type: string; key: string; amount: Prisma.Decimal }) {
  await tx.$queryRaw`SELECT id FROM artist_payout_balances WHERE user_id=${input.userId} FOR UPDATE`;
  if (await tx.walletTransaction.findUnique({ where: { idempotencyKey: input.key } })) return;
  const balance = await tx.artistPayoutBalance.upsert({ where: { userId: input.userId }, create: { userId: input.userId, availableBalance: input.available, pendingBalance: input.pending, lifetimeEarnings: input.lifetime }, update: { availableBalance: { increment: input.available }, pendingBalance: { increment: input.pending }, lifetimeEarnings: { increment: input.lifetime }, lastUpdatedAt: new Date() } });
  await tx.walletTransaction.create({ data: { userId: input.userId, type: input.type, direction: input.available.isPositive() ? "credit" : "debit", amount: input.amount, currency: balance.currency, referenceType: "studio_order", referenceId: `${input.orderId}:${input.key}`, auditMetadata: { studioOrderId: input.orderId }, idempotencyKey: input.key, balanceAfter: balance.availableBalance, note: "Verified Studio financial adjustment; original earning retained." } });
}

export async function recordStudioRefund(paymentId: number, observed: RefundObservation) {
  const result = await prisma.$transaction(async tx => {
    const identity = await tx.studioPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { select: { publicId: true } } } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.order.publicId}))`;
    const payment = await tx.studioPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { include: { engineerParty: true, earning: true } } } });
    if (!payment.capturedAt || !payment.razorpayPaymentId) throw new Error("A refund requires a verified captured Studio payment.");
    if (!observed.id || observed.id.length > 120 || observed.payment_id !== payment.razorpayPaymentId || !Number.isSafeInteger(observed.amount) || observed.amount <= 0 || observed.currency.toUpperCase() !== payment.currency.toUpperCase()) throw new Error("Refund identity, amount or currency does not match the Studio payment.");
    const status = observed.status === "processed" ? "PROCESSED" : observed.status === "failed" ? "FAILED" : ["pending", "created"].includes(observed.status) ? "PENDING" : null;
    if (!status) throw new Error("Unrecognised refund status.");
    const existing = await tx.studioRefund.findUnique({ where: { providerRefundId: observed.id } });
    const intent = !existing && observed.notes?.hymnStudioRefundKey ? await tx.studioRefund.findUnique({ where: { id: observed.notes.hymnStudioRefundKey } }) : null;
    const prior = existing || intent;
    if (prior && (prior.paymentId !== paymentId || prior.amountMinor !== observed.amount || prior.currency !== payment.currency || prior.providerRefundId && prior.providerRefundId !== observed.id)) throw new Error("Refund retry differs from the recorded request.");
    const reserved = await tx.studioRefund.aggregate({ where: { paymentId, status: { in: ["REQUESTED", "PENDING", "PROCESSED"] }, ...(prior ? { id: { not: prior.id } } : {}) }, _sum: { amountMinor: true } });
    if (status !== "FAILED" && (reserved._sum.amountMinor || 0) + observed.amount > Number(payment.amount.mul(100))) throw new Error("Refund totals exceed the captured Studio payment.");
    const finalStatus = prior?.status === "PROCESSED" ? "PROCESSED" : prior?.status === "FAILED" && status === "PENDING" ? "FAILED" : status;
    const row = prior ? await tx.studioRefund.update({ where: { id: prior.id }, data: { providerRefundId: observed.id, status: finalStatus } }) : await tx.studioRefund.create({ data: { paymentId, providerRefundId: observed.id, amountMinor: observed.amount, currency: payment.currency, status: finalStatus } });
    const sum = await tx.studioRefund.aggregate({ where: { paymentId, status: "PROCESSED" }, _sum: { amountMinor: true } });
    const refunded = new Prisma.Decimal(sum._sum.amountMinor || 0).div(100);
    // Provider-history polling must not reopen a review an admin has already
    // closed, or create another compensating entry for an unchanged refund.
    if (prior && prior.status === finalStatus && payment.refundedAmount.eq(refunded)) return row;
    const fullyRefunded = refunded.eq(payment.amount);
    await tx.studioPayment.update({ where: { id: paymentId }, data: { refundedAmount: refunded, status: fullyRefunded ? "REFUNDED" : payment.status === "DISPUTED" ? "DISPUTED" : "CAPTURED", refundedAt: fullyRefunded ? payment.refundedAt || new Date() : null } });
    const funding = await tx.studioPayment.findMany({ where: { orderId: payment.orderId, capturedAt: { not: null } }, select: { amount: true, refundedAmount: true } });
    const allRefunded = funding.length > 0 && funding.every(p => p.refundedAmount.eq(p.amount));
    const totalRefunded = funding.reduce((sum, p) => sum.add(p.refundedAmount), new Prisma.Decimal(0));
    const pending = await tx.studioRefund.count({ where: { payment: { orderId: payment.orderId }, status: { in: ["REQUESTED", "PENDING"] } } });
    const order = payment.order;
    const earning = order.earning;
    if (finalStatus === "FAILED") await reviewTask(tx, order.id, order.publicId, "The provider confirmed a refund failure. Review the provider response, then explicitly authorize a retry from the Studio payment ledger.");
    if (earning && totalRefunded.gt(0)) {
      const ratio = Prisma.Decimal.min(totalRefunded.div(earning.grossAmount), 1);
      const reversedCommission = earning.commissionAmount.mul(ratio).toDecimalPlaces(2);
      const reversedNet = Prisma.Decimal.min(totalRefunded, earning.grossAmount).sub(reversedCommission);
      const delta = reversedNet.sub(earning.reversedNetAmount);
      const heldUsed = Prisma.Decimal.min(delta, earning.heldNetAmount);
      if (delta.gt(0) && order.engineerParty.claimedByUserId) await walletChange(tx, { userId: order.engineerParty.claimedByUserId, orderId: order.id, available: delta.sub(heldUsed).negated(), pending: heldUsed.negated(), lifetime: delta.negated(), amount: delta, type: "studio_service_reversal", key: `studio-refund:${order.id}:net:${reversedNet.toFixed(2)}` });
      await tx.studioEarning.update({ where: { id: earning.id }, data: { reversedNetAmount: reversedNet, reversedCommissionAmount: reversedCommission, heldNetAmount: earning.heldNetAmount.sub(heldUsed), status: reversedNet.eq(earning.netAmount) ? "REVERSED" : "PARTIALLY_REVERSED" } });
      await reviewTask(tx, order.id, order.publicId, "A verified refund reversed credited Studio earnings. Review negative balances, pending payouts and any already-created Route transfer before releasing further funds. No external transfer is reversed automatically.");
    }
    const next = allRefunded ? "REFUNDED" : totalRefunded.gt(0) || pending ? order.status === "REFUND_PENDING" ? "REFUND_PENDING" : "DISPUTED" : null;
    if (next) {
      await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: next, paymentStatus: next, autoCompleteAt: null } });
      if (next !== order.status) await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: next, actorType: "PAYMENT", reason: "Verified refund ledger updated", correlationId: `refund-ledger:${row.id}:${finalStatus}` } });
      if (allRefunded) await tx.notification.upsert({ where: { eventKey: `studio:${order.id}:refunded` }, create: { userId: order.customerId, title: "Studio payment refunded", body: `Your payments for ${order.projectTitle} have been refunded.`, type: "system", href: `/studio/orders/${order.publicId}`, eventKey: `studio:${order.id}:refunded` }, update: {} });
    }
    if (next === "DISPUTED") await reviewTask(tx, order.id, order.publicId, "A partial or pending refund requires review. The project is not fully refunded, and earnings cannot be released until the remaining scope/funding is resolved.");
    if (prior?.status !== finalStatus) {
      const reason = `Refund ${observed.id}: ${finalStatus.toLowerCase()} · ${payment.currency} ${new Prisma.Decimal(observed.amount).div(100).toFixed(2)}.`;
      await tx.studioMessage.upsert({ where: { idempotencyKey: `studio-refund:${row.id}:${finalStatus}` }, create: { orderId: order.id, kind: "SYSTEM", body: reason, idempotencyKey: `studio-refund:${row.id}:${finalStatus}` }, update: {} });
      await tx.auditLog.create({ data: { actorType: "payment", action: "STUDIO_REFUND_RECONCILED", entity: "studio_payment", entityId: String(payment.id), metadata: { refundId: observed.id, amountMinor: observed.amount, status: finalStatus } } });
    }
    return row;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20000 });
  await prisma.$transaction(tx => refreshReferralCommission(tx, observed.payment_id));
  return result;
}

export async function applyStudioDispute(paymentId: number, state: string, eventKey: string) {
  return prisma.$transaction(async tx => {
    const identity = await tx.studioPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { select: { publicId: true } } } });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${identity.order.publicId}))`;
    const payment = await tx.studioPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { order: { include: { earning: true, engineerParty: true } } } });
    if (!payment.capturedAt || payment.status === "REFUNDED") return;
    const order = payment.order, earning = order.earning;
    if (state === "disputed") {
      const opening = Number.isSafeInteger(Number(eventKey)) ? await tx.paymentWebhookEvent.findUnique({ where: { id: Number(eventKey) } }) : null;
      const disputeId = (opening?.payloadRedacted as { entity?: { id?: string } } | null)?.entity?.id;
      const terminal = disputeId ? await tx.paymentWebhookEvent.findFirst({ where: { paymentId: payment.razorpayPaymentId, signatureValid: true, processingState: "processed", eventType: { in: ["payment.dispute.won", "payment.dispute.lost"] }, payloadRedacted: { path: ["entity", "id"], equals: disputeId } } }) : null;
      if (terminal) return;
      if (payment.status === "DISPUTED") return;
      await tx.studioPayment.update({ where: { id: payment.id }, data: { status: "DISPUTED" } });
      await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: "DISPUTED", paymentStatus: "DISPUTED", autoCompleteAt: null } });
      if (earning && order.engineerParty.claimedByUserId) {
        const delta = earning.netAmount.sub(earning.reversedNetAmount).sub(earning.heldNetAmount);
        if (delta.gt(0)) await walletChange(tx, { userId: order.engineerParty.claimedByUserId, orderId: order.id, available: delta.negated(), pending: delta, lifetime: new Prisma.Decimal(0), amount: delta, type: "studio_dispute_hold", key: `studio-dispute:${eventKey}:hold` });
        await tx.studioEarning.update({ where: { id: earning.id }, data: { status: "HELD", heldNetAmount: earning.heldNetAmount.add(delta) } });
      }
      await tx.studioOrderStatusEvent.create({ data: { orderId: order.id, previousStatus: order.status, newStatus: "DISPUTED", actorType: "PAYMENT", reason: "Provider payment dispute opened", correlationId: `studio-dispute:${eventKey}` } });
      await reviewTask(tx, order.id, order.publicId, "A payment dispute is open. Engineer earnings are held; review any existing payout/Route transfer before resolution.");
    } else if (state === "paid" && payment.status === "DISPUTED") {
      await tx.studioPayment.update({ where: { id: payment.id }, data: { status: "CAPTURED" } });
      const stillHeld = await tx.studioPayment.count({ where: { orderId: order.id, OR: [{ status: "DISPUTED" }, { refundedAmount: { gt: 0 } }] } }) + await tx.studioRefund.count({ where: { payment: { orderId: order.id }, status: { in: ["REQUESTED", "PENDING"] } } });
      if (!stillHeld) {
        if (earning && order.engineerParty.claimedByUserId && earning.heldNetAmount.gt(0)) {
          await walletChange(tx, { userId: order.engineerParty.claimedByUserId, orderId: order.id, available: earning.heldNetAmount, pending: earning.heldNetAmount.negated(), lifetime: new Prisma.Decimal(0), amount: earning.heldNetAmount, type: "studio_dispute_release", key: `studio-dispute:${eventKey}:release` });
          await tx.studioEarning.update({ where: { id: earning.id }, data: { heldNetAmount: 0, status: "AVAILABLE" } });
        }
        const before = await tx.studioOrderStatusEvent.findFirst({ where: { orderId: order.id, reason: "Provider payment dispute opened", previousStatus: { not: "DISPUTED" } }, orderBy: { id: "desc" } });
        await tx.studioServiceOrder.update({ where: { id: order.id }, data: { status: earning ? "COMPLETED" : before?.previousStatus || "IN_PROGRESS", paymentStatus: earning ? "RELEASED" : "HELD" } });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 20000 });
}
