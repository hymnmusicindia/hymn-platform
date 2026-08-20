import { NextResponse } from "next/server";
import { paymentVerifySchema } from "@/lib/validation";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { getCheckoutOrderByRazorpayId, markOrderPaid } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const payload = paymentVerifySchema.parse(await request.json());
    const valid = verifyRazorpaySignature(payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature);
    if (!valid) {
      return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });
    }

    const existing = await getCheckoutOrderByRazorpayId(payload.razorpay_order_id);
    if (!existing || existing.userId !== session.sub) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const order = await markOrderPaid(payload.razorpay_order_id, payload.razorpay_payment_id);
    return NextResponse.json({
      success: true,
      order,
      downloadsUnlocked: true,
      licensesGenerated: payload.items.map((item) => ({
        beatId: item.beatId,
        licenseType: item.licenseType,
        url: `/licenses/${payload.razorpay_order_id}-${item.beatId}-${item.licenseType}.pdf`
      }))
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

