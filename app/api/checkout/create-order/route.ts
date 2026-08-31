import { NextResponse } from "next/server";
import { buildCheckoutQuote, quoteToOrderItems } from "@/lib/checkout";
import { createOrder, completeCheckoutOrder, createBeatPurchase, createNotification } from "@/lib/db";
import { razorpay } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { checkoutCreateOrderSchema } from "@/lib/validation";
import { generateBeatLicense } from "@/lib/beat-license";
import { prisma } from "@/lib/prisma";
import { emailAppUrl, sendBeatEmailEvent } from "@/lib/email/email-events";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = checkoutCreateOrderSchema.parse(await request.json());
    const quote = await buildCheckoutQuote(session.sub, payload);
    const amountPaise = Math.round(quote.finalAmount * 100);

    if (amountPaise > 0 && process.env.NODE_ENV === "production" && !razorpay) {
      return NextResponse.json({ error: "Payment service is not configured." }, { status: 503 });
    }

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
      if (order?.paymentStatus === "paid") {
        for (const item of order.items) {
          const purchase = await createBeatPurchase(order.userId, item.beatId, item.licenseType, order.razorpayPaymentId);
          const beat = purchase ? await prisma.beat.findUnique({ where: { id: item.beatId }, select: { title: true } }) : null;
          if (purchase && beat) await sendBeatEmailEvent({ event: "beat_purchase_success", to: session.email, userId: session.sub, purchaseId: purchase.id, userName: session.name, beatTitle: beat.title, url: emailAppUrl("/dashboard?module=purchases") });
          if (purchase && !purchase.licenseUrl) await generateBeatLicense(purchase.id, order.userId).catch((error) => console.error("Beat license generation failed:", error));
        }
        await createNotification({
          userId: order.userId,
          title: "Beat purchase successful",
          body: "Your beat purchase was successful. Check your dashboard for downloads and license details.",
          type: "beat",
          href: "/dashboard?tab=purchases",
          actionLabel: "Open dashboard",
          eventKey: `payment:${order.razorpayOrderId}:success`,
          metadata: { orderId: order.id, razorpayOrderId: order.razorpayOrderId }
        });
      }
      return NextResponse.json({
        requiresPayment: false,
        success: true,
        order,
        quote,
        reviewEligibility: order?.paymentStatus === "paid" ? { purchaseType: "beat", purchaseId: order.id, label: "Beat Store purchase" } : null
      });
    }

    return NextResponse.json({
      requiresPayment: true,
      orderId: razorpayOrder.id,
      amount: amountPaise,
      currency: "INR",
      quote,
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID || (process.env.NODE_ENV !== "production" ? "dev_razorpay_key" : "")
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create checkout order.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 5
// vercel trigger 6
