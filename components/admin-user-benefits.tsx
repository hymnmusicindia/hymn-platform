"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@/lib/types";
type Benefits = { checkoutCredit: number; active: boolean; subscriptionVersion: string | null; subscription: null | { plan: string; planName: string | null; expiryDate: string; status: string; razorpaySubscriptionId: string | null } };
export function AdminUserBenefits({ user, onCreditChange, canManageSubscription = true, canAdjustCredit = true, onChanged }: { user: User; onCreditChange: (balance: number) => void; canManageSubscription?: boolean; canAdjustCredit?: boolean; onChanged?: () => void }) {
  const [benefits, setBenefits] = useState<Benefits | null>(null);
  const [plan, setPlan] = useState("half_yearly");
  const [mode, setMode] = useState("extend");
  const [days, setDays] = useState(180);
  const [note, setNote] = useState("");
  const [credit, setCredit] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const creditRequest = useRef<string | null>(null);
  async function refresh() {
    const response = await fetch(`/api/admin/users/${user.id}/benefits`, { cache: "no-store" });
    const result = await response.json(); if (!response.ok) throw Error(result.error || "Could not load benefits.");
    setBenefits(result.benefits); return result.benefits as Benefits;
  }
  useEffect(() => {
    let active = true;
    fetch(`/api/admin/users/${user.id}/benefits`, { cache: "no-store" }).then(async response => {
      const result = await response.json(); if (!response.ok) throw Error(result.error || "Could not load benefits.");
      if (active) { setBenefits(result.benefits); if (result.benefits.subscription) setPlan(result.benefits.subscription.plan); }
    }).catch(error => { if (active) setFeedback(error.message); });
    return () => { active = false; };
  }, [user.id]);
  async function mutate(method: string, payload: unknown) {
    const response = await fetch(`/api/admin/users/${user.id}/benefits`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json(); if (!response.ok) throw Error(result.error || "Could not update benefits."); return result;
  }
  async function grant(event: FormEvent, kind: "subscription" | "checkout_credit") {
    event.preventDefault(); if (busy || !benefits) return;
    if (kind === "subscription" && benefits.active && !window.confirm(`${mode === "extend" ? "Extend" : "Replace"} ${user.name}'s subscription? ${mode === "replace" ? "The new term starts now and replaces the current expiry." : "Days will be added to the current expiry."}`)) return;
    setBusy(true); setFeedback("");
    try {
      const payload = kind === "subscription" ? { kind, plan, durationDays: days, mode: benefits.active ? mode : "replace", note, expectedUpdatedAt: benefits.subscriptionVersion } : { kind, amount: Number(credit), note: creditNote, requestId: creditRequest.current ?? (creditRequest.current = crypto.randomUUID()) };
      const result = await mutate("POST", payload); setFeedback(result.message);
      if (kind === "checkout_credit") { onCreditChange(result.benefits.checkoutCredit); setCredit(""); setCreditNote(""); creditRequest.current = null; } else setNote("");
      await refresh(); onChanged?.();
    } catch (error) { setFeedback(error instanceof Error ? error.message : "Update failed."); } finally { setBusy(false); }
  }
  async function remove() {
    if (!benefits?.active || note.trim().length < 3 || busy) return;
    if (!window.confirm(`Remove subscription access from ${user.name}? Access stops immediately; payment and usage history are retained.`)) return;
    setBusy(true); setFeedback("");
    try { const result = await mutate("DELETE", { note, expectedUpdatedAt: benefits.subscriptionVersion }); setFeedback(result.message); setNote(""); await refresh(); onChanged?.(); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Removal failed."); } finally { setBusy(false); }
  }
  return <section className="grid gap-4" aria-label="Plan and credits" aria-busy={busy}>
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-semibold">Plan & checkout credits</h3><p className="text-sm text-muted">Manage access and credit without leaving the directory.</p></div><button className="btn-outline" disabled={busy} onClick={() => void refresh().catch(error => setFeedback(error.message))}>Refresh benefits</button></header>
    {feedback && <p role="status" className="surface-card p-3 text-sm">{feedback}</p>}
    {!benefits ? <p className="text-muted">Loading benefits…</p> : <div className="grid gap-5 xl:grid-cols-2">
      <form className="surface-card grid content-start gap-3 p-4" onSubmit={event => void grant(event, "subscription")}>
        <div><h4 className="font-semibold">{benefits.subscription?.planName || "No subscription"}</h4><p className="mt-1 text-sm text-muted">{benefits.subscription ? `${benefits.active ? "Active" : benefits.subscription.status} · expires ${new Date(benefits.subscription.expiryDate).toLocaleDateString("en-IN")} · ${benefits.subscription.razorpaySubscriptionId ? "Provider billing" : "Manual access"}` : "No plan recorded"}</p><p className="mt-1 text-xs text-muted">Active subscribers do not receive the first-release gift.</p></div>
        {canManageSubscription ? <><label className="grid gap-1 text-sm">Plan<select className="field" disabled={busy} value={plan} onChange={event => { setPlan(event.target.value); setDays(event.target.value === "half_yearly" ? 180 : 365); }}><option value="half_yearly">Half-Yearly</option><option value="yearly">Yearly</option><option value="yearly_plus">Yearly+</option></select></label>
        {benefits.active && <label className="grid gap-1 text-sm">Term action<select className="field" value={mode} disabled={busy} onChange={event => setMode(event.target.value)}><option value="extend">Extend current term (same plan)</option><option value="replace">Replace plan / term</option></select></label>}
        <label className="grid gap-1 text-sm">Days of access<input className="field" type="number" min={1} max={1095} required disabled={busy} value={days} onChange={event => setDays(Number(event.target.value))}/></label>
        {Number.isInteger(days) && days > 0 && days <= 1095 && <p className="text-sm text-muted">New access ends approximately {new Date((benefits.active && mode === "extend" && benefits.subscription ? new Date(benefits.subscription.expiryDate).getTime() : Date.now()) + days * 86400000).toLocaleDateString("en-IN")}. No payment will be collected by this action.</p>}
        <p className="text-xs text-muted">Manual grants: unlimited releases, plan-specific artist limits, no automatic billing. Usage and payment history are retained.</p>
        {benefits.subscription?.razorpaySubscriptionId && <p className="text-sm text-muted">Cancel active provider billing before replacing it with manual access.</p>}
        <label className="grid gap-1 text-sm">Reason<input className="field" minLength={3} maxLength={300} required value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder="Reason for this subscription change"/></label>
        <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : benefits.active ? mode === "extend" ? "Extend subscription" : "Replace subscription" : "Grant subscription"}</button>
        {benefits.active && <button type="button" className="btn-outline" disabled={busy || note.trim().length < 3} onClick={() => void remove()}>Remove subscription access</button>}</> : <p className="text-sm text-muted">Read-only subscription access.</p>}
      </form>
      <form className="surface-card grid content-start gap-3 p-4" onSubmit={event => void grant(event, "checkout_credit")}>
        <div><h4 className="font-semibold">Checkout wallet</h4><p className="mt-1 text-2xl font-semibold">₹{benefits.checkoutCredit.toLocaleString("en-IN")}</p><p className="mt-1 text-xs text-muted">Discount credit, not cash earnings or withdrawable payout balance.</p></div>
        {canAdjustCredit ? <><label className="grid gap-1 text-sm">Credit amount (INR)<input className="field" type="number" min={1} max={1000000} step={1} required disabled={busy} value={credit} onChange={event => { setCredit(event.target.value); creditRequest.current = null; }}/></label><label className="grid gap-1 text-sm">Credit reason<input className="field" minLength={3} maxLength={300} required disabled={busy} value={creditNote} onChange={event => { setCreditNote(event.target.value); creditRequest.current = null; }}/></label><button className="btn-primary" disabled={busy}>Add checkout credit</button></> : <p className="text-sm text-muted">Credit adjustment requires wallet permission.</p>}
      </form>
    </div>}
  </section>;
}
