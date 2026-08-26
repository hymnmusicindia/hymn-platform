import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { razorpay } from "@/lib/razorpay";
import { getTrackPricingQuote, getUgcAddonPrice } from "@/lib/distribution-pricing";
import { createDistributionOrder, getDistributionPricing } from "@/lib/distribution-db";
import { distributionOrderCreateSchema } from "@/lib/validation";
import { calculateFirstReleasePrice, FIRST_RELEASE_PROMOTION_CODE, getFirstReleaseEligibility } from "@/lib/first-release-promotion";
import { getSubscriptionByUserId } from "@/lib/db";
import { createProviderSubscription, isSubscriptionProduct, subscriptionHasEntitlement } from "@/lib/subscription-billing";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = distributionOrderCreateSchema.parse(await request.json());
    const subscription = await getSubscriptionByUserId(session.sub);
    const hasActiveSubscription = subscriptionHasEntitlement(subscription);
    if (hasActiveSubscription) {
      if (payload.paymentModel !== "subscription" || payload.plan !== subscription!.plan) return NextResponse.json({ error: "The selected plan does not match your active subscription." }, { status: 400 });
      if (subscription!.releaseLimit != null && subscription!.releasesUsed >= subscription!.releaseLimit) return NextResponse.json({ error: "Your subscription release allowance has been used." }, { status: 409 });
      const entitlementOrderId = `sub_entitlement_${session.sub}_${Date.now()}`;
      await createDistributionOrder({ userId: session.sub, plan: payload.plan, amount: 0, razorpayOrderId: entitlementOrderId });
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
    const amountPaise = Math.round(amount * 100);
    if (amountPaise > 0 && !razorpay) {
      return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });
    }

    const order = amountPaise === 0
      ? { id: `free_first_release_${session.sub}_${Date.now()}`, amount: 0, currency: "INR" }
      : await razorpay!.orders.create({ amount: amountPaise, currency: "INR", receipt: `hymn-dist-${Date.now()}` });

    await createDistributionOrder({
      userId: session.sub,
      plan: payload.plan,
      amount,
      razorpayOrderId: order.id
    });

    return NextResponse.json({
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      displayAmount: amount,
      requiresPayment: amountPaise > 0,
      promotion,
      ugcAddOnAmount: getUgcAddonPrice(payload.platforms, payload.plan, { youtubeContentIdEnabled: payload.youtubeContentIdEnabled }),
      trackPricing: payload.plan === "one_time" ? getTrackPricingQuote(payload.trackCount) : null,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || ""
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create distribution payment order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 5
