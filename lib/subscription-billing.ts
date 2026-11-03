import crypto from "node:crypto";
import type {Subscriptions} from 'razorpay/dist/types/subscriptions';
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { razorpay } from "@/lib/razorpay";
import { artistProfileLimitForPlan } from "@/lib/artist-profile-limits";
import { findDistributionPlan } from "@/lib/distribution-plans";
import { qualifyRecurringReferral } from "@/lib/referral-reward-policy";
import { qualifyPartnerPayment } from "@/lib/growth-partners";
import { recordGrowthEvent } from "@/lib/growth";
import { SubscriptionPlanConfigurationError, validateSubscriptionProviderPlan } from "@/lib/subscription-plan-validation";
import { recordVerifiedAcquisitionRevenue } from "@/lib/acquisition-revenue";
import {annualCompatibilityRequired,validateCompatibleAnnualPlan,validSubscriptionCycleCount,isUnstartedSubscription} from './subscription-recurrence';
import { labelArtistQuote } from './label-artist-pricing';
import { queueSubscriptionReceipt } from './email/subscription-receipts';

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
  half_yearly: { name: findDistributionPlan("half_yearly").title, amount: findDistributionPlan("half_yearly").price * 100, currency: "INR", billingInterval: "6 months", releaseLimit: Number(process.env.HALF_YEARLY_RELEASE_LIMIT || 6), features: ["distribution", "quality_check", "5_artist_profiles"], planEnv: "RAZORPAY_PLAN_HALF_YEARLY", totalCount: Number(process.env.RAZORPAY_HALF_YEARLY_TOTAL_COUNT || 20) },
  yearly: { name: findDistributionPlan("yearly").title, amount: findDistributionPlan("yearly").price * 100, currency: "INR", billingInterval: "12 months", releaseLimit: Number(process.env.YEARLY_RELEASE_LIMIT || 18), features: ["distribution", "quality_check", "priority_support", "7_artist_profiles"], planEnv: "RAZORPAY_PLAN_YEARLY", totalCount: Number(process.env.RAZORPAY_YEARLY_TOTAL_COUNT || 20) },
  yearly_plus: { name: findDistributionPlan("yearly_plus").title, amount: findDistributionPlan("yearly_plus").price * 100, currency: "INR", billingInterval: "12 months", releaseLimit: null, features: ["distribution", "quality_check", "priority_support", "custom_label", "15_artist_profiles"], planEnv: "RAZORPAY_PLAN_YEARLY_PLUS", totalCount: Number(process.env.RAZORPAY_YEARLY_PLUS_TOTAL_COUNT || 20) }
};

export function isSubscriptionProduct(value: unknown): value is SubscriptionProduct {
  return typeof value === "string" && SUBSCRIPTION_PRODUCTS.includes(value as SubscriptionProduct);
}

/** Epoch ms at which a subscription's access ends, or 0 when it has no end date. */
export function subscriptionEntitlementEnd(subscription: { currentPeriodEnd?: Date | string | null; expiryDate?: Date | string | null }) {
  // Provider syncs and revocations write currentPeriodEnd; purchases and admin
  // grants extend expiryDate only. Preferring either one treats a renewed plan
  // as expired, so the entitlement runs to whichever date is later. Revocation
  // sets both, and a cancelled plan is already excluded by the status check.
  const ends = [subscription.currentPeriodEnd, subscription.expiryDate]
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter((time) => Number.isFinite(time));
  return Math.max(0, ...ends);
}

export function subscriptionHasEntitlement(subscription: { status: string; currentPeriodEnd?: Date | string | null; expiryDate?: Date | string | null; cancelAtPeriodEnd?: boolean } | null, now = new Date()) {
  if (!subscription) return false;
  if (String(subscription.status ?? "").trim().toLowerCase() !== "active") return false;
  return subscriptionEntitlementEnd(subscription) > now.getTime();
}

/** A plan that will not renew and whose paid term is over. Only a new payment restores access. */
export function subscriptionTermLapsed(subscription: { status: string; autoRenewal?: boolean | null; currentPeriodEnd?: Date | string | null; expiryDate?: Date | string | null }, now = new Date()) {
  return String(subscription.status ?? "").trim().toLowerCase() === "active" && subscription.autoRenewal === false && subscriptionEntitlementEnd(subscription) <= now.getTime();
}

export function effectiveSubscriptionReleaseLimit(subscription: { plan?: string | null; releaseLimit?: number | null; availableFeatures?: string | string[]; razorpaySubscriptionId?: string | null } | null | undefined) {
  if (!subscription) return null;
  // Manual grants explicitly promise unlimited releases. Preserve legacy grants
  // written with ["all"] rather than silently falling back to a provider quota.
  let features: string[] = [];
  try { features = typeof subscription.availableFeatures === "string" ? JSON.parse(subscription.availableFeatures) : subscription.availableFeatures ?? []; } catch { /* Malformed legacy features are not an unlimited grant. */ }
  if (!subscription.razorpaySubscriptionId && subscription.releaseLimit == null && Array.isArray(features) && (features.includes("manual_unlimited_releases") || features.includes("all"))) return null;
  const plan = String(subscription.plan ?? "").trim().toLowerCase();
  if (plan === "yearly_plus" || plan === "elite") return null;
  return subscription.releaseLimit ?? SUBSCRIPTION_POLICIES[plan as SubscriptionProduct]?.releaseLimit ?? null;
}

export function subscriptionHasReleaseAllowance(subscription: { plan?: string | null; releaseLimit?: number | null; releasesUsed?: number | null; availableFeatures?: string | string[]; razorpaySubscriptionId?: string | null } | null | undefined) {
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

export async function reserveSubscriptionReleaseSlot(userId: number, releaseId?: number) {
  return prisma.$transaction(async tx => {
    const sub = await tx.subscription.findUnique({ where: { userId } });
    if (!sub || !subscriptionHasEntitlement(sub)) throw new Error("No active subscription entitlement is available.");
    if (releaseId) {
      const existing = await tx.subscriptionReleaseUsage.findUnique({ where: { releaseId } });
      if (existing) throw new Error("This release already has a subscription allowance reservation.");
    }
    const ledgerCount = await tx.subscriptionReleaseUsage.count({ where: { subscriptionId: sub.id, ...(sub.currentPeriodStart ? { createdAt: { gte: sub.currentPeriodStart } } : {}) } });
    const releaseLimit = effectiveSubscriptionReleaseLimit(sub);
    if (sub.releaseLimit !== releaseLimit || sub.releasesUsed !== ledgerCount) await tx.subscription.update({ where: { id: sub.id }, data: { releaseLimit, releasesUsed: ledgerCount } });
    if (releaseLimit == null) {
      if (releaseId) await tx.subscriptionReleaseUsage.create({ data: { subscriptionId: sub.id, releaseId } });
      return { subscriptionId: sub.id, counted: false };
    }
    const updated = await tx.subscription.updateMany({ where: { id: sub.id, releasesUsed: { equals: ledgerCount, lt: releaseLimit } }, data: { releasesUsed: { increment: 1 } } });
    if (updated.count !== 1) throw new Error("Your subscription release allowance has been used.");
    if (releaseId) await tx.subscriptionReleaseUsage.create({ data: { subscriptionId: sub.id, releaseId } });
    return { subscriptionId: sub.id, counted: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function attachReservedSubscriptionRelease(subscriptionId: number, releaseId: number) {
  const existing = await prisma.subscriptionReleaseUsage.findUnique({ where: { releaseId } });
  if (existing) {
    if (existing.subscriptionId !== subscriptionId) throw new Error("Release allowance belongs to a different subscription.");
    return existing;
  }
  return prisma.subscriptionReleaseUsage.create({ data: { subscriptionId, releaseId } });
}

export async function releaseReservedSubscriptionSlot(subscriptionId: number, counted: boolean, releaseId?: number) {
  await prisma.$transaction(async tx => {
    if (releaseId) {
      const removed = await tx.subscriptionReleaseUsage.deleteMany({ where: { subscriptionId, releaseId } });
      if (!removed.count) return;
    }
    if (counted) await tx.subscription.updateMany({ where: { id: subscriptionId, releasesUsed: { gt: 0 } }, data: { releasesUsed: { decrement: 1 } } });
  });
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

async function resolvePlanVersion(product: SubscriptionProduct, extraArtists = 0) {
  if (extraArtists && product !== 'yearly_plus') throw Error('Extra artists require Yearly+.');
  const artistQuote = labelArtistQuote(extraArtists);
  const policy = SUBSCRIPTION_POLICIES[product];
  if (extraArtists) {
    if (!razorpay) throw Error('Payment service unavailable.');
    const gateway = razorpay;
    // A transaction-level lock prevents concurrent checkouts creating duplicate variants.
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(49813, ${extraArtists})`;
      const saved = await tx.subscriptionPlanVersion.findFirst({ where: { product, amount: artistQuote.total, currency: 'INR', billingInterval: '12 months', active: true }, orderBy: { id: 'asc' } });
      const provider = saved ? await gateway.plans.fetch(saved.razorpayPlanId) : await gateway.plans.create({ period: 'monthly', interval: 12, item: { name: `HYMN Yearly+ | 15 + ${extraArtists} artists`, amount: artistQuote.total, currency: 'INR', description: 'Annual subscription including extra artist profiles' }, notes: { hymn_extra_artists: String(extraArtists), hymn_pricing: 'label-artists-v1' } });
      validateSubscriptionProviderPlan(provider, { amount: artistQuote.total, currency: 'INR', months: 12, planEnv: 'Yearly+ artist slots' });
      if (String((provider.notes as Record<string, unknown> | undefined)?.hymn_extra_artists) !== String(extraArtists)) throw Error('Artist slot billing configuration mismatch.');
      return saved ?? tx.subscriptionPlanVersion.create({ data: { product, amount: artistQuote.total, currency: 'INR', billingInterval: '12 months', razorpayPlanId: provider.id } });
    }, { maxWait: 10000, timeout: 20000 });
  }
  let razorpayPlanId = process.env[policy.planEnv]?.trim();
  if (!razorpayPlanId) throw new SubscriptionPlanConfigurationError(`${policy.planEnv} is not configured.`);
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const providerPlan = await razorpay.plans.fetch(razorpayPlanId);
  validateSubscriptionProviderPlan(providerPlan, { ...policy, months: product === "half_yearly" ? 6 : 12 });
  if(annualCompatibilityRequired(providerPlan)){
    const mapping=await prisma.auditLog.findFirst({where:{entity:'subscription_plan_compatibility',entityId:razorpayPlanId,action:'SUBSCRIPTION_PLAN_COMPATIBILITY_REGISTERED'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{metadata:true}});
    const compatibleId=(mapping?.metadata as {compatiblePlanId?:unknown}|null)?.compatiblePlanId;
    if(typeof compatibleId!=='string'||!compatibleId.startsWith('plan_'))throw new SubscriptionPlanConfigurationError('The annual UPI-compatible billing plan has not been registered.');
    const compatible=await razorpay.plans.fetch(compatibleId);
    validateCompatibleAnnualPlan(compatible,razorpayPlanId,{...policy,months:12});
    razorpayPlanId=compatible.id;
  }
  return prisma.subscriptionPlanVersion.upsert({
    where: { razorpayPlanId },
    create: { product, razorpayPlanId, amount: policy.amount, currency: policy.currency, billingInterval: policy.billingInterval },
    update: {}
  });
}

async function retireFailedAnnualMandate(id:string,provider:Subscriptions.RazorpaySubscription){
  if(!razorpay)throw new Error('Payment service unavailable.');
  if(!isUnstartedSubscription(provider)&&!(provider.status==='cancelled'&&provider.paid_count===0&&!provider.current_start))return false;
  const invoices=await razorpay.invoices.all({subscription_id:id,count:100});
  if(invoices.items.length>=100||invoices.items.some(i=>i.status==='paid'||Number(i.amount_paid)>0||i.paid_at))return false;
  const invoiceIds=new Set(invoices.items.map(i=>i.id));
  const payments=await razorpay.payments.all({from:provider.created_at,count:100});
  // Do not guess when the bounded read cannot prove every relevant payment is terminal.
  if(payments.items.length>=100)return false;
  const attempts=payments.items.filter(p=>p.invoice_id&&invoiceIds.has(p.invoice_id));
  if(!attempts.length||attempts.some(p=>p.status!=='failed'||Date.now()-p.created_at*1000<300000))return false;
  if(provider.status!=='cancelled'){
    const latest=await razorpay.subscriptions.fetch(id);
    if(!isUnstartedSubscription(latest))return false;
    const cancelled=await razorpay.subscriptions.cancel(id,false);
    if(cancelled.status!=='cancelled'||cancelled.paid_count!==0||cancelled.current_start)return false;
  }
  const confirmed=await razorpay.subscriptions.fetch(id);
  return confirmed.status==='cancelled'&&confirmed.paid_count===0&&!confirmed.current_start;
}

export async function createProviderSubscription(userId: number, product: SubscriptionProduct, extraArtists = 0) {
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const gateway=razorpay;
  const policy = SUBSCRIPTION_POLICIES[product];
  validSubscriptionCycleCount(policy.totalCount,product==='half_yearly'?6:12);
  const version = await resolvePlanVersion(product, extraArtists);
  // Serialize browser retries for this customer; another checkout must reuse the committed mandate.
  return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
  const existing = await tx.subscription.findUnique({ where: { userId } });
  if (existing?.razorpaySubscriptionId && !["cancelled", "completed", "expired", "halted"].includes(existing.status) && !subscriptionTermLapsed(existing)) {
    if (existing.plan === product && ["created", "authenticated"].includes(existing.status)) {
      const provider = await gateway.subscriptions.fetch(existing.razorpaySubscriptionId);
      if (["created", "authenticated"].includes(provider.status) && provider.plan_id === version.razorpayPlanId) {
        return { local: existing, provider, policy, version };
      }
      if(existing.status==='created'&&provider.plan_id===process.env[policy.planEnv]?.trim()&&provider.plan_id!==version.razorpayPlanId&&product!=='half_yearly'){
        if(await tx.subscriptionPayment.count({where:{subscriptionId:existing.id}})===0&&await retireFailedAnnualMandate(provider.id,provider)){
          await tx.subscription.update({where:{id:existing.id},data:{status:'cancelled',autoRenewal:false,cancelledAt:new Date()}});
          await tx.auditLog.create({data:{actorId:userId,action:'SUBSCRIPTION_FAILED_MANDATE_RETIRED',entity:'subscriptions',entityId:String(existing.id),metadata:{providerId:provider.id,previousPlanId:provider.plan_id,replacementPlanId:version.razorpayPlanId,reason:'Unstarted annual mandate with only terminal failed payments; compatibility refresh requested by customer.'}}});
        }else throw new Error('Your earlier UPI authorisation needs a status check. Wait a few minutes and retry. If your bank shows a debit, contact HYMN support before paying again.');
      }else throw new Error("An active or pending subscription already exists for this account. Check its status before starting another payment.");
    }else{
      throw new Error("An active or pending subscription already exists for this account. Check its status before starting another payment.");
    }
  }
  if(existing?.status==='cancelled'&&existing.plan===product&&existing.razorpaySubscriptionId&&existing.razorpayPlanId===process.env[policy.planEnv]?.trim()&&existing.razorpayPlanId!==version.razorpayPlanId&&product!=='half_yearly'){
    const old=await gateway.subscriptions.fetch(existing.razorpaySubscriptionId);
    if(await tx.subscriptionPayment.count({where:{subscriptionId:existing.id}})!==0||old.status!=='cancelled'||!await retireFailedAnnualMandate(old.id,old))throw new Error('The previous subscription needs payment review before another checkout can start. Contact HYMN support.');
    await tx.auditLog.create({data:{action:'SUBSCRIPTION_FAILED_MANDATE_RETIRED',entity:'subscriptions',entityId:String(existing.id),metadata:{providerId:old.id,previousPlanId:old.plan_id,replacementPlanId:version.razorpayPlanId,reason:'Confirmed unpaid legacy cancellation recovered before replacement.'}}});
  }
  const pending=await tx.auditLog.findFirst({where:{entity:'subscription_checkout_attempt',entityId:String(userId),action:'SUBSCRIPTION_CREATE_STARTED'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{requestId:true}});
  if(pending?.requestId&&!await tx.auditLog.findFirst({where:{requestId:pending.requestId,action:{in:['SUBSCRIPTION_CREATE_COMMITTED','SUBSCRIPTION_CREATE_REJECTED']}},select:{id:true}}))throw new Error('An earlier checkout is still being checked. Contact HYMN support before starting another payment.');
  const requestId=crypto.randomUUID();
  // Independent durable intent survives a transaction/transport failure. No user FK is
  // written here because this transaction holds the customer's row lock.
  await prisma.auditLog.create({data:{action:'SUBSCRIPTION_CREATE_STARTED',entity:'subscription_checkout_attempt',entityId:String(userId),requestId,metadata:{product,planVersionId:version.id}}});
  let provider:Subscriptions.RazorpaySubscription;
  try{provider=await gateway.subscriptions.create({ plan_id: version.razorpayPlanId, total_count: policy.totalCount, quantity: 1, customer_notify: true, notes: { hymn_user_id: String(userId), hymn_product: product, hymn_plan_version_id: String(version.id),hymn_checkout_request_id:requestId } });}
  catch(error){const status=Number((error as {statusCode?:unknown})?.statusCode);if([400,401,403,404,422].includes(status))await prisma.auditLog.create({data:{action:'SUBSCRIPTION_CREATE_REJECTED',entity:'subscription_checkout_attempt',entityId:String(userId),requestId,metadata:{status}}});throw error;}
  const now = new Date();
  const local = await tx.subscription.upsert({
    where: { userId },
    create: { userId, plan: product, planName: policy.name, planVersionId: version.id, razorpayPlanId: version.razorpayPlanId, razorpaySubscriptionId: provider.id, expiryDate: now, status: String(provider.status || "created"), releaseLimit: policy.releaseLimit, artistLimit: artistProfileLimitForPlan(product) + extraArtists, availableFeatures: JSON.stringify(policy.features), daysRemaining: 0, autoRenewal: true, providerSyncedAt: now },
    update: { plan: product, planName: policy.name, planVersionId: version.id, razorpayPlanId: version.razorpayPlanId, razorpaySubscriptionId: provider.id, expiryDate: now, status: String(provider.status || "created"), releasesUsed: 0, releaseLimit: policy.releaseLimit, artistLimit: artistProfileLimitForPlan(product) + extraArtists, availableFeatures: JSON.stringify(policy.features), daysRemaining: 0, autoRenewal: true, cancelAtPeriodEnd: false, cancelledAt: null, currentPeriodStart: null, currentPeriodEnd: null, providerSyncedAt: now }
  });
  await tx.auditLog.create({ data: { actorId: userId, action: "SUBSCRIPTION_PROVIDER_CREATED", entity: "subscriptions", entityId: String(local.id), metadata: { product, planVersionId: version.id, razorpaySubscriptionId: provider.id } } });
  await tx.auditLog.create({data:{action:'SUBSCRIPTION_CREATE_COMMITTED',entity:'subscription_checkout_attempt',entityId:String(userId),requestId,metadata:{providerId:provider.id,subscriptionId:local.id}}});
  return { local, provider, policy, version };
  },{maxWait:10000,timeout:30000});
}

type ProviderSubscription = { id: string; plan_id?: string; status?: string; current_start?: number | null; current_end?: number | null; start_at?: number | null; ended_at?: number | null; charge_at?: number | null; notes?: Record<string, unknown> };
type ProviderPayment = { id?: string; invoice_id?: string; amount?: number; currency?: string; status?: string; created_at?: number };
const fromUnix = (value?: number | null) => value ? new Date(value * 1000) : null;

export async function synchronizeProviderSubscription(entity: ProviderSubscription, payment?: ProviderPayment | null) {
  const existing = await prisma.subscription.findUnique({ where: { razorpaySubscriptionId: entity.id } });
  if (!existing) {
    // A delayed cancellation/creation event from the retired, proven-unpaid
    // mandate must never cancel the replacement or trigger endless webhook retries.
    if(!payment?.id&&['created','cancelled'].includes(entity.status||'')){
      const retired=await prisma.auditLog.findFirst({where:{entity:'subscriptions',action:'SUBSCRIPTION_FAILED_MANDATE_RETIRED',metadata:{path:['providerId'],equals:entity.id}},orderBy:{id:'desc'},select:{entityId:true}});
      if(retired?.entityId){const current=await prisma.subscription.findUnique({where:{id:Number(retired.entityId)}});if(current)return current;}
    }
    throw new Error("Razorpay subscription is not linked to a HYMN account.");
  }
  if (entity.plan_id && existing.razorpayPlanId && entity.plan_id !== existing.razorpayPlanId) throw new Error("Razorpay plan does not match the persisted subscription.");
  const providerStatus = String(entity.status || existing.status).toLowerCase();
  const currentStart = fromUnix(entity.current_start) || existing.currentPeriodStart;
  const currentEnd = fromUnix(entity.current_end) || existing.currentPeriodEnd;
  const expiryDate = currentEnd || existing.expiryDate;
  const now = new Date();
  // Razorpay reports a subscription as cancelled the moment AutoPay is switched off, but the
  // customer has already paid for the running period. Keep the plan until that period ends and
  // stop renewal; once it ends, access returns only with a new payment. A plan that was not
  // active (never paid, pending, halted, revoked) gets no such grace.
  const paidThrough = providerStatus === "cancelled" && subscriptionHasEntitlement(existing, now) && expiryDate.getTime() > now.getTime();
  const status = paidThrough ? "active" : providerStatus;
  const daysRemaining = Math.max(0, Math.ceil((expiryDate.getTime() - now.getTime()) / 86_400_000));
  const cancelledAt = providerStatus === "cancelled" ? (fromUnix(entity.ended_at) || now) : existing.cancelledAt;
  const billingPeriodRenewed = subscriptionPeriodAdvanced(existing.currentPeriodStart, currentStart);
  const subscription = await prisma.$transaction(async tx => {
    const updated = await tx.subscription.update({ where: { id: existing.id,razorpaySubscriptionId:entity.id }, data: { status, currentPeriodStart: currentStart, currentPeriodEnd: currentEnd, expiryDate, nextRenewalDate: !paidThrough && ["active", "pending"].includes(status) ? (fromUnix(entity.charge_at) || currentEnd) : null, startedAt: existing.startedAt || fromUnix(entity.start_at) || currentStart, cancelledAt, daysRemaining, ...(billingPeriodRenewed ? { releasesUsed: 0 } : {}), autoRenewal: !paidThrough && !["cancelled", "completed", "expired"].includes(status) && !existing.cancelAtPeriodEnd, ...(paidThrough ? { cancelAtPeriodEnd: true } : {}), providerSyncedAt: now } });
    if (payment?.id) await tx.subscriptionPayment.upsert({ where: { razorpayPaymentId: payment.id }, create: { subscriptionId: existing.id, planSnapshot: existing.plan, razorpayPaymentId: payment.id, razorpayInvoiceId: payment.invoice_id || null, amount: Number(payment.amount || 0), currency: String(payment.currency || "INR").toUpperCase(), status: String(payment.status || "unknown"), billingPeriodStart: currentStart, billingPeriodEnd: currentEnd, createdAt: fromUnix(payment.created_at) || now }, update: { status: String(payment.status || "unknown"), razorpayInvoiceId: payment.invoice_id || undefined } });
    await tx.auditLog.create({ data: { action: "SUBSCRIPTION_PROVIDER_SYNCHRONIZED", entity: "subscriptions", entityId: String(existing.id), metadata: { providerStatus, paidThrough, paymentId: payment?.id || null, billingPeriodRenewed, releaseAllowanceReset: billingPeriodRenewed } as Prisma.InputJsonObject } });
    return updated;
  });
  if (payment?.id && payment.status === "captured") {
    // Durable enqueue is independent of growth/referral side effects. Cron repairs missed events.
    try { const saved = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayPaymentId: payment.id } }); await queueSubscriptionReceipt(saved.id); }
    catch { console.warn(JSON.stringify({ scope: 'subscription_receipt', status: 'enqueue_retry_required' })); }
    try {
      const persisted = await prisma.subscriptionPayment.findUniqueOrThrow({ where: { razorpayPaymentId: payment.id } });
      await recordVerifiedAcquisitionRevenue({ sourceType: "subscription_payment", sourceId: String(persisted.id), customerId: subscription.userId, paymentId: payment.id, currency: persisted.currency, recognisedRevenueMinor: persisted.amount });
      await qualifyRecurringReferral(persisted.id);
      await qualifyPartnerPayment(persisted.id);
      const earlier = await prisma.subscriptionPayment.count({ where: { subscriptionId: subscription.id, status: "captured", id: { lt: persisted.id } } });
      await recordGrowthEvent({ event: "payment_success", key: `subscription-payment:${persisted.id}`, userId: subscription.userId, properties: { amount_cents: persisted.amount, currency: persisted.currency, plan_id: subscription.plan } });
      await recordGrowthEvent({ event: earlier ? "plan_renewed" : "plan_purchased", key: `subscription-conversion:${persisted.id}`, userId: subscription.userId, properties: { plan_id: subscription.plan } });
    } catch { console.warn(JSON.stringify({ scope: "growth", event: "subscription_observation", status: "retry_required" })); }
  }
  return subscription;
}

export async function fetchAndSynchronizeSubscription(userId: number, providerSubscriptionId: string, paymentId?: string) {
  const local = await prisma.subscription.findUnique({ where: { userId } });
  if (!local || local.razorpaySubscriptionId !== providerSubscriptionId) throw new Error("Subscription does not belong to the authenticated user.");
  if (!razorpay) throw new Error("Razorpay is not configured.");
  const provider = await razorpay.subscriptions.fetch(providerSubscriptionId);
  let payment: ProviderPayment | undefined;
  if (paymentId) {
    const captured = await razorpay.payments.fetch(paymentId);
    if (!captured.invoice_id) throw Error('Subscription payment invoice is not available yet. Please refresh your subscription shortly.');
    const invoice = await razorpay.invoices.fetch(captured.invoice_id);
    if ((invoice as typeof invoice & { subscription_id?: string }).subscription_id !== providerSubscriptionId) throw Error('Payment does not belong to this subscription.');
    const version = local.planVersionId ? await prisma.subscriptionPlanVersion.findUnique({ where: { id: local.planVersionId } }) : null;
    if (!version || Number(captured.amount) !== version.amount || captured.currency !== version.currency) throw Error('Subscription payment amount does not match the authorised plan.');
    payment = captured as ProviderPayment;
  }
  return synchronizeProviderSubscription(provider as ProviderSubscription, payment);
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
