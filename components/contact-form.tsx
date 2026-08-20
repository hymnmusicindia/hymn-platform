"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, Send } from "lucide-react";

export function ContactForm({ initialName = "", initialEmail = "" }: { initialName?: string; initialEmail?: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    setSubmitting(true);
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      setMessage(response.ok ? "Your inquiry has been sent. HYMN will follow up." : data.error || "Could not submit form.");
      if (response.ok) event.currentTarget.reset();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold text-[var(--text)]">
        Your name
        <input className="field" name="name" defaultValue={initialName} placeholder="Enter your name" required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--text)]">
        Email address
        <input className="field" name="email" defaultValue={initialEmail} placeholder="you@example.com" type="email" required />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--text)] md:col-span-2">
        Service interest
        <input className="field" name="serviceInterest" placeholder="Distribution, label services, partnerships…" />
      </label>
      <label className="grid gap-2 text-sm font-semibold text-[var(--text)] md:col-span-2">
        How can we help?
        <textarea className="field min-h-36 resize-y" name="message" placeholder="Tell HYMN what you need." required />
      </label>
      <div className="flex flex-col gap-4 border-t pt-5 md:col-span-2 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
        <p className="max-w-xl text-xs leading-5" style={{ color: "var(--text-soft)" }}>Your inquiry is securely attached to your HYMN account for follow-up.</p>
        <button type="submit" disabled={submitting} className="group inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60" style={{ background: "var(--text)", color: "var(--bg)" }}>
          <Send className="h-4 w-4" />
          {submitting ? "Sending…" : "Send inquiry"}
          {!submitting ? <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /> : null}
        </button>
      </div>
      {message ? (
        <p className="rounded-xl border px-4 py-3 text-sm md:col-span-2" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }} aria-live="polite">
          {message}
        </p>
      ) : null}
    </form>
  );
}
