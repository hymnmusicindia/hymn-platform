import { NextResponse } from "next/server";
import { buildCheckoutQuote, quoteToOrderItems } from "@/lib/checkout";
import { paymentCreateSchema } from "@/lib/validation";
import { createOrder } from "@/lib/db";
import { getSession } from "@/lib/session";
import { razorpay } from "@/lib/razorpay";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = paymentCreateSchema.parse(await request.json());
    const checkoutItems = payload.items.map((item) => {
      if (item.licenseType === "premium") throw new Error("Premium legacy licenses are no longer available for checkout.");
      return { type: "beat" as const, beatId: item.beatId, licenseType: item.licenseType };
    });
    const quote = await buildCheckoutQuote(session.sub, { items: checkoutItems, useReferralCredits: false });
    const amountPaise = Math.round(quote.finalAmount * 100);

    if (amountPaise > 0 && process.env.NODE_ENV === "production" && !razorpay) {
      return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });
    }

    const order =
      razorpay
        ? await razorpay.orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: `hymn-${Date.now()}`
          })
        : { id: `dev_order_${Date.now()}`, amount: amountPaise, currency: "INR" };

    await createOrder({
      userId: session.sub,
      productId: quote.productId,
      originalPrice: quote.originalPrice,
      discountApplied: quote.couponDiscount + quote.referralBenefitApplied,
      referralCreditsUsed: quote.referralCreditsApplied,
      finalAmount: quote.finalAmount,
      couponCode: quote.couponCode,
      razorpayOrderId: order.id,
      amount: quote.finalAmount,
      paymentStatus: "created",
      items: quoteToOrderItems(quote)
    });

    return NextResponse.json({
      orderId: order.id,
      amount: amountPaise,
      currency: "INR",
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || (process.env.NODE_ENV !== "production" ? "dev_razorpay_key" : "")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create payment order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger 5
