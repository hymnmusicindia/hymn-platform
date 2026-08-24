import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { razorpay } from "@/lib/razorpay";
import { getTrackPricingQuote, getUgcAddonPrice } from "@/lib/distribution-pricing";
import { createDistributionOrder, getDistributionPricing } from "@/lib/distribution-db";
import { distributionOrderCreateSchema } from "@/lib/validation";
import { isProductionPaymentBypassEnabled } from "@/lib/env";
import { calculateFirstReleasePrice, FIRST_RELEASE_PROMOTION_CODE, getFirstReleaseEligibility } from "@/lib/first-release-promotion";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = distributionOrderCreateSchema.parse(await request.json());
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
    const isBypassEnabled = isProductionPaymentBypassEnabled();

    if (amountPaise > 0 && !isBypassEnabled && process.env.NODE_ENV === "production" && !razorpay) {
      return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });
    }

    const order = amountPaise === 0
      ? { id: `free_first_release_${session.sub}_${Date.now()}`, amount: 0, currency: "INR" }
      : razorpay
      ? await razorpay.orders.create({ amount: amountPaise, currency: "INR", receipt: `hymn-dist-${Date.now()}` })
      : { id: `dev_dist_order_${Date.now()}`, amount: amountPaise, currency: "INR" };

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
      key: isBypassEnabled ? "dev_bypass_payment" : (process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || (process.env.NODE_ENV !== "production" ? "dev_razorpay_key" : ""))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create distribution payment order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 5
