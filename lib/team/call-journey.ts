export const CALL_PHASES = { FIRST_CONVERSATION: "First conversation", FOLLOW_UP: "Follow-up conversation", CONSULTATION: "Specialist consultation", ASSISTANCE: "Ongoing assistance" } as const;
export function callJourney(context: unknown, state?: {callPhase?:string|null;callAttempts?:number;conversationCount?:number}) {
  const value = context && typeof context === "object" ? context as Record<string, unknown> : {};
  const phaseValue = state?.callPhase || value.callPhase;
  const phase = typeof phaseValue === "string" && phaseValue in CALL_PHASES ? phaseValue as keyof typeof CALL_PHASES : value.consultationId ? "CONSULTATION" : value.kind === "SUPPORT_CALLBACK" ? "ASSISTANCE" : Number(state?.conversationCount || value.conversationCount || 0) > 0 ? "FOLLOW_UP" : "FIRST_CONVERSATION";
  return { phase, label: CALL_PHASES[phase], attempts: Math.max(0, state?.callAttempts || 0, Number(value.callAttempts || value.attempts || 0)), conversations: Math.max(0, state?.conversationCount || 0, Number(value.conversationCount || 0)) };
}
