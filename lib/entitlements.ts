import { countArtistProfilesByUser, getSubscriptionByUserId } from "@/lib/db";
import { listPaidDistributionPlansByUser } from "@/lib/distribution-db";
import { artistProfileLimitForPlan } from "@/lib/artist-profile-limits";

export type UserEntitlements = {
  plan: string | null;
  artistProfileLimit: number;
  artistProfilesUsed: number;
  canCreateArtistProfile: boolean;
  customLabelAllowed: boolean;
  releaseAccess: boolean;
  priorityReview: boolean;
  producerAccess: boolean;
  payoutAccess: boolean;
};

export async function getUserEntitlements(userId: number): Promise<UserEntitlements> {
  const [subscription, paidPlans, artistProfilesUsed] = await Promise.all([
    getSubscriptionByUserId(userId),
    listPaidDistributionPlansByUser(userId),
    countArtistProfilesByUser(userId)
  ]);
  const activePlan = subscription?.status === "active" && Number(subscription.daysRemaining) > 0 ? subscription.plan : null;
  const plans = [activePlan, ...paidPlans].filter((plan): plan is string => Boolean(plan));
  const artistProfileLimit = Math.max(artistProfileLimitForPlan("basic"), ...plans.map(artistProfileLimitForPlan));
  const customLabelAllowed = plans.some((plan) => ["yearly_plus", "elite"].includes(plan));
  const priorityReview = plans.some((plan) => ["yearly", "yearly_plus", "pro", "elite"].includes(plan));
  return {
    plan: activePlan ?? paidPlans[0] ?? null,
    artistProfileLimit,
    artistProfilesUsed,
    canCreateArtistProfile: artistProfilesUsed < artistProfileLimit,
    customLabelAllowed,
    releaseAccess: plans.length > 0,
    priorityReview,
    producerAccess: true,
    payoutAccess: true
  };
}
