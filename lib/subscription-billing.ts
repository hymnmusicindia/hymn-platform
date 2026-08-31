import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import { artistProfileLimitForPlan } from "@/lib/artist-profile-limits";

export const SUBSCRIPTION_PRODUCTS = ["half_yearly", "yearly", "yearly_plus"] as const;
export type SubscriptionProduct = typeof SUBSCRIPTION_PRODUCTS[number];

type ProductPolicy = {
  name: string;
  amount: number;
  currency: "INR";
  billingInterval: string;
  releaseLimit: number | null;
  features: string[];
  planEnv: string;
  totalCount: number;
};

export const SUBSCRIPTION_POLICIES: Record<SubscriptionProduct, ProductPolicy> = {
  half_yearly: { name: "Half-Yearly", amount: 70000, currency: "INR", billingInterval: "6 months", releaseLimit: Number(process.env.HALF_YEARLY_RELEASE_LIMIT || 6), features: ["distribution", "quality_check", "5_artist_profiles"], planEnv: "RAZORPAY_PLAN_HALF_YEARLY", totalCount: Number(process.env.RAZORPAY_HALF_YEARLY_TOTAL_COUNT || 20) },
  yearly: { name: "Yearly", amount: 160000, currency: "INR", billingInterval: "12 months", releaseLimit: Number(process.env.YEARLY_RELEASE_LIMIT || 18), features: ["distribution", "quality_check", "priority_support", "7_artist_profiles"], planEnv: "RAZORPAY_PLAN_YEARLY", totalCount: Number(process.env.RAZORPAY_YEARLY_TOTAL_COUNT || 20) },
  yearly_plus: { name: "Yearly+", amount: 250000, currency: "INR", billingInterval: "12 months", releaseLimit: null, features: ["distribution", "quality_check", "priority_support", "custom_label", "15_artist_profiles"], planEnv: "RAZORPAY_PLAN_YEARLY_PLUS", totalCount: Number(process.env.RAZORPAY_YEARLY_PLUS_TOTAL_COUNT || 20) }
};

export function isSubscriptionProduct(value: unknown): value is SubscriptionProduct {
  return typeof value === "string" && SUBSCRIPTION_PRODUCTS.includes(value as SubscriptionProduct);
}

export function subscriptionHasEntitlement(subscription: { status: string; currentPeriodEnd?: Date | string | null; expiryDate?: Date | string | null; cancelAtPeriodEnd?: boolean } | null, now = new Date()) {
  if (!subscription) return false;
  return String(subscription.status ?? "").trim().toLowerCase() === "active" && new Date(subscription.currentPeriodEnd || subscription.expiryDate || 0) > now;
}

export function effectiveSubscriptionReleaseLimit(subscription: { plan?: string | null; releaseLimit?: number | null } | null | undefined) {
  if (!subscription) return null;
  const plan = String(subscription.plan ?? "").trim().toLowerCase();
  if (plan === "yearly_plus" || plan === "elite") return null;
  return subscription.releaseLimit ?? SUBSCRIPTION_POLICIES[plan as SubscriptionProduct]?.releaseLimit ?? null;
}

export function subscriptionHasReleaseAllowance(subscription: { plan?: string | null; releaseLimit?: number | null; releasesUsed?: number | null } | null | undefined) {
  if (!subscription) return false;
  const limit = effectiveSubscriptionReleaseLimit(subscription);
  return limit == null || Number(subscription.releasesUsed ?? 0) < limit;
}

export function subscriptionPeriodAdvanced(previousStart: Date | string | null | undefined, nextStart: Date | string | null | undefined) {
  if (!previousStart || !nextStart) return false;
  const previous = new Date(previousStart).getTime();
  const next = new Date(nextStart).getTime();
  return Number.isFinite(previous) && Number.isFinite(next) && next > previous;
}

export async function reserveSubscriptionReleaseSlot(userId: number) {
  return prisma.$transaction(async tx => {
    const sub = await tx.subscription.findUnique({ where: { userId } });
    if (!sub || !subscriptionHasEntitlement(sub)) throw new Error("No active subscription entitlement is available.");
    const ledgerCount = await tx.subscriptionReleaseUsage.count({ where: { subscriptionId: sub.id, ...(sub.currentPeriodStart ? { createdAt: { gte: sub.currentPeriodStart } } : {}) } });
    const releaseLimit = effectiveSubscriptionReleaseLimit(sub);
    if (sub.releaseLimit !== releaseLimit || sub.releasesUsed !== ledgerCount) await tx.subscription.update({ where: { id: sub.id }, data: { releaseLimit, releasesUsed: ledgerCount } });
    if (releaseLimit == null) return { subscriptionId: sub.id, counted: false };
    const updated = await tx.subscription.updateMany({ where: { id: sub.id, releasesUsed: { equals: ledgerCount, lt: releaseLimit } }, data: { releasesUsed: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("Your subscription release allowance has been used.");
    return { subscriptionId: sub.id, counted: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function attachReservedSubscriptionRelease(subscriptionId: number, releaseId: number) {
  return prisma.subscriptionReleaseUsage.create({ data: { subscriptionId, releaseId } });
}

export async function releaseReservedSubscriptionSlot(subscriptionId: number, counted: boolean) {
  if (counted) await prisma.subscription.update({ where: { id: subscriptionId }, data: { releasesUsed: { decrement: 1 } } });
}

export function verifySubscriptionCheckoutSignature(paymentId: string, subscriptionId: string, signature: string) {
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production" && signature === `dev:${paymentId}:${subscriptionId}`;
  const expected = crypto.createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`).digest("hex");
  if (!/^[a-f\d]+$/i.test(signature)) return false;
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(signature, "hex");
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function resolvePlanVersion(product: SubscriptionProduct) {
  const policy = SUBSCRIPTION_POLICIES[product];
  const razorpayPlanId = process.env[policy.planEnv]?.trim();
  if (!razorpayPlanId) throw new Error(`${policy.planEnv} is not configured.`);
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const providerPlan = await razorpay.plans.fetch(razorpayPlanId);
  if (Number(providerPlan.item?.amount) !== policy.amount || String(providerPlan.item?.currency || "").toUpperCase() !== policy.currency) throw new Error(`${policy.planEnv} amount or currency does not match HYMN's ${policy.name} configuration.`);
  return prisma.subscriptionPlanVersion.upsert({
    where: { razorpayPlanId },
    create: { product, razorpayPlanId, amount: policy.amount, currency: policy.currency, billingInterval: policy.billingInterval },
    update: {}
  });
}

export async function createProviderSubscription(userId: number, product: SubscriptionProduct) {
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const existing = await prisma.subscription.findUnique({ where: { userId } });
  if (existing?.razorpaySubscriptionId && !["cancelled", "completed", "expired", "halted"].includes(existing.status)) throw new Error("An active or pending subscription already exists for this account.");
  const policy = SUBSCRIPTION_POLICIES[product];
  const version = await resolvePlanVersion(product);
  const provider = await razorpay.subscriptions.create({ plan_id: version.razorpayPlanId, total_count: policy.totalCount, quantity: 1, customer_notify: true, notes: { hymn_user_id: String(userId), hymn_product: product, hymn_plan_version_id: String(version.id) } });
  const now = new Date();
  const local = await prisma.subscription.upsert({
    where: { userId },
    create: { userId, plan: product, planName: policy.name, planVersionId: version.id, razorpayPlanId: version.razorpayPlanId, razorpaySubscriptionId: provider.id, expiryDate: now, status: String(provider.status || "created"), releaseLimit: policy.releaseLimit, artistLimit: artistProfileLimitForPlan(product), availableFeatures: JSON.stringify(policy.features), daysRemaining: 0, autoRenewal: true, providerSyncedAt: now },
    update: { plan: product, planName: policy.name, planVersionId: version.id, razorpayPlanId: version.razorpayPlanId, razorpaySubscriptionId: provider.id, expiryDate: now, status: String(provider.status || "created"), releasesUsed: 0, releaseLimit: policy.releaseLimit, artistLimit: artistProfileLimitForPlan(product), availableFeatures: JSON.stringify(policy.features), daysRemaining: 0, autoRenewal: true, cancelAtPeriodEnd: false, cancelledAt: null, currentPeriodStart: null, currentPeriodEnd: null, providerSyncedAt: now }
  });
  await prisma.auditLog.create({ data: { actorId: userId, action: "SUBSCRIPTION_PROVIDER_CREATED", entity: "subscriptions", entityId: String(local.id), metadata: { product, planVersionId: version.id, razorpaySubscriptionId: provider.id } } });
  return { local, provider, policy, version };
}

type ProviderSubscription = { id: string; plan_id?: string; status?: string; current_start?: number | null; current_end?: number | null; start_at?: number | null; ended_at?: number | null; charge_at?: number | null; notes?: Record<string, unknown> };
type ProviderPayment = { id?: string; invoice_id?: string; amount?: number; currency?: string; status?: string; created_at?: number };
const fromUnix = (value?: number | null) => value ? new Date(value * 1000) : null;

export async function synchronizeProviderSubscription(entity: ProviderSubscription, payment?: ProviderPayment | null) {
  const existing = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: entity.id } });
  if (!existing) throw new Error("Razorpay subscription is not linked to a HYMN account.");
  if (entity.plan_id && existing.razorpayPlanId && entity.plan_id !== existing.razorpayPlanId) throw new Error("Razorpay plan does not match the persisted subscription.");
  const status = String(entity.status || existing.status).toLowerCase();
  const currentStart = fromUnix(entity.current_start) || existing.currentPeriodStart;
  const currentEnd = fromUnix(entity.current_end) || existing.currentPeriodEnd;
  const expiryDate = currentEnd || existing.expiryDate;
  const now = new Date();
  const daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / 86_400_000));
  const cancelledAt = status === "cancelled" ? (fromUnix(entity.ended_at) || now) : existing.cancelledAt;
  const billingPeriodRenewed = subscriptionPeriodAdvanced(existing.currentPeriodStart, currentStart);
  const subscription = await prisma.$transaction(async tx => {
    const updated = await tx.subscription.update({ where: { id: existing.id }, data: { status, currentPeriodStart: currentStart, currentPeriodEnd: currentEnd, expiryDate, nextRenewalDate: ["active", "pending"].includes(status) ? (fromUnix(entity.charge_at) || currentEnd) : null, startedAt: existing.startedAt || fromUnix(entity.start_at) || currentStart, cancelledAt, daysRemaining, ...(billingPeriodRenewed ? { releasesUsed: 0 } : {}), autoRenewal: !["cancelled", "completed", "expired"].includes(status) && !existing.cancelAtPeriodEnd, providerSyncedAt: now } });
    if (payment?.id) await tx.subscriptionPayment.upsert({ where: { razorpayPaymentId: payment.id }, create: { subscriptionId: existing.id, razorpayPaymentId: payment.id, razorpayInvoiceId: payment.invoice_id || null, amount: Number(payment.amount || 0), currency: String(payment.currency || "INR").toUpperCase(), status: String(payment.status || "captured"), billingPeriodStart: currentStart, billingPeriodEnd: currentEnd, createdAt: fromUnix(payment.created_at) || now }, update: { status: String(payment.status || "captured"), razorpayInvoiceId: payment.invoice_id || undefined } });
    await tx.auditLog.create({ data: { action: "SUBSCRIPTION_PROVIDER_SYNCHRONIZED", entity: "subscriptions", entityId: String(existing.id), metadata: { providerStatus: status, paymentId: payment?.id || null, billingPeriodRenewed, releaseAllowanceReset: billingPeriodRenewed } as Prisma.InputJsonObject } });
    return updated;
  });
  return subscription;
}

export async function fetchAndSynchronizeSubscription(userId: number, providerSubscriptionId: string) {
  const local = await prisma.subscription.findUnique({ where: { userId } });
  if (!local || local.razorpaySubscriptionId !== providerSubscriptionId) throw new Error("Subscription does not belong to the authenticated user.");
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const provider = await razorpay.subscriptions.fetch(providerSubscriptionId);
  return synchronizeProviderSubscription(provider as ProviderSubscription);
}

export async function synchronizeSubscriptionPayment(providerSubscriptionId: string, payment: ProviderPayment) {
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const provider = await razorpay.subscriptions.fetch(providerSubscriptionId);
  return synchronizeProviderSubscription(provider as ProviderSubscription, payment);
}

export async function manageProviderSubscription(userId: number, action: "cancel_now" | "cancel_period_end" | "pause" | "resume") {
  const local = await prisma.subscription.findUnique({ where: { userId } });
  if (!local?.razorpaySubscriptionId) throw new Error("No provider-backed subscription was found.");
  if (!razorpay) throw new Error("Razorpay is not configured.");
  let provider;
  if (action === "pause") provider = await razorpay.subscriptions.pause(local.razorpaySubscriptionId, { pause_at: "now" });
  else if (action === "resume") provider = await razorpay.subscriptions.resume(local.razorpaySubscriptionId, { resume_at: "now" });
  else provider = await razorpay.subscriptions.cancel(local.razorpaySubscriptionId, action === "cancel_period_end");
  if (action === "cancel_period_end") await prisma.subscription.update({ where: { id: local.id }, data: { cancelAtPeriodEnd: true, autoRenewal: false } });
  return synchronizeProviderSubscription(provider as ProviderSubscription);
}

export async function consumeSubscriptionRelease(userId: number, releaseId: number) {
  return prisma.$transaction(async tx => {
    const sub = await tx.subscription.findUnique({ where: { userId } });
    if (!sub || !subscriptionHasEntitlement(sub)) throw new Error("No active subscription entitlement is available.");
    const existing = await tx.subscriptionReleaseUsage.findUnique({ where: { releaseId } });
    if (existing) {
      if (existing.subscriptionId !== sub.id) throw new Error("Release usage belongs to a different subscription.");
      return sub;
    }
    const ledgerCount = await tx.subscriptionReleaseUsage.count({ where: { subscriptionId: sub.id, ...(sub.currentPeriodStart ? { createdAt: { gte: sub.currentPeriodStart } } : {}) } });
    const releaseLimit = effectiveSubscriptionReleaseLimit(sub);
    if (sub.releaseLimit !== releaseLimit || sub.releasesUsed !== ledgerCount) await tx.subscription.update({ where: { id: sub.id }, data: { releaseLimit, releasesUsed: ledgerCount } });
    if (releaseLimit == null) {
      await tx.subscriptionReleaseUsage.create({ data: { subscriptionId: sub.id, releaseId } });
      return tx.subscription.findUniqueOrThrow({ where: { id: sub.id } });
    }
    const updated = await tx.subscription.updateMany({ where: { id: sub.id, releasesUsed: { equals: ledgerCount, lt: releaseLimit } }, data: { releasesUsed: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("Your subscription release allowance has been used.");
    await tx.subscriptionReleaseUsage.create({ data: { subscriptionId: sub.id, releaseId } });
    return tx.subscription.findUniqueOrThrow({ where: { id: sub.id } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
