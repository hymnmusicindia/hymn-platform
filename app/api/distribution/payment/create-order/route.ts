import { requireCurrentPolicyAcceptance } from "@/lib/policy-agreement";
import { SubscriptionPlanConfigurationError, subscriptionCheckoutUnavailable } from "@/lib/subscription-plan-validation";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { razorpay } from "@/lib/razorpay";
import { createDistributionCheckoutQuote, getTrackPricingQuote, getUgcAddonPrice, getYoutubeContentIdAddonPrice } from "@/lib/distribution-pricing";
import { createDistributionOrder, getDistributionPricing } from "@/lib/distribution-db";
import { distributionOrderCreateSchema } from "@/lib/validation";
import { calculateFirstReleasePrice, FIRST_RELEASE_PROMOTION_CODE, getFirstReleaseEligibility, reserveFirstRelease } from "@/lib/first-release-promotion";
import { getSubscriptionByUserId } from "@/lib/db";
import { createProviderSubscription, isSubscriptionProduct, subscriptionHasEntitlement, subscriptionHasReleaseAllowance } from "@/lib/subscription-billing";
import { prisma } from "@/lib/prisma";
import { confirmDistributionPayment } from "@/lib/payment-webhooks";
import { checkoutPlan } from "@/lib/distribution-checkout-plan";
import { releaseReviewSnapshotHash } from "@/lib/release-review-snapshot";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const policyGate = await requireCurrentPolicyAcceptance(session.sub);
  if (policyGate) return policyGate;

  try {
    const payload = distributionOrderCreateSchema.parse(await request.json());
    if (!payload.draftReleaseId) return NextResponse.json({ error: "Save your release draft before starting checkout." }, { status: 409 });
    const checkoutDraft = await prisma.release.findFirst({
      where: { id: payload.draftReleaseId, userId: session.sub, archivedAt: null },
      include: { tracks: { select: { id: true, trackNumber: true } } }
    });
    if (!checkoutDraft) return NextResponse.json({ error: "The checkout draft is no longer available." }, { status: 409 });
    const savedMetadata = checkoutDraft.metadata && typeof checkoutDraft.metadata === "object" && !Array.isArray(checkoutDraft.metadata)
      ? checkoutDraft.metadata as Record<string, unknown>
      : {};
    const savedPlatforms = Array.isArray(savedMetadata.platforms) ? savedMetadata.platforms.filter((item): item is string => typeof item === "string") : [];
    const savedReleaseType = checkoutDraft.releaseType || "single";
    const savedTrackCount = checkoutDraft.tracks.length;
    const savedYoutubeContentId = savedMetadata.youtubeContentIdEnabled === true;
    const savedPlan = typeof savedMetadata.distributionPlan === "string" ? savedMetadata.distributionPlan : payload.plan;
    const savedPaymentModel = savedMetadata.paymentModel === "subscription" ? "subscription" : "one_time";
    if (savedPlan !== payload.plan || savedTrackCount !== payload.trackCount || savedReleaseType !== payload.releaseType || savedPaymentModel !== payload.paymentModel) {
      return NextResponse.json({ error: "The saved release changed after checkout was opened. Refresh the review and try again.", code: "CHECKOUT_DRAFT_CHANGED" }, { status: 409 });
    }
    if (JSON.stringify(savedPlatforms) !== JSON.stringify(payload.platforms) || savedYoutubeContentId !== Boolean(payload.youtubeContentIdEnabled)) {
      return NextResponse.json({ error: "The saved delivery options changed. Refresh the review before checkout.", code: "CHECKOUT_DRAFT_CHANGED" }, { status: 409 });
    }
    if (payload.draftReleaseId) {
      const draft = checkoutDraft;
      const draftStatus = String(draft?.status ?? "").trim().toLowerCase();
      const draftPaymentStatus = String(draft?.paymentStatus ?? "").trim().toLowerCase();
      const paidCorrectionStatuses = new Set(["changes_requested", "rejected", "resubmitted"]);
      if (!draft) return NextResponse.json({ error: "The checkout draft is no longer available." }, { status: 409 });
      if (paidCorrectionStatuses.has(draftStatus) && draftPaymentStatus === "paid") {
        return NextResponse.json({ error: "This release is already paid. Submit the corrections again instead of creating another payment." }, { status: 409 });
      }
      if (!["draft", "awaiting_payment"].includes(draftStatus)) return NextResponse.json({ error: "The checkout draft is no longer available." }, { status: 409 });
      if (draftStatus === "draft") {
        if (!draft.reviewConfirmedAt || draft.reviewConfirmedBy !== session.sub) return NextResponse.json({ error: "Confirm the saved release review before checkout." }, { status: 409 });
        const currentHash = await releaseReviewSnapshotHash(draft.id, session.sub);
        if (!draft.reviewMetadataHash || draft.reviewMetadataHash !== currentHash) return NextResponse.json({ error: "The release changed after review. Review and confirm the latest saved version before checkout." }, { status: 409 });
      }
      const attachedOrder = await prisma.distributionOrder.findUnique({ where: { releaseId: draft.id } });
      if (attachedOrder && attachedOrder.userId !== session.sub) return NextResponse.json({ error: "The checkout payment belongs to another customer." }, { status: 409 });
      // Older draft saves reset the release payment flag after fulfillment.
      if (draftPaymentStatus === "paid" || (attachedOrder?.paymentStatus === "paid" && attachedOrder.fulfilledAt)) {
        if (draftPaymentStatus !== "paid") {
          const restored = await prisma.release.updateMany({ where: { id: draft.id, userId: session.sub, status: draft.status, paymentStatus: draft.paymentStatus }, data: { paymentStatus: "paid" } });
          if (restored.count !== 1) return NextResponse.json({ error: "The release changed while checkout was loading. Please retry." }, { status: 409 });
        }
        return NextResponse.json({ requiresPayment: false, paidReleaseReusable: true });
      }
      if (attachedOrder?.paymentStatus === "paid" && attachedOrder.razorpayPaymentId && !attachedOrder.fulfilledAt && (!attachedOrder.razorpayOrderId.startsWith("sub_entitlement_") || payload.paymentModel === "subscription")) {
        // verify-submit still checks ownership, price, plan and the stored payment ID.
        return NextResponse.json({ orderId: attachedOrder.razorpayOrderId, paymentId: attachedOrder.razorpayPaymentId, plan: checkoutPlan(attachedOrder, payload.plan), requiresPayment: false, paidOrderReusable: true, amount: 0, currency: attachedOrder.currency, creditsUsed: attachedOrder.creditsUsed });
      }
    }
    const subscription = await getSubscriptionByUserId(session.sub);
    const hasActiveSubscription = subscriptionHasEntitlement(subscription);
    // Issues the zero-value order that lets an active plan cover this release.
    const coverWithSubscription = async (plan: typeof payload.plan) => {
      const existingEntitlement = payload.draftReleaseId
        ? await prisma.distributionOrder.findUnique({ where: { releaseId: payload.draftReleaseId } })
        : null;
      if (existingEntitlement?.userId === session.sub && existingEntitlement.fulfilledAt == null && existingEntitlement.plan === plan && existingEntitlement.amount === 0 && existingEntitlement.creditsUsed === 0 && existingEntitlement.razorpayOrderId.startsWith("sub_entitlement_")) {
        return NextResponse.json({
          orderId: existingEntitlement.razorpayOrderId,
          plan: existingEntitlement.plan,
          amount: 0,
          currency: existingEntitlement.currency,
          displayAmount: 0,
          requiresPayment: false,
          subscriptionCovered: true,
          resumedOrder: true,
        });
      }
      const entitlementOrderId = `sub_entitlement_${session.sub}_${Date.now()}`;
      await createDistributionOrder({ userId: session.sub, plan, amount: 0, razorpayOrderId: entitlementOrderId, releaseId: payload.draftReleaseId });
      return NextResponse.json({
        orderId: entitlementOrderId,
        plan,
        amount: 0,
        currency: "INR",
        displayAmount: 0,
        requiresPayment: false,
        subscriptionCovered: true,
      });
    };
    if (hasActiveSubscription && payload.paymentModel === "subscription") {
      if (payload.plan !== checkoutPlan(subscription!, "one_time")) return NextResponse.json({ error: "The selected plan does not match your active subscription." }, { status: 400 });
      if (!subscriptionHasReleaseAllowance(subscription)) return NextResponse.json({ error: "Your subscription release allowance has been used." }, { status: 409 });
      return coverWithSubscription(payload.plan);
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
        key: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ""
      });
    }
    if (payload.promotionCode === FIRST_RELEASE_PROMOTION_CODE && savedMetadata.promotionCode !== FIRST_RELEASE_PROMOTION_CODE) {
      return NextResponse.json({ error: "Save and confirm this first-release offer on the draft before checkout." }, { status: 409 });
    }
    const normalAmount = getDistributionPricing(payload.plan, savedTrackCount, savedReleaseType, savedPlatforms, { youtubeContentIdEnabled: savedYoutubeContentId });
    let amount = normalAmount;
    let promotion = null;
    const firstReleaseOffer = savedMetadata.promotionCode === FIRST_RELEASE_PROMOTION_CODE;
    if (firstReleaseOffer) {
      const eligibility = await getFirstReleaseEligibility(session.sub, checkoutDraft.id);
      if (eligibility.reason === "active_subscription") return NextResponse.json({ error: "Your active subscription already covers distribution. Resume the release using your plan instead of the first-release gift.", code: "active_subscription", resumeUrl: "/distribution/start" }, { status: 409 });
      if (!eligibility.eligible) return NextResponse.json({ error: eligibility.reason === "reserved" ? "Your first-release offer is reserved by an in-progress checkout. Resume that draft before starting another release." : ["promotion_inactive", "promotion_exhausted"].includes(eligibility.reason) ? "The first-release campaign is not currently accepting claims." : "This account has already used its first-release eligibility.", code: eligibility.reason }, { status: 409 });
      promotion = calculateFirstReleasePrice({ plan: payload.plan, releaseType: savedReleaseType, trackCount: savedTrackCount, normalAmount });
      amount = promotion.finalAmount;
    }
    // The release page picks the plan when it loads, so a page opened before a plan was activated
    // still asks for the one-time fee. Never start a new charge for a release the plan already covers;
    // the first-release gift keeps its own order so the plan allowance is saved for a later release.
    const coveringPlan = !promotion && hasActiveSubscription && subscriptionHasReleaseAllowance(subscription) ? checkoutPlan(subscription!, "one_time") : "one_time";
    const priceBeforeCredits = amount;
    const creditAccount = payload.useHymnCredits && amount > 0
      ? await prisma.user.findUnique({ where: { id: session.sub }, select: { referralCredits: true } })
      : null;
    const creditsUsed = Math.min(Math.max(0, Number(creditAccount?.referralCredits ?? 0)), amount);
    amount = Math.max(0, amount - creditsUsed);
    const reviewMetadataHash = await releaseReviewSnapshotHash(checkoutDraft.id, session.sub);
    if (!reviewMetadataHash || (checkoutDraft.reviewMetadataHash && reviewMetadataHash !== checkoutDraft.reviewMetadataHash)) return NextResponse.json({ error: "The release review is out of date. Review and confirm the latest saved version before checkout." }, { status: 409 });
    const quote = payload.plan === "one_time" && savedPaymentModel === "one_time"
      ? createDistributionCheckoutQuote({
          releaseId: checkoutDraft.id,
          reviewMetadataHash,
          trackCount: savedTrackCount,
          releaseType: savedReleaseType,
          platforms: savedPlatforms,
          youtubeContentIdEnabled: savedYoutubeContentId,
          firstReleaseOffer,
          useHymnCredits: Boolean(payload.useHymnCredits),
          availableCredits: Number(creditAccount?.referralCredits ?? 0)
        })
      : null;
    const quoteSnapshot = quote && firstReleaseOffer && promotion
      ? {
          ...quote,
          promotionRedemptionId: (await reserveFirstRelease({
            userId: session.sub,
            releaseId: checkoutDraft.id,
            originalAmount: promotion.originalAmount,
            discountAmount: promotion.discountAmount,
            finalAmount: promotion.finalAmount,
            attribution: savedMetadata.campaignAttribution && typeof savedMetadata.campaignAttribution === "object" ? savedMetadata.campaignAttribution as Record<string, string> : undefined
          })).id
        }
      : quote;
    const responseQuote = quoteSnapshot ? { ...quoteSnapshot, promotionRedemptionId: undefined } : null;
    if (quoteSnapshot) {
      amount = quoteSnapshot.payable;
      // Credits and the first-release discount are based on the server quote,
      // with add-ons left outside the ₹99 base-fee discount.
    }
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
          plan: reusable.plan,
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
      if (coveringPlan !== "one_time") return coverWithSubscription(coveringPlan);
      const resumableUnpaidOrder = recentUnfulfilledOrders.find((candidate) => candidate.amount === amount && candidate.creditsUsed === creditsUsed);
      if (resumableUnpaidOrder) {
        if (quoteSnapshot) await prisma.distributionOrder.updateMany({
          where: { id: resumableUnpaidOrder.id, userId: session.sub, paymentStatus: { in: ["created", "authorized"] }, fulfilledAt: null },
          data: { quoteSnapshot: quoteSnapshot as any }
        });
        return NextResponse.json({
          orderId: resumableUnpaidOrder.razorpayOrderId,
          plan: resumableUnpaidOrder.plan,
          amount: amountPaise,
          currency: resumableUnpaidOrder.currency,
          displayAmount: amount,
          requiresPayment: true,
          resumedOrder: true,
          creditsUsed: resumableUnpaidOrder.creditsUsed,
          quote: responseQuote,
          key: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "",
        });
      }
    }

    if (coveringPlan !== "one_time") return coverWithSubscription(coveringPlan);
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
      quoteSnapshot: quoteSnapshot as any,
    });

    const creditPaymentId = creditsUsed > 0 && amountPaise === 0 ? `credits_${order.id}` : null;
    if (creditPaymentId) await confirmDistributionPayment({ razorpayOrderId: order.id, paymentId: creditPaymentId, userId: session.sub, amountMinor: 0, currency: "INR", source: "browser" });

    return NextResponse.json({
      orderId: order.id,
      plan: payload.plan,
      amount: amountPaise,
      currency: "INR",
      displayAmount: amount,
      requiresPayment: amountPaise > 0,
      ...(creditPaymentId ? { paymentId: creditPaymentId, paidOrderReusable: true, creditCovered: true } : {}),
      creditsUsed,
      priceBeforeCredits,
      promotion,
      ugcAddOnAmount: getUgcAddonPrice(savedPlatforms, payload.plan),
      youtubeContentIdAddOnAmount: getYoutubeContentIdAddonPrice(payload.plan, savedYoutubeContentId),
      trackPricing: payload.plan === "one_time" ? getTrackPricingQuote(savedTrackCount) : null,
      quote: responseQuote,
      key: process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create distribution payment order.";
    if (error instanceof SubscriptionPlanConfigurationError) {
      console.error("Subscription plan configuration mismatch", { message });
      return NextResponse.json({ error: subscriptionCheckoutUnavailable, code: "SUBSCRIPTION_PLAN_UNAVAILABLE" }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 5
