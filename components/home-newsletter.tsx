"use client";

import { FormEvent, useState } from "react";

export function HomeNewsletter() {
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  async function subscribe(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") || "");
    setSending(true); setMessage(null);
    try {
      const response = await fetch("/api/newsletter/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not subscribe.");
      form.reset(); setMessage("You’re subscribed. You can unsubscribe from any email we send.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not subscribe."); }
    finally { setSending(false); }
  }
  return <form onSubmit={subscribe} className="w-full max-w-md"><div className="flex overflow-hidden rounded-md border border-[var(--border-strong)] bg-white"><label className="sr-only" htmlFor="home-newsletter-email">Email address</label><input id="home-newsletter-email" name="email" type="email" required placeholder="Enter your email" className="min-w-0 flex-1 border-0 bg-white px-4 py-3 text-sm text-[#131313] outline-none placeholder:text-[#777]" /><button type="submit" disabled={sending} className="shrink-0 bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-foreground)] transition-opacity hover:opacity-90 disabled:opacity-60">{sending ? "Subscribing…" : "Subscribe"}</button></div>{message ? <p className="mt-3 text-xs leading-5 text-white/65" aria-live="polite">{message}</p> : null}</form>;
}
