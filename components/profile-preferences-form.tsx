"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, Check, CreditCard, Globe2, LockKeyhole, Mail, ShieldCheck, SlidersHorizontal, UserRound, Wallet } from "lucide-react";
import type { User } from "@/lib/types";
import { languages } from "@/lib/i18n/languages";
import { AccountHandle } from "@/components/account-handle";
import { HomeNewsletter } from "@/components/home-newsletter";
import { useSubscriptionLabel } from "@/components/subscription-label-context";
import styles from "./account-settings.module.css";

const sections = [{ id: "profile", label: "Personal details", icon: UserRound }, { id: "preferences", label: "Preferences", icon: SlidersHorizontal }, { id: "security", label: "Sign-in & privacy", icon: ShieldCheck }, { id: "billing", label: "Plan & payments", icon: CreditCard }] as const;
type Section = typeof sections[number]["id"];

export function ProfilePreferencesForm({ user }: { user: User }) {
  const router = useRouter();
  const planLabel = useSubscriptionLabel();
  const initial = { name: user.name, mobile: user.mobile ?? "", contactEmail: user.contactEmail ?? "", dateOfBirth: user.dateOfBirth?.slice(0, 10) ?? "", preferredLanguage: user.preferredLanguage ?? "en", onboardingUserType: user.onboardingUserType ?? "", onboardingPurpose: user.onboardingPurpose ?? "" };
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [section, setSection] = useState<Section>("profile");
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function update(key: keyof typeof form, value: string) { setForm(current => ({ ...current, [key]: value })); setStatus(null); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (saving || !dirty) return;
    setSaving(true); setStatus(null);
    try {
      const snapshot = { ...form };
      const response = await fetch("/api/user/onboarding-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Could not save settings. Try again.");
      setSaved(snapshot);
      document.documentElement.lang = snapshot.preferredLanguage;
      try { localStorage.setItem("hymn_preferred_language", snapshot.preferredLanguage); } catch { /* Storage can be disabled in private browsers. */ }
      setStatus({ error: false, text: "Changes saved." });
      router.refresh();
    } catch (error) { setStatus({ error: true, text: error instanceof Error ? error.message : "Check your connection and retry." }); }
    finally { setSaving(false); }
  }
  const optional = <small>Optional</small>;
  return <section className={styles.root} aria-labelledby="account-settings-title">
    <header className={styles.heading}><div><p className={styles.eyebrow}>YOUR HYMN ACCOUNT</p><h1 id="account-settings-title">Make yourself at home.</h1><p>Your identity, your preferences, your control.</p></div><span className={styles.status}><span />{(user.status || "active").replaceAll("_", " ")}</span></header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.identity}>{user.avatarUrl ? <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <div className={styles.avatar}>{user.name.slice(0, 1).toUpperCase()}</div>}<strong>{saved.name}</strong><span>{user.email}</span><AccountHandle /></div>
        <nav aria-label="Account settings">{sections.map(item => <button key={item.id} type="button" aria-current={section === item.id ? "page" : undefined} onClick={() => setSection(item.id)}><item.icon size={18}/>{item.label}</button>)}</nav>
        <Link className={styles.help} href="/dashboard?tab=support">Need a hand? <ArrowUpRight size={14}/></Link>
      </aside>
      <div className={styles.content}>
      <form onSubmit={save}>
        <fieldset disabled={saving} className={styles.fields} hidden={section !== "profile"}>
          <legend>Personal details</legend><p className={styles.intro}>How we know you. Artist names stay with your artist profiles.</p>
          <div className={styles.grid}>
            <label>Display name<input autoComplete="name" value={form.name} required maxLength={120} onChange={e => update("name", e.target.value)}/></label>
            <label>WhatsApp number {optional}<input type="tel" autoComplete="tel" maxLength={30} placeholder="+91" value={form.mobile} onChange={e => update("mobile", e.target.value)}/><small>Add a number where HYMN can reach you with faster account and release updates.</small></label>
            <label>Contact email {optional}<input type="email" autoComplete="email" maxLength={254} placeholder="For reaching you" value={form.contactEmail} onChange={e => update("contactEmail", e.target.value)}/><small>Does not change your sign-in email.</small></label>
            <label>Date of birth {optional}<input type="date" autoComplete="bday" max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={e => update("dateOfBirth", e.target.value)}/><small>Private. Never shown on your public profile.</small></label>
          </div>
          <div className={styles.note}><LockKeyhole size={17}/><span>Personal details are separate from your public artist and producer profiles.</span></div>
        </fieldset>
        <fieldset disabled={saving} className={styles.fields} hidden={section !== "preferences"}>
          <legend>Your creative workspace</legend><p className={styles.intro}>Tell us how you use HYMN.</p>
          <div className={styles.grid}>
            <label>Preferred language<select value={form.preferredLanguage} onChange={e => update("preferredLanguage", e.target.value)}>{languages.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <label>Creative role {optional}<input list="hymn-creative-roles" maxLength={80} value={form.onboardingUserType} placeholder="Artist, producer, label..." onChange={e => update("onboardingUserType", e.target.value)}/><datalist id="hymn-creative-roles">{["Artist", "Producer", "Songwriter", "Engineer", "Label", "Manager"].map(role => <option key={role} value={role}/>)}</datalist><small>Your account permissions stay the same.</small></label>
            <label className={styles.full}>What brings you here? {optional}<input list="hymn-creative-goals" maxLength={160} value={form.onboardingPurpose} placeholder="Release music, find beats, build my catalog..." onChange={e => update("onboardingPurpose", e.target.value)}/><datalist id="hymn-creative-goals">{["Release my music", "Find beats", "Sell my beats", "Mix and master a record", "Manage a label"].map(goal => <option key={goal} value={goal}/>)}</datalist></label>
          </div>
          <div className={styles.note}><Globe2 size={17}/><span>Language preference applies where translations are available.</span></div>
        </fieldset>
        {(section === "profile" || section === "preferences") && <div className={styles.savebar}><span role={status?.error ? "alert" : "status"}>{status ? <>{!status.error && <Check size={16}/>}<span style={status.error ? { color: "var(--danger)" } : undefined}>{status.text}</span></> : dirty ? "Unsaved changes" : "You're up to date"}</span><div><button type="button" disabled={!dirty || saving} onClick={() => { setForm(saved); setStatus(null); }}>Discard</button><button type="submit" disabled={!dirty || saving} className={styles.primary}>{saving ? "Saving..." : "Save changes"}</button></div></div>}
      </form>
      {section === "preferences" && <div className={styles.secondary}><h2><Mail size={19}/> Email updates</h2><p>Choose whether to receive HYMN news and opportunities.</p><HomeNewsletter accountEmail={user.email}/></div>}
      {section === "security" && <div className={styles.fields}><h2>Sign-in & privacy</h2><p className={styles.intro}>A clear view of what protects your account.</p><div className={styles.detail}><span>Sign-in email</span><strong>{user.email}</strong></div><div className={styles.detail}><span>Sign-in method</span><strong>{user.googleId ? "Google" : "Account sign-in"}</strong></div><div className={styles.detail}><span>Member since</span><strong>{new Date(user.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</strong></div><div className={styles.note}><ShieldCheck size={19}/><span>{user.googleId ? "Manage your password and two-step verification in your Google account." : "Contact HYMN if you need help securing or recovering your account."}</span></div>{user.googleId && <a className={styles.action} href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Google security <ArrowUpRight size={17}/></a>}<Link className={styles.action} href="/privacy-policy">How your data is handled <ArrowUpRight size={17}/></Link><Link className={styles.action} href="/contact">Request account or data assistance <ArrowUpRight size={17}/></Link></div>}
      {section === "billing" && <div className={styles.fields}><h2>Plan & payments</h2><p className={styles.intro}>Your membership, purchases, and earnings in one place.</p>{[{ icon: CreditCard, title: "Membership", text: `${planLabel === "Subscriptions" ? "Explore plans" : planLabel} - renewal and release allowance`, href: "/dashboard?tab=subscription" }, { icon: Wallet, title: "Earnings & payouts", text: "Payout details, balance, and withdrawals", href: "/payout" }, { icon: Mail, title: "Purchases & licences", text: "Orders, files, and licence agreements", href: "/dashboard?tab=purchases" }].map(item => <Link key={item.title} className={styles.destination} href={item.href}><item.icon size={23}/><span><strong>{item.title}</strong><small>{item.text}</small></span><ArrowUpRight size={19}/></Link>)}</div>}
      </div>
    </div>
  </section>;
}
