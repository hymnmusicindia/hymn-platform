import { prisma } from "@/lib/prisma";
import { createNotificationOnce } from "@/lib/notifications";
import { logAuditEvent } from "@/lib/audit-log";

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const number = (value: any) => typeof value?.toNumber === "function" ? value.toNumber() : Number(value ?? 0);

export function validateSplitRecord(splitRecord: any) {
  const eligible = splitRecord.recipients.filter((row: any) => row.payoutEligible && row.inviteStatus !== "declined" && row.inviteStatus !== "revoked");
  const total = money(eligible.reduce((sum: number, row: any) => sum + number(row.sharePercent), 0));
  return { valid: Math.abs(total - 100) < 0.001, total, error: Math.abs(total - 100) < 0.001 ? null : "Split total must equal 100% before earnings can be distributed." };
}

export function calculateSplitEarnings(royalty: any, splitRecord: any) {
  const validation = validateSplitRecord(splitRecord);
  if (!validation.valid) throw new Error(validation.error!);
  const artistPool = number(royalty.netRevenue);
  return splitRecord.recipients.filter((row: any) => row.payoutEligible && !["declined", "revoked"].includes(row.inviteStatus)).map((row: any, index: number, all: any[]) => {
    const allocatedBefore = all.slice(0, index).reduce((sum, prior) => sum + money(artistPool * number(prior.sharePercent) / 100), 0);
    const amount = index === all.length - 1 ? money(artistPool - allocatedBefore) : money(artistPool * number(row.sharePercent) / 100);
    return { recipient: row, sharePercent: number(row.sharePercent), amount };
  });
}

export async function creditSplitRecipients(royaltyLineItemId: number, actorId?: number | null) {
  const royalty = await (prisma as any).royaltyLineItem.findUnique({ where: { id: royaltyLineItemId }, include: { release: true } });
  if (!royalty?.releaseId) throw new Error("Royalty line item must be linked to a release.");
  const statement = new Date(royalty.statementMonth);
  const split = await (prisma as any).splitRecord.findFirst({ where: {
    releaseId: royalty.releaseId, trackId: royalty.trackId ?? null, status: { in: ["active", "pending_acceptance", "locked"] },
    OR: [{ effectiveFromYear: null }, { effectiveFromYear: { lt: statement.getUTCFullYear() } }, { effectiveFromYear: statement.getUTCFullYear(), effectiveFromMonth: { lte: statement.getUTCMonth() + 1 } }]
  }, include: { recipients: true }, orderBy: { createdAt: "desc" } });
  if (!split) return { applied: false, reason: "No active split record; owner earnings remain on the existing payout path." };
  const calculated = calculateSplitEarnings(royalty, split);
  const created = await (prisma as any).$transaction(async (tx: any) => {
    const rows = [];
    for (const item of calculated) {
      const credential = item.recipient.recipientUserId ? await tx.payoutCredential.findUnique({ where: { userId: item.recipient.recipientUserId } }) : null;
      const creditable = item.recipient.inviteStatus === "accepted" && item.recipient.recipientUserId && credential;
      const status = creditable ? "credited" : item.recipient.inviteStatus === "accepted" ? "pending_payout_details" : "held";
      const earning = await tx.splitEarningLineItem.create({ data: {
        royaltyLineItemId: royalty.id, splitRecordId: split.id, recipientUserId: item.recipient.recipientUserId,
        recipientEmail: item.recipient.recipientEmail, recipientName: item.recipient.recipientName, recipientRole: item.recipient.role,
        releaseId: royalty.releaseId, trackId: royalty.trackId, sharePercent: item.sharePercent,
        grossShareAmount: item.amount, netShareAmount: item.amount, currency: "INR", status
      } });
      if (creditable) {
        const balance = await tx.artistPayoutBalance.upsert({ where: { userId: item.recipient.recipientUserId }, create: { userId: item.recipient.recipientUserId, availableBalance: item.amount, lifetimeEarnings: item.amount }, update: { availableBalance: { increment: item.amount }, lifetimeEarnings: { increment: item.amount }, lastUpdatedAt: new Date() } });
        await tx.walletTransaction.create({ data: { userId: item.recipient.recipientUserId, type: "earning_credit", amount: item.amount, referenceType: "split_earning", referenceId: String(earning.id), balanceAfter: balance.availableBalance, note: `Split earnings for ${royalty.release.title}` } });
      }
      rows.push(earning);
    }
    await tx.splitRecord.update({ where: { id: split.id }, data: { status: "locked", lockedAt: split.lockedAt ?? new Date() } });
    return rows;
  });
  await Promise.all(created.filter((row: any) => row.recipientUserId).map((row: any) => createNotificationOnce({ eventKey: `earnings:${row.recipientUserId}:${royalty.releaseId}:${statement.getUTCMonth()+1}:${statement.getUTCFullYear()}`, userId: row.recipientUserId, title: "Split earnings updated", body: `Your split earnings for “${royalty.release.title}” have been updated.`, type: "payout", href: "/payout", actionLabel: "View payout" })));
  await logAuditEvent({ actorType: "admin", actorId: actorId ?? null, entityType: "royalty_line_item", entityId: royalty.id, action: "split.calculated", newValue: { splitRecordId: split.id, recipients: created.length, artistPool: number(royalty.netRevenue) } });
  return { applied: true, splitRecordId: split.id, earnings: created };
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
  const earning = await (prisma as any).splitEarningLineItem.findUnique({ where: { id: referenceId } });
  if (!earning || earning.status === "reversed") throw new Error("Credited split earning not found or already reversed.");
  await (prisma as any).$transaction(async (tx: any) => {
    if (earning.status === "credited" && earning.recipientUserId) {
      const balance = await tx.artistPayoutBalance.update({ where: { userId: earning.recipientUserId }, data: { availableBalance: { decrement: earning.netShareAmount }, lifetimeEarnings: { decrement: earning.netShareAmount }, lastUpdatedAt: new Date() } });
      await tx.walletTransaction.create({ data: { userId: earning.recipientUserId, type: "payout_reversal", amount: -number(earning.netShareAmount), referenceType: "split_earning_reversal", referenceId: String(earning.id), balanceAfter: balance.availableBalance, note } });
    }
    await tx.splitEarningLineItem.update({ where: { id: earning.id }, data: { status: "reversed" } });
  });
  await logAuditEvent({ actorType: "admin", actorId: actorId ?? null, entityType: "split_earning", entityId: earning.id, action: "earning.reversed", oldValue: { status: earning.status }, newValue: { status: "reversed" }, metadata: { note } });
}
