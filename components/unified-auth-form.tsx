"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Check } from "lucide-react";
import { useState } from "react";
import { GoogleAuthButton } from "@/components/google-auth-button";
import type { UserRole } from "@/lib/types";

type AuthRole = Exclude<UserRole, "admin">;
type AuthMode = "login" | "signup";

export function UnifiedAuthForm({
  initialRole = "customer",
  initialMode = "login",
  initialReferralCode,
  referralError,
  invitedBy,
  returnTo,
}: {
  initialRole?: AuthRole;
  initialMode?: AuthMode;
  initialReferralCode?: string;
  referralError?: string;
  invitedBy?: string;
  returnTo?:string;
}) {
  const [code, setCode] = useState(initialReferralCode || "");
  const [appliedCode, setAppliedCode] = useState(initialReferralCode || "");
  const [applying, setApplying] = useState(false);
  const [referralState, setReferralState] = useState<string | null>(referralError ? "This invitation is unavailable. Ask your friend for a new link, or continue without a referral." : initialReferralCode ? "Referral code applied" : null);

  async function applyReferralCode() {
    if (applying) return;
    setApplying(true); setReferralState(null);
    try {
      const response = await fetch("/api/referrals/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralCode: code }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Referral code is not valid.");
      setAppliedCode(body.referralCode); setCode(body.referralCode); setReferralState("Referral code applied");
    } catch (error) { setReferralState(error instanceof Error ? error.message : "Could not check this code. Try again."); }
    finally { setApplying(false); }
  }

  return (
    <section className="auth-minimal mx-auto flex min-h-[70svh] w-full max-w-xl flex-col justify-center px-1 py-10 sm:px-6">
      <Link href="/" className="mb-14 inline-flex w-fit items-center gap-2 py-2 text-sm font-semibold text-[var(--text-muted)] transition hover:text-[var(--text)]">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div className="flex justify-center">
        <Image src="/assets/hymnlogowhite.png" alt="HYMN" width={184} height={60} priority className="h-auto w-36 object-contain sm:w-44" style={{ filter: "var(--logo-filter)" }} />
      </div>
      <div className="mt-10 border-t border-[var(--border)] pt-8">
        {invitedBy ? <div className="mb-6 flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--bg-soft)] text-lg font-semibold">{invitedBy.slice(0, 1).toUpperCase()}</span><div><p className="text-sm font-medium">{invitedBy} invited you to HYMN</p><p className="mt-1 text-xs text-[var(--text-muted)]">Create your account. Your referral connects automatically.</p></div></div> : null}
        {initialMode === "signup" || initialReferralCode || referralError ? <details className="mb-4 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }} open={Boolean(initialReferralCode || referralError)}>
          <summary className="cursor-pointer text-sm font-medium">Have a referral code? <span className="font-normal" style={{ color: "var(--text-soft)" }}>Optional</span></summary>
          <div className="mt-3 flex gap-2"><input className="field min-w-0 flex-1 uppercase" value={code} onChange={event => { setCode(event.target.value); setReferralState(null); }} placeholder="Enter code" maxLength={24} /><button type="button" className="btn-outline pressable" disabled={applying} onClick={applyReferralCode}>{applying ? "Checking..." : "Apply"}</button></div>
          {appliedCode && code !== appliedCode ? <p className="mt-2 text-xs">{appliedCode} stays applied until you apply a new code.</p> : null}
          {referralState ? <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: referralState === "Referral code applied" ? "var(--success)" : "var(--danger)" }}>{referralState === "Referral code applied" ? <Check className="h-3.5 w-3.5" /> : null}{referralState}</p> : null}
        </details> : null}
        <GoogleAuthButton returnTo={returnTo} label="Continue with Google" className="w-full" appearance="quiet" expectedRole={initialRole} referralCode={appliedCode || undefined} autoPrompt />
      </div>
    </section>
  );
}

// vercel trigger 12
