"use client";

import { useMemo, useState } from "react";
import { estimateRoyalty, platformRates, type RoyaltyPlatform } from "@/lib/royalty";

export function RoyaltyCalculator() {
  const [streams, setStreams] = useState(5000);
  const [platform, setPlatform] = useState<RoyaltyPlatform>("Spotify");

  const estimated = useMemo(() => estimateRoyalty(streams, platform), [streams, platform]);

  return (
    <section className="surface-panel p-6 md:p-8">
      <div className="grid gap-8 lg:grid-cols-[0.95fr,1.05fr]">
        <div>
          <h2 className="text-3xl font-semibold" style={{ color: "var(--text)" }}>Estimate streaming revenue in real time.</h2>
          <p className="mt-4 text-base" style={{ color: "var(--text-muted)" }}>
            Use HYMN&apos;s streaming benchmarks to model approximate payout ranges across major platforms.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Platform</label>
              <select className="field" value={platform} onChange={(event) => setPlatform(event.target.value as RoyaltyPlatform)}>
                {Object.keys(platformRates).map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>Streams</label>
              <input className="field" type="number" min="0" value={streams} onChange={(event) => setStreams(Number(event.target.value || 0))} />
            </div>
          </div>
        </div>
        <div className="rounded-[1.5rem] border p-6" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
          <p className="text-sm uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>Estimated Earnings</p>
          <p className="mt-4 text-5xl font-semibold" style={{ color: "var(--text)" }}>Rs {estimated.toLocaleString("en-IN")}</p>
          <div className="mt-6 grid gap-3">
            <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <span style={{ color: "var(--text-muted)" }}>Rate per stream</span>
              <span style={{ color: "var(--text)" }}>Rs {platformRates[platform].toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <span style={{ color: "var(--text-muted)" }}>Selected platform</span>
              <span style={{ color: "var(--text)" }}>{platform}</span>
            </div>
          </div>
          <p className="mt-5 text-sm" style={{ color: "var(--text-soft)" }}>Estimates only. Actual payouts vary by territory, listener mix, subscription type, and platform policy.</p>
        </div>
      </div>
    </section>
  );
}

// vercel trigger 2
