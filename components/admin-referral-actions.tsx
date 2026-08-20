"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function AdminReferralActions({ referralId, rewarded }: { referralId: number; rewarded: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function run(action: "reverse" | "invalidate") {
    const reason = window.prompt(`Reason for referral ${action} (minimum 10 characters):`); if (!reason) return;
    if (!window.confirm(`Confirm ${action} for referral #${referralId}? This action is audited${action === "reverse" ? " and may change financial balances" : ""}.`)) return;
    setBusy(true); setMessage(null);
    const response = await fetch(`/api/admin/referrals/${referralId}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason, confirm: true }) });
    const body = await response.json(); setBusy(false); setMessage(response.ok ? `Referral ${action} completed.` : body.error || `Could not ${action} referral.`); if (response.ok) router.refresh();
  }
  return <div><div className="flex flex-wrap gap-2">{rewarded ? <button disabled={busy} className="btn-outline pressable" style={{ color: "var(--danger)" }} onClick={() => run("reverse")}>Reverse reward</button> : <button disabled={busy} className="btn-outline pressable" style={{ color: "var(--danger)" }} onClick={() => run("invalidate")}>Mark invalid</button>}<a className="btn-outline pressable" href="/admin/fraud">Review fraud</a></div>{message && <p className="mt-3 text-sm" role="status" style={{ color: "var(--text-muted)" }}>{message}</p>}</div>;
}
