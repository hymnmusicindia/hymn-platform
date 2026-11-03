import { NextResponse, after } from "next/server";
import { getSession } from "@/lib/session";
import { fetchAndSynchronizeSubscription, verifySubscriptionCheckoutSignature } from "@/lib/subscription-billing";
import { prisma } from '@/lib/prisma';
import { deliverSubscriptionReceipts } from '@/lib/email/subscription-receipts';

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const body = await request.json();
    const subscriptionId = String(body.razorpay_subscription_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");
    if (!subscriptionId || !paymentId || !signature) return NextResponse.json({ error: "Missing subscription authorization fields." }, { status: 400 });
    if (!verifySubscriptionCheckoutSignature(paymentId, subscriptionId, signature)) return NextResponse.json({ error: "Invalid Razorpay subscription signature." }, { status: 400 });
    const subscription = await fetchAndSynchronizeSubscription(session.sub, subscriptionId, paymentId);
    // Return checkout promptly; the durable outbox and scheduled repair remain the fallback.
    after(async () => {
      try {
        const receipt = await prisma.emailLog.findUnique({ where: { eventKey: `subscription-receipt:${paymentId}` } });
        if (receipt?.userId === session.sub && receipt.status === 'pending') await deliverSubscriptionReceipts(receipt.id);
      } catch { console.warn(JSON.stringify({ scope: 'subscription_receipt', status: 'background_delivery_deferred' })); }
    });
    return NextResponse.json({ success: true, active: subscription.status === "active", subscription });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Subscription authorization failed." }, { status: 400 });
  }
}
