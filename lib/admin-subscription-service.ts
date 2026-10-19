import "server-only";
import { prisma } from "@/lib/prisma";
import { artistProfileLimitForPlan } from "@/lib/artist-profile-limits";
import { SUBSCRIPTION_POLICIES, subscriptionHasEntitlement, subscriptionEntitlementEnd, type SubscriptionProduct } from "@/lib/subscription-billing";

export async function grantManualSubscription(userId: number, actorId: number | null, input: { plan: SubscriptionProduct; durationDays: number; note: string; mode: "replace" | "extend"; expectedUpdatedAt: string | null }) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(19462027, ${userId}::int)`;
    const user = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (!user || user.status !== "ACTIVE") throw Error("Subscription grants require an active user account.");
    const previous = await tx.subscription.findUnique({ where: { userId } });
    if ((previous?.updatedAt.toISOString() ?? null) !== input.expectedUpdatedAt) throw Error("The subscription changed. Refresh account benefits before trying again.");
    if (previous?.razorpaySubscriptionId && !["cancelled", "completed", "expired"].includes(previous.status.toLowerCase())) throw Error("A provider-billed subscription is still linked. Cancel it through billing before granting manual access; this prevents duplicate billing.");
    const now = new Date();
    if (input.mode === "extend" && (!previous || !subscriptionHasEntitlement(previous) || previous.plan !== input.plan)) throw Error("Extension requires an active manual subscription on the same plan. Choose replace to change plans.");
    const expiryDate = new Date((input.mode === "extend" && previous ? subscriptionEntitlementEnd(previous) : now.getTime()) + input.durationDays * 86400000);
    const policy = SUBSCRIPTION_POLICIES[input.plan];
    const fields = { plan: input.plan, planName: policy.name, expiryDate, status: "active", artistLimit: artistProfileLimitForPlan(input.plan), releaseLimit: null, availableFeatures: JSON.stringify([...policy.features, "manual_unlimited_releases"]), daysRemaining: Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000), autoRenewal: false, currentPeriodStart: null, currentPeriodEnd: null, nextRenewalDate: null, cancelledAt: null, cancelAtPeriodEnd: false, razorpaySubscriptionId: null, razorpayPlanId: null, planVersionId: null, providerSyncedAt: null };
    const subscription = await tx.subscription.upsert({ where: { userId }, create: { userId, ...fields, purchasedAt: now }, update: fields });
    await tx.auditLog.create({ data: { actorType: "admin", actorId, actorRole: "admin", entity: "subscription", entityId: String(subscription.id), action: "subscription.admin_granted", reason: input.note, riskLevel: "high", previousValue: previous ? { plan: previous.plan, status: previous.status, expiryDate: previous.expiryDate.toISOString() } : undefined, newValue: { userId, plan: input.plan, mode: input.mode, expiryDate: expiryDate.toISOString(), releaseLimit: null, autoRenewal: false } } });
    // An unpaid one-time order saved before the grant must not keep sending this
    // user through payment after their subscription now covers the draft.
    await tx.distributionOrder.updateMany({
      where: { userId, paymentStatus: { in: ["created", "authorized"] }, fulfilledAt: null, razorpayPaymentId: null, plan: input.plan },
      data: { paymentStatus: "cancelled" },
    });
    return subscription;
  }, { isolationLevel: "Serializable", timeout: 15000 });
}
