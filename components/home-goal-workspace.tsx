"use client";

import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, AudioLines, Check, ChevronDown, Compass, Disc3, Headphones, LoaderCircle, Music2, RotateCcw, Mic2, SlidersHorizontal, Users } from "lucide-react";
import type { OnboardingAgentState } from "@/lib/onboarding-agent";
import { beginHomeGuide, homeGoal, homeGoals, onboardingTarget, homeFeedSections, type HomeBannerId } from "@/lib/home-goals";

type Payload = { state: OnboardingAgentState | null; goalOptions: Array<{ id: string; label: string }>; goalLimit: number; knownGoalId?: string };
const icons = { release: Disc3, "finish-release": RotateCcw, "buy-beat": Headphones, "sell-beats": Music2, studio: AudioLines };
const professions = [
  { id: "artist", label: "Artist", icon: Mic2, goals: ["release", "buy-beat", "studio"] },
  { id: "producer", label: "Producer", icon: Music2, goals: ["sell-beats", "release"] },
  { id: "music-engineer", label: "Music Engineer", icon: SlidersHorizontal, goals: ["studio", "release"] },
  { id: "manager", label: "Manager", icon: Users, goals: ["release", "finish-release"] }
];
const goalCaptions: Record<string, string> = { release: "Go worldwide", "finish-release": "Pick up your draft", "buy-beat": "Find your sound", "sell-beats": "Build your catalogue", studio: "Finish your record" };

export function HomeGoalWorkspace({ userId, name, banners = {} }: { userId: number; name: string; banners?: Partial<Record<HomeBannerId, ReactNode>> }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState("");
  const [profession, setProfession] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [visit, setVisit] = useState(0);
  const [popupOpen, setPopupOpen] = useState(true);
  const headingRef = useRef<HTMLHeadingElement>(null);

  async function load() {
    setError("");
    try {
      const [response, profile] = await Promise.all([fetch("/api/onboarding-agent", { cache: "no-store" }), fetch("/api/user/onboarding-preferences", { cache: "no-store" })]);
      if (!response.ok || !profile.ok) throw new Error("We couldn't load your saved path. Please try again.");
      const data: Payload = await response.json();
      const preferences = await profile.json();
      const savedProfession = String(preferences.preferences?.onboardingUserType || "").toLowerCase().replaceAll(" ", "-");
      setProfession(professions.find(item => item.id === savedProfession)?.id || "");
      setPayload(data); setSelected(data.state?.goalId || data.knownGoalId || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your saved path is unavailable."); }
  }
  useEffect(() => { void load(); }, []);

  async function chooseProfession(id: string) {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/user/onboarding-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboardingUserType: professions.find(item => item.id === id)?.label || id }) });
      if (!response.ok) throw new Error("We couldn't save your profession. Please try again.");
      setProfession(id); setSelected(""); setEditing(true);
      requestAnimationFrame(() => headingRef.current?.focus());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  }

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
  const chooser = Boolean(payload && (!state || editing || !profession));
  useEffect(() => {
    if (!state) return;
    try {
      const key = `hymn:home-feed:${userId}:${state.goalId || "custom"}`;
      const previous = Number(localStorage.getItem(key) || 0);
      const current = Number.isFinite(previous) ? previous : 0;
      setVisit(current); localStorage.setItem(key, String((current + 1) % 12));
    } catch { setVisit(new Date().getUTCDate()); }
    // Rotate between home visits or changed goals, never after checklist edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, state?.goalId, state?.version]);
  const choosingProfession = chooser && !profession;
  const professionOption = professions.find(item => item.id === profession);
  const goal = homeGoal(state?.goalId || payload?.knownGoalId);
  const steps = state?.plan.steps ?? [];
  const next = steps.find(step => !["completed", "skipped"].includes(step.status));
  const completed = steps.filter(step => ["completed", "skipped"].includes(step.status)).length;
  const firstName = name.trim().split(/\s+/)[0] || "there";
  const activeHref = onboardingTarget(next?.action_target || goal.href, state?.goalId);
  const guide = (href: string, title: string, description: string) => beginHomeGuide({ userId, goalId: state?.goalId || goal.id, href, title, description });

  return <section className="home-goal-workspace" data-home-goal={state?.goalId || "choose"} data-mode={state && !chooser ? "home" : "onboarding"} aria-labelledby="home-goal-title">
    <div className="home-goal-backdrop" aria-hidden="true"><Image src="/home-hero-crowd.jpg" alt="" fill priority sizes="100vw" /></div>
    <header className="home-goal-topline"><span><Compass size={15} /> YOUR NEXT CHAPTER</span><Link href="/dashboard">Open dashboard <ArrowRight size={14} /></Link></header>
    <div className="home-goal-heading"><p>Welcome{state ? " back" : ""}, {firstName}.</p><h1 id="home-goal-title" ref={headingRef} tabIndex={-1}>{choosingProfession ? "Your role in music?" : chooser ? "What brings you to HYMN?" : state ? "Your music. Ready for its next chapter." : "Your music. Your next move."}</h1>{chooser || !state ? <p>{choosingProfession ? "Start with you." : chooser ? "Pick your next move." : "Getting your workspace ready."}</p> : null}</div>
    {!payload && !error ? <div className="home-goal-loading" role="status"><LoaderCircle size={20} /> Loading your workspace…</div> : null}
    {error ? <div className="home-goal-error" role="alert"><span>{error}</span>{!payload ? <button type="button" onClick={() => void load()}>Retry</button> : null}</div> : null}
    {chooser ? <>
      <div className="home-goal-stage"><span>{choosingProfession ? "01 / ABOUT YOU" : "02 / YOUR GOAL"}</span>{!choosingProfession ? <button type="button" onClick={() => setProfession("")} disabled={busy}>{professionOption?.label} / Change</button> : null}</div>
      {choosingProfession ? <div className="home-profession-choices" role="group" aria-label="Choose your profession">{professions.map(item => <button type="button" key={item.id} onClick={() => void chooseProfession(item.id)} disabled={busy}><item.icon size={30} strokeWidth={1.3} /><strong>{item.label}</strong><ArrowRight size={17} /></button>)}</div> :
      <div className="home-goal-choices" role="group" aria-label="Choose your main objective">{homeGoals.filter(option => professionOption?.goals.includes(option.id) && payload?.goalOptions.some(item => item.id === option.id)).map(option => { const ChoiceIcon = icons[option.id]; return <button type="button" key={option.id} aria-pressed={selected === option.id} onClick={() => setSelected(option.id)} disabled={busy}><ChoiceIcon size={32} strokeWidth={1.3} /><span className="home-goal-choice-copy"><strong>{option.title}</strong><small>{goalCaptions[option.id]}</small></span><span className="home-goal-choice-marker" aria-hidden="true">{selected === option.id ? <Check size={16} /> : <ArrowRight size={16} />}</span></button>; })}</div>}
      <div className="home-goal-choice-footer"><p>{busy && choosingProfession ? "Saving your profession..." : "Your path. Always changeable."}</p><div>{state ? <button type="button" onClick={() => { setEditing(false); void load(); }} disabled={busy}>Cancel</button> : <Link href="/dashboard">Explore first</Link>}{!choosingProfession ? <button className="home-goal-primary" type="button" disabled={busy || !selected} onClick={() => void update({ action: state ? "regenerate" : "generate", goalId: selected })}>{busy ? <><LoaderCircle size={16} /> Building your path...</> : <>Build my path <ArrowRight size={16} /></>}</button> : null}</div></div>
    </> : state ? <>
      {typeof document !== "undefined" ? createPortal(<aside className="home-path-popup" aria-label="Your focus">
      <button className="home-path-popup-toggle" type="button" aria-expanded={popupOpen} aria-controls="home-path-popup-content" onClick={() => setPopupOpen(open => !open)}><Compass size={17}/><span>Your focus. Your next move.</span><ChevronDown size={16}/></button>
      <div id="home-path-popup-content" hidden={!popupOpen}>
      <div className="home-path-launch"><Link className="home-goal-primary" href={activeHref}>{next?.action_label || goal.action}<ArrowRight size={16}/></Link><button type="button" onClick={() => { setSelected(state.goalId || ""); setEditing(true); requestAnimationFrame(() => headingRef.current?.focus()); }}>Change goal</button></div>
      <details className="home-path-guide"><summary>Your guide <span>{completed}/{steps.length} steps</span><ArrowRight size={16}/></summary>
      <div className="home-goal-focus-grid"><article className="home-goal-feature"><div className="home-goal-feature-label"><span>YOUR NEXT STEP</span></div><h2>{next?.title || "Your path is complete. Keep creating."}</h2><p>{next?.description || "Your chosen tools and services are ready whenever you need them."}</p><div className="home-goal-feature-actions"><Link className="home-goal-primary" href={activeHref}>{next?.action_label || goal.action}<ArrowRight size={16} /></Link><button type="button" onClick={() => guide(activeHref, next?.title || goal.title, next?.description || goal.description)}><Compass size={16} /> Guide me there</button></div><details className="home-goal-feature-footnote"><summary>Why this step?</summary>{next?.why_it_matters || "Revisit any step or choose a new objective."}</details></article>
      <aside className="home-goal-checklist"><header><h2>Your next steps</h2><span>{completed}/{steps.length}</span></header><div className="home-goal-progress" role="progressbar" aria-label="Your path progress" aria-valuemin={0} aria-valuemax={steps.length || 1} aria-valuenow={completed}><span style={{ width: `${steps.length ? completed / steps.length * 100 : 0}%` }} /></div><ol>{steps.map((step,index) => <li key={step.id} data-status={step.status} data-current={step.id === next?.id}><span className="home-goal-step-number">{step.status === "completed" ? <Check size={14} /> : step.status === "skipped" ? "—" : String(index + 1).padStart(2,"0")}</span><div><h3>{step.title}</h3>{!["completed","skipped"].includes(step.status) ? <div className="home-goal-step-actions"><button type="button" onClick={() => guide(step.action_target, step.title, step.description)} disabled={busy}>Show me <ArrowRight size={12} /></button><button type="button" onClick={() => void update({ action:"step", stepId:step.id, status:"completed" })} disabled={busy}>Mark done</button><button type="button" onClick={() => void update({ action:"step", stepId:step.id, status:"skipped" })} disabled={busy}>Skip</button></div> : <span className="home-goal-step-finished">{step.status === "completed" ? "Completed" : "Skipped"}</span>}</div></li>)}</ol></aside></div>
      </details>
      </div></aside>, document.body) : null}
      {banners.releases ? <div className="home-goal-hero-showcase" data-home-banner="releases">{banners.releases}</div> : null}
      <div className="home-personalized-feed" aria-label="Selected for your path">{homeFeedSections(state.goalId,visit).filter(id => id !== "releases").map(id => banners[id] ? <div key={id} data-home-banner={id}>{banners[id]}</div> : null)}</div>
    </> : null}
  </section>;
}
