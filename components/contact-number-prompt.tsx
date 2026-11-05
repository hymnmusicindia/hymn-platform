"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Check, ChevronDown, Phone, ShieldCheck, X } from "lucide-react";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { contactNumberToE164, contactPhoneCountries } from "@/lib/contact-phone-countries";

const promptKey = (userId: number) => `hymn-contact-number-prompt-skipped:${userId}`;
function wasSkipped(userId: number) {
  try { return sessionStorage.getItem(promptKey(userId)) === "true"; }
  catch (error) {
    console.warn("Could not read the phone prompt dismissal preference.", error);
    return false;
  }
}
function rememberSkip(userId: number) {
  try { sessionStorage.setItem(promptKey(userId), "true"); }
  catch (error) { console.warn("Could not save the phone prompt dismissal preference.", error); }
}

export function ContactNumberPrompt({ userId }: { userId: number }) {
  const [open, setOpen] = useState(false);
  const [country, setCountry] = useState("IN");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useAccessibleDialog(open, () => dismiss());
  const selectedCountry = contactPhoneCountries.find(item => item.code === country) ?? contactPhoneCountries[0];

  useEffect(() => {
    if (wasSkipped(userId)) return;
    let active = true;
    fetch("/api/user/contact-number", { cache: "no-store" })
      .then(async response => {
        if (!response.ok) throw new Error("Could not check your contact details.");
        const result = await response.json() as { hasPhone?: boolean };
        if (active && !result.hasPhone && !wasSkipped(userId)) setOpen(true);
      })
      .catch(cause => console.error("Customer phone prompt status check failed", cause));
    return () => { active = false; };
  }, [userId]);

  function dismiss() {
    rememberSkip(userId);
    setOpen(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      contactNumberToE164(selectedCountry.dialCode, phone);
      const response = await fetch("/api/user/contact-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dialCode: selectedCountry.dialCode, phone })
      });
      const result = await response.json().catch(() => ({})) as { success?: boolean; error?: string };
      if (!response.ok || !result.success) throw new Error(result.error || "We couldn't save your number. Please try again.");
      rememberSkip(userId);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "We couldn't save your number. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return <div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/55 px-0 backdrop-blur-sm sm:items-center sm:px-5 sm:py-6" onMouseDown={event => { if (event.target === event.currentTarget && !busy) dismiss(); }}>
    <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="contact-number-title" aria-describedby="contact-number-description" className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-[1.7rem] border border-[var(--border)] bg-[var(--card)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-16px_60px_rgba(0,0,0,.3)] sm:max-w-lg sm:rounded-[1.7rem] sm:p-8 sm:shadow-[0_30px_100px_rgba(0,0,0,.4)]">
      <button type="button" onClick={dismiss} disabled={busy} aria-label="Skip adding a phone number" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50"><X size={18}/></button>
      <div className="grid h-12 w-12 place-items-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]"><Phone size={21}/></div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[.15em] text-[var(--accent)]">A smoother HYMN experience</p>
      <h2 id="contact-number-title" className="mt-2 max-w-sm text-2xl font-semibold leading-tight tracking-[-.03em] sm:text-[1.8rem]">A good way to reach you, when it matters.</h2>
      <p id="contact-number-description" className="mt-3 text-sm leading-6 text-[var(--text-muted)]">Add a number so our team can help faster with release updates, account questions, or support you request. It stays in your private HYMN contact card—not on your public artist profile. Sharing is optional.</p>
      <form className="mt-6" onSubmit={event => void save(event)}>
        <label htmlFor="contact-country" className="mb-2 block text-sm font-medium">Your phone number</label>
        <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-2">
          <div className="relative">
            <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg">{selectedCountry.flag}</span>
            <select id="contact-country" aria-label="Country calling code" value={country} onChange={event => setCountry(event.target.value)} disabled={busy} className="h-12 w-full appearance-none rounded-xl border border-[var(--border)] bg-[var(--surface)] py-2 pl-11 pr-9 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25">
              {contactPhoneCountries.map(item => <option key={item.code} value={item.code}>{item.flag} {item.name} (+{item.dialCode})</option>)}
            </select>
            <ChevronDown aria-hidden="true" size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
          </div>
          <input aria-label="Phone number" type="tel" inputMode="tel" autoComplete="tel-national" required maxLength={24} value={phone} onChange={event => { setPhone(event.target.value); setError(""); }} placeholder="Phone number" disabled={busy} className="h-12 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/25"/>
        </div>
        <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-[var(--text-muted)]"><ShieldCheck size={14} className="mt-0.5 shrink-0"/>We’ll use it for HYMN account support and updates. You can change or remove it in account settings.</p>
        {error ? <p role="alert" className="mt-3 rounded-xl border border-[var(--danger)]/40 bg-[var(--danger)]/5 px-3 py-2 text-sm text-[var(--danger)]">{error}</p> : null}
        <button type="submit" disabled={busy || !phone.trim()} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-contrast,var(--background))] shadow-sm transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55">
          {busy ? "Saving securely…" : <><Check size={17}/>Add my number</>}
        </button>
        <button type="button" disabled={busy} onClick={dismiss} className="mt-2 min-h-11 w-full rounded-xl px-4 text-sm font-medium text-[var(--text-muted)] transition hover:bg-[var(--hover)] hover:text-[var(--text)] disabled:opacity-50">Maybe later</button>
      </form>
    </section>
  </div>;
}
