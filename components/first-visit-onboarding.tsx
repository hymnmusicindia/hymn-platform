"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Compass, Disc3, Headphones, Languages, Megaphone, Mic2, Music2, Radio, Search, Sparkles, Store, UsersRound, WandSparkles } from "lucide-react";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { getDictionary } from "@/lib/i18n/dictionary";
import { languages, type LanguageCode } from "@/lib/i18n/languages";

const SEEN_KEY = "hymn_first_visit_onboarding_seen";
const DRAFT_KEY = "hymn_onboarding_draft";
const LANGUAGE_KEY = "hymn_preferred_language";
const BROWSE_COOLDOWN_KEY = "hymn_onboarding_browse_cooldown_at";
const LEGACY_BROWSE_SESSION_KEY = "hymn_onboarding_browse_session";
const BROWSE_COOLDOWN_MS = 15 * 60 * 1000;
const allowedPaths = new Set(["/", "/services", "/distribution", "/beat-store", "/beatstore", "/pricing"]);
const progress = [12, 25, 37, 50, 62, 75, 87, 100];

type Draft = { name: string; mobile: string; contactEmail: string; dateOfBirth: string; preferredLanguage: LanguageCode; purposes: string[]; userTypes: string[]; referralSource: string; referralCode: string };
const emptyDraft: Draft = { name: "", mobile: "", contactEmail: "", dateOfBirth: "", preferredLanguage: "en", purposes: [], userTypes: [], referralSource: "", referralCode: "" };

const purposes = [
  ["Music Distribution", "Release your music on leading DSPs."], ["Beat Store", "Find or sell production-ready beats."],
  ["Playlisting / Promotion", "Build a focused release campaign."], ["Artist Management", "Organize the business around your music."],
  ["Marketing Services", "Plan how your release reaches listeners."], ["Producer Tools", "Build, license, and manage your catalog."],
  ["Just exploring", "See the HYMN ecosystem first."]
] as const;
const userTypes = ["Independent Artist", "Producer", "Rapper / Singer", "Label / Manager", "Composer / Songwriter", "Music Marketer", "Just browsing"];
const referrals = ["Instagram", "YouTube", "Google Search", "Friend / Referral", "Artist Community", "WhatsApp", "College / Event", "Existing HYMN Artist", "Other"];
const microLines = [
  "HYMN is built for artists who want their music business organized from day one.",
  "A serious artist profile starts with a clean identity.",
  "The artists who stay reachable move faster when opportunities, payouts, and release issues appear.",
  "The earlier you build your music system, the faster your catalog starts compounding.",
  "Your music can travel globally, but your workspace should still speak your language.",
  "Most artists do not fail because of talent. They fail because their release system is weak.",
  "The industry rewards artists who move like businesses, not hobbyists.",
  "Every serious music brand grows through trust, referrals, and repeat discovery."
];

function optionIcon(title: string) {
  const icons: Record<string, ReactNode> = {
    "Music Distribution": <Disc3 className="h-4 w-4" />, "Beat Store": <Store className="h-4 w-4" />,
    "Playlisting / Promotion": <Radio className="h-4 w-4" />, "Artist Management": <UsersRound className="h-4 w-4" />,
    "Marketing Services": <Megaphone className="h-4 w-4" />, "Producer Tools": <WandSparkles className="h-4 w-4" />,
    "Just exploring": <Compass className="h-4 w-4" />,
    "Independent Artist": <Music2 className="h-4 w-4" />, Producer: <Disc3 className="h-4 w-4" />,
    "Rapper / Singer": <Mic2 className="h-4 w-4" />, "Label / Manager": <UsersRound className="h-4 w-4" />,
    "Composer / Songwriter": <WandSparkles className="h-4 w-4" />, "Music Marketer": <Megaphone className="h-4 w-4" />,
    "Just browsing": <Search className="h-4 w-4" />
  };
  return icons[title] ?? <Sparkles className="h-4 w-4" />;
}

function OptionCard({ title, description, selected, onClick, icon, compact = false }: { title: string; description?: string; selected: boolean; onClick: () => void; icon?: ReactNode; compact?: boolean }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`group relative flex w-full flex-col items-start justify-between overflow-hidden border text-left transition duration-200 hover:-translate-y-1 hover:shadow-xl focus:outline-none focus:ring-2 active:scale-[.975] ${compact ? "min-h-[4.25rem] rounded-xl p-2.5" : "min-h-[5.25rem] rounded-2xl p-3"}`} style={{ borderColor: selected ? "var(--accent)" : "var(--border)", background: selected ? "linear-gradient(145deg, color-mix(in srgb, var(--accent) 18%, var(--surface)), var(--surface))" : "linear-gradient(145deg, var(--bg-soft), color-mix(in srgb, var(--surface) 88%, transparent))", color: "var(--text)", boxShadow: selected ? "0 14px 36px color-mix(in srgb, var(--accent) 14%, transparent)" : undefined }}>
    <span className="flex w-full items-start justify-between"><span className={`grid place-items-center border transition group-hover:rotate-[-4deg] group-hover:scale-110 ${compact ? "h-7 w-7 rounded-lg" : "h-8 w-8 rounded-xl"}`} style={{ borderColor: selected ? "var(--accent)" : "var(--border)", color: selected ? "var(--accent)" : "var(--text-muted)" }}>{icon ?? <Music2 className="h-4 w-4" />}</span><span className={`grid place-items-center rounded-full border transition ${compact ? "h-4 w-4" : "h-5 w-5"}`} style={{ borderColor: selected ? "var(--accent)" : "var(--border)", background: selected ? "var(--accent)" : "transparent", color: selected ? "var(--bg)" : "transparent" }}><Check className="h-3 w-3" /></span></span>
    <span className="mt-2 min-w-0"><span className="block text-xs font-bold leading-4 sm:text-sm">{title}</span>{description ? <span className="mt-0.5 hidden text-[11px] leading-4 xl:block" style={{ color: "var(--text-muted)" }}>{description}</span> : null}</span>
  </button>;
}

export function FirstVisitOnboarding({ isAuthenticated }: { isAuthenticated: boolean }) {
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [step, setStep] = useState(0); const [final, setFinal] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft); const [error, setError] = useState("");
  const dictionary = useMemo(() => getDictionary(draft.preferredLanguage), [draft.preferredLanguage]);

  useEffect(() => {
    if (isAuthenticated || !allowedPaths.has(pathname)) {
      setOpen(false);
      return;
    }

    // Older builds used a session-long flag, which could suppress onboarding
    // indefinitely across refreshes in the same tab. Remove it during migration.
    sessionStorage.removeItem(LEGACY_BROWSE_SESSION_KEY);

    const cooldownStartedAt = Number(localStorage.getItem(BROWSE_COOLDOWN_KEY));
    if (Number.isFinite(cooldownStartedAt) && Date.now() - cooldownStartedAt < BROWSE_COOLDOWN_MS) {
      setOpen(false);
      return;
    }
    localStorage.removeItem(BROWSE_COOLDOWN_KEY);

    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Record<string, unknown>;
        setDraft({ ...emptyDraft, ...parsed, purposes: Array.isArray(parsed.purposes) ? parsed.purposes as string[] : typeof parsed.purpose === "string" && parsed.purpose ? [parsed.purpose] : [], userTypes: Array.isArray(parsed.userTypes) ? parsed.userTypes as string[] : typeof parsed.userType === "string" && parsed.userType ? [parsed.userType] : [] });
      }
    } catch { localStorage.removeItem(DRAFT_KEY); }
    setOpen(true);
  }, [isAuthenticated, pathname]);
  useEffect(() => { if (open) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); }, [draft, open]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { setDraft(current => ({ ...current, [key]: value })); setError(""); }
  function toggleMulti(key: "purposes" | "userTypes", value: string) { setDraft(current => ({ ...current, [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value] })); setError(""); }
  function markSeen() { localStorage.setItem(SEEN_KEY, "true"); }
  function next() {
    if (step === 1 && !draft.name.trim()) return setError("Enter your name or artist name.");
    if (step === 2 && draft.contactEmail && !/^\S+@\S+\.\S+$/.test(draft.contactEmail)) return setError("Enter a valid contact email or leave it blank.");
    if (step === 3 && (!draft.dateOfBirth || new Date(`${draft.dateOfBirth}T00:00:00`) > new Date())) return setError("Enter a valid date of birth.");
    if (step === 5 && draft.purposes.length === 0) return setError("Choose at least one reason that brought you to HYMN.");
    if (step === 6 && draft.userTypes.length === 0) return setError("Choose at least one option that describes you.");
    if (step === 7 && !draft.referralSource) return setError("Choose how you heard about HYMN.");
    if (step === 7) return setFinal(true);
    setStep(value => value + 1);
  }
  const age = draft.dateOfBirth ? Math.floor((Date.now() - new Date(`${draft.dateOfBirth}T00:00:00`).getTime()) / 31557600000) : null;
  const payload = { ...draft, purpose: draft.purposes.join(", "), userType: draft.userTypes.join(", "), completedAt: new Date().toISOString() };
  const recommendedPath: Record<string, string> = { "Music Distribution": "/distribution", "Beat Store": "/beat-store", "Producer Tools": "/producer-dashboard", "Marketing Services": "/services", "Playlisting / Promotion": "/services", "Artist Management": "/services" };
  async function afterGoogle(data: { redirectPath?: string }) {
    const response = await fetch("/api/user/onboarding-preferences", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error || "Signed in, but preferences could not be saved."); }
    markSeen(); localStorage.removeItem(DRAFT_KEY); localStorage.setItem(LANGUAGE_KEY, draft.preferredLanguage);
    router.push(recommendedPath[draft.purposes[0]] || data.redirectPath || "/dashboard"); router.refresh();
  }
  function explore() { markSeen(); localStorage.setItem(BROWSE_COOLDOWN_KEY, String(Date.now())); localStorage.setItem(LANGUAGE_KEY, draft.preferredLanguage); localStorage.removeItem(DRAFT_KEY); setOpen(false); router.push(recommendedPath[draft.purposes[0]] || "/"); }
  if (!open) return null;

  const headings = [dictionary.newQuestion, dictionary.callYou, dictionary.contact, dictionary.dob, dictionary.language, dictionary.purpose, dictionary.userType, dictionary.referral];
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.28 }} className="fixed inset-0 z-[100] overflow-y-auto bg-black/75 px-4 py-5 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
    <div className="mx-auto flex min-h-full max-w-5xl items-center justify-center"><motion.section initial={{ opacity: 0, y: 24, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }} className="relative w-full overflow-hidden rounded-[2rem] border shadow-2xl" style={{ borderColor: "var(--border)", background: "radial-gradient(circle at 85% 5%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 32%), var(--surface)" }}>
      <div className="border-b px-5 py-5 sm:px-8" style={{ borderColor: "var(--border)" }}>
        <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.24em]" style={{ color: "var(--accent)" }}><Headphones className="h-4 w-4" /> HYMN first listen</div><span className="text-xs" style={{ color: "var(--text-muted)" }}>{final ? "Path ready" : `Step ${step + 1} of 8 · ${progress[step]}% ${dictionary.complete}`}</span></div>
        {!final ? <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: "var(--bg-soft)" }}><div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress[step]}%`, background: "var(--accent)" }} /></div> : null}
      </div>
      <motion.div key={final ? "final" : step} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="px-5 py-5 sm:px-8 sm:py-6">
        {final ? <div className="mx-auto max-w-xl py-4 text-center"><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border" style={{ borderColor: "var(--accent)", color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 9%, transparent)" }}><Sparkles /></span><h2 id="onboarding-title" className="mt-6 text-3xl font-bold tracking-tight">Your HYMN path is ready, {draft.name}.</h2><p className="mx-auto mt-3 max-w-md leading-7" style={{ color: "var(--text-muted)" }}>Sign in with Google to save your preferences and open your HYMN workspace.</p><div className="mx-auto mt-8 max-w-sm"><GoogleAuthButton label="Sign in with Google" referralCode={draft.referralCode || undefined} onAuthenticated={afterGoogle} /><button type="button" onClick={explore} className="mt-4 w-full rounded-xl px-5 py-3 text-sm font-semibold transition hover:bg-white/5 focus:outline-none focus:ring-2" style={{ color: "var(--text-muted)" }}>Explore without signing in</button></div></div> : <>
          <div className="mb-4"><h2 id="onboarding-title" className="text-2xl font-bold tracking-tight sm:text-3xl">{headings[step]}</h2><p className="mt-1.5 text-sm leading-5" style={{ color: "var(--text-muted)" }}>{microLines[step]}</p>{step === 5 || step === 6 ? <p className="mt-2 text-xs font-semibold" style={{ color: "var(--accent)" }}>Select all that apply</p> : null}</div>
          {step === 0 ? <div className="relative overflow-hidden rounded-3xl border p-5 sm:p-7" style={{ borderColor: "var(--border)", background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, var(--bg-soft)), var(--bg-soft))" }}>
            <div className="relative z-10 max-w-xl">
              <p className="text-base leading-7" style={{ color: "var(--text-muted)" }}>If this is your first time here, we’ll shape HYMN around your music, goals, and preferred language. It only takes a moment.</p>
              <div className="mt-6">
                <button type="button" onClick={() => setStep(1)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 active:translate-y-0" style={{ background: "var(--accent)", color: "var(--bg)" }}>Yes, help me get started <ArrowRight className="h-4 w-4" /></button>
              </div>
              <div className="mt-6 flex items-center gap-3 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Already using HYMN?</span>
                <button type="button" onClick={() => { markSeen(); router.push("/login"); }} className="rounded-lg px-2 py-1 text-sm font-bold transition hover:bg-white/5 focus:outline-none focus:ring-2" style={{ color: "var(--accent)" }}>Sign in <span aria-hidden="true">→</span></button>
              </div>
            </div>
            <Disc3 className="pointer-events-none absolute -bottom-12 -right-8 h-44 w-44 rotate-12 opacity-[0.06]" aria-hidden="true" />
          </div> : null}
          {step === 1 ? <Field label="Full name / artist name" value={draft.name} onChange={value => update("name", value)} autoFocus helper="This helps us personalize your HYMN workspace." /> : null}
          {step === 2 ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Mobile number" optional value={draft.mobile} onChange={value => update("mobile", value)} type="tel" /><Field label="Email ID" optional value={draft.contactEmail} onChange={value => update("contactEmail", value)} type="email" /><p className="sm:col-span-2 text-xs leading-5" style={{ color: "var(--text-muted)" }}>Used only for important account, release, payout, or support communication.</p></div> : null}
          {step === 3 ? <div><Field label="Date of birth" value={draft.dateOfBirth} onChange={value => update("dateOfBirth", value)} type="date" helper="Use DD/MM/YYYY. Your date of birth helps us personalize your account and send birthday wishes. It is not shown publicly." />{age !== null && age < 18 ? <p className="mt-3 rounded-xl border p-3 text-xs leading-5" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Some paid services or legal actions may require guardian consent depending on your age and location.</p> : null}</div> : null}
          {step === 4 ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{languages.map(([code, label]) => <OptionCard compact key={code} title={label} icon={<Languages className="h-3.5 w-3.5" />} selected={draft.preferredLanguage === code} onClick={() => { update("preferredLanguage", code); localStorage.setItem(LANGUAGE_KEY, code); document.documentElement.lang = code; window.setTimeout(() => setStep(5), 220); }} />)}</div> : null}
          {step === 5 ? <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">{purposes.map(([title, description]) => <OptionCard key={title} title={title} description={description} icon={optionIcon(title)} selected={draft.purposes.includes(title)} onClick={() => toggleMulti("purposes", title)} />)}</div> : null}
          {step === 6 ? <div className="grid gap-2 grid-cols-2 lg:grid-cols-4">{userTypes.map(value => <OptionCard key={value} title={value} icon={optionIcon(value)} selected={draft.userTypes.includes(value)} onClick={() => toggleMulti("userTypes", value)} />)}</div> : null}
          {step === 7 ? <div><div className="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">{referrals.map(value => <OptionCard key={value} title={value} icon={optionIcon(value)} selected={draft.referralSource === value} onClick={() => update("referralSource", value)} />)}</div>{draft.referralSource === "Friend / Referral" ? <div className="mt-3"><Field label="Referral code" optional value={draft.referralCode} onChange={value => update("referralCode", value)} /></div> : null}</div> : null}
          {error ? <p className="mt-4 text-sm" style={{ color: "var(--danger)" }} role="alert">{error}</p> : null}
          {step > 0 ? <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => setStep(value => value - 1)} className="inline-flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}><ArrowLeft className="h-4 w-4" /> {dictionary.back}</button>{step !== 4 ? <button type="button" onClick={next} className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold" style={{ background: "var(--accent)", color: "var(--bg)" }}>{step === 7 ? "Build my HYMN path" : dictionary.next}<ArrowRight className="h-4 w-4" /></button> : null}</div> : null}
        </>}
      </motion.div>
    </motion.section></div>
  </motion.div>;
}

function Field({ label, optional, value, onChange, type = "text", helper, autoFocus }: { label: string; optional?: boolean; value: string; onChange: (value: string) => void; type?: string; helper?: string; autoFocus?: boolean }) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold">{label} {optional ? <span className="font-normal" style={{ color: "var(--text-muted)" }}>· optional</span> : null}</span><input autoFocus={autoFocus} type={type} value={value} onChange={event => onChange(event.target.value)} className="min-h-12 w-full rounded-xl border bg-transparent px-4 text-sm outline-none transition focus:ring-2" style={{ borderColor: "var(--border)", color: "var(--text)" }} />{helper ? <span className="mt-2 block text-xs leading-5" style={{ color: "var(--text-muted)" }}>{helper}</span> : null}</label>;
}

// vercel trigger
