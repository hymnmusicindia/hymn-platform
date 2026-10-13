"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { Camera, ImagePlus, Headphones } from "lucide-react";
import { ENGINEER_GENRES, ENGINEER_SPECIALTIES } from "@/lib/engineer-applications";
import type { StudioProfileInput } from "@/lib/studio-profile";

export function StudioProfileEditor({ initial, slug }: { initial: StudioProfileInput; slug: string }) {
  const [draft, setDraft] = useState(initial), [busy, setBusy] = useState(false), [uploading, setUploading] = useState(""), [feedback, setFeedback] = useState("");
  const router = useRouter();
  function update(patch: Partial<StudioProfileInput>) { setDraft(current => ({ ...current, ...patch })); setFeedback(""); }
  async function image(file: File | undefined, key: "banner" | "profilePhotoUrl") {
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 5 * 1024 * 1024) { setFeedback("Choose a JPG or PNG under 5 MB."); return; }
    setUploading(key); setFeedback("");
    try { const blob = await upload(`engineers/${crypto.randomUUID()}/${file.name}`, file, { access: "public", handleUploadUrl: "/api/upload" }); update({ [key]: blob.url }); }
    catch { setFeedback("Image upload failed. Please try again."); }
    finally { setUploading(""); }
  }
  return <form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setFeedback("");
    try { const response = await fetch("/api/studio/engineer/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) }); const result = await response.json(); if (!response.ok) throw new Error(result.error || "Could not save your profile."); setFeedback("Your public profile is updated."); router.refresh(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Could not save. Please try again."); }
    finally { setBusy(false); }
  }} className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
    <fieldset disabled={busy || Boolean(uploading)} className="min-w-0 space-y-6 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 sm:p-7">
      <div><h2 className="text-xl font-semibold">Photo & banner</h2><p className="mt-2 text-sm text-[var(--text-muted)]">Public images · JPG or PNG · up to 5 MB each</p></div>
      <div className="grid gap-4 sm:grid-cols-2">{(["profilePhotoUrl", "banner"] as const).map(key => <div key={key}><label className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border border-dashed border-[var(--border)] p-4 hover:bg-[var(--bg-soft)]">{key === "banner" ? <ImagePlus/> : <Camera/>}<span className="text-sm font-semibold">{uploading === key ? "Uploading…" : key === "banner" ? "Change banner" : "Change profile photo"}</span><input className="sr-only" type="file" accept="image/jpeg,image/png" onChange={event => { void image(event.target.files?.[0], key); event.target.value = ""; }}/></label>{draft[key] ? <button type="button" className="mt-2 text-xs underline" onClick={() => update({ [key]: "" })}>Remove {key === "banner" ? "banner" : "photo"}</button> : null}</div>)}</div>
      <label className="block text-sm">Professional name<input className="field mt-2 w-full" required minLength={2} maxLength={120} value={draft.professionalName} onChange={event => update({ professionalName: event.target.value })}/></label>
      <label className="block text-sm">Bio<textarea className="field mt-2 min-h-32 w-full" required minLength={20} maxLength={320} value={draft.bio} onChange={event => update({ bio: event.target.value })}/><span className="mt-1 block text-xs text-[var(--text-muted)]">{draft.bio.length}/320 · Tell clients about your sound and approach.</span></label>
      {(["specialties", "genres"] as const).map(key => <div key={key}><h3 className="mb-3 text-sm font-semibold">{key === "genres" ? "Genres · choose up to 5" : "Specialties · choose up to 4"}</h3><div className="flex flex-wrap gap-2">{(key === "genres" ? ENGINEER_GENRES : ENGINEER_SPECIALTIES).map(value => { const selected = (draft[key] as string[]).includes(value); return <button key={value} type="button" aria-pressed={selected} className={`rounded-full border px-3 py-2 text-sm transition-colors ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--border)]"}`} onClick={() => { const values = selected ? draft[key].filter(item => item !== value) : [...draft[key], value]; if (values.length <= (key === "genres" ? 5 : 4)) update({ [key]: values } as Partial<StudioProfileInput>); }}>{value}</button>; })}</div></div>)}
      {(["instagram", "youtube"] as const).map(key => <label key={key} className="block text-sm">{key === "instagram" ? "Instagram" : "YouTube"} · optional<input type="url" className="field mt-2 w-full" maxLength={1000} placeholder="https://" value={draft[key]} onChange={event => update({ [key]: event.target.value })}/></label>)}
      <p role="status" aria-live="polite" className="text-sm">{feedback}</p><button className="btn-primary" disabled={!draft.genres.length || !draft.specialties.length}>{busy ? "Saving…" : "Save profile"}</button>
    </fieldset>
    <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start"><p className="hymn-kicker mb-3">Preview · unsaved changes</p><article className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]"><div className="h-40 bg-[var(--accent-soft)]">{draft.banner ? <img src={draft.banner} alt="Banner preview" className="h-full w-full object-cover"/> : null}</div><div className="p-6"><div className="-mt-16 mb-5 grid h-24 w-24 place-items-center overflow-hidden rounded-full border-4 border-[var(--card)] bg-[var(--bg-soft)]">{draft.profilePhotoUrl ? <img src={draft.profilePhotoUrl} alt="Profile preview" className="h-full w-full object-cover"/> : <Headphones/>}</div><h2 className="break-words text-2xl font-semibold">{draft.professionalName}</h2><p className="mt-2 text-sm text-[var(--text-muted)]">{draft.specialties.join(" · ")}</p><p className="mt-5 whitespace-pre-wrap break-words text-sm leading-6">{draft.bio}</p><div className="mt-5 flex flex-wrap gap-2">{draft.genres.map(genre => <span key={genre} className="rounded-full bg-[var(--bg-soft)] px-3 py-1 text-xs">{genre}</span>)}</div></div></article><Link className="btn-outline mt-4" href={`/studio/engineers/${slug}`} target="_blank" rel="noreferrer">View saved public profile</Link></aside>
  </form>;
}
