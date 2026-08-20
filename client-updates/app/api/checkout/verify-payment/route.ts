import { NextResponse } from "next/server";
import { completeCheckoutOrder, getCheckoutOrderByRazorpayId } from "@/lib/db";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { checkoutVerifySchema } from "@/lib/validation";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = checkoutVerifySchema.parse(await request.json());
    const valid = verifyRazorpaySignature(payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature);
    if (!valid) return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });

    const existing = await getCheckoutOrderByRazorpayId(payload.razorpay_order_id);
    if (!existing || existing.userId !== session.sub) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const order = await completeCheckoutOrder(payload.razorpay_order_id, payload.razorpay_payment_id);
    return NextResponse.json({ success: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
