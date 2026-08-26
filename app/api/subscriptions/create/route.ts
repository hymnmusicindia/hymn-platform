import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchAndSynchronizeSubscription, verifySubscriptionCheckoutSignature } from "@/lib/subscription-billing";

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
    const subscription = await fetchAndSynchronizeSubscription(session.sub, subscriptionId);
    return NextResponse.json({ success: true, active: subscription.status === "active", subscription });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Subscription authorization failed." }, { status: 400 });
  }
}
