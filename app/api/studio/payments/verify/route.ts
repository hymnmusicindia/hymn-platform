import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/access";
import { confirmStudioPayment } from "@/lib/studio-services";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendStudioEmail } from "@/lib/studio-email";

const schema = z.object({ razorpay_order_id: z.string().min(1), razorpay_payment_id: z.string().min(1), razorpay_signature: z.string().min(1) });
export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const rate = await consumeRateLimit({ scope: "studio-payment-verify", identity: String(auth.user.id), limit: 20, windowSeconds: 900 });
  if (!rate.allowed) return NextResponse.json({ error: "Too many payment verification attempts." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  try { const body = schema.parse(await request.json()); const order = await confirmStudioPayment({ razorpayOrderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature, customerId: auth.user.id, source: "browser" }); await sendStudioEmail(order.publicId, "request", body.razorpay_payment_id).catch(()=>undefined); return NextResponse.json({ success: true, order }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Payment verification failed." }, { status: 400 }); }
}
