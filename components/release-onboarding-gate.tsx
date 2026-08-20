"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { OnboardingLoginModal } from "@/components/onboarding-login-modal";
import { ONBOARDING_STORAGE_KEY, type OnboardingContext } from "@/lib/onboarding-client";

export function ReleaseOnboardingGate() {
  const [open, setOpen] = useState(false); const [context, setContext] = useState<OnboardingContext>({});
  useEffect(() => { try { setContext(JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || "{}")); } catch {} const timer = window.setTimeout(() => setOpen(true), 550); return () => clearTimeout(timer); }, []);
  return <>
    <div className="mx-auto w-full max-w-4xl rounded-[2rem] border bg-[var(--surface)] p-5 opacity-90 shadow-xl sm:p-8" aria-label="Release form preview">
      <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--accent)]">Step 1 · Release details</p><h2 className="mt-2 text-2xl font-semibold">Tell us what you’re releasing.</h2></div><span className="grid h-10 w-10 place-items-center rounded-full border text-[var(--accent)]"><Check className="h-5 w-5" /></span></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2"><PreviewField label="Release type" value={context.releaseType?.replace(/-/g, " ") || "Single, EP, or album"} /><PreviewField label="Release title" value="Your release title" /><PreviewField label="Primary artist" value={context.name || "Artist name"} /><PreviewField label="Previously released?" value={context.previouslyReleased ? "Yes — have UPC / ISRC ready" : "No"} /></div>
      <p className="mt-5 text-sm leading-6 text-[var(--text-muted)]">You can preview the first step here. Sign in before saving, uploading files, or creating a release draft.</p>
    </div>
    <OnboardingLoginModal open={open} title="You’ll need to log in before distribution" body="Create or access your HYMN account to save your release, upload files, submit metadata, and track its status." redirectAfterLogin="/distribution/start?onboarding=release" context={context} onClose={() => setOpen(false)} />
  </>;
}
function PreviewField({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border bg-[var(--bg-soft)] p-4"><span className="text-xs font-semibold text-[var(--text-muted)]">{label}</span><span className="mt-2 block capitalize">{value}</span></div>; }

// vercel trigger 12
