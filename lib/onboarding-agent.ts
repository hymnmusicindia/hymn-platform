import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const ONBOARDING_GOAL_LIMIT = 140;
export const ONBOARDING_REGENERATION_LIMIT = 5;

export const onboardingGoalOptions = [
  { id: "release", label: "Distribute my music" },
  { id: "finish-release", label: "Finish a release" },
  { id: "buy-beat", label: "Find a beat" },
  { id: "sell-beats", label: "Sell my beats" },
  { id: "studio", label: "Book studio services" }
] as const;

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  why_it_matters: string;
  action_label: string;
  action_target: string;
  status: "not_started" | "in_progress" | "completed" | "skipped";
  priority: "high" | "medium" | "low";
};

export type OnboardingPlan = {
  welcome_message: string;
  summary: string;
  steps: OnboardingStep[];
  primary_cta: { label: string; action: string };
  fallback_message: string;
};

export type OnboardingAgentState = {
  version: 1;
  goal: string;
  goalId?: string;
  plan: OnboardingPlan;
  status: "active" | "completed" | "dismissed";
  generatedAt: string;
  regeneratedAt?: string;
};

type Capability = { id: string; label: string; description: string; target: string };

const capabilities: Capability[] = [
  { id: "start-release", label: "Start a music release", description: "Create a distribution draft and add release metadata, artwork and audio.", target: "/distribution/start" },
  { id: "manage-releases", label: "Manage releases", description: "Continue drafts, respond to corrections and follow release status.", target: "/dashboard/releases" },
  { id: "artist-profile", label: "Create an artist profile", description: "Save artist details for release metadata.", target: "/distribution/start" },
  { id: "browse-beats", label: "Browse and license beats", description: "Search the Beatstore and choose a licence.", target: "/beat-store" },
  { id: "beat-purchases", label: "Manage beat purchases", description: "Access purchased beats and licences.", target: "/dashboard?tab=purchases" },
  { id: "producer-workspace", label: "Open producer workspace", description: "Set up a producer storefront, upload beats and manage sales.", target: "/producer/dashboard" },
  { id: "studio-services", label: "Book studio services", description: "Choose available mixing, mastering and studio services.", target: "/services" },
  { id: "earnings", label: "Review earnings", description: "Review reported earnings and payout availability.", target: "/dashboard?tab=earnings" },
  { id: "support", label: "Get support", description: "Open and follow a support request.", target: "/dashboard?tab=support" }
];

const validTargets = new Set(capabilities.map((item) => item.target));
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function getOnboardingContext(userId: number) {
  const [user, releases, artistProfiles, purchases, producerProfile, studioOrders] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, role: true, onboardingPurpose: true, onboardingUserType: true, onboardingPreferences: true, createdAt: true } }),
    prisma.release.findMany({ where: { userId, archivedAt: null }, select: { id: true, title: true, status: true, draftCompletionPercent: true }, orderBy: { updatedAt: "desc" }, take: 20 }),
    prisma.artistCard.count({ where: { userId, archivedAt: null } }),
    prisma.beatPurchase.count({ where: { userId, hasAccess: true } }),
    prisma.producerProfile.findUnique({ where: { userId }, select: { active: true } }),
    prisma.studioServiceOrder.count({ where: { customerId: userId } })
  ]);
  const preferences = record(user.onboardingPreferences);
  const state = record(preferences.onboardingAgent) as Partial<OnboardingAgentState>;
  const draft = releases.find((item) => item.status === "DRAFT");
  const correction = releases.find((item) => ["CHANGES_REQUESTED", "REJECTED"].includes(item.status));
  const experience = releases.length > 0 || purchases > 0 || producerProfile ? "returning" : "new";
  return {
    user,
    preferences,
    savedState: state.version === 1 ? state as OnboardingAgentState : null,
    context: {
      first_name: user.name.trim().split(/\s+/)[0] || "there",
      account_role: user.role.toLowerCase(),
      experience_level: experience,
      known_onboarding_purpose: user.onboardingPurpose,
      known_user_type: user.onboardingUserType,
      known_primary_intent: typeof preferences.primaryIntent === "string" ? preferences.primaryIntent : null,
      account_age_days: Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000))
    },
    currentState: {
      release_count: releases.length,
      has_draft_release: Boolean(draft),
      draft_release_id: draft?.id ?? null,
      draft_completion_percent: draft?.draftCompletionPercent ?? null,
      has_release_corrections: Boolean(correction),
      correction_release_id: correction?.id ?? null,
      artist_profile_count: artistProfiles,
      purchased_beat_count: purchases,
      has_producer_profile: Boolean(producerProfile),
      producer_profile_active: producerProfile?.active ?? false,
      studio_order_count: studioOrders
    }
  };
}

export function inferKnownGoalId(data: Awaited<ReturnType<typeof getOnboardingContext>>) {
  const value = [data.context.known_primary_intent, data.context.known_onboarding_purpose, data.context.known_user_type].filter(Boolean).join(" ").toLowerCase();
  if (/producer|sell.*beat|storefront/.test(value)) return "sell-beats";
  if (/buy.*beat|find.*beat|beat.*licen/.test(value)) return "buy-beat";
  if (/studio|mix|master/.test(value)) return "studio";
  if (/release|distribut|artist/.test(value)) return data.currentState.has_draft_release ? "finish-release" : "release";
  return undefined;
}

function fallbackPlan(goal: string, goalId: string | undefined, data: Awaited<ReturnType<typeof getOnboardingContext>>): OnboardingPlan {
  const firstName = data.context.first_name;
  const step = (id: string, title: string, description: string, why: string, label: string, target: string, priority: OnboardingStep["priority"] = "high"): OnboardingStep => ({ id, title, description, why_it_matters: why, action_label: label, action_target: target, status: "not_started", priority });
  let steps: OnboardingStep[];
  if (data.currentState.has_release_corrections) {
    steps = [step("review-corrections", "Review requested changes", "Open the release that needs your attention and resolve each note.", "Clearing corrections is the fastest route back to review.", "Review corrections", `/dashboard/releases`), step("resubmit-release", "Resubmit when ready", "Check every requested change before sending the release back.", "A complete correction avoids another review cycle.", "Open release", "/dashboard/releases", "medium"), step("check-release-status", "Follow the release status", "Return to your releases after resubmitting.", "You will see the next update in one place.", "View releases", "/dashboard/releases", "low")];
  } else if (goalId === "finish-release" && data.currentState.has_draft_release) {
    steps = [step("continue-draft", "Continue your draft", "Resume the release you already started.", "Your saved work is ready to finish.", "Continue release", `/distribution/start?draft=${data.currentState.draft_release_id}`), step("review-release", "Review and submit", "Check the release details and submit when everything is ready.", "A complete submission can move into review.", "Open draft", `/distribution/start?draft=${data.currentState.draft_release_id}`, "medium"), step("track-release", "Track the review", "Follow status updates from your release dashboard.", "You can respond quickly if HYMN needs a correction.", "View releases", "/dashboard/releases", "low")];
  } else if (goalId === "buy-beat") {
    steps = [step("browse-beats", "Find your sound", "Browse available beats and preview the catalogue.", "A suitable beat gives your next track a clear starting point.", "Browse beats", "/beat-store"), step("choose-licence", "Choose how you will use it", "Review the available licence choices on the beat.", "The right licence matches the release you plan to make.", "Open Beatstore", "/beat-store", "medium"), step("open-purchases", "Keep your licence handy", "Your completed purchases and licence access appear in the dashboard.", "It keeps the files for your release together.", "View purchases", "/dashboard?tab=purchases", "low")];
  } else if (goalId === "sell-beats") {
    steps = [step("producer-setup", data.currentState.has_producer_profile ? "Open your producer workspace" : "Set up your producer workspace", "Add your storefront details and prepare your catalogue.", "Artists need a complete storefront before they can discover your work.", "Open producer workspace", "/producer/dashboard"), step("upload-beat", "Add your first beat", "Upload a beat, artwork and licence prices from the producer workspace.", "A listed beat is your first opportunity to make a sale.", "Upload a beat", "/producer/dashboard", "medium"), step("check-storefront", "Check your storefront", "Review your catalogue from the producer workspace.", "A clear listing helps artists understand the beat.", "View producer workspace", "/producer/dashboard", "low")];
  } else if (goalId === "studio") {
    steps = [step("choose-service", "Choose the service you need", "Review the studio services currently available.", "Starting with the right service keeps the order focused.", "Explore services", "/services"), step("prepare-files", "Prepare your project files", "Use the service requirements to gather the right files.", "Complete source files help the order move forward.", "Review services", "/services", "medium"), step("track-service", "Track your order", "Return to your studio dashboard after placing an order.", "You can follow progress and respond to updates.", "Track studio order", "/dashboard/studio", "low")];
  } else {
    steps = [step("artist-details", data.currentState.artist_profile_count ? "Start your release" : "Prepare your artist details", data.currentState.artist_profile_count ? "Create a release draft with your music and artwork." : "Start a release and save the artist details you will reuse.", "Accurate artist information keeps your release setup moving.", "Start release", "/distribution/start"), step("add-release", "Add music and artwork", "Complete the release metadata, audio and cover artwork.", "These are required before HYMN can review the release.", "Continue setup", "/distribution/start", "medium"), step("follow-progress", "Follow its progress", "Use your release dashboard for review updates and corrections.", "You can act quickly when the release status changes.", "View releases", "/dashboard/releases", "low")];
  }
  return { welcome_message: `Let’s get you moving, ${firstName}.`, summary: `Here is the quickest path for “${goal}”.`, steps: steps.slice(0, 5), primary_cta: { label: steps[0].action_label, action: steps[0].action_target }, fallback_message: "This path uses the HYMN features available to your account." };
}

const FIXED_PROMPT = `You are an onboarding agent inside a digital product.

Create a personalized path that gets the user to their first meaningful outcome as fast as possible.

Use only the provided context, features, routes, and user state.

Do not invent features, pages, integrations, pricing, claims, or actions.

Return only valid JSON.

Context: {{AUTO_CONTEXT}}

User goal: {{USER_GOAL}}

Available capabilities: {{AVAILABLE_PRODUCT_CAPABILITIES}}

Current user state: {{CURRENT_USER_STATE}}

Return this JSON:
{
  "welcome_message": "Short personalized welcome",
  "summary": "One sentence explaining the path",
  "steps": [{
    "title": "Step title",
    "description": "Short explanation",
    "why_it_matters": "Why this helps",
    "action_label": "Button label",
    "action_target": "Existing route, feature, section, or action",
    "status": "not_started | in_progress | completed",
    "priority": "high | medium | low"
  }],
  "primary_cta": { "label": "CTA label", "action": "CTA action" },
  "fallback_message": "Message if there is not enough context"
}

Rules:
- 3 to 5 steps maximum. Prioritize the fastest path to value.
- Plain language. Do not mention AI. Do not sound like documentation.
- Only recommend features that exist.
- If context is limited, build a useful default path from existing routes and features.`;

function cleanText(value: unknown, max: number) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function validatePlan(value: unknown): OnboardingPlan | null {
  const root = record(value); const rawSteps = Array.isArray(root.steps) ? root.steps : [];
  if (rawSteps.length < 2 || rawSteps.length > 5) return null;
  const steps: OnboardingStep[] = [];
  for (let index = 0; index < rawSteps.length; index++) {
    const item = record(rawSteps[index]); const target = cleanText(item.action_target, 240);
    const normalizedTarget = target.replace(/\?draft=\d+$/, "");
    if (!validTargets.has(target) && normalizedTarget !== "/distribution/start") return null;
    const title = cleanText(item.title, 80); const label = cleanText(item.action_label, 40);
    if (!title || !label) return null;
    steps.push({ id: `step-${index + 1}`, title, description: cleanText(item.description, 180), why_it_matters: cleanText(item.why_it_matters, 180), action_label: label, action_target: target, status: "not_started", priority: ["high", "medium", "low"].includes(String(item.priority)) ? item.priority as OnboardingStep["priority"] : "medium" });
  }
  const primary = record(root.primary_cta); const action = cleanText(primary.action, 240);
  return { welcome_message: cleanText(root.welcome_message, 120), summary: cleanText(root.summary, 200), steps, primary_cta: { label: cleanText(primary.label, 40) || steps[0].action_label, action: validTargets.has(action) ? action : steps[0].action_target }, fallback_message: cleanText(root.fallback_message, 200) };
}

export async function generateOnboardingPlan(goal: string, goalId: string | undefined, data: Awaited<ReturnType<typeof getOnboardingContext>>) {
  const fallback = fallbackPlan(goal, goalId, data);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { plan: fallback, source: "fallback" as const };
  const prompt = FIXED_PROMPT
    .replace("{{AUTO_CONTEXT}}", JSON.stringify(data.context))
    .replace("{{USER_GOAL}}", JSON.stringify(goal))
    .replace("{{AVAILABLE_PRODUCT_CAPABILITIES}}", JSON.stringify(capabilities))
    .replace("{{CURRENT_USER_STATE}}", JSON.stringify(data.currentState));
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.ONBOARDING_AGENT_MODEL || "gpt-5-mini", input: prompt, text: { format: { type: "json_object" } } }), signal: AbortSignal.timeout(20_000) });
    if (!response.ok) return { plan: fallback, source: "fallback" as const };
    const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const output = result.output_text || result.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
    const plan = output ? validatePlan(JSON.parse(output)) : null;
    return { plan: plan || fallback, source: plan ? "generated" as const : "fallback" as const };
  } catch { return { plan: fallback, source: "fallback" as const }; }
}

export async function saveOnboardingAgentState(userId: number, state: OnboardingAgentState | null) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { onboardingPreferences: true } });
  const preferences = record(user.onboardingPreferences);
  if (state) preferences.onboardingAgent = state; else delete preferences.onboardingAgent;
  await prisma.user.update({ where: { id: userId }, data: { onboardingPreferences: preferences as Prisma.InputJsonValue } });
}

export function goalLabel(goalId: string | undefined, customGoal: string | undefined) {
  const preset = onboardingGoalOptions.find((item) => item.id === goalId);
  return (preset?.label || customGoal || "").trim().slice(0, ONBOARDING_GOAL_LIMIT);
}
