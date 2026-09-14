import type { DistributionPlan } from "@/lib/types";

export type DistributionPlanOption = Extract<DistributionPlan, "one_time" | "half_yearly" | "yearly" | "yearly_plus">;

export const distributionPlanCards = [
  {
    key: "one_time",
    title: "Quick Release",
    price: 99,
    cadence: "Per single release",
    tag: "Fast Start",
    description: "Perfect for one release. Includes QC, artwork check, and distributor handoff.",
    cta: "Choose Quick Release",
    featureList: [
      "Single release submission",
      "5 artist profiles",
      "Metadata review",
      "Artwork and audio QC"
    ],
    featured: false,
    artistLimit: 5,
    label_editable: false
  },
  {
    key: "half_yearly",
    title: "6 Months",
    price: 699,
    cadence: "6 months",
    tag: "Subscription",
    description: "Built for artists who release often and want a clean, affordable subscription lane.",
    cta: "Choose 6 Months",
    featureList: [
      "5 artist profiles",
      "Distribution to all stores",
      "Metadata, artwork, and audio review",
      "Release tracking dashboard",
      "Standard support turnaround"
    ],
    featured: false,
    artistLimit: 5,
    label_editable: false
  },
  {
    key: "yearly",
    title: "Annual",
    price: 1099,
    cadence: "12 months",
    tag: "Most Popular",
    description: "Made for active artists and labels who need the fullest feature set across the full year.",
    cta: "Choose Annual",
    featureList: [
      "7 artist profiles",
      "Everything in Half-Yearly",
      "Faster support response",
      "Release planning guidance",
      "Save ₹299 versus two 6-month plans"
    ],
    featured: true,
    artistLimit: 7,
    label_editable: false
  },
  {
    key: "yearly_plus",
    title: "Yearly+ / Label",
    price: 1999,
    cadence: "12 months",
    tag: "Premium",
    description: "For serious producers and labels. Includes custom labels and the highest artist limits.",
    cta: "Choose Yearly+ / Label",
    featureList: [
      "15 artist profiles",
      "Custom Label Name",
      "Everything in Yearly",
      "Custom branding on releases",
      "Priority support",
      "Early access to new features"
    ],
    featured: false,
    artistLimit: 15,
    label_editable: true
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
  artistLimit: number;
  label_editable: boolean;
}>;

export function findDistributionPlan(plan: DistributionPlanOption) {
  return distributionPlanCards.find((entry) => entry.key === plan) ?? distributionPlanCards[0];
}

// trigger vercel deploy

// vercel trigger 2
