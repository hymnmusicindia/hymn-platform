import { prisma } from "@/lib/prisma";
import { logAuditEvent } from "@/lib/audit-log";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const number = (value: any) => typeof value?.toNumber === "function" ? value.toNumber() : Number(value ?? 0);

export function validateSplitRecord(splitRecord: any) {
  // A recipient's acceptance is the financial consent boundary. Pending, declined,
  // revoked, and expired invitations must never participate in a payable allocation.
  const eligible = splitRecord.recipients.filter((row: any) => row.payoutEligible && row.inviteStatus === "accepted");
  if (eligible.some((row: any) => !Number.isFinite(number(row.sharePercent)) || number(row.sharePercent) <= 0 || number(row.sharePercent) > 100)) return { valid: false, total: 0, error: "Every payout share must be between 0.01 and 100%." };
  const total = money(eligible.reduce((sum: number, row: any) => sum + number(row.sharePercent), 0));
  return { valid: Math.abs(total - 100) < 0.001, total, error: Math.abs(total - 100) < 0.001 ? null : "Split total must equal 100% before earnings can be distributed." };
}

export function calculateSplitEarnings(royalty: any, splitRecord: any) {
  const validation = validateSplitRecord(splitRecord);
  if (!validation.valid) throw new Error(validation.error!);
  const artistPool = number(royalty.netRevenue);
  if (!Number.isFinite(artistPool) || artistPool < 0) throw new Error("Royalty amount must be a non-negative finite value.");
  const recipients = splitRecord.recipients.filter((row: any) => row.payoutEligible && row.inviteStatus === "accepted");
  const cents = Math.round(artistPool * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Royalty amount exceeds the supported range.");
  const parts = recipients.map((recipient: any, index: number) => {
    const numerator = BigInt(cents) * BigInt(Math.round(number(recipient.sharePercent) * 100));
    return { recipient, index, cents: Number(numerator / 10000n), remainder: Number(numerator % 10000n) };
  });
  const remaining = cents - parts.reduce((sum: number, part: any) => sum + part.cents, 0);
  const ranking = [...parts].sort((a: any, b: any) => b.remainder - a.remainder || a.index - b.index);
  for (let i = 0; i < remaining; i++) ranking[i % ranking.length].cents++;
  return parts.map((part: any) => ({ recipient: part.recipient, sharePercent: number(part.recipient.sharePercent), amount: part.cents / 100 }));
}

/** Caller must hold the royalty row lock. Used inside earnings import's transaction. */
export async function allocateSplitInTransaction(tx: any, royaltyLineItemId: number) {
  await tx.$queryRaw`SELECT id FROM royalty_line_items WHERE id = ${royaltyLineItemId} FOR UPDATE`;
  const royalty = await tx.royaltyLineItem.findUniqueOrThrow({ where: { id: royaltyLineItemId }, include: { release: true } });
  const existing = await tx.splitEarningLineItem.findMany({ where: { royaltyLineItemId } });
  if (existing.length) return { applied: true as const, splitRecordId: existing[0].splitRecordId, earnings: existing, duplicate: true };
  const statement = new Date(royalty.statementMonth);
  const eligibleDate = { OR: [{ effectiveFromYear: null }, { effectiveFromYear: { lt: statement.getUTCFullYear() } }, { effectiveFromYear: statement.getUTCFullYear(), effectiveFromMonth: { lte: statement.getUTCMonth() + 1 } }] };
  const split = await tx.splitRecord.findFirst({ where: { releaseId: royalty.releaseId, ownerUserId: royalty.release.userId, status: { in: ["active", "locked"] }, AND: [eligibleDate, { OR: [{ trackId: royalty.trackId ?? null }, { trackId: null }] }] }, orderBy: [{ trackId: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }] });
  if (!split) return { applied: false as const, reason: "No active, fully accepted agreement for this statement period." };
  await tx.$queryRaw`SELECT id FROM split_records WHERE id = ${split.id} FOR UPDATE`;
  const current = await tx.splitRecord.findUniqueOrThrow({ where: { id: split.id }, include: { recipients: true } });
  if (!["active", "locked"].includes(current.status)) throw new Error("Split agreement changed during allocation. Retry the import.");
  const calculated = calculateSplitEarnings(royalty, current);
  const rows = [];
  for (const item of [...calculated].sort((a: any, b: any) => a.recipient.recipientUserId - b.recipient.recipientUserId)) {
    if (!item.recipient.recipientUserId) throw new Error("Accepted recipients must have a registered account.");
    // Serialize profile verification and allocation so held earnings cannot miss a review.
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${item.recipient.recipientUserId} FOR UPDATE`;
    const credential = await tx.payoutCredential.findUnique({ where: { userId: item.recipient.recipientUserId } });
    const creditable = credential?.status === "verified";
    const earning = await tx.splitEarningLineItem.create({ data: { royaltyLineItemId: royalty.id, splitRecordId: current.id, recipientUserId: item.recipient.recipientUserId, recipientEmail: item.recipient.recipientEmail, recipientName: item.recipient.recipientName, recipientRole: item.recipient.role, releaseId: royalty.releaseId, trackId: royalty.trackId, sharePercent: item.sharePercent, grossShareAmount: item.amount, netShareAmount: item.amount, currency: "INR", status: creditable ? "credited" : "pending_payout_details" } });
    if (creditable) {
      const userId = item.recipient.recipientUserId;
      const balance = await tx.artistPayoutBalance.upsert({ where: { userId }, create: { userId, availableBalance: item.amount, lifetimeEarnings: item.amount }, update: { availableBalance: { increment: item.amount }, lifetimeEarnings: { increment: item.amount }, lastUpdatedAt: new Date() } });
      await tx.walletTransaction.create({ data: { userId, type: "earning_credit", amount: item.amount, direction: "credit", idempotencyKey: `split-earning:${earning.id}:credit`, referenceType: "split_earning", referenceId: String(earning.id), balanceAfter: balance.availableBalance, note: `Split earnings for ${royalty.release.title}` } });
    }
    await tx.notification.createMany({ data: [{ userId: item.recipient.recipientUserId, eventKey: `split-earnings:${item.recipient.recipientUserId}:${royalty.releaseId}:${statement.getUTCFullYear()}:${statement.getUTCMonth() + 1}`, title: "Split earnings updated", body: `Your royalty share for "${royalty.release.title}" has been allocated.`, type: "payout", href: "/dashboard?tab=collaborators&splitView=earnings" }], skipDuplicates: true });
    rows.push(earning);
  }
  await tx.splitRecord.update({ where: { id: current.id }, data: { status: "locked", lockedAt: current.lockedAt ?? new Date() } });
  return { applied: true as const, splitRecordId: current.id, earnings: rows, duplicate: false };
}
export async function creditSplitRecipients(royaltyLineItemId: number, actorId?: number | null) {
  // Historical owner-paid royalties must not be retroactively diverted to a new agreement.
  const existing = await prisma.splitEarningLineItem.findMany({ where: { royaltyLineItemId } });
  if (!existing.length) return { applied: false, reason: "Historical owner-paid royalties are preserved. New splits apply during import; retroactive changes require a finance-reviewed adjustment." };
  await logAuditEvent({ actorType: "admin", actorId: actorId ?? null, entityType: "royalty_line_item", entityId: royaltyLineItemId, action: "split.recalculation_skipped", newValue: { reason: "already_allocated" } });
  return { applied: true, splitRecordId: existing[0].splitRecordId, earnings: existing, duplicate: true };
}

export async function updateUserWalletBalance(userId: number) {
  const aggregate = await (prisma as any).walletTransaction.aggregate({ where: { userId }, _sum: { amount: true } });
  return number(aggregate._sum.amount);
}

export async function recalculateReleaseSplitEarnings(releaseId: number) {
  const royalties = await (prisma as any).royaltyLineItem.findMany({ where: { releaseId } });
  const results = [];
  for (const royalty of royalties) results.push(await creditSplitRecipients(royalty.id));
  return results;
}

export async function reverseSplitEarnings(referenceId: number, actorId?: number | null, note = "Administrative reversal") {
  const initial = await (prisma as any).splitEarningLineItem.findUnique({ where: { id: referenceId } });
  if (!initial || initial.status === "reversed") throw new Error("Credited split earning not found or already reversed.");
  await (prisma as any).$transaction(async (tx: any) => {
    if (initial.recipientUserId) await tx.$queryRaw`SELECT id FROM users WHERE id = ${initial.recipientUserId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM split_earning_line_items WHERE id = ${referenceId} FOR UPDATE`;
    const earning = await tx.splitEarningLineItem.findUniqueOrThrow({ where: { id: referenceId } });
    if (earning.status === "reversed") throw new Error("This earning was already reversed.");
    if (earning.status === "credited" && earning.recipientUserId) {
      const balance = await tx.artistPayoutBalance.update({ where: { userId: earning.recipientUserId }, data: { availableBalance: { decrement: earning.netShareAmount }, lifetimeEarnings: { decrement: earning.netShareAmount }, lastUpdatedAt: new Date() } });
      await tx.walletTransaction.create({ data: { userId: earning.recipientUserId, type: "payout_reversal", amount: -number(earning.netShareAmount), direction: "debit", idempotencyKey: `split-earning:${earning.id}:reversal`, referenceType: "split_earning_reversal", referenceId: String(earning.id), balanceAfter: balance.availableBalance, note } });
    }
    await tx.splitEarningLineItem.update({ where: { id: earning.id }, data: { status: "reversed" } });
  });
  await logAuditEvent({ actorType: "admin", actorId: actorId ?? null, entityType: "split_earning", entityId: initial.id, action: "earning.reversed", oldValue: { status: initial.status }, newValue: { status: "reversed" }, metadata: { note } });
}
// vercel trigger 9
