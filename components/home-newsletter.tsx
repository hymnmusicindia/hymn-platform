"use client";

import { FormEvent, useState } from "react";

export function HomeNewsletter({ accountEmail }: { accountEmail?: string | null }) {
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [useDifferentEmail, setUseDifferentEmail] = useState(!accountEmail);

  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = useDifferentEmail
      ? String(new FormData(form).get("email") || "").trim()
      : accountEmail?.trim() || "";
    setSending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not subscribe.");
      setMessage(`Subscribed with ${email}. You can unsubscribe from any email we send.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not subscribe.");
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={subscribe} className="w-full max-w-md">
      {accountEmail && !useDifferentEmail ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-sm font-semibold text-white">Do you want to subscribe?</p>
          <p className="mt-1 truncate text-sm text-white/65">We’ll send HYMN updates to {accountEmail}.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={sending} className="rounded-md bg-white px-5 py-2.5 text-sm font-semibold text-[#131313] transition-opacity hover:opacity-90 disabled:opacity-60">
              {sending ? "Subscribing…" : "Yes, subscribe"}
            </button>
            <button type="button" onClick={() => { setUseDifferentEmail(true); setMessage(null); }} className="text-xs font-medium text-white/65 underline decoration-white/30 underline-offset-4 hover:text-white">
              Use a different email?
            </button>
          </div>
        </div>
      ) : (
        <>
          {accountEmail ? <button type="button" onClick={() => { setUseDifferentEmail(false); setMessage(null); }} className="mb-2 text-xs font-medium text-white/65 underline decoration-white/30 underline-offset-4 hover:text-white">Use my Google email instead</button> : null}
          <div className="flex overflow-hidden rounded-md border border-[var(--border-strong)] bg-white">
            <label className="sr-only" htmlFor="home-newsletter-email">Email address</label>
            <input id="home-newsletter-email" name="email" type="email" required autoFocus={Boolean(accountEmail)} defaultValue={accountEmail || ""} placeholder="Enter your email" className="min-w-0 flex-1 border-0 bg-white px-4 py-3 text-sm text-[#131313] outline-none placeholder:text-[#777]" />
            <button type="submit" disabled={sending} className="shrink-0 bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-60">{sending ? "Subscribing…" : "Subscribe"}</button>
          </div>
        </>
      )}
      {message ? <p className="mt-3 text-xs leading-5 text-white/65" aria-live="polite">{message}</p> : null}
    </form>
  );
}
