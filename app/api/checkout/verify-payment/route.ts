import { NextResponse } from "next/server";
import { completeCheckoutOrder, createBeatPurchase, createNotification, getCheckoutOrderByRazorpayId } from "@/lib/db";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import { checkoutVerifySchema } from "@/lib/validation";
import { generateBeatLicense } from "@/lib/beat-license";
import { prisma } from "@/lib/prisma";
import { emailAppUrl, sendBeatEmailEvent } from "@/lib/email/email-events";

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
    if (order?.paymentStatus === "paid") {
      for (const item of order.items) {
        const purchase = await createBeatPurchase(order.userId, item.beatId, item.licenseType, payload.razorpay_payment_id);
        const beat = purchase ? await prisma.beat.findUnique({ where: { id: item.beatId }, select: { title: true } }) : null;
        if (purchase && beat) await sendBeatEmailEvent({ event: "beat_purchase_success", to: session.email, userId: session.sub, purchaseId: purchase.id, userName: session.name, beatTitle: beat.title, url: emailAppUrl("/dashboard?module=purchases") });
        if (purchase && !purchase.licenseUrl) await generateBeatLicense(purchase.id, order.userId).catch((error) => console.error("Beat license generation failed:", error));
      }
    }
    if (order?.paymentStatus === "paid" && existing.paymentStatus !== "paid") {
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
    return NextResponse.json({ success: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Payment verification failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// vercel trigger
// vercel trigger 6
