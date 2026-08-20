"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";

export type IndiaRegionStat = {
  id: string;
  name: string;
  streams: number;
  revenue: number;
  hint: string;
  x: number;
  y: number;
};

interface IndiaRevenueCardProps {
  totalStreams: number;
  totalRevenue: number;
  regions: IndiaRegionStat[];
}

export function IndiaRevenueCard({ totalStreams, totalRevenue, regions }: IndiaRevenueCardProps) {
  const [selected, setSelected] = useState<string>("india");
  const activeRegion = useMemo(() => regions.find((region) => region.id === selected) ?? regions[0], [regions, selected]);

  return (
    <section className="surface-card overflow-hidden p-0">
      <div className="border-b p-5 sm:p-6" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Regional streaming pulse</h3>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Hover or tap a region, then click India to zoom the country focus.</p>
      </div>
      <div className="grid gap-0 lg:grid-cols-[1.05fr,0.95fr]">
        <div className="relative border-b lg:border-b-0 lg:border-r" style={{ borderColor: "var(--border)" }}>
          <button
            type="button"
            className={clsx("relative block h-full min-h-[360px] w-full overflow-hidden p-5 text-left transition duration-300 sm:p-6", selected === "india" ? "scale-[1.01]" : "scale-100")}
            onClick={() => setSelected("india")}
            aria-label="Focus India"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_42%)]" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.26em]" style={{ color: "var(--text-soft)" }}>Country focus</p>
                  <h4 className="mt-2 text-4xl font-semibold" style={{ color: "var(--text)" }}>India</h4>
                </div>
                <span className="rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em]" style={{ borderColor: "var(--border)", color: "var(--text)" }}>Tap to zoom</span>
              </div>

              <svg viewBox="0 0 420 480" className="mx-auto mt-6 h-[300px] w-full max-w-[360px]" role="img" aria-label="India regional map abstraction">
                <defs>
                  <filter id="indiaGlow">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feColorMatrix in="blur" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.18 0" />
                  </filter>
                </defs>
                <path d="M194 52 232 72 262 110 275 158 250 211 264 260 242 314 214 352 190 404 146 432 114 406 121 353 94 314 72 270 76 220 98 181 94 140 116 96 152 70Z" fill="color-mix(in srgb, var(--accent) 8%, transparent)" filter="url(#indiaGlow)" />
                <path d="M194 52 232 72 262 110 275 158 250 211 264 260 242 314 214 352 190 404 146 432 114 406 121 353 94 314 72 270 76 220 98 181 94 140 116 96 152 70Z" fill="none" stroke="var(--border-strong)" strokeWidth="2.5" />
                {regions.map((region) => (
                  <g key={region.id} onMouseEnter={() => setSelected(region.id)} onFocus={() => setSelected(region.id)} onClick={() => setSelected(region.id)} tabIndex={0} role="button" aria-label={region.name}>
                    <circle cx={region.x} cy={region.y} r={selected === region.id ? 22 : 16} fill={selected === region.id ? "var(--accent)" : "var(--card-strong)"} stroke="var(--border-strong)" strokeWidth="2" />
                    <text x={region.x} y={region.y + 5} textAnchor="middle" fontSize="10" fontWeight="700" fill={selected === region.id ? "var(--accent-foreground)" : "var(--text)"}>{region.name.slice(0, 1)}</text>
                  </g>
                ))}
              </svg>
            </div>
          </button>
        </div>
        <div className="p-5 sm:p-6">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <p className="text-xs uppercase tracking-[0.26em]" style={{ color: "var(--text-soft)" }}>Streams from India</p>
              <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>{totalStreams.toLocaleString("en-IN")}</p>
            </div>
            <div className="rounded-[1.4rem] border p-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <p className="text-xs uppercase tracking-[0.26em]" style={{ color: "var(--text-soft)" }}>Revenue from region</p>
              <p className="mt-3 text-3xl font-semibold" style={{ color: "var(--text)" }}>Rs {totalRevenue.toLocaleString("en-IN")}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {regions.map((region) => (
              <button
                key={region.id}
                type="button"
                onClick={() => setSelected(region.id)}
                className={clsx("rounded-2xl border p-4 text-left transition hover:scale-[1.01]", selected === region.id ? "bg-[var(--card-strong)]" : "bg-[var(--bg-soft)]")}
                style={{ borderColor: selected === region.id ? "var(--border-strong)" : "var(--border)" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold" style={{ color: "var(--text)" }}>{region.name}</p>
                  <span className="text-xs uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>{selected === region.id ? "Active" : "Focus"}</span>
                </div>
                <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>{region.hint}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>Streams</p>
                    <p className="mt-1 font-semibold" style={{ color: "var(--text)" }}>{region.streams.toLocaleString("en-IN")}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>Revenue</p>
                    <p className="mt-1 font-semibold" style={{ color: "var(--text)" }}>Rs {region.revenue.toLocaleString("en-IN")}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
            <p className="text-xs uppercase tracking-[0.26em]" style={{ color: "var(--text-soft)" }}>Selected region</p>
            <p className="mt-2 text-xl font-semibold" style={{ color: "var(--text)" }}>{activeRegion?.name ?? "India"}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>{activeRegion?.hint ?? "Focus the country to see the full India picture."}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// vercel trigger 2
