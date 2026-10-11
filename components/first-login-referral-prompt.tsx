"use client";

import { customerMessage } from "@/lib/customer-message";

import { useAccessibleDialog } from "@/components/ui/use-accessible-dialog";
import { FormEvent, useEffect, useState } from "react";

export function FirstLoginReferralPrompt() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rewards, setRewards] = useState({ referrerReward: 0, referredReward: 0 });
  const dialogRef = useAccessibleDialog(open, () => { if (!pending) void skip(); });
  useEffect(() => { fetch("/api/referrals/onboarding", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) { setOpen(Boolean(data.showPrompt)); setRewards({ referrerReward: data.referrerReward, referredReward: data.referredReward }); } }).catch(() => undefined); }, []);
  async function skip() {
    if (pending) return;
    setPending(true); setError("");
    try { const response = await fetch("/api/referrals/onboarding", { method: "POST" }); if (!response.ok) throw new Error(); setOpen(false); }
    catch { setError("Could not save your choice. Please try again."); }
    finally { setPending(false); }
  }
  async function apply(event: FormEvent) {
    event.preventDefault(); if (pending) return; setPending(true); setError("");
    try {
      const response = await fetch("/api/referrals/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralCode: code }) });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Could not apply referral code."); return; }
      setOpen(false);
    } catch { setError("Could not connect. Your code is still here; please try again."); }
    finally { setPending(false); }
  }
  if (!open) return null;
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="referral-welcome-title"><form ref={dialogRef as React.RefObject<HTMLFormElement>} onSubmit={apply} className="w-full max-w-md rounded-[1.75rem] border p-6 shadow-2xl sm:p-8" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Welcome to HYMN</p><h2 id="referral-welcome-title" className="mt-3 text-2xl font-semibold">Were you invited by someone?</h2><p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>Enter their referral code within 24 hours of signup, before your first order or subscription payment. After an eligible recurring-plan purchase, your referrer can receive ₹{rewards.referrerReward} HYMN credit following verification and admin approval.</p><label className="mt-5 grid gap-2 text-sm font-medium">Referral code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="field text-center font-semibold tracking-[0.12em]" placeholder="ENTER CODE" autoFocus maxLength={64} /></label>{error ? <p role="alert" className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{customerMessage(error)}</p> : null}<button type="submit" disabled={pending || code.length < 2} className="btn-primary pressable mt-5 w-full disabled:opacity-50">{pending ? "Checking…" : "Apply referral code"}</button><button type="button" disabled={pending} onClick={skip} className="mt-3 w-full py-2 text-sm font-medium" style={{ color: "var(--text-muted)" }}>I don’t have a code</button><p className="mt-4 text-center text-[11px] leading-5" style={{ color: "var(--text-soft)" }}>One referral per new account. Rewards are issued once and only after a qualifying payment is verified.</p></form></div>;
}
