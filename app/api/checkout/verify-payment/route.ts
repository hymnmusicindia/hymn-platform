import { NextResponse } from "next/server";
import { getCheckoutOrderByRazorpayId } from "@/lib/db";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { checkoutVerifySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
import { emailAppUrl, sendBeatEmailEvent } from "@/lib/email/email-events";
import { confirmCheckoutPayment } from "@/lib/payment-webhooks";
import { consumeRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const rate = await consumeRateLimit({ scope: "checkout-payment-verify", identity: String(session.sub), limit: 20, windowSeconds: 15 * 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many payment verification attempts." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

  try {
    const payload = checkoutVerifySchema.parse(await request.json());
    const valid = verifyRazorpaySignature(payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature);
    if (!valid) return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });

    const existing = await getCheckoutOrderByRazorpayId(payload.razorpay_order_id);
    if (!existing || existing.userId !== session.sub) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const order = await confirmCheckoutPayment({ razorpayOrderId: payload.razorpay_order_id, paymentId: payload.razorpay_payment_id, userId: session.sub, source: "browser" });
    if (order?.paymentStatus === "paid") {
      for (const item of order.items) {
        const purchase = await prisma.beatPurchase.findFirst({ where: { userId: order.userId, beatId: item.beatId, licenseType: item.licenseType, paymentId: payload.razorpay_payment_id } });
        const beat = purchase ? await prisma.beat.findUnique({ where: { id: item.beatId }, select: { title: true } }) : null;
        if (purchase && beat) await sendBeatEmailEvent({ event: "beat_purchase_success", to: session.email, userId: session.sub, purchaseId: purchase.id, userName: session.name, beatTitle: beat.title, url: emailAppUrl("/dashboard?module=purchases") });
      }
    }
    return NextResponse.json({ success: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 6
// vercel trigger 7
// vercel trigger 9
