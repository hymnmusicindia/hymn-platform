import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rewardPolicySchema } from "@/lib/referral-reward-policy";

export const PARTNER_COOKIE = "hymn_partner_attribution";
export async function attachPartnerReferral(userId: number) {
  const store = await cookies(); const code = store.get(PARTNER_COOKIE)?.value;
  if (!code) return;
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (Date.now() - user.createdAt.getTime() > 7 * 86400000 || user.referredById) return;
      const partner = await tx.growthPartner.findUnique({ where: { code } });
      if (!partner || partner.status !== "approved" || partner.email.toLowerCase() === user.email.toLowerCase()) return;
      const policy = rewardPolicySchema.parse(await tx.growthRewardPolicy.findUniqueOrThrow({ where: { id: 1 } }));
      await tx.partnerReferral.createMany({ data: [{ partnerId: partner.id, userId, policy }], skipDuplicates: true });
    });
    store.delete(PARTNER_COOKIE);
  } catch { console.warn(JSON.stringify({ scope: "growth", event: "partner_attribution", status: "retry_required" })); }
}

export async function qualifyPartnerPayment(paymentId: number) {
  return prisma.$transaction(async tx => {
    const payment = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id: paymentId }, include: { subscription: true } });
    if (payment.status !== "captured" || payment.currency !== "INR" || payment.amount <= 0) return;
    const referral = await tx.partnerReferral.findUnique({ where: { userId: payment.subscription.userId }, include: { partner: true } });
    if (!referral || referral.partner.status !== "approved" || payment.createdAt < referral.createdAt) return;
    const policy = rewardPolicySchema.parse(referral.policy);
    const plan = payment.subscription.plan;
    const amount = plan === "half_yearly" ? policy.halfYearlyCommission : plan === "yearly" ? policy.annualCommission : plan === "yearly_plus" ? policy.labelCommission : 0;
    if (!amount) return;
    await tx.partnerReward.createMany({ data: [{ referralId: referral.id, subscriptionPaymentId: payment.id, amount, plan, eligibleAt: new Date(Date.now() + policy.coolingDays * 86400000) }], skipDuplicates: true });
  });
}

export async function reviewPartnerReward(input: { id: number; action: "approve" | "reject" | "reverse"; actorId: number | null; note: string }) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM partner_rewards WHERE id = ${input.id} FOR UPDATE`;
    const reward = await tx.partnerReward.findUniqueOrThrow({ where: { id: input.id }, include: { referral: { include: { partner: true } } } });
    if (input.action === "approve") {
      if (reward.status !== "pending" || reward.eligibleAt > new Date() || reward.referral.partner.status !== "approved") throw new Error("Reward is not ready for approval.");
      await assertPartnerPayment(tx, reward.subscriptionPaymentId);
    } else if (input.action === "reject" ? reward.status !== "pending" : !["approved", "paid"].includes(reward.status)) throw new Error("Invalid reward transition.");
    const status = input.action === "approve" ? "approved" : input.action === "reject" ? "rejected" : "reversed";
    await tx.partnerReward.update({ where: { id: reward.id }, data: { status, ...(status === "approved" ? { approvedAt: new Date() } : {}) } });
    await tx.auditLog.create({ data: { actorType: "admin", actorId: input.actorId, action: `PARTNER_REWARD_${status.toUpperCase()}`, entity: "partner_reward", entityId: String(reward.id), reason: input.note, metadata: { before: reward.status, after: status, amount: reward.amount, manualRecoveryRequired: reward.status === "paid" } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function assertPartnerPayment(tx: Prisma.TransactionClient, id: number) {
  const payment = await tx.subscriptionPayment.findUniqueOrThrow({ where: { id } });
  const adverse = await tx.paymentWebhookEvent.count({ where: { paymentId: payment.razorpayPaymentId, signatureValid: true, eventType: { in: ["refund.created", "refund.processed", "payment.dispute.created", "payment.dispute.lost"] } } });
  if (payment.status !== "captured" || adverse) throw new Error("Payment requires review.");
}

export async function recordPartnerPayout(partnerId: number, reference: string, actorId: number | null) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM growth_partners WHERE id = ${partnerId} FOR UPDATE`;
    const partner = await tx.growthPartner.findUniqueOrThrow({ where: { id: partnerId } });
    if (partner.status !== "approved") throw new Error("Partner is suspended.");
    const rewards = await tx.partnerReward.findMany({ where: { referral: { partnerId }, status: "approved" }, orderBy: { id: "asc" } });
    const policy = await tx.growthRewardPolicy.findUniqueOrThrow({ where: { id: 1 } });
    const total = rewards.reduce((sum, row) => sum + row.amount, 0);
    if (!rewards.length || total < policy.payoutMinimum) throw new Error("Minimum payout has not been reached.");
    for (const reward of rewards) await assertPartnerPayment(tx, reward.subscriptionPaymentId);
    const updated = await tx.partnerReward.updateMany({ where: { id: { in: rewards.map(row => row.id) }, status: "approved" }, data: { status: "paid", paidAt: new Date(), payoutReference: reference } });
    if (updated.count !== rewards.length) throw new Error("Rewards changed; review again.");
    await tx.auditLog.create({ data: { actorType: "admin", actorId, action: "PARTNER_MANUAL_PAYOUT_RECORDED", entity: "growth_partner", entityId: String(partnerId), metadata: { total, reference, rewardIds: rewards.map(row => row.id) } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
