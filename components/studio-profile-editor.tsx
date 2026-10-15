"use client";

import { useState } from "react";
import { EngineerDawSelector } from "@/components/engineer-daw-selector";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { uploadEngineerImage } from "@/lib/engineer-image-upload";
import { Camera, ImagePlus, Headphones, ArrowUpRight, UserRound, Disc3, BriefcaseBusiness, Check } from "lucide-react";
import { ENGINEER_GENRES, ENGINEER_SPECIALTIES } from "@/lib/engineer-applications";
import { studioProfileSchema, type StudioProfileInput } from "@/lib/studio-profile";
import { EngineerWorkEditor, EngineerWorkShowcase } from "@/components/engineer-work-showcase";
import styles from "./studio-profile-editor.module.css";

export function StudioProfileEditor({ initial, slug, initialDaws }: { initial: StudioProfileInput; slug: string; initialDaws?: string[] }) {
  const [draft, setDraft] = useState({ ...initial, daws: initialDaws ?? initial.daws, works: initial.works ?? [], experience: initial.experience ?? { level: "WORKING" as const, years: null } });
  const [tab, setTab] = useState("identity"), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(""), [feedback, setFeedback] = useState(""), [dirty, setDirty] = useState(false);
  const [workChanged, setWorkChanged] = useState(false), [experienceChanged, setExperienceChanged] = useState(false);
  const router = useRouter();
  function update(patch: Partial<StudioProfileInput>) { if (patch.works !== undefined) setWorkChanged(true); if (patch.experience !== undefined) setExperienceChanged(true); setDraft(current => ({ ...current, ...patch, works: patch.works ?? current.works, experience: patch.experience ?? current.experience })); setDirty(true); setFeedback(""); }
  async function image(file: File | undefined, key: "banner" | "profilePhotoUrl") {
    if (!file) return;
    setUploading(key); setFeedback("");
    try { update({ [key]: await uploadEngineerImage(file, key === "banner" ? "banner" : "photo") }); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Image upload failed. Please try again."); }
    finally { setUploading(""); }
  }
  const ready = draft.works.filter(work => work.title.trim().length >= 2 && /^https?:\/\//.test(work.url));
  return <form className={styles.editor} noValidate onSubmit={async event => {
    event.preventDefault();
    const payload = { ...draft, works: workChanged ? draft.works : undefined, experience: experienceChanged ? draft.experience : undefined };
    const validation = studioProfileSchema.safeParse(payload);
    if (!validation.success) { const issue = validation.error.issues[0]; const field = String(issue.path[0]); setTab(["works", "experience"].includes(field) ? "experience" : ["specialties", "genres"].includes(field) ? "sound" : "identity"); setFeedback(`${field === "works" ? `Credit ${Number(issue.path[1]) + 1}` : field}: ${issue.message}`); return; }
    setBusy(true); setFeedback("");
    try { const response = await fetch("/api/studio/engineer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not save your profile."); setFeedback("Your public profile is updated."); setDirty(false); setWorkChanged(false); setExperienceChanged(false); router.refresh(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Could not save. Please try again."); }
    finally { setBusy(false); }
  }}>
    <div className={styles.topbar}><nav aria-label="Profile editor sections">{[["identity", "Identity", UserRound], ["sound", "Sound & style", Headphones], ["experience", "Experience", Disc3]].map(([key, label, Icon]) => { const SectionIcon = Icon as typeof UserRound; return <button type="button" key={String(key)} aria-pressed={tab === key} onClick={() => setTab(String(key))}><SectionIcon size={16}/>{String(label)}</button>; })}</nav><Link href={`/studio/engineers/${slug}`} target="_blank" rel="noreferrer">View public profile <ArrowUpRight size={15}/></Link></div>
    <div className={styles.grid}><fieldset disabled={busy || Boolean(uploading)} className={styles.fields}>
      {tab === "sound" ? <EngineerDawSelector value={draft.daws ?? []} onChange={daws => update({ daws })}/> : null}
      <div hidden={tab !== "identity"}>
        <header className={styles.sectionHeading}><span>01 / IDENTITY</span><h2>Your studio, at first glance.</h2><p>Make your profile feel like you. Your images and introduction appear at the top of your public page.</p></header>
        <div className={styles.images}><label className={styles.banner} style={draft.banner ? { backgroundImage: `url("${draft.banner}")` } : undefined}><span><ImagePlus size={17}/>{uploading === "banner" ? "Uploading…" : "Change banner"}</span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload banner" onChange={event => { void image(event.target.files?.[0], "banner"); event.target.value = ""; }}/></label><label className={styles.photo}>{draft.profilePhotoUrl ? <img src={draft.profilePhotoUrl} alt="Profile photo"/> : <Headphones/>}<span><Camera size={14}/></span><input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile photo" onChange={event => { void image(event.target.files?.[0], "profilePhotoUrl"); event.target.value = ""; }}/></label></div>
        <div className={styles.imageHelp}><span>JPG, PNG or WebP · up to 5 MB each</span>{draft.banner ? <button type="button" onClick={() => update({ banner: "" })}>Remove banner</button> : null}{draft.profilePhotoUrl ? <button type="button" onClick={() => update({ profilePhotoUrl: "" })}>Remove photo</button> : null}</div>
        <label className={styles.label}>Professional name<input className="field" required minLength={2} maxLength={120} value={draft.professionalName} onChange={event => update({ professionalName: event.target.value })}/></label>
        <label className={styles.label}>Bio<textarea className="field" rows={4} required minLength={20} maxLength={320} value={draft.bio} onChange={event => update({ bio: event.target.value })}/><small>{draft.bio.length}/320 · Tell clients about your sound and approach.</small></label>
        <div className={styles.pair}>{(["instagram", "youtube"] as const).map(key => <label key={key} className={styles.label}>{key === "instagram" ? "Instagram" : "YouTube"} <small>optional</small><input type="url" className="field" maxLength={1000} placeholder="https://" value={draft[key]} onChange={event => update({ [key]: event.target.value })}/></label>)}</div>
      </div>
      <div hidden={tab !== "sound"}><header className={styles.sectionHeading}><span>02 / SOUND & STYLE</span><h2>Help the right artists find you.</h2><p>Choose the services you offer and the genres that feel most like home.</p></header>{(["specialties", "genres"] as const).map(key => <div key={key} className={styles.choiceGroup}><h3>{key === "genres" ? "Your genres" : "Your specialties"}<small>{draft[key].length}/{key === "genres" ? 5 : 4}</small></h3><div className={styles.choices}>{(key === "genres" ? ENGINEER_GENRES : ENGINEER_SPECIALTIES).map(value => { const selected = (draft[key] as string[]).includes(value); return <button key={value} type="button" aria-pressed={selected} onClick={() => { const values = selected ? draft[key].filter(item => item !== value) : [...draft[key], value]; if (values.length <= (key === "genres" ? 5 : 4)) update({ [key]: values } as Partial<StudioProfileInput>); }}>{selected ? <Check size={14}/> : null}{value}</button>; })}</div></div>)}</div>
      <div hidden={tab !== "experience"}><header className={styles.sectionHeading}><span>03 / EXPERIENCE</span><h2>Let your records do the talking.</h2><p>Lead with your best work. Add a listening link, your role, and a little of the story behind each record.</p></header>
        <div className={styles.journey}><h3><BriefcaseBusiness size={17}/> Your journey</h3><div className={styles.levels}>{[["STARTING", "Building my portfolio"], ["WORKING", "Taking regular projects"], ["ESTABLISHED", "Established studio"]].map(([value, label]) => <button key={value} type="button" aria-pressed={draft.experience.level === value} onClick={() => update({ experience: { ...draft.experience, level: value as "STARTING" | "WORKING" | "ESTABLISHED" } })}>{label}</button>)}</div><label className={styles.years}>Years working in audio <small>optional · self-reported</small><input className="field" type="number" min={0} max={60} value={draft.experience.years ?? ""} onChange={event => update({ experience: { ...draft.experience, years: event.target.value === "" ? null : Number(event.target.value) } })}/></label></div>
        <EngineerWorkEditor works={draft.works} onChange={works => update({ works })}/>
      </div>
    </fieldset><aside className={styles.preview}><p className={styles.previewLabel}>LIVE PREVIEW <span>{dirty ? "Unsaved changes" : "Saved profile"}</span></p>{tab === "experience" ? ready.length ? <EngineerWorkShowcase works={ready} name={draft.professionalName} years={draft.experience.years}/> : <div className={styles.previewEmpty}><Disc3 size={35}/><h3>Your next great credit starts here.</h3><p>Add a title and listening link to preview your listening room.</p></div> : <article className={styles.previewProfile}><div className={styles.previewBanner}>{draft.banner ? <img src={draft.banner} alt="Banner preview"/> : null}</div><div className={styles.previewBody}><div className={styles.previewAvatar}>{draft.profilePhotoUrl ? <img src={draft.profilePhotoUrl} alt="Profile preview"/> : <Headphones/>}</div><h2>{draft.professionalName}</h2><p>{draft.specialties.join(" · ")}</p><p className={styles.previewBio}>{draft.bio}</p><div className={styles.previewGenres}>{draft.genres.join(" / ")}</div></div></article>}</aside></div>
    <footer className={styles.savebar}><div><p role="status" aria-live="polite">{feedback || (uploading ? "Uploading image…" : dirty ? "You have unsaved changes." : "Your profile is up to date.")}</p><small>Changes appear on your public profile when saved.</small></div><button className="btn-primary" disabled={busy || Boolean(uploading) || !draft.genres.length || !draft.specialties.length || (workChanged && ready.length !== draft.works.length)}>{busy ? "Saving…" : "Save profile"}</button></footer>
  </form>;
}
