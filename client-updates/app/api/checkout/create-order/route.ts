import { NextResponse } from "next/server";
import { buildCheckoutQuote, quoteToOrderItems } from "@/lib/checkout";
import { createOrder, completeCheckoutOrder } from "@/lib/db";
import { razorpay } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { checkoutCreateOrderSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = checkoutCreateOrderSchema.parse(await request.json());
    const quote = await buildCheckoutQuote(session.sub, payload);
    const amountPaise = Math.round(quote.finalAmount * 100);

    const razorpayOrder = amountPaise > 0
      ? razorpay
        ? await razorpay.orders.create({
            amount: amountPaise,
            currency: "INR",
            receipt: `hymn-checkout-${Date.now()}`
          })
        : { id: `dev_checkout_order_${Date.now()}`, amount: amountPaise, currency: "INR" }
      : { id: `free_checkout_order_${Date.now()}`, amount: 0, currency: "INR" };

    await createOrder({
      userId: session.sub,
      productId: quote.productId,
      originalPrice: quote.originalPrice,
      discountApplied: quote.couponDiscount + quote.referralBenefitApplied,
      referralCreditsUsed: quote.referralCreditsApplied,
      finalAmount: quote.finalAmount,
      couponCode: quote.couponCode,
      razorpayOrderId: razorpayOrder.id,
      amount: quote.finalAmount,
      paymentStatus: "created",
      items: quoteToOrderItems(quote)
    });

    if (amountPaise === 0) {
      const order = await completeCheckoutOrder(razorpayOrder.id, `free_payment_${Date.now()}`);
      return NextResponse.json({
        requiresPayment: false,
        success: true,
        order,
        quote
      });
    }

    return NextResponse.json({
      requiresPayment: true,
      orderId: razorpayOrder.id,
      amount: amountPaise,
      currency: "INR",
      quote,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || "dev_razorpay_key"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create checkout order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
