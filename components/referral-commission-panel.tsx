"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, Clock3, Wallet, ShieldCheck } from "lucide-react";
import type { ReferralDashboard } from "@/lib/types";

const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
const labels: Record<string, string> = { one_time: "One-time release", half_yearly: "Half-yearly", yearly: "Yearly", yearly_plus: "Yearly+", beats: "Beat purchases", studio: "Studio services" };
export function ReferralCommissionPanel({ data, refresh }: { data: NonNullable<ReferralDashboard["commission"]>; refresh: () => Promise<void> }) {
  const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const [history, setHistory] = useState(data.history); const [cursor, setCursor] = useState(data.nextCursor);
  async function withdraw() {
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/referrals/payouts", { method: "POST" }); const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not request payout.");
      setMessage("Payout requested. You can track it below."); await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not request payout."); }
    finally { setPending(false); }
  }
  async function more() {
    setPending(true);
    try {
      const response = await fetch(`/api/referrals/me?commissionCursor=${cursor}`, { cache: "no-store" }); const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not load commissions.");
      setHistory(current => [...current, ...body.referral.commission.history]); setCursor(body.referral.commission.nextCursor);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Please try again."); }
    finally { setPending(false); }
  }
  return <section className="my-6" aria-label="Lifetime referral earnings">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="referral-kicker">LIFETIME COMMISSION</p><h3 className="text-xl font-semibold">Invite once. Earn on every paid purchase.</h3></div><Link className="text-sm underline" href="/dashboard?tab=payouts">Payout profile</Link></div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      { label: "Ready to withdraw", amount: data.available, Icon: Wallet }, { label: "Refund hold", amount: data.pending, Icon: Clock3 },
      { label: "Paid to you", amount: data.paid, Icon: ArrowDownToLine }, { label: "Lifetime earned", amount: data.total, Icon: ShieldCheck },
    ].map(({ label, amount, Icon }) => <div className="surface-card p-4" key={label}><Icon size={18}/><strong className="mt-3 block text-2xl">{money(amount)}</strong><span className="text-xs text-[var(--text-muted)]">{label}</span></div>)}</div>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-[var(--text-muted)]">{data.holdDays}-day hold · {money(data.minimumPayout)} minimum · Verified payout profile</p><button className="referral-primary" disabled={pending || data.available < data.minimumPayout || data.requested > 0} onClick={() => void withdraw()}>{pending ? "Please wait…" : data.requested > 0 ? `${money(data.requested)} payout pending` : "Withdraw commission"}</button></div>
    {data.held > 0 ? <p className="text-sm">{money(data.held)} held for payment or account review.</p> : null}
    {data.recovery > 0 ? <p className="text-sm">{money(data.recovery)} adjustment after refunds or holds. Cleared earnings offset this before the next payout.</p> : null}
    <p role="status" className="my-2 text-sm">{message}</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{data.rates.map(rate => <div className="rounded-xl border border-[var(--border)] p-3" key={rate.category}><div className="flex items-center justify-between gap-2"><span className="text-sm">{labels[rate.category]}</span><strong>{rate.percent}%</strong></div><div className="my-2 h-1 overflow-hidden rounded-full bg-[var(--bg-soft)]"><div className="h-full bg-[var(--accent)]" style={{ width: `${rate.percent * 5}%` }}/></div><small className="text-[var(--text-muted)]">of {rate.basis}</small></div>)}</div>
    <details className="referral-terms" open><summary>Purchase commissions</summary><div>{history.length ? history.map(row => <div className="referral-credit-row" key={row.id}><span><strong>{labels[row.category] || row.category}</strong><small>{row.rate}% × {money(row.base)} · {row.status === "PENDING" ? `Clears after ${new Date(row.eligibleAt).toLocaleDateString("en-IN")}` : row.status.toLowerCase()}</small></span><strong>{money(row.amount)}</strong></div>) : <p>Your friends’ paid purchases and renewals will appear here.</p>}{cursor ? <button className="referral-more" disabled={pending} onClick={() => void more()}>Load more commissions</button> : null}</div></details>
    {data.payouts.length ? <details className="referral-terms"><summary>Payout history</summary><div>{data.payouts.map(row => <div className="referral-credit-row" key={row.id}><span><strong>Payout #{row.id} · {row.status.toLowerCase()}</strong><small>{row.reference || new Date(row.createdAt).toLocaleDateString("en-IN")}</small></span><strong>{money(row.amount)}</strong></div>)}</div></details> : null}
  </section>;
}
