import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commissionMinor, remainingCommissionMinor, REFERRAL_COMMISSION_RATES, REFERRAL_HOLD_DAYS, REFERRAL_MINIMUM_PAYOUT_MINOR, type ReferralCommissionCategory } from "@/lib/referral-commission-policy";

type Tx = Prisma.TransactionClient;
export type CommissionSource = "distribution_order" | "checkout_order" | "subscription_payment" | "studio_payment";
const minor = (value: Prisma.Decimal | number) => new Prisma.Decimal(value).mul(100).toDecimalPlaces(0).toNumber();

// Read authoritative paid records, not browser amounts. A payment can earn once
// across all entry points; each subsequent renewal has a different payment ID.
export async function accrueReferralCommission(tx: Tx, source: CommissionSource, id: number) {
  const testMode = process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") || false;
  let userId: number, paidMinor: number, baseMinor: number, paymentId: string | null, purchasedAt: Date;
  let category: ReferralCommissionCategory;
  if (source === "distribution_order") {
    const row = await tx.distributionOrder.findUniqueOrThrow({ where: { id } });
    if (row.paymentStatus !== "paid" || !row.razorpayOrderId.startsWith("order_") || row.currency !== "INR") return;
    userId = row.userId; paidMinor = minor(row.amount); baseMinor = paidMinor; paymentId = row.razorpayPaymentId; purchasedAt = row.createdAt;
    if (!(row.plan in REFERRAL_COMMISSION_RATES) || ["beats", "studio"].includes(row.plan)) return;
    category = row.plan as ReferralCommissionCategory;
  } else if (source === "checkout_order") {
    const row = await tx.checkoutOrder.findUniqueOrThrow({ where: { id } });
    if (row.paymentStatus !== "paid" || row.currency !== "INR") return;
    userId = row.userId; paidMinor = minor(row.finalAmount); paymentId = row.razorpayPaymentId; purchasedAt = row.createdAt; category = "beats";
    const sales = await tx.beatSale.findMany({ where: { orderId: id, status: "paid" } });
    baseMinor = sales.filter(sale => sale.producerUserId !== userId).reduce((sum, sale) => sum + minor(sale.hymnCommissionAmount), 0);
  } else if (source === "subscription_payment") {
    const row = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id }, include: { subscription: true } });
    if (row.status !== "captured" || row.currency !== "INR") return;
    const plan = row.planSnapshot || row.subscription.plan;
    if (!["half_yearly", "yearly", "yearly_plus"].includes(plan)) return;
    userId = row.subscription.userId; paidMinor = row.amount; baseMinor = paidMinor; paymentId = row.razorpayPaymentId; purchasedAt = row.createdAt;
    category = plan as ReferralCommissionCategory;
  } else {
    const row = await tx.studioPayment.findUniqueOrThrow({ where: { id }, include: { order: { include: { engineerParty: true } } } });
    if (row.status !== "CAPTURED" || row.currency !== "INR") return;
    userId = row.order.customerId; paidMinor = minor(row.amount); paymentId = row.razorpayPaymentId; purchasedAt = row.createdAt; category = "studio";
    baseMinor = minor(row.amount.mul(row.order.commissionRate));
    if (userId === row.order.engineerParty.claimedByUserId) baseMinor = 0;
  }
  if (paidMinor <= 0 || !paymentId?.startsWith("pay_")) return;
  const program = await tx.referralProgram.findUnique({ where: { id: 1 } });
  if (!program || purchasedAt < program.effectiveAt) return;
  const referral = await tx.referral.findUnique({ where: { referredUserId: userId }, include: { owner: true, referredUser: true } });
  if (!referral || referral.status === "REJECTED" || referral.userId === userId || purchasedAt < referral.createdAt || referral.owner.status !== "ACTIVE" || referral.referredUser?.status !== "ACTIVE") return;
  const rates = referral.commissionRates as Record<string, number> | null;
  const savedRate = rates?.[category];
  const rateBps = savedRate !== undefined && Number.isInteger(savedRate) && savedRate >= 0 && savedRate <= 10000 ? savedRate : REFERRAL_COMMISSION_RATES[category];
  const amount = testMode ? 0 : commissionMinor(Math.min(baseMinor, paidMinor), rateBps);
  const created = await tx.referralCommission.createMany({ data: [{ referralId: referral.id, paymentId, sourceType: source, sourceId: String(id), category, paidMinor, baseMinor: Math.min(baseMinor, paidMinor), rateBps, originalMinor: amount, netMinor: amount, status: testMode ? "EXCLUDED" : "PENDING", capturedAt: purchasedAt, eligibleAt: new Date(Date.now() + REFERRAL_HOLD_DAYS * 86400000) }], skipDuplicates: true });
  if (!created.count) return;
  await refreshReferralCommission(tx, paymentId);
  if (amount === 0) return;
  await tx.notification.upsert({ where: { eventKey: `referral-commission:${paymentId}` }, update: {}, create: { userId: referral.userId, type: "account", title: "Referral commission tracked", body: `Rs ${(amount / 100).toFixed(2)} pending from a ${category.replaceAll("_", " ")} purchase. Available after the refund hold and payment checks.`, href: "/dashboard?tab=referral", eventKey: `referral-commission:${paymentId}` } });
}

// Recompute from signature-verified events. Refund IDs deduplicate webhook
// replays; multiple partial refunds reduce commission proportionally.
export async function refreshReferralCommission(tx: Tx, paymentId: string, now = new Date()) {
  await tx.$queryRaw`SELECT id FROM referral_commissions WHERE payment_id = ${paymentId} FOR UPDATE`;
  const row = await tx.referralCommission.findUnique({ where: { paymentId }, include: { referral: { include: { owner: true, referredUser: true } } } });
  if (!row || row.status === "EXCLUDED") return;
  const events = await tx.paymentWebhookEvent.findMany({ where: { paymentId, signatureValid: true, eventType: { in: ["refund.created", "refund.processed", "payment.dispute.created", "payment.dispute.won", "payment.dispute.lost"] } }, orderBy: { id: "asc" } });
  const refunds = new Map<string, number>(); const pendingRefunds = new Set<string>();
  let dispute = "", unknownRefund = false;
  for (const event of events) {
    if (event.eventType.startsWith("payment.dispute.")) {
      // Terminal outcomes outrank delayed opening events.
      if (event.eventType === "payment.dispute.lost" || (!dispute.endsWith("lost") && event.eventType === "payment.dispute.won") || !dispute) dispute = event.eventType;
      continue;
    }
    const data = event.payloadRedacted as { entity?: { id?: string } } | null;
    const refundId = data?.entity?.id;
    if (!refundId || event.amountMinor === null || event.amountMinor < 0) { unknownRefund = true; continue; }
    if (event.eventType === "refund.processed") { refunds.set(refundId, Math.max(refunds.get(refundId) || 0, event.amountMinor)); pendingRefunds.delete(refundId); }
    else if (!refunds.has(refundId)) pendingRefunds.add(refundId);
  }
  const refundedMinor = dispute === "payment.dispute.lost" ? row.paidMinor : Math.min(row.paidMinor, [...refunds.values()].reduce((a, b) => a + b, 0));
  const netMinor = remainingCommissionMinor(row.originalMinor, row.paidMinor, refundedMinor);
  const held = unknownRefund || pendingRefunds.size > 0 || dispute === "payment.dispute.created" || row.referral.riskStatus !== "clear" || row.referral.status === "REJECTED" || row.referral.owner.status !== "ACTIVE" || row.referral.referredUser?.status !== "ACTIVE";
  const status = netMinor === 0 ? "REVERSED" : held ? "HELD" : row.eligibleAt > now ? "PENDING" : "AVAILABLE";
  if (row.netMinor !== netMinor || row.status !== status || row.refundedMinor !== refundedMinor) {
    await tx.referralCommission.update({ where: { id: row.id }, data: { netMinor, refundedMinor, status } });
    await tx.auditLog.create({ data: { actorType: "system", action: "REFERRAL_COMMISSION_UPDATED", entity: "referral_commission", entityId: String(row.id), metadata: { previousStatus: row.status, status, previousMinor: row.netMinor, netMinor, refundedMinor } } });
  } else await tx.referralCommission.update({ where: { id: row.id }, data: { updatedAt: now } });
}

async function cashBalance(tx: Tx, userId: number) {
  const [earnings, payouts] = await Promise.all([
    tx.referralCommission.aggregate({ where: { referral: { userId, riskStatus: "clear", status: { not: "REJECTED" }, owner: { status: "ACTIVE" }, referredUser: { status: "ACTIVE" } }, status: "AVAILABLE" }, _sum: { netMinor: true } }),
    tx.referralCommissionPayout.aggregate({ where: { userId, status: { in: ["REQUESTED", "PAID"] } }, _sum: { amountMinor: true } }),
  ]);
  // A refund after payout creates a recoverable negative balance. Never hide it
  // by clamping the ledger: future earnings first offset the overpayment.
  return (earnings._sum.netMinor || 0) - (payouts._sum.amountMinor || 0);
}

async function refreshDueForOwner(tx: Tx, userId: number) {
  // Reconcile in bounded batches. A long-lived account must not re-read every
  // historical payment before it can withdraw; webhooks refresh adverse events.
  const rows = await tx.referralCommission.findMany({ where: { referral: { userId }, status: { in: ["PENDING", "HELD"] }, eligibleAt: { lte: new Date() } }, orderBy: { updatedAt: "asc" }, take: 100, select: { paymentId: true } });
  for (const row of rows) await refreshReferralCommission(tx, row.paymentId);
}

export async function requestReferralPayout(userId: number) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { payoutCredential: true } });
    if (user.status !== "ACTIVE" || user.payoutCredential?.status !== "verified") throw new Error("Verify your payout profile before withdrawing referral earnings.");
    if (await tx.referralCommissionPayout.findFirst({ where: { userId, status: "REQUESTED" } })) throw new Error("A referral payout is already pending.");
    await refreshDueForOwner(tx, userId);
    const amountMinor = await cashBalance(tx, userId);
    if (amountMinor < REFERRAL_MINIMUM_PAYOUT_MINOR) throw new Error("At least Rs 500 in cleared commission is required.");
    const credential = user.payoutCredential;
    const destination = { method: credential.method, legalName: credential.legalName, upiIdMasked: credential.upiIdMasked, upiIdEncrypted: credential.upiIdEncrypted, bankAccountMasked: credential.bankAccountMasked, bankAccountEncrypted: credential.bankAccountEncrypted, accountHolderName: credential.accountHolderName, ifscMasked: credential.ifscMasked, ifscEncrypted: credential.ifscEncrypted };
    const payout = await tx.referralCommissionPayout.create({ data: { userId, amountMinor, destination } });
    await tx.auditLog.create({ data: { actorId: userId, action: "REFERRAL_PAYOUT_REQUESTED", entity: "referral_commission_payout", entityId: String(payout.id), metadata: { amountMinor } } });
    return { id: payout.id, amount: amountMinor / 100, status: payout.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
}

export async function reviewReferralPayout(id: number, actorId: number | null, input: { action: "paid" | "reject"; note: string; reference?: string }) {
  return prisma.$transaction(async tx => {
    const payout = await tx.referralCommissionPayout.findUniqueOrThrow({ where: { id } });
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${payout.userId} FOR UPDATE`;
    const current = await tx.referralCommissionPayout.findUniqueOrThrow({ where: { id } });
    if (current.status !== "REQUESTED") throw new Error("This payout has already been processed.");
    if (input.action === "paid") {
      if (!input.reference?.trim()) throw new Error("A bank payment reference is required.");
      const user = await tx.user.findUniqueOrThrow({ where: { id: payout.userId }, include: { payoutCredential: true } });
      if (user.status !== "ACTIVE" || user.payoutCredential?.status !== "verified") throw new Error("Payout profile is not verified.");
      await refreshDueForOwner(tx, payout.userId);
      if (await cashBalance(tx, payout.userId) < 0) throw new Error("Refunds or holds reduced the balance. Reject this request so the owner can request the corrected amount.");
    }
    const updated = await tx.referralCommissionPayout.update({ where: { id }, data: { status: input.action === "paid" ? "PAID" : "REJECTED", adminNote: input.note, paymentReference: input.action === "paid" ? input.reference!.trim() : null, paidAt: input.action === "paid" ? new Date() : null } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, action: `REFERRAL_PAYOUT_${updated.status}`, entity: "referral_commission_payout", entityId: String(id), reason: input.note, metadata: { amountMinor: updated.amountMinor, reference: updated.paymentReference } } });
    await tx.notification.create({ data: { userId: updated.userId, type: "account", title: input.action === "paid" ? "Referral payout recorded" : "Referral payout needs attention", body: input.action === "paid" ? `Rs ${(updated.amountMinor / 100).toFixed(2)} paid. Reference: ${updated.paymentReference}` : input.note, href: "/dashboard?tab=referral" } });
    return { id, status: updated.status };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 });
}
