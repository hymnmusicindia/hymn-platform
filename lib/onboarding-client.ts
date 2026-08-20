export const ONBOARDING_STORAGE_KEY = "hymn_onboarding_context_v2";
// Versioned independently from the discarded legacy popup so an old dismissal
// cannot suppress the rebuilt onboarding experience.
export const ONBOARDING_SEEN_KEY = "hymn_onboarding_v2_completed";

export const ONBOARDING_ROUTES = {
  singleRelease: "/distribution/start?onboarding=release",
  plans: "/distribution",
  beatStore: "/beat-store",
  producerAccess: "/producer-login",
  services: "/services",
  learn: "/faq",
  dashboard: "/dashboard"
} as const;

export type OnboardingContext = {
  name?: string; primaryIntent?: string; releaseStage?: string; releaseType?: string;
  releaseFrequency?: string; missingRequirement?: string; previouslyReleased?: boolean;
  beatMood?: string; beatGenre?: string; beatBudget?: string; producerStage?: string;
  producerNeeds?: string; promotionGoal?: string; releaseTiming?: string;
  explorationTopic?: string; personalGoal?: string; discoverySource?: string;
  preferredRoute?: string; recommendedPlan?: string; onboardingCompleted?: boolean;
};

export function saveOnboardingContext(context: OnboardingContext) {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(context));
}

export function beatStoreHref(context: OnboardingContext) {
  const params = new URLSearchParams();
  if (context.beatMood) params.set("mood", context.beatMood);
  if (context.beatGenre) params.set("genre", context.beatGenre);
  if (context.beatBudget === "under-500") params.set("budgetMax", "500");
  if (context.beatBudget === "500-1500") params.set("budgetMax", "1500");
  return `${ONBOARDING_ROUTES.beatStore}?${params.toString()}`;
}

// vercel trigger 12
