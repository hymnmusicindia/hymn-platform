import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { razorpay } from "@/lib/razorpay";
import { getTrackPricingQuote } from "@/lib/distribution-pricing";
import { createDistributionOrder, getDistributionPricing } from "@/lib/distribution-db";
import { distributionOrderCreateSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = distributionOrderCreateSchema.parse(await request.json());
    const amount = getDistributionPricing(payload.plan, payload.trackCount, payload.releaseType, payload.platforms, { youtubeContentIdEnabled: payload.youtubeContentIdEnabled });
    const amountPaise = Math.round(amount * 100);

    const order = razorpay
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
      ugcAddOnAmount: amount - getDistributionPricing(payload.plan, payload.trackCount, payload.releaseType, [], { youtubeContentIdEnabled: payload.youtubeContentIdEnabled }),
      trackPricing: payload.plan === "pay_per_release" ? getTrackPricingQuote(payload.trackCount) : null,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "dev_razorpay_key"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create distribution payment order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

