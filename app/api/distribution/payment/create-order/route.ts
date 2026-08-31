import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { razorpay } from "@/lib/razorpay";
import { getTrackPricingQuote, getUgcAddonPrice } from "@/lib/distribution-pricing";
import { createDistributionOrder, getDistributionPricing } from "@/lib/distribution-db";
import { distributionOrderCreateSchema } from "@/lib/validation";
import { calculateFirstReleasePrice, FIRST_RELEASE_PROMOTION_CODE, getFirstReleaseEligibility } from "@/lib/first-release-promotion";
import { getSubscriptionByUserId } from "@/lib/db";
import { createProviderSubscription, isSubscriptionProduct, subscriptionHasEntitlement, subscriptionHasReleaseAllowance } from "@/lib/subscription-billing";
import { prisma } from "@/lib/prisma";
import { confirmDistributionPayment } from "@/lib/payment-webhooks";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = distributionOrderCreateSchema.parse(await request.json());
    if (payload.draftReleaseId) {
      const draft = await prisma.release.findFirst({ where: { id: payload.draftReleaseId, userId: session.sub }, select: { id: true, status: true, paymentStatus: true } });
      const draftStatus = String(draft?.status ?? "").trim().toLowerCase();
      const draftPaymentStatus = String(draft?.paymentStatus ?? "").trim().toLowerCase();
      const paidCorrectionStatuses = new Set(["changes_requested", "rejected", "resubmitted"]);
      if (!draft) return NextResponse.json({ error: "The checkout draft is no longer available." }, { status: 409 });
      if (paidCorrectionStatuses.has(draftStatus) && draftPaymentStatus === "paid") {
        return NextResponse.json({ error: "This release is already paid. Submit the corrections again instead of creating another payment." }, { status: 409 });
      }
      if (!["draft", "awaiting_payment"].includes(draftStatus)) return NextResponse.json({ error: "The checkout draft is no longer available." }, { status: 409 });
    }
    const subscription = await getSubscriptionByUserId(session.sub);
    const hasActiveSubscription = subscriptionHasEntitlement(subscription);
    if (hasActiveSubscription && payload.paymentModel === "subscription") {
      if (payload.plan !== subscription!.plan) return NextResponse.json({ error: "The selected plan does not match your active subscription." }, { status: 400 });
      if (!subscriptionHasReleaseAllowance(subscription)) return NextResponse.json({ error: "Your subscription release allowance has been used." }, { status: 409 });
      const existingEntitlement = payload.draftReleaseId
        ? await prisma.distributionOrder.findUnique({ where: { releaseId: payload.draftReleaseId } })
        : null;
      if (existingEntitlement?.userId === session.sub && existingEntitlement.fulfilledAt == null && existingEntitlement.plan === payload.plan && existingEntitlement.amount === 0 && existingEntitlement.creditsUsed === 0 && existingEntitlement.razorpayOrderId.startsWith("sub_entitlement_")) {
        return NextResponse.json({
          orderId: existingEntitlement.razorpayOrderId,
          amount: 0,
          currency: existingEntitlement.currency,
          displayAmount: 0,
          requiresPayment: false,
          subscriptionCovered: true,
          resumedOrder: true,
        });
      }
      const entitlementOrderId = `sub_entitlement_${session.sub}_${Date.now()}`;
      await createDistributionOrder({ userId: session.sub, plan: payload.plan, amount: 0, razorpayOrderId: entitlementOrderId, releaseId: payload.draftReleaseId });
      return NextResponse.json({
        orderId: entitlementOrderId,
        amount: 0,
        currency: "INR",
        displayAmount: 0,
        requiresPayment: false,
        subscriptionCovered: true,
      });
    }
    if (payload.plan !== "one_time") {
      if (!isSubscriptionProduct(payload.plan)) return NextResponse.json({ error: "Invalid subscription product." }, { status: 400 });
      const created = await createProviderSubscription(session.sub, payload.plan);
      return NextResponse.json({
        billingType: "subscription",
        subscriptionId: created.provider.id,
        product: payload.plan,
        amount: created.version.amount,
        currency: created.version.currency,
        displayAmount: created.version.amount / 100,
        requiresPayment: true,
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ""
      });
    }
    const normalAmount = getDistributionPricing(payload.plan, payload.trackCount, payload.releaseType, payload.platforms, { youtubeContentIdEnabled: payload.youtubeContentIdEnabled });
    let amount = normalAmount;
    let promotion = null;
    if (payload.promotionCode === FIRST_RELEASE_PROMOTION_CODE) {
      const eligibility = await getFirstReleaseEligibility(session.sub);
      if (!eligibility.eligible) return NextResponse.json({ error: "Your first-release offer has already been used or reserved." }, { status: 409 });
      promotion = calculateFirstReleasePrice({ plan: payload.plan, releaseType: payload.releaseType, trackCount: payload.trackCount, normalAmount });
      amount = promotion.finalAmount;
    }
    const priceBeforeCredits = amount;
    const creditAccount = payload.useHymnCredits && amount > 0
      ? await prisma.user.findUnique({ where: { id: session.sub }, select: { referralCredits: true } })
      : null;
    const creditsUsed = Math.min(Math.max(0, Number(creditAccount?.referralCredits ?? 0)), amount);
    amount = Math.max(0, amount - creditsUsed);
    const amountPaise = Math.round(amount * 100);
    if (amountPaise > 0 && !razorpay) {
      return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });
    }

    if (priceBeforeCredits > 0 && payload.draftReleaseId) {
      const recentOrderCandidates = await prisma.distributionOrder.findMany({
        where: {
          userId: session.sub,
          plan: payload.plan,
          currency: "INR",
          paymentStatus: { in: ["created", "authorized"] },
          fulfilledAt: null,
          OR: [
            { releaseId: payload.draftReleaseId },
            { releaseId: null, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const recentUnfulfilledOrders = recentOrderCandidates.filter((candidate) => candidate.amount + candidate.creditsUsed === priceBeforeCredits);
      let providerReconciliationFailed = false;
      if (razorpay) {
        for (const candidate of recentUnfulfilledOrders) {
          try {
            const payments = await razorpay.orders.fetchPayments(candidate.razorpayOrderId);
            const captured = payments.items.find((payment: any) => payment.status === "captured" && Number(payment.amount) === candidate.amount * 100 && String(payment.currency).toUpperCase() === "INR");
            if (captured?.id) await confirmDistributionPayment({ razorpayOrderId: candidate.razorpayOrderId, paymentId: String(captured.id), userId: session.sub, amountMinor: candidate.amount * 100, currency: "INR", source: "reconciliation" });
          } catch (error) {
            providerReconciliationFailed = true;
            console.error("Distribution payment reconciliation failed", { orderId: candidate.id, message: error instanceof Error ? error.message : "Provider lookup failed" });
          }
        }
      }
      const reusableCandidates = await prisma.distributionOrder.findMany({
        where: {
          userId: session.sub,
          plan: payload.plan,
          currency: "INR",
          paymentStatus: "paid",
          fulfilledAt: null,
          razorpayPaymentId: { not: null },
          OR: [
            { releaseId: payload.draftReleaseId },
            { releaseId: null, createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const reusableOrders = reusableCandidates.filter((candidate) => candidate.amount + candidate.creditsUsed === priceBeforeCredits);
      const boundOrder = reusableOrders.find((candidate) => candidate.releaseId === payload.draftReleaseId);
      const unboundOrders = reusableOrders.filter((candidate) => candidate.releaseId == null);
      if (!boundOrder && unboundOrders.length > 1) return NextResponse.json({ error: "Multiple captured payments are waiting for this release. No new charge was created. Contact HYMN support for reconciliation." }, { status: 409 });
      const reusable = boundOrder ?? (unboundOrders.length === 1 ? unboundOrders[0] : null);
      if (reusable) {
        if (reusable.releaseId == null) {
          const bound = await prisma.distributionOrder.updateMany({ where: { id: reusable.id, releaseId: null, fulfilledAt: null }, data: { releaseId: payload.draftReleaseId } });
          if (bound.count !== 1) return NextResponse.json({ error: "The paid release entitlement changed while checkout was loading. Please retry." }, { status: 409 });
        }
        return NextResponse.json({
          orderId: reusable.razorpayOrderId,
          paymentId: reusable.razorpayPaymentId,
          amount: 0,
          currency: reusable.currency,
          displayAmount: 0,
          requiresPayment: false,
          paidOrderReusable: true,
          creditsUsed: reusable.creditsUsed,
        });
      }
      if (providerReconciliationFailed) return NextResponse.json({ error: "HYMN could not safely reconcile your previous checkout. No new charge was created. Please retry shortly or contact HYMN support." }, { status: 503 });
      const resumableUnpaidOrder = recentUnfulfilledOrders.find((candidate) => candidate.amount === amount && candidate.creditsUsed === creditsUsed);
      if (resumableUnpaidOrder) {
        return NextResponse.json({
          orderId: resumableUnpaidOrder.razorpayOrderId,
          amount: amountPaise,
          currency: resumableUnpaidOrder.currency,
          displayAmount: amount,
          requiresPayment: true,
          resumedOrder: true,
          creditsUsed: resumableUnpaidOrder.creditsUsed,
          key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "",
        });
      }
    }

    const order = amountPaise === 0
      ? { id: creditsUsed > 0 ? `credit_distribution_${session.sub}_${Date.now()}` : `free_first_release_${session.sub}_${Date.now()}`, amount: 0, currency: "INR" }
      : await razorpay!.orders.create({ amount: amountPaise, currency: "INR", receipt: `hymn-dist-${Date.now()}` });

    await createDistributionOrder({
      userId: session.sub,
      plan: payload.plan,
      amount,
      creditsUsed,
      razorpayOrderId: order.id,
      releaseId: payload.draftReleaseId,
    });

    const creditPaymentId = creditsUsed > 0 && amountPaise === 0 ? `credits_${order.id}` : null;
    if (creditPaymentId) await confirmDistributionPayment({ razorpayOrderId: order.id, paymentId: creditPaymentId, userId: session.sub, amountMinor: 0, currency: "INR", source: "browser" });

    return NextResponse.json({
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      displayAmount: amount,
      requiresPayment: amountPaise > 0,
      ...(creditPaymentId ? { paymentId: creditPaymentId, paidOrderReusable: true, creditCovered: true } : {}),
      creditsUsed,
      priceBeforeCredits,
      promotion,
      ugcAddOnAmount: getUgcAddonPrice(payload.platforms, payload.plan, { youtubeContentIdEnabled: payload.youtubeContentIdEnabled }),
      trackPricing: payload.plan === "one_time" ? getTrackPricingQuote(payload.trackCount) : null,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create distribution payment order.";
    const missingRazorpayPlan = message.match(/^RAZORPAY_PLAN_(HALF_YEARLY|YEARLY|YEARLY_PLUS) is not configured\.$/);
    if (missingRazorpayPlan) {
      console.error("Distribution subscription checkout is missing a Razorpay plan id.", { planEnv: `RAZORPAY_PLAN_${missingRazorpayPlan[1]}` });
      return NextResponse.json({ error: "This subscription checkout is temporarily unavailable. HYMN support has been notified; please choose One-Time Review or try again after the plan is configured." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 5
