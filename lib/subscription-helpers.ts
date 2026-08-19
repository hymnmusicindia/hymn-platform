// Helper functions for subscription-based workflow

import { getSubscriptionByUserId } from "@/lib/db";
import { artistProfileLimitForPlan } from "@/lib/artist-profile-limits";
import { listPaidDistributionPlansByUser } from "@/lib/distribution-db";

export async function getSubscriptionStatus(userId: number) {
  const subscription = await getSubscriptionByUserId(userId);
  
  if (!subscription || subscription.plan === "one_time") {
    return {
      hasActiveSubscription: false,
      requiresPayment: true,
      plan: null,
      daysRemaining: 0
    };
  }

  const isActive = subscription.status === "active" && subscription.daysRemaining > 0;
  
  return {
    hasActiveSubscription: isActive,
    requiresPayment: !isActive,
    plan: subscription.plan,
    daysRemaining: subscription.daysRemaining,
    artistLimit: subscription.artistLimit,
    subscription
  };
}

export function shouldBypassPayment(userId: number, plan: string): boolean {
  // If selecting a subscription plan (half_yearly, yearly, yearly_plus)
  // and user already has an active subscription, they might be eligible for renewal
  // This should only apply if they're upgrading
  
  // If selecting one_time plan, always require payment
  if (plan === "one_time") {
    return false;
  }
  
  // This will be determined by subscription check
  return false; // Will be set dynamically
}

export function getReleaseSubmissionRequirements(plan: string, hasActiveSubscription: boolean) {
  return {
    requiresPayment: plan === "one_time" || !hasActiveSubscription,
    bypassesPayment: plan !== "one_time" && hasActiveSubscription,
    warningMessage: !hasActiveSubscription && plan !== "one_time" 
      ? "You need to purchase a subscription plan first" 
      : undefined
  };
}

/**
 * Check if user has hit their artist limit
 */
export async function checkArtistLimitReached(userId: number, newArtistCount: number): Promise<boolean> {
  const [subscription, paidPlans] = await Promise.all([getSubscriptionByUserId(userId), listPaidDistributionPlansByUser(userId)]);
  const subscriptionLimit = subscription?.status === "active" && subscription.daysRemaining > 0 ? artistProfileLimitForPlan(subscription.plan) : 0;
  const oneTimeLimit = paidPlans.some((plan) => ["one_time", "pay_per_release"].includes(plan)) ? 5 : 0;
  return newArtistCount > Math.max(subscriptionLimit, oneTimeLimit);
}

/**
 * Format plan display name for UI
 */
export function formatPlanName(plan: string): string {
  const names: Record<string, string> = {
    one_time: "One-Time Release",
    half_yearly: "Half-Yearly Plan",
    yearly: "Yearly Plan",
    yearly_plus: "Yearly+ Plan",
    basic: "Half-Yearly",
    pro: "Yearly",
    elite: "Yearly+",
    pay_per_release: "One-Time"
  };
  
  return names[plan] || plan.replace(/_/g, " ").toUpperCase();
}

/**
 * Get features available in a plan
 */
export function getPlanFeatures(plan: string): string[] {
  const features: Record<string, string[]> = {
    one_time: ["Single release", "Basic QC", "5 artist profiles"],
    half_yearly: ["Unlimited releases", "5 artist profiles", "Distribution to all stores"],
    yearly: ["Unlimited releases", "7 artist profiles", "Distribution to all stores", "Priority support"],
    yearly_plus: ["Unlimited releases", "15 artist profiles", "Custom label", "Distribution", "Priority support"]
  };
  
  return features[plan] || [];
}

// trigger vercel deploy

// vercel trigger 2
