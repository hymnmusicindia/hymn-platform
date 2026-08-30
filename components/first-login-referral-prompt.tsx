"use client";

import { FormEvent, useEffect, useState } from "react";

export function FirstLoginReferralPrompt() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [rewards, setRewards] = useState({ referrerReward: 5, referredReward: 3 });
  useEffect(() => { fetch("/api/referrals/onboarding", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => { if (data) { setOpen(Boolean(data.showPrompt)); setRewards({ referrerReward: data.referrerReward, referredReward: data.referredReward }); } }).catch(() => undefined); }, []);
  if (!open) return null;
  async function skip() { setPending(true); await fetch("/api/referrals/onboarding", { method: "POST" }).catch(() => undefined); setOpen(false); }
  async function apply(event: FormEvent) {
    event.preventDefault(); setPending(true); setError("");
    const validation = await fetch(`/api/referrals/validate/${encodeURIComponent(code.trim())}`, { cache: "no-store" });
    if (!validation.ok) { setPending(false); setError("That referral code was not found or is not eligible."); return; }
    const response = await fetch("/api/referrals/apply", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ referralCode: code }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { setPending(false); setError(data.error || "Could not apply referral code."); return; }
    setOpen(false);
  }
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="referral-welcome-title"><form onSubmit={apply} className="w-full max-w-md rounded-[1.75rem] border p-6 shadow-2xl sm:p-8" style={{ borderColor: "var(--border)", background: "var(--card)" }}><p className="text-[10px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--accent)" }}>Welcome to HYMN</p><h2 id="referral-welcome-title" className="mt-3 text-2xl font-semibold">Were you invited by someone?</h2><p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>Enter their referral code now. After your first verified paid purchase, they receive ₹{rewards.referrerReward} and you receive ₹{rewards.referredReward} in HYMN credit.</p><label className="mt-5 grid gap-2 text-sm font-medium">Referral code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} className="field text-center font-semibold tracking-[0.12em]" placeholder="ENTER CODE" autoFocus maxLength={64} /></label>{error ? <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>{error}</p> : null}<button type="submit" disabled={pending || code.length < 2} className="btn-primary pressable mt-5 w-full disabled:opacity-50">{pending ? "Checking…" : "Apply referral code"}</button><button type="button" disabled={pending} onClick={skip} className="mt-3 w-full py-2 text-sm font-medium" style={{ color: "var(--text-muted)" }}>I don’t have a code</button><p className="mt-4 text-center text-[11px] leading-5" style={{ color: "var(--text-soft)" }}>One referral per new account. Rewards are issued once and only after a qualifying payment is verified.</p></form></div>;
}
