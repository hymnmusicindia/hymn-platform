import { accrueReferralCommission } from "@/lib/referral-commissions";
import { REFERRAL_COMMISSION_RATES, REFERRAL_HOLD_DAYS } from "@/lib/referral-commission-policy";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const rewardPolicySchema = z.object({
  artistCredit: z.number().int().min(0).max(10000),
  halfYearlyCommission: z.number().int().min(0).max(10000), annualCommission: z.number().int().min(0).max(10000), labelCommission: z.number().int().min(0).max(10000),
  coolingDays: z.number().int().min(1).max(90), payoutMinimum: z.number().int().min(0).max(100000)
});
export async function newReferralRewardPolicy(tx: Prisma.TransactionClient) {
  void tx;
  return { version: 3, rates: REFERRAL_COMMISSION_RATES, coolingDays: REFERRAL_HOLD_DAYS, lifetime: true };
}
export const referralPolicySnapshotSchema = z.object({ version: z.literal(2), amount: z.number().int().min(0).max(10000), coolingDays: z.number().int().min(1).max(90), plans: z.array(z.string()) });

export async function qualifyRecurringReferral(paymentId: number) {
  return prisma.$transaction(async tx => {
    await accrueReferralCommission(tx, "subscription_payment", paymentId);
    const payment = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { subscription: true } });
    if (payment.status !== "captured" || payment.amount <= 0 || payment.currency !== "INR") return;
    const referral = await tx.referral.findUnique({ where: { referredUserId: payment.subscription.userId } });
    if (!referral?.rewardPolicy || referral.status !== "PENDING") return;
    const parsed = referralPolicySnapshotSchema.safeParse(referral.rewardPolicy);
    if (!parsed.success) return;
    const policy = parsed.data;
    const adverse = await tx.paymentWebhookEvent.findFirst({ where: { paymentId: payment.razorpayPaymentId, signatureValid: true, eventType: { in: ["refund.created", "refund.processed", "payment.dispute.created", "payment.dispute.lost"] } } });
    if (adverse) return;
    if (!policy.plans.includes(payment.subscription.plan) || payment.createdAt < referral.createdAt || referral.userId === payment.subscription.userId) return;
    const claimed = await tx.referral.updateMany({ where: { id: referral.id, status: "PENDING", qualifyingTransactionId: null }, data: { status: "QUALIFIED", qualifiedAt: new Date(), qualifyingTransactionType: "subscription_payment", qualifyingTransactionId: String(payment.id), qualifyingPaymentId: payment.razorpayPaymentId, purchaseAmount: Math.round(payment.amount / 100) } });
    if (!claimed.count) return;
    await tx.notification.upsert({ where: { eventKey: `referral:${referral.id}:qualified` }, update: {}, create: { userId: referral.userId, title: "Your referral reached the next step", body: `A qualifying purchase was received. Your referral credit will be reviewed after the ${policy.coolingDays}-day verification period.`, type: "account", href: "/dashboard?tab=referral", eventKey: `referral:${referral.id}:qualified` } });
    await tx.auditLog.create({ data: { action: "REFERRAL_REWARD_PENDING", entity: "referral", entityId: String(referral.id), metadata: { paymentId: payment.id, amount: policy.amount, coolingDays: policy.coolingDays } } });
  });
}

export async function approveRecurringReferral(referralId: number, actorId: number | null, note: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM referrals WHERE id = ${referralId} FOR UPDATE`;
    const referral = await tx.referral.findUniqueOrThrow({ where: { id: referralId } });
    const policy = referralPolicySnapshotSchema.parse(referral.rewardPolicy);
    if (referral.status !== "QUALIFIED" || referral.qualifyingTransactionType !== "subscription_payment" || !referral.qualifiedAt || referral.riskStatus !== "clear") throw new Error("Referral is not eligible for approval.");
    if (Date.now() < referral.qualifiedAt.getTime() + policy.coolingDays * 86400000) throw new Error("The verification period has not ended.");
    const payment = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id: Number(referral.qualifyingTransactionId) }, include: { subscription: true } });
    if (payment.status !== "captured" || payment.amount <= 0 || payment.currency !== "INR" || payment.subscription.userId !== referral.referredUserId || !policy.plans.includes(payment.subscription.plan)) throw new Error("Payment is no longer eligible.");
    const adverseEvent = await tx.paymentWebhookEvent.findFirst({ where: { paymentId: payment.razorpayPaymentId, signatureValid: true, eventType: { in: ["refund.created", "refund.processed", "payment.dispute.created", "payment.dispute.lost"] } }, select: { id: true } });
    if (adverseEvent) throw new Error("Payment requires refund or dispute review.");
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${referral.userId} FOR UPDATE`;
    const accounts = await tx.user.count({ where: { id: { in: [referral.userId, referral.referredUserId!] }, status: "ACTIVE" } });
    if (accounts !== 2) throw new Error("Both referral accounts must be active.");
    const user = await tx.user.update({ where: { id: referral.userId }, data: { referralCredits: { increment: policy.amount } } });
    await tx.creditLedgerEntry.create({ data: { userId: user.id, type: "REFERRAL_REWARD", bucket: "HYMN_CREDIT", amount: policy.amount, direction: "credit", sourceType: "referral", sourceId: String(referral.id), description: "Recurring-plan referral reward", idempotencyKey: `REFERRAL_REWARD:${referral.id}:REFERRER`, balanceAfter: user.referralCredits, metadata: { paymentId: payment.id, policy: referral.rewardPolicy } } });
    await tx.referral.update({ where: { id: referral.id }, data: { status: "REWARDED", earnings: policy.amount, referredReward: 0, rewardedAt: new Date() } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "REFERRAL_REWARD_APPROVED", entity: "referral", entityId: String(referral.id), reason: note, metadata: { amount: policy.amount } } });
    await tx.notification.create({ data: { userId: user.id, title: "Referral credit approved", body: `₹${policy.amount} HYMN credit has been added to your account.`, type: "account", href: "/dashboard?tab=referral", eventKey: `referral:${referral.id}:v2-approved` } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
