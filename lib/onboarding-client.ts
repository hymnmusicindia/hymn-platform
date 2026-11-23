export const ONBOARDING_STORAGE_KEY = "hymn_onboarding_context_v2";
// Versioned independently from the discarded legacy popup so an old dismissal
// cannot suppress the rebuilt onboarding experience.
export const ONBOARDING_SEEN_KEY = "hymn_onboarding_v2_completed";

export const ONBOARDING_ROUTES = {
  singleRelease: "/distribution/start?onboarding=release",
  plans: "/distribution",
  beatStore: "/beat-store",
  producerAccess: "/producer-onboarding",
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
  try { localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(context)); } catch { /* Storage is optional for browsing. */ }
}

export function markOnboardingSeen() {
  try { localStorage.setItem(ONBOARDING_SEEN_KEY, "true"); } catch { /* Optional preference. */ }
}

export function readOnboardingContext(): OnboardingContext {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const strings = new Set(['name','primaryIntent','releaseStage','releaseType','releaseFrequency','missingRequirement','beatMood','beatGenre','beatBudget','producerStage','producerNeeds','promotionGoal','releaseTiming','explorationTopic','personalGoal','discoverySource','preferredRoute','recommendedPlan']);
    return Object.fromEntries(Object.entries(value).filter(([key, item]) => strings.has(key) ? typeof item === 'string' && item.length <= 250 : ['previouslyReleased','onboardingCompleted'].includes(key) && typeof item === 'boolean'));
  } catch { return {}; }
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
