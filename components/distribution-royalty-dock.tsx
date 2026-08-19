"use client";

import { ChevronUp, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { estimateRoyalty, platformRates, type RoyaltyPlatform } from "@/lib/royalty";

export function DistributionRoyaltyDock() {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<RoyaltyPlatform>("Spotify");
  const [streams, setStreams] = useState(100000);

  const estimated = useMemo(() => estimateRoyalty(streams, platform), [platform, streams]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4">
      <div className="pointer-events-auto mx-auto max-w-5xl overflow-hidden rounded-[1.8rem] border shadow-2xl" style={{ borderColor: "rgba(255,255,255,0.14)", background: "color-mix(in srgb, var(--bg-elevated) 92%, transparent)" }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="pressable flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs uppercase tracking-[0.22em]" style={{ borderColor: "var(--border)", color: "var(--text-soft)" }}>
              <Sparkles className="h-3.5 w-3.5" />
              Royalty Forecast
            </div>
            <p className="mt-3 text-lg font-semibold" style={{ color: "var(--text)" }}>
              Estimated earnings if this track hits 100K streams
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-soft)" }}>
              {platform} estimate: Rs {estimated.toLocaleString("en-IN")}
            </p>
          </div>
          <div className="inline-flex items-center gap-3">
            <span className="hidden text-sm md:inline" style={{ color: "var(--text-muted)" }}>
              {open ? "Hide calculator" : "Open calculator"}
            </span>
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <ChevronUp className="h-5 w-5" style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.3s ease" }} />
            </span>
          </div>
        </button>

        {open ? (
          <div className="grid gap-5 border-t px-5 pb-5 pt-4 md:grid-cols-[1.1fr,0.9fr]" style={{ borderColor: "var(--border)" }}>
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                  Platform
                </label>
                <select className="field" value={platform} onChange={(event) => setPlatform(event.target.value as RoyaltyPlatform)}>
                  {Object.keys(platformRates).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                  Streams
                </label>
                <input className="field" type="number" min="0" value={streams} onChange={(event) => setStreams(Number(event.target.value || 0))} />
              </div>
            </div>
            <div className="rounded-[1.4rem] border p-5" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
              <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>
                Real-time estimate
              </p>
              <p className="mt-4 text-4xl font-semibold" style={{ color: "var(--text)" }}>
                Rs {estimated.toLocaleString("en-IN")}
              </p>
              <div className="mt-5 space-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
                <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <span>Per-stream benchmark</span>
                  <span style={{ color: "var(--text)" }}>Rs {platformRates[platform].toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between rounded-2xl border px-4 py-3" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                  <span>Projection size</span>
                  <span style={{ color: "var(--text)" }}>{streams.toLocaleString("en-IN")} streams</span>
                </div>
              </div>
              <p className="mt-4 text-xs" style={{ color: "var(--text-soft)" }}>
                Estimates only. Actual payouts vary by territory, platform policy, subscription mix, and listener geography.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
