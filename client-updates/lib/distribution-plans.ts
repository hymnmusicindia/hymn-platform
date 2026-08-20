import type { SubscriptionPlan } from "@/lib/types";

export type DistributionPlanOption = Extract<SubscriptionPlan, "pay_per_release" | "basic" | "pro">;

export const distributionPlanCards = [
  {
    key: "pay_per_release",
    title: "One-Time Review",
    price: 99,
    cadence: "Per release",
    tag: "Fast Start",
    description: "Perfect for one release. Includes QC, artwork check, and distributor handoff.",
    cta: "Pay once",
    featureList: [
      "Single release submission",
      "Metadata review",
      "Artwork and audio QC"
    ],
    featured: false
  },
  {
    key: "basic",
    title: "Half-Yearly",
    price: 700,
    cadence: "6 months",
    tag: "Subscription",
    description: "Built for artists who release often and want a clean, affordable subscription lane.",
    cta: "Choose half-yearly",
    featureList: [
      "Unlimited artist additions",
      "Distribution to all stores",
      "Metadata, artwork, and audio review",
      "Release tracking dashboard",
      "Standard support turnaround"
    ],
    featured: false
  },
  {
    key: "pro",
    title: "Yearly",
    price: 1600,
    cadence: "12 months",
    tag: "Best Value",
    description: "Made for active artists and labels who need the fullest feature set across the full year.",
    cta: "Choose yearly",
    featureList: [
      "Everything in Half-Yearly",
      "Unlimited artist additions",
      "Faster support response",
      "Release planning guidance",
      "Best value for frequent releases"
    ],
    featured: true
  }
] as const satisfies ReadonlyArray<{
  key: DistributionPlanOption;
  title: string;
  price: number;
  cadence: string;
  tag: string;
  description: string;
  cta: string;
  featureList: readonly string[];
  featured: boolean;
}>;

export function findDistributionPlan(plan: DistributionPlanOption) {
  return distributionPlanCards.find((entry) => entry.key === plan) ?? distributionPlanCards[0];
}
