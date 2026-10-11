import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getPublicAppUrl } from "@/lib/public-app-url";
import { newReferralRewardPolicy } from "@/lib/referral-reward-policy";

export const REFERRER_REWARD_INR = 5;
export const REFERRED_USER_REWARD_INR = 3;
export const REFERRAL_ATTRIBUTION_COOKIE = "hymn_referral_attribution";
export const REFERRAL_ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ReferralStatus = "ATTRIBUTED" | "REGISTERED" | "PENDING" | "QUALIFIED" | "REWARDED" | "REVERSED" | "REJECTED";
type Tx = Prisma.TransactionClient;

export function normalizeReferralCode(value?: string | null) {
  return value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
}

export function referralCodeCandidate(name: string) {
  const prefix = name.normalize("NFKD").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6) || "HYMN";
  const suffix = crypto.randomBytes(3).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 4).padEnd(4, "X");
  return `${prefix}${suffix}`;
}

export async function createUniqueReferralCode(tx: Tx, name: string) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = referralCodeCandidate(name);
    const exists = await tx.user.findUnique({ where: { referralCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not allocate a unique referral code. Please try again.");
}

export async function registerReferralForNewUser(tx: Tx, input: { referredUserId: number; referredEmail: string; referralCode?: string | null }) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${input.referredUserId} FOR UPDATE`;
  const code = normalizeReferralCode(input.referralCode);
  if (!code) return null;
  const [referredUser, referrer, existing] = await Promise.all([
    tx.user.findUnique({ where: { id: input.referredUserId }, select: { id: true, email: true, status: true, referredById: true, createdAt: true } }),
    tx.user.findFirst({ where: { referralCode: { equals: code, mode: "insensitive" } }, select: { id: true, email: true, referralCode: true, status: true } }),
    tx.referral.findUnique({ where: { referredUserId: input.referredUserId } })
  ]);
  if (!referredUser || referredUser.status !== "ACTIVE") throw new Error("Referred account was not found.");
  if (!referrer || referrer.status !== "ACTIVE") throw new Error("This referral code isn't valid.");
  if (existing || referredUser.referredById) throw new Error("A referral has already been associated with this account.");
  if (await tx.partnerReferral.findUnique({ where: { userId: input.referredUserId } })) throw new Error("A partner referral has already been associated with this account.");
  if (referrer.id === referredUser.id || referrer.email.toLowerCase() === input.referredEmail.toLowerCase()) throw new Error("You can't use your own referral code.");

  const reverse = await tx.referral.findFirst({ where: { userId: input.referredUserId, referredUserId: referrer.id }, select: { id: true } });
  if (reverse) throw new Error("Circular referrals are not eligible.");
  const ancestors = await tx.$queryRaw<Array<{ id: number }>>`WITH RECURSIVE ancestry AS (
    SELECT id, referred_by, ARRAY[id] AS visited FROM users WHERE id = ${referrer.id}
    UNION ALL SELECT u.id, u.referred_by, a.visited || u.id FROM users u JOIN ancestry a ON u.id = a.referred_by WHERE NOT u.id = ANY(a.visited)
  ) SELECT id FROM ancestry WHERE id = ${input.referredUserId}`;
  if (ancestors.length) throw new Error("Circular referrals are not eligible.");


  await tx.user.update({ where: { id: input.referredUserId }, data: { referredById: referrer.id, onboardingReferralCode: referrer.referralCode } });
  const referral = await tx.referral.create({ data: {
    userId: referrer.id,
    referredUserId: input.referredUserId,
    referralCode: referrer.referralCode || code,
    signupEmail: input.referredEmail.toLowerCase(),
    rewardPolicy: await newReferralRewardPolicy(tx),
    status: "PENDING",
    registeredAt: new Date()
  } });
  await tx.notification.upsert({
    where: { eventKey: `referral:${referral.id}:registered` },
    create: { userId: referrer.id, title: "A referral joined HYMN", body: "Someone joined HYMN using your referral. Their reward remains pending until a qualifying purchase is verified.", type: "account", href: "/dashboard?tab=referral", actionLabel: "View referrals", eventKey: `referral:${referral.id}:registered`, metadata: { referralId: referral.id } },
    update: {}
  });
  await tx.auditLog.create({ data: { actorType: "user", actorId: input.referredUserId, actorRole: "customer", action: "REFERRAL_SIGNUP_COMPLETED", entity: "referral", entityId: String(referral.id), metadata: { referralCode: referral.referralCode } } });
  return referral;
}

export async function qualifyReferralInTransaction(tx: Tx, input: { referredUserId: number; transactionType: "checkout_order" | "distribution_order"; transactionId: string | number; paymentId: string; paidAmountInr: number; source: string; test?: boolean; adminCreated?: boolean }) {
  if (input.test || input.adminCreated || input.paidAmountInr <= 0 || !input.paymentId.trim()) return { qualified: false as const, reason: "ineligible_transaction" as const };
  const referral = await tx.referral.findUnique({ where: { referredUserId: input.referredUserId } });
  if (!referral || !["PENDING", "REGISTERED"].includes(referral.status)) return { qualified: false as const, reason: "no_pending_referral" as const };
  if (referral.rewardPolicy) return { qualified: false as const, reason: "recurring_plan_required" as const };
  if (referral.userId === input.referredUserId) throw new Error("Self-referral cannot qualify.");

  const claimed = await tx.referral.updateMany({
    where: { id: referral.id, status: { in: ["PENDING", "REGISTERED"] }, qualifyingTransactionId: null },
    data: { status: "QUALIFIED", qualifiedAt: new Date(), qualifyingTransactionType: input.transactionType, qualifyingTransactionId: String(input.transactionId), qualifyingPaymentId: input.paymentId, purchaseAmount: Math.round(input.paidAmountInr) }
  });
  if (claimed.count !== 1) return { qualified: false as const, reason: "already_claimed" as const };

  for (const id of [referral.userId, input.referredUserId].sort((a,b)=>a-b)) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  const [referrer, referred] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: referral.userId }, select: { referralCredits: true } }),
    tx.user.findUniqueOrThrow({ where: { id: input.referredUserId }, select: { referralCredits: true } })
  ]);
  const referrerBalance = Number(referrer.referralCredits) + REFERRER_REWARD_INR;
  const referredBalance = Number(referred.referralCredits) + REFERRED_USER_REWARD_INR;

  await tx.creditLedgerEntry.createMany({ data: [
    { userId: referral.userId, type: "REFERRAL_REWARD", bucket: "REFERRAL_REWARD", amount: REFERRER_REWARD_INR, direction: "credit", sourceType: "referral", sourceId: String(referral.id), description: "Referral reward", idempotencyKey: `REFERRAL_REWARD:${referral.id}:REFERRER`, balanceAfter: referrerBalance, metadata: { paymentId: input.paymentId, source: input.source } },
    { userId: input.referredUserId, type: "REFERRED_USER_BONUS", bucket: "HYMN_CREDIT", amount: REFERRED_USER_REWARD_INR, direction: "credit", sourceType: "referral", sourceId: String(referral.id), description: "HYMN release credit", idempotencyKey: `REFERRAL_REWARD:${referral.id}:REFERRED`, balanceAfter: referredBalance, metadata: { paymentId: input.paymentId, source: input.source } }
  ] });
  await Promise.all([
    tx.user.update({ where: { id: referral.userId }, data: { referralCredits: { increment: REFERRER_REWARD_INR } } }),
    tx.user.update({ where: { id: input.referredUserId }, data: { referralCredits: { increment: REFERRED_USER_REWARD_INR }, firstPaymentRewarded: true } }),
    tx.referral.update({ where: { id: referral.id }, data: { status: "REWARDED", earnings: REFERRER_REWARD_INR, referredReward: REFERRED_USER_REWARD_INR, rewardedAt: new Date() } }),
    tx.notification.upsert({ where: { eventKey: `referral:${referral.id}:referrer-reward` }, create: { userId: referral.userId, title: "Referral reward earned", body: `Your referral qualified. Rs ${REFERRER_REWARD_INR} HYMN referral credit has been added to your account.`, type: "account", href: "/dashboard?tab=referral", actionLabel: "View credits", eventKey: `referral:${referral.id}:referrer-reward`, metadata: { referralId: referral.id } }, update: {} }),
    tx.notification.upsert({ where: { eventKey: `referral:${referral.id}:referred-reward` }, create: { userId: input.referredUserId, title: "HYMN release credit added", body: `Your referral reward is active. Rs ${REFERRED_USER_REWARD_INR} HYMN release credit has been added to your account.`, type: "account", href: "/dashboard?tab=referral", actionLabel: "View credits", eventKey: `referral:${referral.id}:referred-reward`, metadata: { referralId: referral.id } }, update: {} }),
    tx.auditLog.create({ data: { action: "REFERRAL_REWARDED", entity: "referral", entityId: String(referral.id), metadata: { transactionType: input.transactionType, transactionId: String(input.transactionId), paymentId: input.paymentId, referrerReward: REFERRER_REWARD_INR, referredReward: REFERRED_USER_REWARD_INR } } })
  ]);
  return { qualified: true as const, referralId: referral.id };
}

export async function sendReferralRewardEmails(referralId: number) {
  const { sendTransactionalEmail } = await import("@/lib/email/send-transactional-email");
  const referral = await prisma.referral.findUnique({ where: { id: referralId }, include: { owner: { select: { id: true, name: true, email: true } }, referredUser: { select: { id: true, name: true, email: true } } } });
  if (!referral?.referredUser || referral.status !== "REWARDED") return;
  const url = new URL("/dashboard?tab=referral", getPublicAppUrl()).toString();
  const { emailLayout } = await import("@/lib/email/email-templates");
  const rewards = [{ user: referral.owner, amount: referral.earnings, audience: "referrer", subject: "Your HYMN referral reward is ready" }, { user: referral.referredUser, amount: referral.referredReward, audience: "referred", subject: "Your HYMN release credit is active" }];
  await Promise.all(rewards.filter(reward => reward.amount > 0).map(({ user, amount, audience, subject }) => {
    const body = `Rs ${amount} HYMN credit was added to your account. View your credit history for details.`;
    return sendTransactionalEmail({ to: user.email, userId: user.id, subject, template: audience === "referrer" ? "referral_reward_earned" : "referred_user_bonus", eventKey: `referral:${referral.id}:${audience}-reward:email`, entityType: "referral", entityId: referral.id, html: emailLayout({ title: subject, greeting: `Hi ${user.name},`, body, ctaLabel: "View referrals", ctaUrl: url }), text: `${body} ${url}` });
  }));
}

export async function reverseReferralForTransactionInTransaction(tx: Tx, input: { transactionType: "checkout_order" | "distribution_order" | "subscription_payment"; transactionId: string | number; reason: "refunded" | "charged_back" }) {
  await tx.$queryRaw`SELECT id FROM referrals WHERE qualifying_transaction_type = ${input.transactionType} AND qualifying_transaction_id = ${String(input.transactionId)} FOR UPDATE`;
  const referral = await tx.referral.findFirst({ where: { qualifyingTransactionType: input.transactionType, qualifyingTransactionId: String(input.transactionId), status: "REWARDED" } });
  if (!referral || !referral.referredUserId) return { reversed: false as const };
  const userIds = [referral.userId, referral.referredUserId].sort((a,b)=>a-b);
  for (const id of userIds) await tx.$queryRaw`SELECT id FROM users WHERE id = ${id} FOR UPDATE`;
  const [referrer, referred] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: referral.userId }, select: { referralCredits: true } }),
    tx.user.findUniqueOrThrow({ where: { id: referral.referredUserId }, select: { referralCredits: true } })
  ]);
  if (referrer.referralCredits < referral.earnings || referred.referralCredits < referral.referredReward) {
    await tx.referral.update({ where: { id: referral.id }, data: { riskStatus: "review_required" } });
    const existingAlert = await tx.fraudAlert.findFirst({ where: { category: "referral_abuse", entityType: "referral", entityId: String(referral.id), summary: `Referral reward reversal required after ${input.reason}; credited balance has already been spent.` } });
    if (!existingAlert) await tx.fraudAlert.create({ data: { category: "referral_abuse", severity: "high", riskScore: 70, entityType: "referral", entityId: String(referral.id), userId: referral.referredUserId, summary: `Referral reward reversal required after ${input.reason}; credited balance has already been spent.` } });
    await tx.auditLog.create({ data: { action: "REFERRAL_REVERSAL_REVIEW_REQUIRED", entity: "referral", entityId: String(referral.id), riskLevel: "high", metadata: { reason: input.reason } } });
    return { reversed: false as const, reviewRequired: true as const };
  }
  const referrerAfter = referrer.referralCredits - referral.earnings;
  const referredAfter = referred.referralCredits - referral.referredReward;
  await tx.creditLedgerEntry.createMany({ data: [
    { userId: referral.userId, type: "REFERRAL_REVERSAL", bucket: referral.rewardPolicy ? "HYMN_CREDIT" : "REFERRAL_REWARD", amount: referral.earnings, direction: "debit", sourceType: "referral", sourceId: String(referral.id), description: `Referral reward reversal: ${input.reason}`, idempotencyKey: `REFERRAL_REVERSAL:${referral.id}:REFERRER`, balanceAfter: referrerAfter },
    { userId: referral.referredUserId, type: "REFERRAL_REVERSAL", bucket: "HYMN_CREDIT", amount: referral.referredReward, direction: "debit", sourceType: "referral", sourceId: String(referral.id), description: `HYMN credit reversal: ${input.reason}`, idempotencyKey: `REFERRAL_REVERSAL:${referral.id}:REFERRED`, balanceAfter: referredAfter }
  ].filter(entry => entry.amount > 0) });
  await Promise.all([
    tx.user.update({ where: { id: referral.userId }, data: { referralCredits: { decrement: referral.earnings } } }),
    tx.user.update({ where: { id: referral.referredUserId }, data: { referralCredits: { decrement: referral.referredReward } } }),
    tx.referral.update({ where: { id: referral.id }, data: { status: "REVERSED", reversedAt: new Date(), riskStatus: "clear" } }),
    tx.auditLog.create({ data: { action: "REFERRAL_REVERSED", entity: "referral", entityId: String(referral.id), riskLevel: "high", metadata: { reason: input.reason } } })
  ]);
  return { reversed: true as const, referralId: referral.id };
}
