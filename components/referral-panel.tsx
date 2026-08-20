"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Gift, IndianRupee, Link2, Send, Users } from "lucide-react";
import { ContextualHelp } from "@/components/contextual-help";
import type { ReferralDashboard } from "@/lib/types";

const money = (value: number) => `₹${Number(value || 0).toLocaleString("en-IN")}`;
const date = (value: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));

export function ReferralPanel() {
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/referrals/me", { signal: controller.signal })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then(payload => setData(payload.referral))
      .catch(error => { if (error.name !== "AbortError") setFeedback(error.message || "Referral data could not be loaded."); });
    return () => controller.abort();
  }, []);

  const shareText = useMemo(() => data ? `Join me on HYMN. Use my referral link and, after your first eligible paid purchase, we both receive HYMN credit: ${data.referralLink}` : "", [data]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    if (label === "Referral link") void fetch("/api/referrals/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "referral_link_copied" }) });
    setFeedback(`${label} copied.`);
  }

  async function share() {
    if (!data) return;
    if (navigator.share) { await navigator.share({ title: "Join HYMN", text: shareText, url: data.referralLink }); void fetch("/api/referrals/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "referral_link_shared" }) }); }
    else await copy(data.referralLink, "Referral link");
  }

  if (!data) return <section className="surface-card p-6"><p className="text-sm" style={{ color: "var(--text-muted)" }}>{feedback ?? "Loading referrals…"}</p></section>;

  const stats = [
    { label: "Invited", value: data.totalReferrals, icon: Users },
    { label: "Rewarded", value: data.successfulReferrals, icon: Check },
    { label: "Pending", value: data.pendingReferrals, icon: Gift },
    { label: "Available credit", value: money(data.availableCredit), icon: IndianRupee }
  ];

  return (
    <section className="surface-card overflow-hidden">
      <div className="border-b p-5 sm:p-7" style={{ borderColor: "var(--border)" }}>
        <p className="eyebrow">Refer artists. Earn verified credit.</p>
        <h2 className="mt-2 max-w-3xl text-2xl font-semibold tracking-tight sm:text-3xl" style={{ color: "var(--text)" }}>
          Earn {money(data.referrerReward)} when a friend completes their first eligible paid purchase.
          <ContextualHelp faqId="referral-rewards" label="Referral rewards">{`Your friend receives ${money(data.referredReward)} HYMN credit at the same time. Sign-up alone does not unlock credit.`}</ContextualHelp>
        </h2>
        <p className="mt-3 text-sm leading-6" style={{ color: "var(--text-muted)" }}>Attribution is locked to the new account. Rewards are verified server-side and issued once.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 p-5 sm:p-7 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border p-4 transition-transform hover:-translate-y-0.5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><Icon className="h-4 w-4" style={{ color: "var(--text-soft)" }} /><p className="mt-5 text-xl font-semibold" style={{ color: "var(--text)" }}>{value}</p><p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{label}</p></div>)}
      </div>

      <div className="grid gap-4 px-5 pb-5 sm:px-7 sm:pb-7 lg:grid-cols-[1fr_.7fr]">
        <div className="rounded-3xl border p-4 sm:p-5" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2"><Link2 className="h-4 w-4" /><h3 className="font-semibold">Share your invitation</h3></div>
          <div className="mt-4 rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}><p className="text-xs" style={{ color: "var(--text-soft)" }}>Referral link</p><p className="mt-1 truncate text-sm">{data.referralLink}</p></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
            <button className="btn-primary pressable" type="button" onClick={share}><Send className="h-4 w-4" /> Share</button>
            <button className="btn-outline pressable" type="button" onClick={() => copy(data.referralLink, "Referral link")}><Copy className="h-4 w-4" /> Copy link</button>
          </div>
        </div>
        <div className="rounded-3xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <p className="text-xs uppercase tracking-[.16em]" style={{ color: "var(--text-soft)" }}>Your permanent code</p>
          <div className="mt-5 flex items-center justify-between gap-3"><strong className="text-2xl tracking-[.08em]">{data.referralCode}</strong><button type="button" aria-label="Copy referral code" className="grid h-10 w-10 place-items-center rounded-full border" style={{ borderColor: "var(--border)" }} onClick={() => copy(data.referralCode, "Referral code")}><Copy className="h-4 w-4" /></button></div>
        </div>
      </div>

      <div className="grid gap-4 border-t p-5 sm:p-7 lg:grid-cols-2" style={{ borderColor: "var(--border)" }}>
          <div><h3 className="font-semibold">Referral journey</h3><div className="mt-3 grid gap-2">{data.activities.map(item => <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }}><div><p>{item.person ?? "Referred artist"}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{date(item.createdAt)}</p></div><div className="text-right"><span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "var(--bg-soft)" }}>{item.status.toLowerCase().replaceAll("_", " ")}</span>{item.earnings > 0 && <p className="mt-1 text-xs">+{money(item.earnings)}</p>}</div></div>)}{!data.activities.length && <p className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>No invitations yet. Share your link when you are ready.</p>}</div></div>
        <div><h3 className="font-semibold">Credit history</h3><div className="mt-3 grid gap-2">{data.creditHistory.map(item => <div key={item.id} className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)" }}><div><p>{item.description}</p><p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>{date(item.createdAt)}</p></div><strong>{item.direction === "credit" ? "+" : "−"}{money(item.amount)}</strong></div>)}{!data.creditHistory.length && <p className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Verified credits and redemptions will appear here.</p>}</div></div>
      </div>
      {feedback && <p role="status" className="px-5 pb-5 text-sm sm:px-7" style={{ color: "var(--text-soft)" }}>{feedback}</p>}
    </section>
  );
}
