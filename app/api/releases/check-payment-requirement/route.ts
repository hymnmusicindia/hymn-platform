import { NextResponse } from "next/server";
import { getSubscriptionByUserId } from "@/lib/db";
import { requireUser } from "@/lib/access";
import { subscriptionHasEntitlement, subscriptionHasReleaseAllowance } from "@/lib/subscription-billing";

export const runtime = "nodejs";

/**
 * Endpoint to check if a user can submit a release without payment
 * GET /api/releases/check-payment-requirement?userId=123&plan=yearly
 */
export async function GET(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get("userId") ? Number(searchParams.get("userId")) : result.user.id;
    const userId = result.user.role === "admin" ? requestedUserId : result.user.id;
    const plan = searchParams.get("plan");

    if (!Number.isInteger(userId) || userId <= 0 || !plan) {
      return NextResponse.json(
        { error: "Missing valid user or plan parameter" },
        { status: 400 }
      );
    }

    // One-time plans always require payment
    if (plan === "one_time") {
      return NextResponse.json({
        requiresPayment: true,
        canSubmitWithoutPayment: false,
        reason: "One-time release plan requires payment per submission"
      });
    }

    // Check subscription for recurring plans
    const subscription = await getSubscriptionByUserId(userId);

    if (!subscription) {
      return NextResponse.json({
        requiresPayment: true,
        canSubmitWithoutPayment: false,
        reason: "No active subscription found. Please purchase a plan."
      });
    }

    if (!subscriptionHasEntitlement(subscription)) {
      return NextResponse.json({
        requiresPayment: true,
        canSubmitWithoutPayment: false,
        reason: `Subscription is ${subscription.status}. Please renew your subscription.`
      });
    }

    if (!subscriptionHasReleaseAllowance(subscription)) {
      return NextResponse.json({
        requiresPayment: true,
        canSubmitWithoutPayment: false,
        reason: "Your subscription release allowance has been used."
      });
    }

    return NextResponse.json({
      requiresPayment: false,
      canSubmitWithoutPayment: true,
      plan: subscription.plan,
      daysRemaining: subscription.daysRemaining,
      artistLimit: subscription.artistLimit,
      reason: `Active subscription found. You can submit releases until ${new Date(subscription.expiryDate).toLocaleDateString()}`
    });
  } catch (error) {
    console.error("Payment requirement check error:", error);
    return NextResponse.json(
      { error: "Failed to check payment requirement" },
      { status: 500 }
    );
  }
}

// trigger vercel deploy

// vercel trigger
