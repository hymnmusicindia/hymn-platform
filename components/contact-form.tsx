"use client";

import { FormEvent, useState } from "react";

export function ContactForm() {
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    setMessage(response.ok ? "Message stored successfully. HYMN will follow up." : data.error || "Could not submit form.");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-[2rem] border border-border bg-white/5 p-6 md:grid-cols-2" style={{ background: "var(--glass-bg)" }}>
      <input className="field" name="name" placeholder="Your name" required />
      <input className="field" name="email" placeholder="Email address" type="email" required />
      <input className="field md:col-span-2" name="serviceInterest" placeholder="Service interest" />
      <textarea className="field min-h-40 md:col-span-2" name="message" placeholder="Tell HYMN what you need." required />
      <div className="md:col-span-2 flex items-center justify-between gap-4">
        <p className="text-sm"
          style={{ color: "var(--text-soft)" }}>Messages are stored in the platform database for follow-up and workflow management.</p>
        <button type="submit" className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink">
          Send inquiry
        </button>
      </div>
      {message ? (
  <p
          className="md:col-span-2 text-sm"
          style={{ color: "var(--text)" }}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
