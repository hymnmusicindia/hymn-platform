/**
 * Database schema validation and utilities
 * Helps ensure subscription system is properly configured
 */

import type { Subscription, ArtistCard, BeatPurchase, DistributionQueueEntry, DistributionPlan } from "@/lib/types";

/**
 * Validate subscription data integrity
 */
export function validateSubscription(subscription: Partial<Subscription>): string[] {
  const errors: string[] = [];

  if (subscription.userId === undefined) errors.push("userId is required");
  if (!subscription.plan) errors.push("plan is required");
  if (!subscription.expiryDate) errors.push("expiryDate is required");

  // Validate plan
  const validPlans: DistributionPlan[] = ["one_time", "half_yearly", "yearly", "yearly_plus"];
  if (subscription.plan && !validPlans.includes(subscription.plan)) {
    errors.push(`Invalid plan: ${subscription.plan}`);
  }

  // Validate dates
  if (subscription.purchasedAt && new Date(subscription.purchasedAt) > new Date()) {
    errors.push("purchasedAt cannot be in the future");
  }

  if (subscription.expiryDate && new Date(subscription.expiryDate) <= new Date()) {
    // This is okay for expired subscriptions, but log it
    console.warn("Subscription is already expired");
  }

  // Validate artist limits
  const PLAN_LIMITS: Record<DistributionPlan, number> = {
    one_time: 0,
    half_yearly: 5,
    yearly: 7,
    yearly_plus: 15
  };

  if (subscription.artistLimit !== undefined && subscription.plan) {
    const expectedLimit = PLAN_LIMITS[subscription.plan];
    if (subscription.artistLimit !== expectedLimit) {
      console.warn(
        `Artist limit mismatch for plan ${subscription.plan}: expected ${expectedLimit}, got ${subscription.artistLimit}`
      );
    }
  }

  return errors;
}

/**
 * Validate artist card data
 */
export function validateArtistCard(card: Partial<ArtistCard>): string[] {
  const errors: string[] = [];

  if (card.userId === undefined) errors.push("userId is required");
  if (!card.artistName) errors.push("artistName is required");

  // Validate URLs if provided
  if (card.spotifyProfileUrl && !isValidUrl(card.spotifyProfileUrl)) {
    errors.push("Invalid spotifyProfileUrl");
  }

  if (card.appleMusicProfileUrl && !isValidUrl(card.appleMusicProfileUrl)) {
    errors.push("Invalid appleMusicProfileUrl");
  }

  return errors;
}

/**
 * Validate beat purchase data
 */
export function validateBeatPurchase(purchase: Partial<BeatPurchase>): string[] {
  const errors: string[] = [];

  if (purchase.userId === undefined) errors.push("userId is required");
  if (purchase.beatId === undefined) errors.push("beatId is required");
  if (!purchase.licenseType) errors.push("licenseType is required");

  const validLicenses = ["mp3", "wav", "stems", "exclusive", "general", "basic", "premium"];
  if (purchase.licenseType && !validLicenses.includes(purchase.licenseType)) {
    errors.push(`Invalid licenseType: ${purchase.licenseType}`);
  }

  if (purchase.licenseUrl && !isValidUrl(purchase.licenseUrl)) {
    errors.push("Invalid licenseUrl");
  }

  return errors;
}

/**
 * Validate distribution queue entry
 */
export function validateQueueEntry(entry: Partial<DistributionQueueEntry>): string[] {
  const errors: string[] = [];

  if (entry.releaseId === undefined) errors.push("releaseId is required");

  const validStages = [
    "draft_submitted",
    "quality_check",
    "awaiting_approval",
    "approved",
    "sent_to_direnote",
    "processing",
    "delivered",
    "completed",
    "rejected"
  ];

  if (entry.currentStage && !validStages.includes(entry.currentStage)) {
    errors.push(`Invalid stage: ${entry.currentStage}`);
  }

  return errors;
}

/**
 * Check if subscription is still valid
 */
export function isSubscriptionActive(subscription: Subscription): boolean {
  if (subscription.plan === "one_time") return false;
  if (subscription.status !== "active") return false;

  const now = new Date();
  const expiryDate = new Date(subscription.expiryDate);

  return expiryDate > now;
}

/**
 * Calculate remaining days in subscription
 */
export function calculateRemainingDays(expiryDate: Date | string): number {
  const expiry = typeof expiryDate === "string" ? new Date(expiryDate) : expiryDate;
  const now = new Date();
  const diffTime = expiry.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

/**
 * Get subscription renewal date
 */
export function getSubscriptionRenewalDate(purchasedAt: Date | string, plan: DistributionPlan): Date {
  const purchased = typeof purchasedAt === "string" ? new Date(purchasedAt) : purchasedAt;
  const renewalDate = new Date(purchased);

  const DURATIONS: Record<DistributionPlan, number> = {
    one_time: 0,
    half_yearly: 180,
    yearly: 365,
    yearly_plus: 365
  };

  renewalDate.setDate(renewalDate.getDate() + DURATIONS[plan]);
  return renewalDate;
}

/**
 * Helper: validate URL format
 */
function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate subscription summary for display
 */
export function getSubscriptionSummary(subscription: Subscription): string {
  const daysLeft = subscription.daysRemaining;
  const planName = subscription.planName || subscription.plan.replace(/_/g, " ").toUpperCase();

  if (subscription.status !== "active" || daysLeft <= 0) {
    return `${planName} (Expired)`;
  }

  if (daysLeft === 1) {
    return `${planName} (expires tomorrow)`;
  }

  if (daysLeft <= 7) {
    return `${planName} (${daysLeft} days left)`;
  }

  if (daysLeft <= 30) {
    return `${planName} (${Math.ceil(daysLeft / 7)} weeks left)`;
  }

  return `${planName} (Active)`;
}

/**
 * Check if user can create another release based on subscription
 */
export function canCreateRelease(subscription: Subscription | null, plan: string): boolean {
  // One-time always requires payment verification
  if (plan === "one_time" || plan === "one_time") {
    return true; // Let payment flow handle it
  }

  // No subscription = cannot create
  if (!subscription) return false;

  // Subscription must be active
  if (!isSubscriptionActive(subscription)) return false;

  return true;
}

/**
 * Get plan features as display strings
 */
export function getPlanFeaturesList(plan: DistributionPlan): string[] {
  const features: Record<DistributionPlan, string[]> = {
    one_time: [
      "Single release",
      "Basic quality check",
      "Standard delivery"
    ],
    half_yearly: [
      "Unlimited releases",
      "Up to 5 artist profiles",
      "Distribution to 100+ stores",
      "Quality check included",
      "Email support"
    ],
    yearly: [
      "Unlimited releases",
      "Up to 7 artist profiles",
      "Distribution to 100+ stores",
      "Priority quality check",
      "Priority email support",
      "Advanced analytics"
    ],
    yearly_plus: [
      "Unlimited releases",
      "Up to 15 artist profiles",
      "Custom label/imprint",
      "Distribution to 100+ stores",
      "Priority quality check",
      "24/7 priority support",
      "Advanced analytics",
      "White-label options"
    ]
  };

  return features[plan];
}

// trigger vercel deploy
