"use client";

import { FormEvent, useState } from "react";

export function PartnershipLeadForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/partnership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(form.entries()))
    });
    const data = await response.json();
    setPending(false);
    setMessage(response.ok ? "Partnership lead submitted. HYMN will reach out shortly." : data.error || "Could not submit partnership request.");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5 rounded-[2rem] border border-border bg-white/5 p-6 md:grid-cols-2">
      <input className="field" name="name" placeholder="Your name" required />
      <input className="field" name="email" type="email" placeholder="Work email" required />
      <input className="field" name="company" placeholder="Company / collective / brand" />
      <input className="field" name="collaborationType" placeholder="Distribution, catalog, campaigns, brand, other" required />
      <textarea className="field min-h-40 md:col-span-2" name="message" placeholder="Tell HYMN what kind of partnership you want to build." required />
      <div className="md:col-span-2 flex items-center justify-between gap-4">
        <p className="text-sm text-white/55">Leads are stored in the database for admin follow-up.</p>
        <button type="submit" disabled={pending} className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-ink">
          {pending ? "Sending..." : "Send partnership request"}
        </button>
      </div>
      {message ? <p className="md:col-span-2 text-sm text-white">{message}</p> : null}
    </form>
  );
}

