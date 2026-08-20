"use client";

import { FormEvent, useState } from "react";
import { ProducerApplication } from "@/lib/types";

export function ProducerApplicationForm({ existingApplication }: { existingApplication: ProducerApplication | null }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      artistName: String(formData.get("artistName") || ""),
      genreFocus: String(formData.get("genreFocus") || ""),
      beatCatalogSize: Number(formData.get("beatCatalogSize")),
      experience: String(formData.get("experience") || ""),
      links: String(formData.get("links") || ""),
      message: String(formData.get("message") || "")
    };

    const response = await fetch("/api/producer/application", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    setPending(false);
    setMessage(response.ok ? "Application submitted. HYMN will review your producer request." : data.error || "Could not submit application.");
    if (response.ok) event.currentTarget.reset();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.9fr,1.1fr]">
      <div className="rounded-[2rem] border border-white/10 bg-black/20 p-6">
        <h2 className="text-2xl font-semibold text-white">Producer access workflow</h2>
        <div className="mt-5 space-y-4 text-sm text-white/65">
          <p>1. Submit your catalog details and links.</p>
          <p>2. HYMN reviews your fit, quality, and release readiness.</p>
          <p>3. Approved accounts are promoted to the producer dashboard automatically.</p>
        </div>
        {existingApplication ? (
          <div className="mt-6 rounded-2xl border border-cyan/20 bg-cyan/10 p-4 text-sm text-cyan">
            Current application: {existingApplication.status.toUpperCase()} ({existingApplication.artistName})
          </div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-5 rounded-[2rem] border border-white/10 bg-white/5 p-6 md:grid-cols-2">
        <input className="field" name="artistName" placeholder="Producer / artist name" required />
        <input className="field" name="genreFocus" placeholder="Primary genre or pocket" required />
        <input className="field" type="number" min="1" name="beatCatalogSize" placeholder="Catalog size" required />
        <input className="field" name="links" placeholder="Drive, SoundCloud, Instagram, website" required />
        <textarea className="field min-h-32 md:col-span-2" name="experience" placeholder="Production background, placements, and workflow" required />
        <textarea className="field min-h-32 md:col-span-2" name="message" placeholder="Why do you want to sell through HYMN?" required />
        <div className="md:col-span-2 flex items-center justify-between gap-4">
          <p className="text-sm text-white/55">Applications are stored in the HYMN database and reviewed from the admin panel.</p>
          <button type="submit" disabled={pending} className="rounded-full bg-cyan px-5 py-3 text-sm font-semibold text-ink">
            {pending ? "Submitting..." : "Apply as Producer"}
          </button>
        </div>
        {message ? <p className="md:col-span-2 text-sm text-white">{message}</p> : null}
      </form>
    </div>
  );
}

