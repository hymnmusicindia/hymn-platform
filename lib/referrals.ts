import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
  const code = normalizeReferralCode(input.referralCode);
  if (!code) return null;
  const [referredUser, referrer, existing] = await Promise.all([
    tx.user.findUnique({ where: { id: input.referredUserId }, select: { id: true, email: true, referredById: true, createdAt: true } }),
    tx.user.findFirst({ where: { referralCode: { equals: code, mode: "insensitive" } }, select: { id: true, email: true, referralCode: true, status: true } }),
    tx.referral.findUnique({ where: { referredUserId: input.referredUserId } })
  ]);
  if (!referredUser) throw new Error("Referred account was not found.");
  if (!referrer || referrer.status !== "ACTIVE") throw new Error("This referral code isn't valid.");
  if (existing || referredUser.referredById) throw new Error("A referral has already been associated with this account.");
  if (referrer.id === referredUser.id || referrer.email.toLowerCase() === input.referredEmail.toLowerCase()) throw new Error("You can't use your own referral code.");

  const reverse = await tx.referral.findFirst({ where: { userId: input.referredUserId, referredUserId: referrer.id }, select: { id: true } });
  if (reverse) throw new Error("Circular referrals are not eligible.");

  await tx.user.update({ where: { id: input.referredUserId }, data: { referredById: referrer.id, onboardingReferralCode: referrer.referralCode } });
  const referral = await tx.referral.create({ data: {
    userId: referrer.id,
    referredUserId: input.referredUserId,
    referralCode: referrer.referralCode || code,
    signupEmail: input.referredEmail.toLowerCase(),
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
  if (referral.userId === input.referredUserId) throw new Error("Self-referral cannot qualify.");

  const claimed = await tx.referral.updateMany({
    where: { id: referral.id, status: { in: ["PENDING", "REGISTERED"] }, qualifyingTransactionId: null },
    data: { status: "QUALIFIED", qualifiedAt: new Date(), qualifyingTransactionType: input.transactionType, qualifyingTransactionId: String(input.transactionId), qualifyingPaymentId: input.paymentId, purchaseAmount: Math.round(input.paidAmountInr) }
  });
  if (claimed.count !== 1) return { qualified: false as const, reason: "already_claimed" as const };

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
  const url = new URL("/dashboard?tab=referral", process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").toString();
  await Promise.all([
    sendTransactionalEmail({ to: referral.owner.email, userId: referral.owner.id, subject: "Your HYMN referral reward is ready", template: "referral_reward_earned", eventKey: `referral:${referral.id}:referrer-reward:email`, entityType: "referral", entityId: referral.id, html: `<p>Hi ${referral.owner.name},</p><p>Your referral qualified and Rs ${REFERRER_REWARD_INR} HYMN referral credit was added to your account.</p><p><a href="${url}">View referrals</a></p>`, text: `Your referral qualified. Rs ${REFERRER_REWARD_INR} HYMN referral credit was added. ${url}` }),
    sendTransactionalEmail({ to: referral.referredUser.email, userId: referral.referredUser.id, subject: "Your HYMN release credit is active", template: "referred_user_bonus", eventKey: `referral:${referral.id}:referred-reward:email`, entityType: "referral", entityId: referral.id, html: `<p>Hi ${referral.referredUser.name},</p><p>Rs ${REFERRED_USER_REWARD_INR} HYMN release credit was added to your account.</p><p><a href="${url}">View credits</a></p>`, text: `Rs ${REFERRED_USER_REWARD_INR} HYMN release credit was added to your account. ${url}` })
  ]);
}

export async function reverseReferralForTransactionInTransaction(tx: Tx, input: { transactionType: "checkout_order" | "distribution_order"; transactionId: string | number; reason: "refunded" | "charged_back" }) {
  const referral = await tx.referral.findFirst({ where: { qualifyingTransactionType: input.transactionType, qualifyingTransactionId: String(input.transactionId), status: "REWARDED" } });
  if (!referral || !referral.referredUserId) return { reversed: false as const };
  const [referrer, referred] = await Promise.all([
    tx.user.findUniqueOrThrow({ where: { id: referral.userId }, select: { referralCredits: true } }),
    tx.user.findUniqueOrThrow({ where: { id: referral.referredUserId }, select: { referralCredits: true } })
  ]);
  if (referrer.referralCredits < referral.earnings || referred.referralCredits < referral.referredReward) {
    await tx.referral.update({ where: { id: referral.id }, data: { riskStatus: "review_required" } });
    await tx.fraudAlert.create({ data: { category: "referral_abuse", severity: "high", riskScore: 70, entityType: "referral", entityId: String(referral.id), userId: referral.referredUserId, summary: `Referral reward reversal required after ${input.reason}; credited balance has already been spent.` } });
    await tx.auditLog.create({ data: { action: "REFERRAL_REVERSAL_REVIEW_REQUIRED", entity: "referral", entityId: String(referral.id), riskLevel: "high", metadata: { reason: input.reason } } });
    return { reversed: false as const, reviewRequired: true as const };
  }
  const referrerAfter = referrer.referralCredits - referral.earnings;
  const referredAfter = referred.referralCredits - referral.referredReward;
  await tx.creditLedgerEntry.createMany({ data: [
    { userId: referral.userId, type: "REFERRAL_REVERSAL", bucket: "REFERRAL_REWARD", amount: referral.earnings, direction: "debit", sourceType: "referral", sourceId: String(referral.id), description: `Referral reward reversal: ${input.reason}`, idempotencyKey: `REFERRAL_REVERSAL:${referral.id}:REFERRER`, balanceAfter: referrerAfter },
    { userId: referral.referredUserId, type: "REFERRAL_REVERSAL", bucket: "HYMN_CREDIT", amount: referral.referredReward, direction: "debit", sourceType: "referral", sourceId: String(referral.id), description: `HYMN credit reversal: ${input.reason}`, idempotencyKey: `REFERRAL_REVERSAL:${referral.id}:REFERRED`, balanceAfter: referredAfter }
  ] });
  await Promise.all([
    tx.user.update({ where: { id: referral.userId }, data: { referralCredits: { decrement: referral.earnings } } }),
    tx.user.update({ where: { id: referral.referredUserId }, data: { referralCredits: { decrement: referral.referredReward } } }),
    tx.referral.update({ where: { id: referral.id }, data: { status: "REVERSED", reversedAt: new Date(), riskStatus: "clear" } }),
    tx.auditLog.create({ data: { action: "REFERRAL_REVERSED", entity: "referral", entityId: String(referral.id), riskLevel: "high", metadata: { reason: input.reason } } })
  ]);
  return { reversed: true as const, referralId: referral.id };
}
