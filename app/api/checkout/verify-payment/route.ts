import { NextResponse } from "next/server";
import { getCheckoutOrderByRazorpayId } from "@/lib/db";
import { verifyRazorpaySignature, verifyCapturedRazorpayPayment } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { checkoutVerifySchema } from "@/lib/validation";
import { prisma } from "@/lib/prisma";
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

    await verifyCapturedRazorpayPayment({ orderId:payload.razorpay_order_id, paymentId:payload.razorpay_payment_id, amountMinor:Math.round(Number(existing.finalAmount)*100), currency:"INR" });

    const order = await confirmCheckoutPayment({ razorpayOrderId: payload.razorpay_order_id, paymentId: payload.razorpay_payment_id, userId: session.sub, source: "browser" });
    if (order?.paymentStatus !== "paid") throw new Error("Payment confirmation is still pending.");
    const purchases = await prisma.beatPurchase.findMany({ where:{userId:session.sub,paymentId:payload.razorpay_payment_id,hasAccess:true},select:{id:true} });
    const logs = await prisma.emailLog.findMany({where:{userId:session.sub,eventKey:{in:purchases.map(purchase=>`beat:${purchase.id}:beat_purchase_success:email`)}},select:{status:true}}).catch(()=>[]);
    const delivery = { email:session.email, status:purchases.length>0 && logs.length===purchases.length && logs.every(log=>log.status==="sent") ? "sent" : "pending" };
    return NextResponse.json({ success: true, order, delivery, reviewEligibility: { purchaseType: "beat", purchaseId: order.id, label: "Beat Store purchase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 6
// vercel trigger 7
// vercel trigger 9
