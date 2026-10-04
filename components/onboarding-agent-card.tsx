"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, AudioLines, CheckCircle2, Compass, Disc3, Headphones, LifeBuoy, LoaderCircle, MessageCircle, Mic2, RotateCcw, Sparkles, X } from "lucide-react";
import type { OnboardingAgentState } from "@/lib/onboarding-agent";

type Payload = { state: OnboardingAgentState | null; goalOptions: Array<{ id: string; label: string }>; goalLimit: number; knownGoalId?: string };

export function OnboardingAgentCard({ compact = false, forceGoalChoice = false, onVisibilityChange }: { compact?: boolean; forceGoalChoice?: boolean; onVisibilityChange?: (visible: boolean, autoOpen: boolean) => void } = {}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selectedGoal, setSelectedGoal] = useState("");
  const [selectedRole, setSelectedRole] = useState<"artist" | "producer" | "engineer" | "other" | "">("");
  const [customGoal, setCustomGoal] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (forceGoalChoice) { setSelectedRole(""); setSelectedGoal(""); } }, [forceGoalChoice]);

  async function load() {
    setError("");
    try { const response = await fetch("/api/onboarding-agent", { cache: "no-store" }); if (!response.ok) throw new Error("Your setup could not be loaded."); setPayload(await response.json()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your setup could not be loaded."); }
  }
  useEffect(() => { void load(); }, []);

  async function update(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/onboarding-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Your setup could not be updated.");
      setPayload((current) => current ? { ...current, state: result.state } : current);
      if (body.action === "reset") { setSelectedRole(""); setSelectedGoal(""); setCustomGoal(""); setEditingGoal(false); }
      return true;
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your setup could not be updated."); return false; }
    finally { setBusy(false); }
  }

  const state = payload?.state;
  const nextStep = useMemo(() => state?.plan.steps.find((step) => step.status === "not_started" || step.status === "in_progress"), [state]);
  useEffect(() => {
    if (!payload) return;
    const visible = !state || state.status === "active" || editingGoal;
    onVisibilityChange?.(visible, visible && !state);
  }, [editingGoal, onVisibilityChange, payload, state]);
  if (!payload && !error) return <section className="onboarding-agent onboarding-agent-loading" aria-live="polite"><LoaderCircle className="animate-spin" /><div><strong>Creating your setup…</strong><span>Checking your workspace and available next steps.</span></div></section>;
  if (!payload && error) return <section className="onboarding-agent onboarding-agent-error"><div><strong>We couldn’t load your setup.</strong><span>{error}</span></div><button type="button" className="btn-outline" onClick={() => void load()}>Retry</button></section>;
  if (!payload || ((state?.status === "completed" || state?.status === "dismissed") && !editingGoal)) return null;

  if (!state || editingGoal) {
    const isOther = selectedRole === "other"; const canSubmit = isOther ? customGoal.trim().length > 2 : Boolean(selectedGoal);
    const roleGoals = selectedRole === "artist" ? ["release", "finish-release", "buy-beat"] : selectedRole === "producer" ? ["sell-beats"] : selectedRole === "engineer" ? ["studio"] : [];
    const roles = [
      { id: "artist" as const, title: "Artist", copy: "Release your sound", Icon: Mic2 },
      { id: "producer" as const, title: "Producer", copy: "Build your beat catalogue", Icon: Disc3 },
      { id: "engineer" as const, title: "Sound engineer", copy: "Explore studio services", Icon: AudioLines }
    ];
    return <section className={`onboarding-agent onboarding-agent-goal ${compact ? "is-compact" : ""}`} aria-labelledby="onboarding-agent-question">
      <div className="onboarding-agent-head"><span className="onboarding-agent-mark"><Sparkles /></span><div><p className="eyebrow">Your space in music</p><h2 id="onboarding-agent-question">{selectedRole ? "What are you trying to accomplish today?" : "Where do you fit in?"}</h2><p>{selectedRole ? "Choose what you want to move forward first." : "A quick choice helps us find your first step."}</p></div>{state ? <button type="button" className="onboarding-agent-close" aria-label="Cancel editing goal" onClick={() => setEditingGoal(false)}><X /></button> : null}</div>
      {!selectedRole ? <><div className="onboarding-role-grid">{roles.map(({ id, title, copy, Icon }) => <button type="button" key={id} className={`onboarding-role-tile role-${id}`} onClick={() => { setSelectedRole(id); setSelectedGoal(id === "producer" ? "sell-beats" : id === "engineer" ? "studio" : ""); }}><span className="onboarding-role-art"><Icon strokeWidth={1.35} /></span><span className="onboarding-role-copy"><strong>{title}</strong><small>{copy}</small></span><ArrowRight className="onboarding-role-arrow" /></button>)}</div><button type="button" className="onboarding-role-other" onClick={() => { setSelectedRole("other"); setSelectedGoal(""); }}>Something else <ArrowRight /></button></> : <><button type="button" className="onboarding-goal-back" onClick={() => { setSelectedRole(""); setSelectedGoal(""); }}><ArrowLeft />Change role</button>{!isOther ? <div className="onboarding-goal-options">{roleGoals.map((id) => { if (!payload.goalOptions.some((item) => item.id === id)) return null; return <button type="button" key={id} aria-pressed={selectedGoal === id} onClick={() => setSelectedGoal(id)}><span>{id === "buy-beat" ? <Headphones /> : id === "sell-beats" ? <Disc3 /> : id === "studio" ? <AudioLines /> : <Mic2 />}</span><strong>{id === "release" ? "Release my music" : id === "finish-release" ? "Continue my release" : id === "buy-beat" ? "Find a beat" : id === "sell-beats" ? "Sell my beats" : "Explore studio services"}</strong><ArrowRight /></button>; })}</div> : <label className="onboarding-custom-goal"><span>Tell us your goal</span><textarea autoFocus maxLength={payload.goalLimit} rows={2} value={customGoal} onChange={(event) => setCustomGoal(event.target.value)} placeholder="For example, prepare a single for release" /><small>{customGoal.length}/{payload.goalLimit}</small></label>}</>}
      {error ? <p className="onboarding-agent-message" role="alert">{error}</p> : null}
      {selectedRole ? <div className="onboarding-agent-footer"><span>A path shaped around your HYMN workspace.</span><button type="button" className="btn-primary pressable" disabled={!canSubmit || busy} onClick={async () => { const ok = await update({ action: state ? "regenerate" : "generate", goalId: isOther ? undefined : selectedGoal, customGoal: isOther ? customGoal.trim() : undefined }); if (ok) setEditingGoal(false); }}>{busy ? <><LoaderCircle className="animate-spin" />Creating your setup…</> : <>Show my path <ArrowRight /></>}</button></div> : null}
    </section>;
  }

  const completedCount = state.plan.steps.filter((step) => step.status === "completed" || step.status === "skipped").length;
  const progress = Math.round((completedCount / state.plan.steps.length) * 100);
  return <section className={`onboarding-agent onboarding-agent-path ${compact ? "is-compact" : ""}`} aria-labelledby="onboarding-agent-title">
    <div className="onboarding-agent-head"><span className="onboarding-agent-mark"><Sparkles /></span><div><p className="eyebrow">Your path · {progress}% complete</p><h2 id="onboarding-agent-title">{state.plan.welcome_message}</h2><p>{state.plan.summary}</p></div><button type="button" className="onboarding-agent-close" aria-label="Dismiss setup" disabled={busy} onClick={() => void update({ action: "dismiss" })}><X /></button></div>
    <div className="onboarding-progress" aria-label={`${progress}% complete`}><span style={{ width: `${progress}%` }} /></div>
    <ol className="onboarding-steps">{state.plan.steps.map((step, index) => { const done = step.status === "completed" || step.status === "skipped"; const current = step.id === nextStep?.id; return <li key={step.id} className={current ? "is-current" : done ? "is-done" : ""}><button type="button" className="onboarding-step-check" aria-label={done ? `${step.title} completed` : `Mark ${step.title} complete`} disabled={busy || done} onClick={() => void update({ action: "step", stepId: step.id, status: "completed" })}>{done ? <CheckCircle2 /> : <span>{index + 1}</span>}</button><div><div className="onboarding-step-title"><strong>{step.title}</strong>{current ? <em>Next best action</em> : null}{step.status === "skipped" ? <em>Skipped</em> : null}</div><p>{step.description}</p><small>{step.why_it_matters}</small>{!done ? <div className="onboarding-step-actions"><Link href={step.action_target} className={current ? "btn-primary pressable" : "btn-outline pressable"}>{step.action_label}<ArrowRight /></Link><button type="button" disabled={busy} onClick={() => void update({ action: "step", stepId: step.id, status: "skipped" })}>Skip</button></div> : null}</div></li>})}</ol>
    {error ? <p className="onboarding-agent-message" role="alert">{error}</p> : null}
    <div className="onboarding-agent-controls"><button type="button" onClick={() => { setSelectedRole(state.goalId === "sell-beats" ? "producer" : state.goalId === "studio" ? "engineer" : state.goalId ? "artist" : "other"); setSelectedGoal(state.goalId || ""); setCustomGoal(state.goalId ? "" : state.goal); setEditingGoal(true); }}>Edit goal</button><button type="button" disabled={busy} onClick={() => void update({ action: "regenerate", goalId: state.goalId, customGoal: state.goalId ? undefined : state.goal })}><RotateCcw />Regenerate</button><button type="button" disabled={busy} onClick={() => void update({ action: "reset" })}>Reset</button></div>
  </section>;
}

export function OnboardingAgentDock() {
  const [open, setOpen] = useState(false);
  const [onboardingAvailable, setOnboardingAvailable] = useState(true);
  const [forceGoalChoice, setForceGoalChoice] = useState(false);
  const [agentKey, setAgentKey] = useState(0);
  const [resetting, setResetting] = useState(false);
  const autoOpened = useRef(false);

  async function reonboard() {
    setResetting(true);
    try {
      const response = await fetch("/api/onboarding-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      if (!response.ok) return;
      setForceGoalChoice(true); setOnboardingAvailable(true); setAgentKey((value) => value + 1);
    } finally { setResetting(false); }
  }

  const handleAvailability = (available: boolean, autoOpen: boolean) => {
    setOnboardingAvailable(available);
    if (autoOpen && !autoOpened.current) { autoOpened.current = true; setOpen(true); }
  };
  return <div className="onboarding-agent-dock">
    {open ? <div className="onboarding-agent-dock-panel"><div className="onboarding-agent-dock-bar"><span>{onboardingAvailable ? <Sparkles /> : <LifeBuoy />}{onboardingAvailable ? "Onboarding Agent" : "HYMN Support"}</span><button type="button" onClick={() => setOpen(false)} aria-label="Minimize panel"><X /></button></div>{onboardingAvailable ? <OnboardingAgentCard key={agentKey} compact forceGoalChoice={forceGoalChoice} onVisibilityChange={handleAvailability} /> : <section className="onboarding-support-panel"><p className="eyebrow">Your HYMN workspace</p><h2>How can we help?</h2><p>Your setup is complete. Find answers, contact support, or start onboarding again with a different goal.</p><div><Link href="/faq"><LifeBuoy />Help and FAQ<ArrowRight /></Link><Link href="/dashboard?tab=support"><MessageCircle />Contact support<ArrowRight /></Link></div><button type="button" className="btn-outline pressable" disabled={resetting} onClick={() => void reonboard()}><RotateCcw />{resetting ? "Preparing setup…" : "Re-onboard me"}</button></section>}</div> : <OnboardingAgentCardProbe key={agentKey} forceGoalChoice={forceGoalChoice} onVisibilityChange={handleAvailability} />}
    <button type="button" className="onboarding-agent-launcher" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close panel" : onboardingAvailable ? "Open onboarding agent" : "Open support"} aria-expanded={open}>{open ? <X /> : onboardingAvailable ? <Compass /> : <MessageCircle />}<span>{onboardingAvailable ? "Setup" : "Support"}</span></button>
  </div>;
}

function OnboardingAgentCardProbe({ forceGoalChoice, onVisibilityChange }: { forceGoalChoice: boolean; onVisibilityChange: (visible: boolean, autoOpen: boolean) => void }) {
  return <div className="onboarding-agent-probe" aria-hidden="true"><OnboardingAgentCard compact forceGoalChoice={forceGoalChoice} onVisibilityChange={onVisibilityChange} /></div>;
}
