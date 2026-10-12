"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function AdminReferralPayoutActions({ id }: { id: number }) {
  const router = useRouter(); const [reference, setReference] = useState(""); const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function submit(action: "paid" | "reject") {
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/referral-payouts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, note, ...(action === "paid" ? { reference } : {}) }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || "Could not review payout."); router.refresh();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not review payout."); }
    finally { setPending(false); }
  }
  return <div className="mt-3 grid gap-3"><input className="field" aria-label={`Payment reference for payout ${id}`} placeholder="Bank / UPI payment reference" value={reference} onChange={event => setReference(event.target.value)} maxLength={200}/><input className="field" aria-label={`Review note for payout ${id}`} placeholder="Review note" value={note} onChange={event => setNote(event.target.value)} maxLength={1000}/><label className="text-xs"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/> I confirm this transfer was made separately and matches this request.</label><div className="flex gap-3"><button className="btn-primary" disabled={pending || !confirmed || note.trim().length < 5 || reference.trim().length < 5} onClick={() => void submit("paid")}>Record payment</button><button className="btn-outline" disabled={pending || note.trim().length < 5} onClick={() => void submit("reject")}>Reject request</button></div><p role="alert" className="text-sm">{error}</p></div>;
}
