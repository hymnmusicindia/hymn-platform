"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, AudioLines, Check, Compass, Disc3, Headphones, LoaderCircle, Music2, RotateCcw } from "lucide-react";
import type { OnboardingAgentState } from "@/lib/onboarding-agent";
import { beginHomeGuide, homeGoal, homeGoals, onboardingTarget } from "@/lib/home-goals";

type Payload = { state: OnboardingAgentState | null; goalOptions: Array<{ id: string; label: string }>; goalLimit: number; knownGoalId?: string };
const icons = { release: Disc3, "finish-release": RotateCcw, "buy-beat": Headphones, "sell-beats": Music2, studio: AudioLines };

export function HomeGoalWorkspace({ userId, name }: { userId: number; name: string }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [customGoal, setCustomGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/onboarding-agent", { cache: "no-store" });
      if (!response.ok) throw new Error("We couldn't load your saved path. Please try again.");
      const data: Payload = await response.json();
      setPayload(data); setSelected(data.state?.goalId || data.knownGoalId || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your saved path is unavailable."); }
  }
  useEffect(() => { void load(); }, []);

  async function update(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/onboarding-agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "We couldn't save your path. Try again.");
      setPayload(current => current ? { ...current, state: result.state } : current);
      setEditing(false);
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "We couldn't save your path."); }
    finally { setBusy(false); }
  }

  const state = payload?.state;
  const chooser = Boolean(payload && (!state || editing));
  const goal = homeGoal(state?.goalId || payload?.knownGoalId);
  const steps = state?.plan.steps ?? [];
  const next = steps.find(step => !["completed", "skipped"].includes(step.status));
  const completed = steps.filter(step => ["completed", "skipped"].includes(step.status)).length;
  const Icon = icons[goal.id];
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const activeHref = onboardingTarget(next?.action_target || goal.href, state?.goalId);
  const guide = (href: string, title: string, description: string) => beginHomeGuide({ userId, goalId: state?.goalId || goal.id, href, title, description });

  return <section className="home-goal-workspace" data-home-goal={state?.goalId || "choose"} aria-labelledby="home-goal-title">
    <header className="home-goal-topline"><span><Compass size={15} /> YOUR HYMN WORKSPACE</span><Link href="/dashboard">Open dashboard <ArrowRight size={14} /></Link></header>
    <div className="home-goal-heading"><p>Welcome{state ? " back" : ""}, {firstName}.</p><h1 id="home-goal-title" ref={headingRef} tabIndex={-1}>{chooser ? "What brings you to HYMN?" : state ? (state.goalId ? goal.headline : state.goal) : "Your music. Your next move."}</h1><p>{chooser ? "Choose your focus. We'll shape your home and next steps around it." : state ? state.plan.summary : "Loading your saved preferences and next steps."}</p></div>
    {!payload && !error ? <div className="home-goal-loading" role="status"><LoaderCircle size={20} /> Loading your workspace…</div> : null}
    {error ? <div className="home-goal-error" role="alert"><span>{error}</span>{!payload ? <button type="button" onClick={() => void load()}>Retry</button> : null}</div> : null}
    {chooser ? <>
      <div className="home-goal-choices" role="group" aria-label="Choose your main objective">{homeGoals.filter(option => payload?.goalOptions.some(item => item.id === option.id)).map(option => { const ChoiceIcon = icons[option.id]; return <button type="button" key={option.id} aria-pressed={selected === option.id} onClick={() => { setSelected(option.id); setCustomGoal(""); }} disabled={busy}><ChoiceIcon size={24} /><span><strong>{option.title}</strong><small>{option.description}</small></span><span className="home-goal-choice-marker" aria-hidden="true">{selected === option.id ? <Check size={16} /> : <ArrowRight size={16} />}</span></button>; })}</div>
      <details className="home-goal-custom"><summary>Have a different goal?</summary><label>Tell us what you want to achieve<textarea rows={2} maxLength={payload?.goalLimit || 140} value={customGoal} onChange={event => { setCustomGoal(event.target.value); setSelected(""); }} placeholder="For example, prepare my next single for release" disabled={busy} /></label></details>
      <div className="home-goal-choice-footer"><p>Your preference is saved to your account. You can change it anytime.</p><div>{state ? <button type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button> : <Link href="/dashboard">Explore first</Link>}<button className="home-goal-primary" type="button" disabled={busy || (!selected && customGoal.trim().length < 3)} onClick={() => void update({ action: state ? "regenerate" : "generate", ...(selected ? { goalId: selected } : { customGoal: customGoal.trim() }) })}>{busy ? <><LoaderCircle size={16} /> Building your path…</> : <>Build my path <ArrowRight size={16} /></>}</button></div></div>
    </> : state ? <>
      <div className="home-goal-focus-grid"><article className="home-goal-feature"><div className="home-goal-feature-label"><Icon size={18} /><span>YOUR FOCUS · {goal.group}</span><button type="button" onClick={() => { setSelected(state.goalId || ""); setCustomGoal(state.goalId ? "" : state.goal); setEditing(true); }} disabled={busy}>Change goal</button></div><h2>{next?.title || "Your path is complete. Keep creating."}</h2><p>{next?.description || "Your chosen tools and services are ready whenever you need them."}</p><div className="home-goal-feature-actions"><Link className="home-goal-primary" href={activeHref}>{next?.action_label || goal.action}<ArrowRight size={16} /></Link><button type="button" onClick={() => guide(activeHref, next?.title || goal.title, next?.description || goal.description)}><Compass size={16} /> Guide me there</button></div><span className="home-goal-feature-footnote">{next?.why_it_matters || "You can revisit any step or choose a new objective."}</span></article>
      <aside className="home-goal-checklist"><header><h2>Your next steps</h2><span>{completed}/{steps.length}</span></header><div className="home-goal-progress" role="progressbar" aria-label="Your path progress" aria-valuemin={0} aria-valuemax={steps.length || 1} aria-valuenow={completed}><span style={{ width: `${steps.length ? completed / steps.length * 100 : 0}%` }} /></div><ol>{steps.map((step,index) => <li key={step.id} data-status={step.status} data-current={step.id === next?.id}><span className="home-goal-step-number">{step.status === "completed" ? <Check size={14} /> : step.status === "skipped" ? "—" : String(index + 1).padStart(2,"0")}</span><div><h3>{step.title}</h3><p>{step.description}</p>{!["completed","skipped"].includes(step.status) ? <div className="home-goal-step-actions"><button type="button" onClick={() => guide(step.action_target, step.title, step.description)} disabled={busy}>Show me <ArrowRight size={12} /></button><button type="button" onClick={() => void update({ action:"step", stepId:step.id, status:"completed" })} disabled={busy}>Mark done</button><button type="button" onClick={() => void update({ action:"step", stepId:step.id, status:"skipped" })} disabled={busy}>Skip</button></div> : <span className="home-goal-step-finished">{step.status === "completed" ? "Completed" : "Skipped"}</span>}</div></li>)}</ol></aside></div>
      <section className="home-goal-recommendations" aria-labelledby="home-recommendations-title"><header><div><p>SELECTED FOR YOUR GOAL</p><h2 id="home-recommendations-title">Your tools for {goal.group.toLowerCase()}.</h2></div><Link href="/dashboard">All tools <ArrowRight size={14} /></Link></header><div>{goal.related.map(item => <Link key={item.title} href={item.href}><span>{goal.group}</span><h3>{item.title}</h3><p>{item.copy}</p><strong>Explore <ArrowRight size={14} /></strong></Link>)}<Link href="/faq"><span>HELP WHEN YOU NEED IT</span><h3>Move forward with confidence.</h3><p>Find answers about your music, account and next steps.</p><strong>Get help <ArrowRight size={14} /></strong></Link></div></section>
    </> : null}
  </section>;
}
