"use client";

import { useState } from "react";
import type { User } from "@/lib/types";
import { languages } from "@/lib/i18n/languages";

export function ProfilePreferencesForm({ user }: { user: User }) {
  const [form, setForm] = useState({ name: user.name, mobile: user.mobile ?? "", contactEmail: user.contactEmail ?? "", dateOfBirth: user.dateOfBirth ?? "", preferredLanguage: user.preferredLanguage ?? "en", onboardingUserType: user.onboardingUserType ?? "" });
  const [status, setStatus] = useState(""); const [saving, setSaving] = useState(false);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setStatus("");
    const response = await fetch("/api/user/onboarding-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const body = await response.json().catch(() => ({})); setSaving(false);
    if (!response.ok) return setStatus(body.error || "Could not save settings.");
    localStorage.setItem("hymn_preferred_language", form.preferredLanguage); document.documentElement.lang = form.preferredLanguage; setStatus("Profile preferences saved.");
  }
  const fieldClass = "mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3 text-sm outline-none focus:ring-2";
  return <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
    <label className="text-sm">Display name<input className={fieldClass} style={{ borderColor: "var(--border)" }} value={form.name} required onChange={e => setForm({ ...form, name: e.target.value })} /></label>
    <label className="text-sm">Mobile number <span style={{ color: "var(--text-muted)" }}>· optional</span><input className={fieldClass} style={{ borderColor: "var(--border)" }} value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value })} /></label>
    <label className="text-sm">Contact email <span style={{ color: "var(--text-muted)" }}>· optional</span><input type="email" className={fieldClass} style={{ borderColor: "var(--border)" }} value={form.contactEmail} onChange={e => setForm({ ...form, contactEmail: e.target.value })} /></label>
    <label className="text-sm">Date of birth<input type="date" className={fieldClass} style={{ borderColor: "var(--border)" }} value={form.dateOfBirth} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} /><span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>Private; used for account personalization and birthday wishes.</span></label>
    <label className="text-sm">Preferred language<select className={fieldClass} style={{ borderColor: "var(--border)", background: "var(--surface)" }} value={form.preferredLanguage} onChange={e => setForm({ ...form, preferredLanguage: e.target.value })}>{languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
    <label className="text-sm">User type<input className={fieldClass} style={{ borderColor: "var(--border)" }} value={form.onboardingUserType} onChange={e => setForm({ ...form, onboardingUserType: e.target.value })} /></label>
    <div className="md:col-span-2 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Referral source: {user.referralSource || "Not provided"} <span className="text-xs">(read-only)</span></div>
    <div className="md:col-span-2 flex items-center gap-4"><button disabled={saving} className="rounded-xl px-5 py-3 text-sm font-bold disabled:opacity-60" style={{ background: "var(--accent)", color: "var(--bg)" }}>{saving ? "Saving..." : "Save preferences"}</button>{status ? <p className="text-sm" style={{ color: status.includes("saved") ? "var(--accent)" : "var(--danger)" }}>{status}</p> : null}</div>
  </form>;
}
