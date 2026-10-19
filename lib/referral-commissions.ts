import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { commissionMinor, remainingCommissionMinor, REFERRAL_COMMISSION_RATES, REFERRAL_HOLD_DAYS, REFERRAL_MINIMUM_PAYOUT_MINOR, REFERRAL_NETWORK_RATES_BPS, type ReferralCommissionCategory } from "@/lib/referral-commission-policy";

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
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${source + ":" + id}, 0))::text`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${paymentId}, 0))::text`;
  const program = await tx.referralProgram.findUnique({ where: { id: 1 } });
  if (!program || purchasedAt < program.effectiveAt) return;
  // New-policy customer rewards wait for reconciled HYMN net revenue.
  // Earlier payments retain their frozen programme terms. Customer rewards
  // remain outside the employee commission cap.
  const employeeAttribution = await tx.acquisitionLead.findFirst({ where: { customerId: userId, attributionLockedAt: { not: null }, acquisitionEmployeeId: { not: null } }, select: { id: true } });
  const netPolicy = Boolean(employeeAttribution || (program.netRevenueEffectiveAt && purchasedAt >= program.netRevenueEffectiveAt));
  const referral = await tx.referral.findUnique({ where: { referredUserId: userId }, include: { owner: true, referredUser: true } });
  if (!referral || referral.status === "REJECTED" || referral.userId === userId || purchasedAt < referral.createdAt || referral.owner.status !== "ACTIVE" || referral.referredUser?.status !== "ACTIVE") return;
  let netEvidence = null;
  if (netPolicy) {
    netEvidence = await tx.acquisitionRevenueEvidence.upsert({
      where: { sourceType_sourceId: { sourceType: source, sourceId: String(id) } },
      create: { sourceType: source, sourceId: String(id), customerId: userId, paymentId, currency: "INR", recognisedRevenueMinor: baseMinor, status: "RECONCILIATION_REQUIRED" }, update: {},
    });
    if (netEvidence.status !== "RECONCILED" || netEvidence.eligibleNetRevenueMinor === null) return;
    baseMinor = netEvidence.eligibleNetRevenueMinor;
  }
  const rates = referral.commissionRates as Record<string, number> | null;
  const savedRate = rates?.[category];
  let rateBps = savedRate !== undefined && Number.isInteger(savedRate) && savedRate >= 0 && savedRate <= 10000 ? savedRate : REFERRAL_COMMISSION_RATES[category];
  if (netPolicy) {
    const settings = netEvidence?.workspaceId ? await tx.acquisitionProgramSettings.findUnique({ where: { workspaceId: netEvidence.workspaceId } }) : null;
    if (settings && (!settings.eligibleSourceTypes.includes(source) || purchasedAt < settings.effectiveAt)) return;
    rateBps = settings?.customerReferralRateBps ?? 200;
  }
  if (!netPolicy && ["beats", "studio"].includes(category)) rateBps = Math.min(rateBps, 500);
  const amount = testMode ? 0 : commissionMinor(Math.min(baseMinor, paidMinor), rateBps);
  // Freeze the whole allocation once. Replays must not award new ancestors
  // after an account changes, or reinterpret an old payment using new rates.
  await tx.$queryRaw`SELECT id FROM referrals WHERE id = ${referral.id} FOR UPDATE`;
  if (await tx.referralCommission.findFirst({ where: { OR: [{ paymentId }, { sourceType: source, sourceId: String(id) }] } })) return;
  const eligibleAt = new Date(Date.now() + REFERRAL_HOLD_DAYS * 86400000);
  const allocations = [{ referralId: referral.id, originReferralId: referral.id, level: 1, paymentId, sourceType: source, sourceId: String(id), category, paidMinor, baseMinor: Math.min(baseMinor, paidMinor), rateBps, originalMinor: amount, netMinor: amount, policyVersion: netPolicy ? 2 : 1, eligibleNetRevenueMinor: netPolicy ? baseMinor : null, status: testMode ? "EXCLUDED" : "PENDING", capturedAt: purchasedAt, eligibleAt }];
  let descendant = referral.userId;
  const visited = new Set([userId, descendant]);
  let budget = ["beats", "studio"].includes(category) ? Math.max(0, Math.min(baseMinor, commissionMinor(paidMinor, 500)) - amount) : Math.max(0, baseMinor - amount);
  if (!netPolicy && !testMode && program.networkEffectiveAt && purchasedAt >= program.networkEffectiveAt) {
    for (let level = 2; level <= 7; level++) {
      const ancestor = await tx.referral.findUnique({ where: { referredUserId: descendant }, include: { owner: { select: { status: true } }, referredUser: { select: { status: true } } } });
      if (!ancestor || visited.has(ancestor.userId) || ancestor.createdAt > purchasedAt || ancestor.status === "REJECTED" || ancestor.riskStatus !== "clear" || ancestor.owner.status !== "ACTIVE" || ancestor.referredUser?.status !== "ACTIVE") break;
      visited.add(ancestor.userId); descendant = ancestor.userId;
      const indirectRate = REFERRAL_NETWORK_RATES_BPS[level - 1];
      const reward = Math.min(budget, commissionMinor(amount, indirectRate)); budget -= reward;
      if (reward > 0) allocations.push({ ...allocations[0], referralId: ancestor.id, level, baseMinor: amount, rateBps: indirectRate, originalMinor: reward, netMinor: reward });
    }
  }
  await tx.referralCommission.createMany({ data: allocations, skipDuplicates: true });
  await refreshReferralCommission(tx, paymentId);
  for (const allocation of allocations.filter(row => row.netMinor > 0)) {
    const beneficiary = await tx.referral.findUniqueOrThrow({ where: { id: allocation.referralId }, select: { userId: true } });
    await tx.notification.upsert({ where: { eventKey: `referral-commission:${paymentId}:${beneficiary.userId}` }, update: {}, create: { userId: beneficiary.userId, type: "account", title: "Referral commission tracked", body: `Rs ${(allocation.netMinor / 100).toFixed(2)} pending from a level ${allocation.level} paid purchase. Available after payment checks and the refund hold.`, href: "/dashboard?tab=referral", eventKey: `referral-commission:${paymentId}:${beneficiary.userId}` } });
  }
}

// Recompute from signature-verified events. Refund IDs deduplicate webhook
// replays; multiple partial refunds reduce commission proportionally.
export async function refreshReferralCommission(tx: Tx, paymentId: string, now = new Date()) {
  await tx.$queryRaw`SELECT id FROM referral_commissions WHERE payment_id = ${paymentId} ORDER BY id FOR UPDATE`;
  const rows = await tx.referralCommission.findMany({ where: { paymentId }, include: { referral: { include: { owner: true, referredUser: true } }, originReferral: { include: { referredUser: true } } } });
  if (!rows.length) return;
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
  const studioFunding = await tx.studioPayment.findUnique({ where: { razorpayPaymentId: paymentId }, include: { refunds: true } });
  if (studioFunding) {
    refunds.clear(); pendingRefunds.clear(); unknownRefund = false;
    for (const refund of studioFunding.refunds) {
      const key = refund.providerRefundId || refund.id;
      if (refund.status === "PROCESSED") { refunds.set(key, refund.amountMinor); pendingRefunds.delete(key); }
      else if (["REQUESTED", "PENDING"].includes(refund.status)) pendingRefunds.add(key);
      else if (refund.status === "FAILED") pendingRefunds.delete(key);
    }
    if (studioFunding.status === "DISPUTED" && !dispute.endsWith("lost")) dispute = "payment.dispute.created";
  }
  for (const row of rows) {
  if (row.status === "EXCLUDED") continue;
  let validPath = true;
  if (row.originReferral) {
    let descendant = row.originReferral.referredUserId;
    const seen = new Set<number>();
    for (let depth = 1; depth <= row.level; depth++) {
      if (!descendant || seen.has(descendant)) { validPath = false; break; }
      seen.add(descendant);
      const edge = await tx.referral.findUnique({ where: { referredUserId: descendant }, include: { owner: { select: { status: true } }, referredUser: { select: { status: true } } } });
      if (!edge || edge.status === "REJECTED" || edge.riskStatus !== "clear" || edge.owner.status !== "ACTIVE" || edge.referredUser?.status !== "ACTIVE") { validPath = false; break; }
      if (depth === row.level && edge.id !== row.referralId) validPath = false;
      descendant = edge.userId;
    }
  }
  const refundedMinor = dispute === "payment.dispute.lost" ? row.paidMinor : Math.min(row.paidMinor, [...refunds.values()].reduce((a, b) => a + b, 0));
  let reconciledEvidence: { eligibleNetRevenueMinor: number | null; status: string } | null = null;
  if (row.policyVersion >= 2) reconciledEvidence = await tx.acquisitionRevenueEvidence.findUnique({ where: { paymentId }, select: { eligibleNetRevenueMinor: true, status: true } });
  const netMinor = row.policyVersion >= 2
    ? (reconciledEvidence?.status === "RECONCILED" && reconciledEvidence.eligibleNetRevenueMinor !== null ? commissionMinor(reconciledEvidence.eligibleNetRevenueMinor, row.rateBps) : row.netMinor)
    : remainingCommissionMinor(row.originalMinor, row.paidMinor, refundedMinor);
  const held = !validPath || unknownRefund || pendingRefunds.size > 0 || dispute === "payment.dispute.created" || row.referral.riskStatus !== "clear" || row.referral.status === "REJECTED" || row.referral.owner.status !== "ACTIVE" || row.referral.referredUser?.status !== "ACTIVE" || (row.policyVersion >= 2 && reconciledEvidence?.status !== "RECONCILED");
  const status = netMinor === 0 ? "REVERSED" : held ? "HELD" : row.eligibleAt > now ? "PENDING" : "AVAILABLE";
  if (row.netMinor !== netMinor || row.status !== status || row.refundedMinor !== refundedMinor) {
    if (row.netMinor !== netMinor) await tx.referralCommissionAdjustment.create({ data: { commissionId: row.id, previousMinor: row.netMinor, amountMinor: netMinor - row.netMinor, resultingMinor: netMinor, eligibleNetRevenueMinor: reconciledEvidence?.eligibleNetRevenueMinor, rateBps: row.rateBps, policyVersion: row.policyVersion, reason: `Payment ${paymentId}; verified refunds ${refundedMinor}; evidence ${reconciledEvidence?.status ?? "legacy provider reconciliation"}` } });
    await tx.referralCommission.update({ where: { id: row.id }, data: { netMinor, refundedMinor, ...(row.policyVersion >= 2 && reconciledEvidence?.status === "RECONCILED" ? { eligibleNetRevenueMinor: reconciledEvidence.eligibleNetRevenueMinor } : {}), status } });
    await tx.auditLog.create({ data: { actorType: "system", action: "REFERRAL_COMMISSION_UPDATED", entity: "referral_commission", entityId: String(row.id), metadata: { previousStatus: row.status, status, previousMinor: row.netMinor, netMinor, refundedMinor, eligibleNetRevenueMinor: reconciledEvidence?.eligibleNetRevenueMinor ?? null, policyVersion: row.policyVersion } } });
  } else await tx.referralCommission.update({ where: { id: row.id }, data: { updatedAt: now } });
  }
}

// Revalidate the full path at withdrawal time. A suspended intermediate account
// cannot be bypassed by withdrawing before the next reconciliation run.
export async function clearedReferralMinor(tx: Tx, userId: number) {
  const rows = await tx.$queryRaw<Array<{ total: bigint }>>`WITH RECURSIVE paths AS (
    SELECT c.id, c.net_minor, c.level, c.referral_id AS target, 1 AS depth,
      r.id AS edge, r.user_id AS ancestor, ARRAY[r.referred_user_id,r.user_id] AS visited
    FROM referral_commissions c JOIN referrals beneficiary ON beneficiary.id = c.referral_id
    JOIN referrals r ON r.id = COALESCE(c.origin_referral_id,c.referral_id)
    JOIN users owner ON owner.id = r.user_id JOIN users buyer ON buyer.id = r.referred_user_id
    WHERE beneficiary.user_id = ${userId} AND c.status = 'AVAILABLE'
      AND NOT EXISTS (SELECT 1 FROM payment_webhook_events e WHERE e.payment_id = c.payment_id AND e.signature_valid = true AND e.processing_state <> 'processed' AND e.event_type IN ('refund.created','refund.processed','payment.dispute.created','payment.dispute.lost'))
      AND r.status <> 'REJECTED' AND r.risk_status = 'clear' AND owner.status = 'ACTIVE' AND buyer.status = 'ACTIVE'
    UNION ALL SELECT p.id,p.net_minor,p.level,p.target,p.depth+1,r.id,r.user_id,p.visited || r.user_id
    FROM paths p JOIN referrals r ON r.referred_user_id = p.ancestor
    JOIN users u ON u.id = r.user_id JOIN users child ON child.id = r.referred_user_id
    WHERE p.depth < p.level AND p.depth < 7 AND NOT r.user_id = ANY(p.visited)
      AND r.status <> 'REJECTED' AND r.risk_status = 'clear' AND u.status = 'ACTIVE' AND child.status = 'ACTIVE'
  ) SELECT COALESCE(SUM(net_minor),0)::bigint AS total FROM paths WHERE depth = level AND edge = target`;
  return Number(rows[0]?.total || 0);
}
async function cashBalance(tx: Tx, userId: number) {
  const [earnings, payouts] = await Promise.all([
    clearedReferralMinor(tx, userId),
    tx.referralCommissionPayout.aggregate({ where: { userId, status: { in: ["REQUESTED", "PAID"] } }, _sum: { amountMinor: true } }),
  ]);
  return earnings - (payouts._sum.amountMinor || 0);
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
    if (amountMinor < REFERRAL_MINIMUM_PAYOUT_MINOR) throw new Error(`At least Rs ${REFERRAL_MINIMUM_PAYOUT_MINOR / 100} in cleared commission is required.`);
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
