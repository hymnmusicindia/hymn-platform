import { NextResponse } from "next/server";
import { createOrUpdateSubscription } from "@/lib/db";
import { listAllDistributionOrders, markDistributionOrderPaid } from "@/lib/distribution-db";
import { verifyRazorpaySignature } from "@/lib/razorpay";
import { getSession } from "@/lib/session";
import type { DistributionPlan } from "@/lib/types";

export const runtime = "nodejs";

const PLAN_CONFIGS: Record<DistributionPlan, { duration: number; artistLimit: number; features: string[] }> = {
  one_time: {
    duration: 15,
    artistLimit: 5,
    features: ["single_release", "5_artist_profiles"]
  },
  half_yearly: {
    duration: 180,
    artistLimit: 5,
    features: ["unlimited_releases", "5_artist_profiles", "distribution", "quality_check"]
  },
  yearly: {
    duration: 365,
    artistLimit: 7,
    features: ["unlimited_releases", "7_artist_profiles", "distribution", "quality_check", "priority_support"]
  },
  yearly_plus: {
    duration: 365,
    artistLimit: 15,
    features: ["unlimited_releases", "15_artist_profiles", "custom_label", "distribution", "quality_check", "priority_support"]
  }
};

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  try {
    const body = await request.json();
    const plan = String(body.plan || "") as DistributionPlan;
    const razorpayOrderId = String(body.razorpay_order_id || body.razorpayOrderId || "");
    const razorpayPaymentId = String(body.razorpay_payment_id || body.razorpayPaymentId || "");
    const razorpaySignature = String(body.razorpay_signature || body.razorpaySignature || "");

    if (!plan || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const validPayment = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!validPayment) return NextResponse.json({ error: "Invalid Razorpay signature." }, { status: 400 });

    const config = PLAN_CONFIGS[plan as DistributionPlan];
    if (!config || plan === "one_time") {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const existingOrder = (await listAllDistributionOrders()).find((order) => order.razorpayOrderId === razorpayOrderId);
    if (!existingOrder || existingOrder.userId !== session.sub || existingOrder.plan !== plan) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    await markDistributionOrderPaid(razorpayOrderId, razorpayPaymentId);

    const subscription = await createOrUpdateSubscription(
      session.sub,
      plan,
      config.duration,
      config.artistLimit,
      config.features
    );

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription?.id,
        plan: subscription?.plan,
        expiryDate: subscription?.expiryDate,
        artistLimit: subscription?.artistLimit,
        features: config.features
      }
    });
  } catch (error) {
    console.error("Subscription creation error:", error);
    return NextResponse.json({ error: "Failed to create subscription" }, { status: 500 });
  }
}

// trigger vercel deploy

// vercel trigger

// vercel trigger 2
