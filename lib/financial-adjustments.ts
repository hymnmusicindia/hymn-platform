import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function requestFinancialAdjustment(input: { userId: number; amount: Prisma.Decimal.Value; currency?: string; reason: string; requestedBy: number; requestKey: string }) {
  const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(6);
  if (amount.isZero()) throw new Error("Adjustment amount cannot be zero.");
  if (input.reason.trim().length < 10) throw new Error("A detailed adjustment reason is required.");
  const user = await prisma.user.findUnique({ where: { id: input.userId } }); if (!user) throw new Error("Adjustment user not found.");
  const idempotencyKey = createHash("sha256").update(`${input.requestedBy}:${input.requestKey.trim()}:${input.userId}:${amount.toString()}`).digest("hex");
  return prisma.$transaction(async tx => {
    const adjustment = await tx.financialAdjustment.create({ data: { userId: input.userId, amount, currency: input.currency?.trim().toUpperCase() || "INR", reason: input.reason.trim(), requestedBy: input.requestedBy, idempotencyKey } });
    await tx.auditLog.create({ data: { actorId: input.requestedBy, action: "FINANCIAL_ADJUSTMENT_REQUESTED", entity: "financial_adjustment", entityId: String(adjustment.id), metadata: { userId: input.userId, amount: amount.toString(), currency: adjustment.currency, reason: adjustment.reason } } });
    return adjustment;
  });
}

export async function decideFinancialAdjustment(input: { id: number; decision: "approved" | "rejected"; note: string; approvedBy: number }) {
  if (input.note.trim().length < 10) throw new Error("A detailed decision note is required.");
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM financial_adjustments WHERE id = ${input.id} FOR UPDATE`;
    const adjustment = await tx.financialAdjustment.findUnique({ where: { id: input.id } });
    if (!adjustment || adjustment.state !== "pending") throw new Error("Pending financial adjustment not found.");
    if (adjustment.requestedBy === input.approvedBy) throw new Error("The requester cannot approve or reject their own financial adjustment.");
    if (input.decision === "rejected") {
      const rejected = await tx.financialAdjustment.update({ where: { id: adjustment.id }, data: { state: "rejected", approvedBy: input.approvedBy, decisionNote: input.note.trim(), decidedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: input.approvedBy, action: "FINANCIAL_ADJUSTMENT_REJECTED", entity: "financial_adjustment", entityId: String(adjustment.id), metadata: { requester: adjustment.requestedBy, note: input.note.trim() } } }); return rejected;
    }
    await tx.$queryRaw`SELECT id FROM artist_payout_balances WHERE user_id = ${adjustment.userId} FOR UPDATE`;
    const current = await tx.artistPayoutBalance.findUnique({ where: { userId: adjustment.userId } });
    const next = new Prisma.Decimal(current?.availableBalance ?? 0).add(adjustment.amount);
    if (next.isNegative()) throw new Error("Adjustment would make the available balance negative.");
    const balance = await tx.artistPayoutBalance.upsert({ where: { userId: adjustment.userId }, create: { userId: adjustment.userId, availableBalance: adjustment.amount, lifetimeEarnings: adjustment.amount, currency: adjustment.currency }, update: { availableBalance: { increment: adjustment.amount }, lifetimeEarnings: { increment: adjustment.amount }, lastUpdatedAt: new Date() } });
    await tx.walletTransaction.create({ data: { userId: adjustment.userId, type: "manual_adjustment", amount: adjustment.amount, currency: adjustment.currency, direction: adjustment.amount.isNegative() ? "debit" : "credit", referenceType: "financial_adjustment", referenceId: String(adjustment.id), idempotencyKey: `financial-adjustment:${adjustment.id}:applied`, balanceAfter: balance.availableBalance, auditMetadata: { requestedBy: adjustment.requestedBy, approvedBy: input.approvedBy, requestReason: adjustment.reason, decisionNote: input.note.trim() } } });
    const applied = await tx.financialAdjustment.update({ where: { id: adjustment.id }, data: { state: "applied", approvedBy: input.approvedBy, decisionNote: input.note.trim(), decidedAt: new Date(), appliedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: input.approvedBy, action: "FINANCIAL_ADJUSTMENT_APPLIED", entity: "financial_adjustment", entityId: String(adjustment.id), metadata: { requester: adjustment.requestedBy, userId: adjustment.userId, amount: adjustment.amount.toString(), note: input.note.trim() } } }); return applied;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
// vercel trigger 9
