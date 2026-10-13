"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BadgeCheck, Check, Clock3, Gauge, Headphones, Instagram, Music2, Sparkles, UploadCloud } from "lucide-react";
import { ENGINEER_GENRES, ENGINEER_SPECIALTIES } from "@/lib/engineer-applications";

type Application = { id: number; professionalName: string; bio: string; specialties: string[]; genres: string[]; portfolioUrl: string; instagramUrl: string | null; experienceLevel: string; startingPrice: number; turnaroundDays: number; status: string; reviewNote: string | null; createdAt: string; updatedAt: string };
type FormState = { professionalName: string; bio: string; specialties: string[]; genres: string[]; portfolioUrl: string; instagramUrl: string; experienceLevel: "STARTING" | "WORKING" | "ESTABLISHED"; startingPrice: number; turnaroundDays: number };

const experience = [{ value: "STARTING", label: "Building", note: "First client work", icon: Sparkles }, { value: "WORKING", label: "Working", note: "Regular projects", icon: Headphones }, { value: "ESTABLISHED", label: "Established", note: "Strong catalogue", icon: BadgeCheck }] as const;

export function EngineerApplicationForm({ user, application, activeProfile }: { user: { name: string; avatar: string | null }; application: Application | null; activeProfile: { id: number; professionalName: string } | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [editingExisting, setEditingExisting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<FormState>({ professionalName: application?.professionalName || user.name, bio: application?.bio || "", specialties: application?.specialties || ["Mixing", "Mastering"], genres: application?.genres || [], portfolioUrl: application?.portfolioUrl || "", instagramUrl: application?.instagramUrl || "", experienceLevel: (application?.experienceLevel as FormState["experienceLevel"]) || "WORKING", startingPrice: application?.startingPrice || 1999, turnaroundDays: application?.turnaroundDays || 5 });
  const toggle = (key: "specialties" | "genres", value: string, max: number) => setForm(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : current[key].length < max ? [...current[key], value] : current[key] }));
  const canContinue = step === 0 ? form.specialties.length > 0 && form.genres.length > 0 : step === 1 ? Boolean(form.portfolioUrl && form.experienceLevel) : form.professionalName.trim().length >= 2 && form.bio.trim().length >= 20 && form.startingPrice >= 499 && form.turnaroundDays > 0;

  if (activeProfile) return <section className="engineer-apply-result"><span className="engineer-result-icon"><BadgeCheck /></span><p className="hymn-kicker">Studio engineer</p><h1>You’re ready for projects.</h1><p>{activeProfile.professionalName} is active in HYMN Studio.</p><div><Link href="/studio/engineer" className="btn-primary">Open engineer workspace <ArrowRight size={16}/></Link><Link href="/studio" className="btn-outline">View public Studio</Link></div></section>;
  if (application?.status === "PENDING" && !editingExisting) return <section className="engineer-apply-result"><span className="engineer-result-icon is-pending"><Clock3 /></span><p className="hymn-kicker">Application in review</p><h1>Your sound is with us.</h1><p>HYMN is reviewing your work sample and profile. You’ll get an email and notification after the decision.</p><div className="engineer-result-meta"><span>Submitted</span><strong>{new Date(application.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong></div><button type="button" className="btn-outline" onClick={() => { setEditingExisting(true); setStep(0); }}>Update application</button></section>;
  const rejected = application?.status === "REJECTED";

  async function submit() {
    if (!canContinue || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/studio/engineer-application", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.error || "Could not submit your application.");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not submit your application."); }
    finally { setBusy(false); }
  }

  return <div className="engineer-apply-card">
    <header className="engineer-apply-heading"><Link href="/studio"><ArrowLeft size={17}/> Studio</Link><span>{step + 1}<i>/3</i></span></header>
    <div className="engineer-apply-progress"><span style={{ width: `${((step + 1) / 3) * 100}%` }}/></div>
    {rejected && step === 0 ? <div className="engineer-review-note"><strong>Ready for another pass</strong><span>{application.reviewNote || "Update your work sample or profile and submit again."}</span></div> : null}
    {step === 0 ? <section className="engineer-apply-step"><p className="hymn-kicker">Your sound</p><h1>What do you make shine?</h1><div className="engineer-choice-grid engineer-specialties">{ENGINEER_SPECIALTIES.map(item => <button type="button" key={item} aria-pressed={form.specialties.includes(item)} onClick={() => toggle("specialties", item, 4)}><Headphones size={18}/><span>{item}</span>{form.specialties.includes(item) ? <Check size={15}/> : null}</button>)}</div><h2>Choose your lanes</h2><div className="engineer-chips">{ENGINEER_GENRES.map(item => <button type="button" key={item} aria-pressed={form.genres.includes(item)} onClick={() => toggle("genres", item, 5)}>{item}</button>)}</div></section> : null}
    {step === 1 ? <section className="engineer-apply-step"><p className="hymn-kicker">Your proof</p><h1>Let the work speak.</h1><label className="engineer-link-field"><UploadCloud/><span><strong>Best work link</strong><small>Spotify, YouTube, SoundCloud or Drive</small></span><input type="url" value={form.portfolioUrl} onChange={event => setForm({ ...form, portfolioUrl: event.target.value })} placeholder="https://" autoFocus required /></label><label className="engineer-link-field"><Instagram/><span><strong>Instagram</strong><small>Optional</small></span><input type="url" value={form.instagramUrl} onChange={event => setForm({ ...form, instagramUrl: event.target.value })} placeholder="https://instagram.com/" /></label><h2>Your current stage</h2><div className="engineer-choice-grid engineer-experience">{experience.map(item => <button type="button" key={item.value} aria-pressed={form.experienceLevel === item.value} onClick={() => setForm({ ...form, experienceLevel: item.value })}><item.icon/><strong>{item.label}</strong><small>{item.note}</small></button>)}</div></section> : null}
    {step === 2 ? <section className="engineer-apply-step"><p className="hymn-kicker">Your gig</p><h1>Set the first impression.</h1><div className="engineer-profile-line">{user.avatar ? <img src={user.avatar} alt="" referrerPolicy="no-referrer"/> : <span>{user.name.slice(0, 1)}</span>}<label><small>Public engineer name</small><input value={form.professionalName} onChange={event => setForm({ ...form, professionalName: event.target.value })} maxLength={120}/></label></div><label className="engineer-bio"><span>One-line pitch <small>{form.bio.length}/320</small></span><textarea value={form.bio} onChange={event => setForm({ ...form, bio: event.target.value })} placeholder="The sound you deliver, in one clear sentence." maxLength={320}/></label><div className="engineer-gig-numbers"><label><Music2/><span>Starts at</span><div>₹<input type="number" min={499} max={100000} value={form.startingPrice} onChange={event => setForm({ ...form, startingPrice: Number(event.target.value) })}/></div></label><label><Gauge/><span>Delivery</span><div><input type="number" min={1} max={30} value={form.turnaroundDays} onChange={event => setForm({ ...form, turnaroundDays: Number(event.target.value) })}/> days</div></label></div><div className="engineer-preview"><span>Preview</span><strong>{form.professionalName || "Your name"}</strong><small>{form.specialties.join(" · ")} · {form.genres.slice(0, 3).join(" / ")}</small><p>{form.bio || "Your pitch appears here."}</p></div></section> : null}
    {error ? <p className="engineer-apply-error" role="alert">{error}</p> : null}
    <footer className="engineer-apply-actions">{step > 0 ? <button type="button" onClick={() => setStep(value => value - 1)}>Back</button> : <span/>}{step < 2 ? <button type="button" className="btn-primary" disabled={!canContinue} onClick={() => setStep(value => value + 1)}>Next <ArrowRight size={16}/></button> : <button type="button" className="btn-primary" disabled={!canContinue || busy} onClick={submit}>{busy ? "Sending…" : "Apply to HYMN"}<ArrowRight size={16}/></button>}</footer>
  </div>;
}
