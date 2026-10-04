import { NextResponse } from "next/server";
import { getSubscriptionByUserId } from "@/lib/db";
import { consumeRateLimit, requestIdentity } from "@/lib/rate-limit";
import { getSession } from "@/lib/session";
import type { SmartHelpContext } from "@/lib/smart-help-context";

type SmartTip = { title: string; tooltip: string; expanded_help: string; suggested_action: string; confidence: "high" | "medium" | "low" };

const FIXED_PROMPT = `You are a contextual help layer inside a digital product.

Replace generic tutorials and static tooltips with short, screen-aware guidance.

You receive a JSON context object. Use only what is provided. Do not ask for missing info. If something is unknown, make the safest useful assumption.

Generate help for the exact element or state the user is focused on.

Return only valid JSON:
{ "title": "Short title", "tooltip": "Under 20 words", "expanded_help": "Under 40 words", "suggested_action": "One short next action", "confidence": "high | medium | low" }

Rules:
- Be specific to the current screen and situation.
- Do not sound like documentation. Do not mention AI.
- Match the user’s level: plain language for beginners, direct and efficient for advanced.
- If the user made an error, explain the fix. If they are hesitating, reduce friction.

Context: {{AUTO_USER_CONTEXT}}`;

const text = (value: unknown, limit: number) => typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
const nullable = (value: unknown, limit: number) => text(value, limit) || null;
const words = (value: unknown, limit: number) => text(value, 500).split(/\s+/).filter(Boolean).slice(0, limit).join(" ");

function cleanContext(value: unknown): SmartHelpContext {
  const root = value && typeof value === "object" ? value as Record<string, any> : {};
  const page = root.page && typeof root.page === "object" ? root.page : {};
  const element = root.element && typeof root.element === "object" ? root.element : {};
  const user = root.user && typeof root.user === "object" ? root.user : {};
  const triggers = new Set(["hover", "click", "error", "inactivity", "repeated_failed_attempt", "time_on_screen"]);
  return {
    page: { productName: "HYMN Music", route: text(page.route, 300) || "/", pageTitle: text(page.pageTitle, 120) || "HYMN Music", sectionName: nullable(page.sectionName, 100) },
    element: {
      label: text(element.label, 100) || "This item", type: text(element.type, 80) || "element", nearbyText: nullable(element.nearbyText, 260), placeholder: nullable(element.placeholder, 120),
      buttonText: nullable(element.buttonText, 100), currentValue: nullable(element.currentValue, 100), validationState: ["valid", "invalid", "unknown"].includes(element.validationState) ? element.validationState : "unknown",
      errorText: nullable(element.errorText, 180), emptyStateText: nullable(element.emptyStateText, 180)
    },
    user: { role: nullable(user.role, 60), plan: nullable(user.plan, 80), deviceType: ["mobile", "tablet", "desktop"].includes(user.deviceType) ? user.deviceType : "desktop", recentActions: Array.isArray(user.recentActions) ? user.recentActions.slice(-5).map((item: unknown) => text(item, 100)).filter(Boolean) : [] },
    trigger: triggers.has(root.trigger) ? root.trigger : "hover"
  };
}

function fallback(context: SmartHelpContext): SmartTip {
  const invalid = context.element.validationState === "invalid" || Boolean(context.element.errorText);
  const label = context.element.label || "This item";
  return { title: invalid ? `Check ${label}` : label, tooltip: invalid ? "Review this value before you continue." : `Use this to work with ${label.toLowerCase()}.`, expanded_help: context.element.errorText || context.element.nearbyText || `This is part of ${context.page.sectionName || context.page.pageTitle}.`, suggested_action: invalid ? "Correct the value, then try again." : context.element.buttonText ? `Select ${context.element.buttonText}.` : "Review this item, then continue.", confidence: context.element.nearbyText ? "medium" : "low" };
}

function validate(value: unknown, fallbackTip: SmartTip): SmartTip {
  const item = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const title = text(item.title, 80); const tooltip = words(item.tooltip, 20); const expanded = words(item.expanded_help, 40); const action = words(item.suggested_action, 18);
  return { title: title || fallbackTip.title, tooltip: tooltip || fallbackTip.tooltip, expanded_help: expanded || fallbackTip.expanded_help, suggested_action: action || fallbackTip.suggested_action, confidence: ["high", "medium", "low"].includes(String(item.confidence)) ? item.confidence as SmartTip["confidence"] : fallbackTip.confidence };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const context = cleanContext(body.context);
  const session = await getSession();
  const rate = await consumeRateLimit({ scope: "smart-help", identity: session ? String(session.sub) : requestIdentity(request), limit: 40, windowSeconds: 60 });
  if (!rate.allowed) return NextResponse.json({ error: "Help is refreshing too quickly. Try again shortly." }, { status: 429 });

  if (session) {
    context.user.role = text(session.role, 60) || context.user.role;
    try { const subscription = await getSubscriptionByUserId(session.sub); context.user.plan = subscription?.planName || subscription?.plan || "No active plan"; } catch { /* Context remains useful without billing state. */ }
  }
  const fallbackTip = fallback(context);
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ tip: fallbackTip, source: "fallback" });

  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: process.env.SMART_HELP_MODEL || process.env.ONBOARDING_AGENT_MODEL || "gpt-5-mini", input: FIXED_PROMPT.replace("{{AUTO_USER_CONTEXT}}", JSON.stringify(context)), text: { format: { type: "json_object" } } }), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return NextResponse.json({ tip: fallbackTip, source: "fallback" });
    const result = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
    const output = result.output_text || result.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("");
    return NextResponse.json({ tip: output ? validate(JSON.parse(output), fallbackTip) : fallbackTip, source: output ? "generated" : "fallback" });
  } catch { return NextResponse.json({ tip: fallbackTip, source: "fallback" }); }
}
