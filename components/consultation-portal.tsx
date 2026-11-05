"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, LoaderCircle, ShieldCheck, Sparkles } from "lucide-react";
import { EmailAuthForm } from "@/components/email-auth-form";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { contactNumberToE164, contactPhoneCountries } from "@/lib/contact-phone-countries";
import { CONSULTATION_INTERESTS, type CONSULTATION_STATUSES } from "@/lib/consultation-domain";
import styles from "./consultation-portal.module.css";

type Interest = (typeof CONSULTATION_INTERESTS)[number]["id"];
type FunnelEvent = "CONSULTATION_PAGE_VIEWED" | "CTA_CLICKED" | "NAME_SUBMITTED" | "AUTHENTICATION_STARTED" | "AUTHENTICATION_COMPLETED" | "PHONE_SUBMITTED" | "INTERESTS_SELECTED" | "SLOT_SELECTED" | "CONSULTATION_SUBMITTED";
type UTM = { source: string; medium: string; campaign: string; content: string; term: string };
type Draft = {
  fullName: string;
  phone: string;
  dialCode: string;
  countryCode: string;
  interests: Interest[];
  otherRequirement: string;
  callbackAt: string | null;
  consent: boolean;
  marketingConsent: boolean;
  idempotencyKey: string;
  funnelEvents: FunnelEvent[];
  utm: UTM;
  source: string;
  campaign: string;
  referralUrl: string;
  landingPageUrl: string;
  referrer: string;
  firstTouchSource: string;
  latestTouchSource: string;
};
type SlotData = { timezone: string; dates: { date: string; slots: string[] }[] };
type Account = { id: number; name: string; email: string; mobile: string | null };
type Confirmation = { id: string; fullName: string; email: string; phone: string; interests: Interest[]; preferredCallback: string | null; status: (typeof CONSULTATION_STATUSES)[number]; assigned: boolean };
type Stored = { step?: number; draft?: Partial<Draft> };

const STORAGE_KEY = "hymn-consultation-draft-v1";
const emptyUtm: UTM = { source: "", medium: "", campaign: "", content: "", term: "" };
const newDraft = (): Draft => ({
  fullName: "", phone: "", dialCode: "91", countryCode: "IN", interests: [], otherRequirement: "", callbackAt: null,
  consent: false, marketingConsent: false, idempotencyKey: crypto.randomUUID(), funnelEvents: ["CONSULTATION_PAGE_VIEWED"],
  utm: emptyUtm, source: "website", campaign: "", referralUrl: "", landingPageUrl: "/consultation", referrer: "",
  firstTouchSource: "website", latestTouchSource: "website"
});

function sourceFrom(utm: UTM, referrer: string) {
  if (utm.source) return utm.source;
  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host.includes("instagram")) return "instagram";
    if (host.includes("whatsapp")) return "whatsapp";
    if (host) return host.replace(/^www\./, "");
  } catch { /* Missing or non-URL referrer uses the website default. */ }
  return "website";
}

function addEvent(draft: Draft, event: FunnelEvent): Draft {
  return { ...draft, funnelEvents: draft.funnelEvents.includes(event) ? draft.funnelEvents : [...draft.funnelEvents, event] };
}

function formatSlot(date: string, timeZone: string, reference?: string) {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", month: "short", day: "numeric", timeZone }).format(reference ? new Date(reference) : new Date(`${date}T12:00:00+05:30`));
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone, hour12: true }).format(new Date(value));
}

const statusMessage: Record<Confirmation["status"], string> = {
  NEW_LEAD: "Your consultation request has been received.",
  UNASSIGNED: "Your request is received. Our team will arrange the right contact.",
  ASSIGNED: "Your request is with the HYMN team. We will contact you shortly.",
  CALLBACK_SCHEDULED: "Your callback time is reserved with the HYMN team.",
  CONTACTED: "The HYMN team is in touch with you.",
  CONSULTATION_COMPLETED: "Your consultation is complete.",
  FOLLOW_UP_REQUIRED: "The HYMN team will follow up with you.",
  CONVERTED: "Your HYMN journey is underway.",
  NOT_INTERESTED: "Your request has been updated.",
  LOST: "Your request has been updated."
};

export function ConsultationPortal() {
  const [draft, setDraft] = useState<Draft>(() => newDraft());
  const [step, setStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [slots, setSlots] = useState<SlotData | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [timeZone, setTimeZone] = useState("Asia/Kolkata");
  const [visitorTimeZone, setVisitorTimeZone] = useState("");
  const [countrySearch, setCountrySearch] = useState("");
  const [slotRetry, setSlotRetry] = useState(0);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const selectedCountry = contactPhoneCountries.find(country => country.code === draft.countryCode) || contactPhoneCountries[0];
  const selectedDateSlots = slots?.dates.find(item => item.date === selectedDate)?.slots || [];
  const hasSlots = Boolean(slots?.dates.some(item => item.slots.length));
  const progress = Math.max(0, Math.min(5, step - 1));
  const progressLabel = step > 0 && step < 6 ? `Step ${step} of 5` : "";
  const serviceTitles = useMemo(() => new Map(CONSULTATION_INTERESTS.map(item => [item.id, item.title])), []);

  useEffect(() => {
    let restoredStep = 0;
    let storedDraft: Partial<Draft> | null = null;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Stored;
        restoredStep = Number.isInteger(parsed.step) && parsed.step! >= 0 && parsed.step! <= 5 ? parsed.step! : 0;
        storedDraft = parsed.draft || null;
      }
    } catch (cause) {
      console.warn("Consultation draft could not be restored.", cause);
    }

    const query = new URLSearchParams(window.location.search);
    const utm: UTM = {
      source: query.get("utm_source")?.slice(0, 160) || "",
      medium: query.get("utm_medium")?.slice(0, 160) || "",
      campaign: query.get("utm_campaign")?.slice(0, 160) || "",
      content: query.get("utm_content")?.slice(0, 160) || "",
      term: query.get("utm_term")?.slice(0, 160) || ""
    };
    const referrer = document.referrer.slice(0, 1000);
    const latestTouchSource = sourceFrom(utm, referrer);
    const defaults = newDraft();
    const restored: Draft = {
      ...defaults,
      ...storedDraft,
      idempotencyKey: storedDraft?.idempotencyKey || defaults.idempotencyKey,
      utm: { ...emptyUtm, ...storedDraft?.utm, ...Object.fromEntries(Object.entries(utm).filter(([, value]) => value)) },
      referrer: storedDraft?.referrer || referrer,
      referralUrl: storedDraft?.referralUrl || referrer,
      landingPageUrl: `${window.location.pathname}${window.location.search}`.slice(0, 1000),
      firstTouchSource: storedDraft?.firstTouchSource || latestTouchSource,
      latestTouchSource,
      source: latestTouchSource,
      campaign: utm.campaign || storedDraft?.campaign || ""
    };
    setDraft(addEvent(restored, "CONSULTATION_PAGE_VIEWED"));
    setStep(restoredStep);
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && browserZone !== "Asia/Kolkata") setVisitorTimeZone(browserZone);
    setHydrated(true);
    void fetch("/api/consultation?mode=profile", { cache: "no-store" }).then(async response => {
      if (!response.ok) {
        if (restoredStep >= 3) setStep(2);
        return;
      }
      const result = await response.json() as { account: Account };
      setAccount(result.account);
      setDraft(current => {
        if (current.phone || !result.account.mobile) return { ...current, fullName: current.fullName || result.account.name };
        const mobile = result.account.mobile!;
        const match = [...contactPhoneCountries].sort((a, b) => b.dialCode.length - a.dialCode.length).find(country => mobile.startsWith(`+${country.dialCode}`));
        return match
          ? { ...current, fullName: current.fullName || result.account.name, countryCode: match.code, dialCode: match.dialCode, phone: mobile.slice(match.dialCode.length + 1) }
          : { ...current, fullName: current.fullName || result.account.name };
      });
      setStep(current => current === 2 ? 3 : current);
    }).catch(cause => {
      console.error("Consultation account check failed.", cause);
      if (restoredStep >= 3) setStep(2);
    });
  }, []);

  useEffect(() => {
    if (!hydrated || confirmation) return;
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ step, draft } satisfies Stored)); }
    catch (cause) { console.warn("Consultation draft could not be saved in this browser session.", cause); }
  }, [draft, hydrated, step, confirmation]);

  useEffect(() => {
    if (step !== 5 || !account || slots || loadingSlots) return;
    let active = true;
    setLoadingSlots(true);
    fetch("/api/consultation?mode=slots", { cache: "no-store" })
      .then(async response => {
        const result = await response.json() as SlotData & { error?: string };
        if (!response.ok) throw new Error(result.error || "Callback availability could not be loaded.");
        if (active) {
          setSlots(result);
          const availableDates = result.dates.filter(item => item.slots.length).map(item => item.date);
          setSelectedDate(current => availableDates.includes(current) ? current : availableDates[0] || "");
          setDraft(current => current.callbackAt && !result.dates.some(item => item.slots.includes(current.callbackAt!)) ? { ...current, callbackAt: null, consent: false } : current);
        }
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Callback availability could not be loaded."); })
      .finally(() => { if (active) setLoadingSlots(false); });
    return () => { active = false; };
  }, [account, loadingSlots, slotRetry, slots, step]);

  function record(event: FunnelEvent) {
    setDraft(current => addEvent(current, event));
  }

  async function completeAuthentication() {
    let lastError = "HYMN sign-in could not be confirmed. Please try again.";
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise(resolve => window.setTimeout(resolve, attempt * 200));
      const response = await fetch("/api/consultation?mode=profile", { cache: "no-store", credentials: "same-origin" });
      const result = await response.json().catch(() => ({})) as { account?: Account; error?: string };
      if (response.ok && result.account) {
        setAccount(result.account);
        setDraft(current => addEvent({ ...current, fullName: current.fullName || result.account!.name }, "AUTHENTICATION_COMPLETED"));
        setError("");
        setStep(3);
        return;
      }
      lastError = result.error || lastError;
      if (response.status !== 401) break;
    }
    throw new Error(lastError);
  }

  function continueName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = draft.fullName.trim();
    if (name.length < 2 || name.length > 120) {
      setError("Enter your full name so our team knows what to call you.");
      return;
    }
    setDraft(current => addEvent({ ...current, fullName: name }, "NAME_SUBMITTED"));
    setError("");
    if (account) setStep(3);
    else {
      record("AUTHENTICATION_STARTED");
      setStep(2);
    }
  }

  function continuePhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { contactNumberToE164(draft.dialCode, draft.phone); }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : "Enter a valid phone number.");
      return;
    }
    setDraft(current => addEvent(current, "PHONE_SUBMITTED"));
    setError("");
    setStep(4);
  }

  function toggleInterest(id: Interest) {
    setDraft(current => addEvent({
      ...current,
      interests: current.interests.includes(id) ? current.interests.filter(value => value !== id) : [...current.interests, id]
    }, "INTERESTS_SELECTED"));
    setError("");
  }

  function selectCallback(value: string | null) {
    setDraft(current => ({ ...current, callbackAt: value, consent: false }));
    if (value) record("SLOT_SELECTED");
    setError("");
  }

  async function submitConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account || busy) return;
    if (!draft.interests.length) { setError("Choose at least one service so we can connect you with the right team."); return; }
    if (draft.interests.includes("OTHER") && !draft.otherRequirement.trim()) { setError("Tell us a little more about the other service you need."); return; }
    if (hasSlots && !draft.callbackAt) { setError("Choose an available callback time, or wait until no slots are available to request an arranged callback."); return; }
    if (!draft.consent) { setError("Please agree to the consultation privacy notice to submit your request."); return; }
    setBusy(true);
    setError("");
    try {
      const phone = contactNumberToE164(draft.dialCode, draft.phone);
      const { countryCode: _countryCode, ...submission } = draft;
      void _countryCode;
      const response = await fetch("/api/consultation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...submission, phone, callbackAt: draft.callbackAt, consent: true })
      });
      const result = await response.json() as Confirmation & { error?: string };
      if (!response.ok) throw new Error(result.error || "We couldn't submit your consultation request. Please try again.");
      setConfirmation(result);
      setStep(6);
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (cause) { console.warn("Consultation draft could not be cleared.", cause); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't submit your consultation request. Please try again.");
    } finally { setBusy(false); }
  }

  function goBack() {
    setError("");
    if (step === 3 && !account) setStep(2);
    else if (step > 1 && step < 6) setStep(step - 1);
    else setStep(0);
  }

  return <main className={`${styles.page} ${step > 0 ? styles.wizardPage : ""}`}>
    <header className={styles.topbar}>
      <Link href="/" aria-label="HYMN Music home" className={styles.brand}><Image src="/assets/hymn-logo-320.webp" alt="HYMN Music" width={156} height={52} className={styles.logo} priority /></Link>
      <Link href="/" className={styles.exitLink}>Back to HYMN <ArrowRight size={14}/></Link>
    </header>

    {step > 0 && step < 6 ? <div className={styles.progressWrap} aria-label={progressLabel}>
      <div className={styles.progressMeta}><button type="button" className={styles.backButton} onClick={goBack}><ArrowLeft size={16}/>Back</button><span>{progressLabel}</span></div>
      <div className={styles.progressTrack} role="progressbar" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step}><span style={{ width: `${progress * 20}%` }}/></div>
    </div> : null}

    <div className={`${styles.shell} ${step > 0 ? styles.wizardShell : ""}`}>
      {step === 0 ? <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><Sparkles size={14}/> ARTIST CONSULTATION</span>
          <h1>Your next move<br/>in music, made clear.</h1>
          <p>A free, focused conversation about your music goals.</p>
          <span className={styles.freeNote}><Check size={14}/> No charge. No obligation.</span>
        </div>
        <button type="button" className={styles.heroNextButton} onClick={() => { record("CTA_CLICKED"); setStep(1); if (account) setDraft(current => ({ ...current, fullName: current.fullName || account.name })); }}>
          <span>Next</span><ArrowRight size={25} strokeWidth={1.5}/>
        </button>
      </section> : null}

      {step === 1 ? <section className={styles.formStep}>
        <span className={styles.eyebrow}>01 / ABOUT YOU</span><h1>What’s your name?</h1>
        <form onSubmit={continueName} className={styles.form}>
          <label htmlFor="consultation-name">Full name</label>
          <input id="consultation-name" name="name" autoComplete="name" autoFocus maxLength={120} required value={draft.fullName} onChange={event => { setDraft(current => ({ ...current, fullName: event.target.value })); setError(""); }} placeholder="Your full name"/>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primaryButton} type="submit">Continue <ArrowRight size={17}/></button>
        </form>
      </section> : null}

      {step === 2 ? <section className={styles.formStep}>
        <span className={styles.eyebrow}>02 / YOUR ACCOUNT</span><h1>Continue with HYMN</h1><p>Sign in or create your account to save your consultation.</p>
        <div className={styles.authCard}>
          <EmailAuthForm signup askForName={false} initialName={draft.fullName} returnTo="/consultation" onAuthenticated={completeAuthentication} showCallbackErrors/>
          <div className={styles.authDivider}><span/>or<span/></div>
          <GoogleAuthButton label="Continue with Google" expectedRole="customer" appearance="quiet" className={styles.googleButton} onAuthenticated={completeAuthentication}/>
        </div>
        <p className={styles.securityNote}><ShieldCheck size={15}/> Your HYMN sign-in keeps your request with your profile.</p>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </section> : null}

      {step === 3 ? <section className={styles.formStep}>
        <span className={styles.eyebrow}>03 / CONTACT</span><h1>Where can we reach you?</h1>
        {account ? <div className={styles.accountPill}><CheckCircle2 size={16}/><span>Signed in as <strong>{account.email}</strong></span></div> : null}
        <form onSubmit={continuePhone} className={styles.form}>
          <label htmlFor="consultation-country">Phone number</label>
          <div className={styles.phoneRow}>
            <div className={styles.countryField}>
              <input id="consultation-country" role="combobox" aria-expanded={Boolean(countrySearch)} aria-controls="consultation-country-options" value={countrySearch || `${selectedCountry.name} (+${selectedCountry.dialCode})`} onFocus={() => setCountrySearch("")} onChange={event => setCountrySearch(event.target.value)} onKeyDown={event => { if (event.key === "Escape") setCountrySearch(""); }} aria-label="Search country and calling code" autoComplete="country-name"/>
              {countrySearch ? <div id="consultation-country-options" role="listbox" className={styles.countryOptions}>{contactPhoneCountries.filter(country => `${country.name} ${country.dialCode}`.toLowerCase().includes(countrySearch.toLowerCase().replace("+", ""))).slice(0, 8).map(country => <button key={country.code} type="button" role="option" aria-selected={country.code === draft.countryCode} onClick={() => { setDraft(current => ({ ...current, countryCode: country.code, dialCode: country.dialCode })); setCountrySearch(""); }}>{country.flag} {country.name} <span>+{country.dialCode}</span></button>)}</div> : null}
              <span className={styles.countryFlag} aria-hidden="true">{selectedCountry.flag}</span><ChevronDown size={14} aria-hidden="true"/>
            </div>
            <input id="consultation-phone" aria-label="Phone number" type="tel" inputMode="tel" autoComplete="tel-national" maxLength={24} required value={draft.phone} onChange={event => { setDraft(current => ({ ...current, phone: event.target.value })); setError(""); }} placeholder="Phone number"/>
          </div>
          <p className={styles.privacy}><ShieldCheck size={15}/>Used only to arrange your consultation. <Link href="/privacy-policy" target="_blank">Privacy policy</Link></p>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primaryButton} type="submit">Continue <ArrowRight size={17}/></button>
        </form>
      </section> : null}

      {step === 4 ? <section className={styles.formStep}>
        <span className={styles.eyebrow}>04 / YOUR GOALS</span><h1>What do you need help with?</h1><p>Select all that apply.</p>
        <div className={styles.choiceGrid} role="group" aria-label="Select services that interest you">
          {CONSULTATION_INTERESTS.map(item => {
            const active = draft.interests.includes(item.id);
            return <button key={item.id} type="button" aria-pressed={active} onClick={() => toggleInterest(item.id)} className={`${styles.choiceCard} ${active ? styles.choiceSelected : ""}`}>
              <span className={styles.choiceCheck}>{active ? <Check size={13}/> : null}</span><strong>{item.title}</strong>
            </button>;
          })}
        </div>
        {draft.interests.includes("OTHER") ? <label className={styles.otherLabel} htmlFor="other-requirement">Tell us what you are looking for.<textarea id="other-requirement" rows={4} maxLength={2000} required value={draft.otherRequirement} onChange={event => setDraft(current => ({ ...current, otherRequirement: event.target.value }))} placeholder="Share a little context so we can prepare."/></label> : null}
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
        <button type="button" className={styles.primaryButton} onClick={() => { if (!draft.interests.length) { setError("Choose at least one service to continue."); return; } if (draft.interests.includes("OTHER") && !draft.otherRequirement.trim()) { setError("Tell us what you are looking for."); return; } setError(""); setStep(5); }}>Next <ArrowRight size={17}/></button>
      </section> : null}

      {step === 5 ? <section className={styles.formStep}>
        <span className={styles.eyebrow}>05 / CALLBACK</span><h1>Choose a callback time</h1><p>Times shown in your local timezone.</p>
        <div className={styles.timeZoneRow}><label htmlFor="consultation-timezone">Show times in</label><select id="consultation-timezone" value={timeZone} onChange={event => setTimeZone(event.target.value)}><option value="Asia/Kolkata">India Standard Time (IST)</option>{visitorTimeZone ? <option value={visitorTimeZone}>{visitorTimeZone.replaceAll("_", " ")}</option> : null}</select></div>
        {loadingSlots ? <div className={styles.loading}><LoaderCircle size={18} className={styles.spin}/> Checking team availability…</div> : null}
        {!loadingSlots && slots && hasSlots ? <>
          <div className={styles.dateChoices} role="group" aria-label="Available callback dates">{slots.dates.filter(item => item.slots.length).map(item => <button key={item.date} type="button" className={selectedDate === item.date ? styles.dateActive : ""} aria-pressed={selectedDate === item.date} onClick={() => { setSelectedDate(item.date); selectCallback(null); }}>{formatSlot(item.date, timeZone, item.slots[0])}</button>)}</div>
          <div className={styles.slotGrid} role="group" aria-label="Available callback times">{selectedDateSlots.map(value => <button key={value} type="button" className={draft.callbackAt === value ? styles.slotActive : ""} aria-pressed={draft.callbackAt === value} onClick={() => selectCallback(value)}>{formatTime(value, timeZone)}</button>)}</div>
          {draft.callbackAt ? <div className={styles.selectedSlot}><CheckCircle2 size={17}/><span>Selected: <strong>{formatSlot(selectedDate, timeZone, draft.callbackAt)} · {formatTime(draft.callbackAt, timeZone)}</strong> ({timeZone === "Asia/Kolkata" ? "IST" : timeZone})</span></div> : null}
        </> : null}
        {!loadingSlots && slots && !hasSlots ? <div className={styles.noSlots}><CalendarDaysIcon/><div><strong>No callback times are available right now.</strong><p>You can still send your request. The HYMN team will contact you to arrange a convenient time.</p></div></div> : null}
        {!slots && !loadingSlots ? <div className={styles.noSlots}><CalendarDaysIcon/><div><strong>Availability could not be checked.</strong><p>Try again to confirm a real time, or return to your service selections.</p><button type="button" onClick={() => { setSlots(null); setError(""); setSlotRetry(value => value + 1); }}>Try again</button></div></div> : null}
        {slots && (!hasSlots || draft.callbackAt) ? <div className={styles.selectedServices}><span>CONSULTATION FOCUS</span><p>{draft.interests.map(id => serviceTitles.get(id)).filter(Boolean).join(" · ")}</p></div> : null}
        <form className={styles.consentForm} onSubmit={submitConsultation}>
          <p className={styles.privacyNotice}>We use your name, email, phone, selections and referral details to arrange and manage this consultation. Request access, correction or deletion via <Link href="/contact" target="_blank">Support</Link>. <Link href="/privacy-policy" target="_blank">Privacy policy</Link>.</p>
          <label className={styles.checkboxLabel}><input type="checkbox" checked={draft.consent} onChange={event => setDraft(current => ({ ...current, consent: event.target.checked }))}/><span>I agree that HYMN may use the details I provided to respond to and manage this consultation request. See the <Link href="/privacy-policy" target="_blank">Privacy Policy</Link>.</span></label>
          <label className={styles.checkboxLabel}><input type="checkbox" checked={draft.marketingConsent} onChange={event => setDraft(current => ({ ...current, marketingConsent: event.target.checked }))}/><span>Optional: email me HYMN news and music-industry updates. This is not required for a consultation.</span></label>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
          <button className={styles.primaryButton} type="submit" disabled={busy || loadingSlots || !slots || (hasSlots && !draft.callbackAt)}>{busy ? <><LoaderCircle size={17} className={styles.spin}/> Sending request…</> : <>Confirm my free consultation <ArrowRight size={17}/></>}</button>
        </form>
      </section> : null}

      {step === 6 && confirmation ? <section className={styles.successStep}>
        <span className={styles.successIcon}><CheckCircle2 size={30}/></span><span className={styles.eyebrow}>REQUEST RECEIVED</span>
        <h1>You’re one step closer to growing your music career.</h1><p className={styles.successCopy}>{statusMessage[confirmation.status]} We’ll connect with you shortly.</p>
        <div className={styles.summaryCard}>
          <div><span>NAME</span><strong>{confirmation.fullName}</strong></div>
          <div><span>HYMN ACCOUNT</span><strong>{confirmation.email}</strong></div>
          <div><span>PHONE</span><strong>{confirmation.phone}</strong></div>
          <div><span>CONSULTATION FOCUS</span><strong>{confirmation.interests.map(id => serviceTitles.get(id) || id).join(", ")}</strong></div>
          <div><span>CALLBACK</span><strong>{confirmation.preferredCallback ? `${new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone, hour12: true }).format(new Date(confirmation.preferredCallback))} ${timeZone === "Asia/Kolkata" ? "IST" : timeZone}` : "HYMN will contact you to arrange a time"}</strong></div>
          <div><span>STATUS</span><strong>{statusMessage[confirmation.status]}</strong></div>
        </div>
        <Link href="/" className={styles.primaryButton}>Return to HYMN <ArrowRight size={17}/></Link>
      </section> : null}
    </div>

    {step === 0 ? <footer className={styles.footer}><span>HYMN MUSIC · BUILT FOR THE NEXT CHAPTER</span><Link href="/privacy-policy">Privacy</Link></footer> : null}
  </main>;
}

function CalendarDaysIcon() {
  return <span className={styles.calendarIcon} aria-hidden="true"><span/><span/><i/></span>;
}
