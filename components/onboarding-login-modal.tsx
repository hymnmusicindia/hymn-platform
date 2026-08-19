"use client";

import { X } from "lucide-react";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { ONBOARDING_SEEN_KEY, saveOnboardingContext, type OnboardingContext } from "@/lib/onboarding-client";

export function OnboardingLoginModal({ open, title, body, redirectAfterLogin, context, allowDismiss = true, secondaryLabel = "Not now", onClose }: { open: boolean; title: string; body: string; redirectAfterLogin: string; context: OnboardingContext; allowDismiss?: boolean; secondaryLabel?: string; onClose: () => void }) {
  const ref = useAccessibleDialog(open, allowDismiss ? onClose : () => {});
  if (!open) return null;
  return <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-5" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && allowDismiss) onClose(); }}>
    <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="onboarding-login-title" className="w-full rounded-t-[1.25rem] border border-white/10 bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[0_-12px_50px_rgba(0,0,0,.28)] backdrop-blur-2xl sm:max-w-[27rem] sm:rounded-[1.25rem] sm:p-7 sm:shadow-[0_28px_90px_rgba(0,0,0,.42)]">
      <div className="flex items-start justify-between gap-5"><h2 id="onboarding-login-title" className="max-w-[21rem] text-xl font-semibold leading-7 tracking-[-.025em] sm:text-[1.4rem]">{title}</h2>{allowDismiss ? <button onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--text-muted)] transition hover:bg-white/[.06] hover:text-[var(--text)] focus-visible:ring-2"><X className="h-4 w-4" /></button> : null}</div>
      <p className="mt-3 text-[.84rem] leading-6 text-[var(--text-muted)]">{body}</p>
      <div className="mt-6 border-t border-white/[.07] pt-5"><GoogleAuthButton appearance="quiet" onAuthenticated={async () => {
        saveOnboardingContext(context); localStorage.setItem(ONBOARDING_SEEN_KEY, "true");
        if (context.name) {
          const current = await fetch("/api/user/onboarding-preferences").then(response => response.ok ? response.json() : null).catch(() => null);
          if (!current?.preferences?.name) await fetch("/api/user/onboarding-preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: context.name }) }).catch(() => null);
        }
        window.location.assign(redirectAfterLogin);
      }} /></div>
      {allowDismiss ? <button onClick={onClose} className="mt-2 min-h-10 w-full rounded-lg text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text)] focus-visible:ring-2">{secondaryLabel}</button> : null}
    </section>
  </div>;
}

// vercel trigger 12
