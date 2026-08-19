"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Gift, MessageCircle, Sparkles } from "lucide-react";
import type { ReferralDashboard } from "@/lib/types";

function formatMoney(value: number) {
  return `Rs ${Number(value || 0).toLocaleString("en-IN")}`;
}

function timeLeft(target: string) {
  const remaining = new Date(target).getTime() - Date.now();
  if (remaining <= 0) return "Ended";
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  return `${days}d ${hours}h left`;
}

export function ReferralPanel() {
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/referrals/me")
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload.referral) setData(payload.referral);
      })
      .catch(() => {
        if (active) setFeedback("Referral data could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  const shareMessage = useMemo(() => {
    if (!data) return "";
    return `Join HYMN with my link and get Rs ${data.friendDiscount} off your first checkout: ${data.referralLink}`;
  }, [data]);

  async function copyLink() {
    if (!data) return;
    await navigator.clipboard.writeText(data.referralLink);
    setFeedback("Referral link copied.");
  }

  if (!data) {
    return (
      <section className="surface-card p-5 sm:p-6">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>{feedback ?? "Loading referral rewards..."}</p>
      </section>
    );
  }

  const progress = Math.min(100, Math.round((data.nextMilestone?.progress ?? 1) * 100));
  const whatsAppUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const pendingReferrals = data.activities.filter((activity) => activity.status === "signed_up").length;

  return (
    <section className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Earn {formatMoney(data.earnPerReferral)} per successful referral.</h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Your friend gets {formatMoney(data.friendDiscount)} off their first checkout.</p>
        </div>
        <div className="rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)", background: "var(--bg-soft)" }}>
          {timeLeft(data.campaignEndsAt)}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        {[
          ["Total referrals", data.totalReferrals],
          ["Successful", data.successfulReferrals],
          ["Pending", pendingReferrals],
          ["Credits earned", formatMoney(data.totalCreditsEarned)],
          ["Balance", formatMoney(data.referralCredits)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-[1.1rem] border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
            <p className="text-xs" style={{ color: "var(--text-soft)" }}>{label}</p>
            <p className="mt-2 text-lg font-semibold" style={{ color: "var(--text)" }}>{value}</p>
          </div>
        ))}
      </div>

      {data.nextMilestone ? (
        <div className="mt-5 rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span style={{ color: "var(--text-muted)" }}>Next milestone: {data.nextMilestone.referrals} referrals</span>
            <span className="font-semibold" style={{ color: "var(--text)" }}>{formatMoney(data.nextMilestone.bonus)} bonus</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div className="h-full rounded-full" style={{ width: `${progress}%`, background: "var(--money)" }} />
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 md:grid-cols-[1fr_auto_auto]">
        <div className="rounded-2xl border px-4 py-3 text-sm" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>
          <span className="block text-xs" style={{ color: "var(--text-soft)" }}>Referral link</span>
          <span className="mt-1 block break-all">{data.referralLink}</span>
        </div>
        <button type="button" onClick={copyLink} className="btn-outline pressable">
          <Copy className="h-4 w-4" />
          Copy link
        </button>
        <a href={whatsAppUrl} target="_blank" rel="noreferrer" className="btn-primary pressable">
          <MessageCircle className="h-4 w-4" />
          WhatsApp
        </a>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>Referral code</p>
          <p className="mt-2 text-xl font-semibold" style={{ color: "var(--text)" }}>{data.referralCode}</p>
        </div>
        <div className="rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <p className="font-semibold" style={{ color: "var(--text)" }}>How credits work</p>
          <p className="mt-2 text-sm leading-6" style={{ color: "var(--text-muted)" }}>Credits are awarded after a referred artist completes the qualifying first checkout. Pending sign-ups do not become spendable credit until the purchase is verified.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Gift className="h-4 w-4" /> Friend signed up notifications appear here.</p>
        <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}><Sparkles className="h-4 w-4" /> {data.socialProofCount} users earned rewards.</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Scratch-card bonuses can be layered onto campaigns without changing checkout math.</p>
      </div>

      <div className="mt-5 rounded-[1.2rem] border p-4" style={{ borderColor: "var(--border)" }}>
        <h3 className="font-semibold" style={{ color: "var(--text)" }}>Referral history</h3>
        <div className="mt-3 grid gap-2">
          {data.activities.map((activity) => (
            <div key={activity.id} className="summary-card">
              <span>{activity.signupEmail}</span>
              <span className="capitalize">{activity.status.replace(/_/g, " ")} · {formatMoney(activity.earnings)}</span>
            </div>
          ))}
          {data.activities.length === 0 ? <p className="text-sm" style={{ color: "var(--text-muted)" }}>No referral credits yet. Share your referral link to start earning credits.</p> : null}
        </div>
      </div>

      {feedback ? <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>{feedback}</p> : null}
    </section>
  );
}

// vercel trigger 2

// vercel trigger 4
