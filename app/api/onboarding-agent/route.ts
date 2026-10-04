import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { consumeRateLimit } from "@/lib/rate-limit";
import { generateOnboardingPlan, getOnboardingContext, goalLabel, inferKnownGoalId, ONBOARDING_GOAL_LIMIT, onboardingGoalOptions, saveOnboardingAgentState, type OnboardingAgentState } from "@/lib/onboarding-agent";

export async function GET() {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const data = await getOnboardingContext(auth.user.id);
  return NextResponse.json({ state: data.savedState, goalOptions: onboardingGoalOptions, goalLimit: ONBOARDING_GOAL_LIMIT, knownGoalId: inferKnownGoalId(data), detected: { experienceLevel: data.context.experience_level, hasDraft: data.currentState.has_draft_release, hasCorrections: data.currentState.has_release_corrections } });
}

export async function POST(request: Request) {
  const auth = await requireUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "generate";
  const data = await getOnboardingContext(auth.user.id);
  if (action === "reset") { await saveOnboardingAgentState(auth.user.id, null); return NextResponse.json({ state: null }); }
  const current = data.savedState;
  if (action === "dismiss" && current) { const state = { ...current, status: "dismissed" as const }; await saveOnboardingAgentState(auth.user.id, state); return NextResponse.json({ state }); }
  if (action === "step" && current) {
    const stepId = String(body.stepId || ""); const status = body.status === "completed" ? "completed" : body.status === "skipped" ? "skipped" : null;
    if (!status || !current.plan.steps.some((step) => step.id === stepId)) return NextResponse.json({ error: "Invalid onboarding step." }, { status: 400 });
    const steps = current.plan.steps.map((step) => step.id === stepId ? { ...step, status: status as "completed" | "skipped" } : step);
    const complete = steps.every((step) => step.status === "completed" || step.status === "skipped");
    const state: OnboardingAgentState = { ...current, status: complete ? "completed" : "active", plan: { ...current.plan, steps } };
    await saveOnboardingAgentState(auth.user.id, state); return NextResponse.json({ state });
  }
  if (action !== "generate" && action !== "regenerate") return NextResponse.json({ error: "Invalid onboarding action." }, { status: 400 });
  const limit = await consumeRateLimit({ scope: "onboarding-agent-generate", identity: String(auth.user.id), limit: 5, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: `You can create another path in ${Math.ceil(limit.retryAfterSeconds / 60)} minutes.` }, { status: 429 });
  const goalId = typeof body.goalId === "string" ? body.goalId : undefined;
  const customGoal = typeof body.customGoal === "string" ? body.customGoal : undefined;
  const goal = goalLabel(goalId, customGoal);
  if (!goal || goal.length > ONBOARDING_GOAL_LIMIT) return NextResponse.json({ error: `Enter a goal under ${ONBOARDING_GOAL_LIMIT} characters.` }, { status: 400 });
  const generated = await generateOnboardingPlan(goal, goalId, data);
  const now = new Date().toISOString();
  const state: OnboardingAgentState = { version: 1, goal, goalId, plan: generated.plan, status: "active", generatedAt: current?.generatedAt || now, ...(action === "regenerate" ? { regeneratedAt: now } : {}) };
  await saveOnboardingAgentState(auth.user.id, state);
  return NextResponse.json({ state, source: generated.source, remaining: limit.remaining });
}
