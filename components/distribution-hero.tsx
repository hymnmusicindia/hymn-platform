"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

type StoreLogo = {
  name: string;
  src: string;
  className: string;
};

const STORE_LOGOS: readonly StoreLogo[] = [
  {
    name: "Spotify",
    src: "/assets/store-logos/spotify.png",
    className: "h-8 w-auto sm:h-9"
  },
  {
    name: "Apple Music",
    src: "/assets/store-logos/apple-music.png",
    className: "h-6 w-auto sm:h-7"
  },
  {
    name: "YouTube Music",
    src: "/assets/store-logos/youtube-music.png",
    className: "h-7 w-auto sm:h-8"
  },
  {
    name: "Amazon Music",
    src: "/assets/store-logos/amazon-music.png",
    className: "h-7 w-auto sm:h-8"
  },
  {
    name: "Gaana",
    src: "/assets/store-logos/gaana.png",
    className: "h-6 w-auto sm:h-7"
  },
  {
    name: "TikTok",
    src: "/assets/store-logos/tiktok.png",
    className: "h-9 w-auto sm:h-10"
  },
  {
    name: "Instagram",
    src: "/assets/store-logos/instagram.png",
    className: "h-7 w-auto sm:h-8"
  },
  {
    name: "Facebook",
    src: "/assets/store-logos/facebook.png",
    className: "h-6 w-auto sm:h-7"
  }
] as const;

export function DistributionHero() {
  const marqueeItems = [...STORE_LOGOS, ...STORE_LOGOS];

  return (
    <section className="distribution-hero overflow-hidden rounded-[2rem] border p-4 shadow-[0_28px_80px_rgba(0,0,0,0.22)] sm:p-7 lg:p-8">
      <div className="grid gap-8 lg:grid-cols-[1.02fr,0.98fr] lg:items-center">
        <div className="relative z-10 space-y-6">
          <div className="grid gap-4">
            <h1 className="max-w-3xl text-3xl font-semibold leading-tight text-balance sm:text-5xl lg:text-6xl fade-up" style={{ animationDelay: "0.16s", color: "var(--text)" }}>
              Distribute Your Music Worldwide.
            </h1>
            <p className="max-w-2xl fade-up" style={{ animationDelay: "0.26s" }}>
              <span className="block text-base font-medium leading-7 sm:text-xl sm:leading-8" style={{ color: "var(--text)" }}>
                Release on Spotify, Apple Music, YouTube &amp; 150+ platforms.
              </span>
              <span className="mt-3 inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.16em] sm:text-sm" style={{ color: "var(--text-muted)" }}>
                <span className="h-px w-7" style={{ background: "var(--accent)" }} aria-hidden="true" />
                Reach listeners across the globe.
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-3 fade-up" style={{ animationDelay: "0.34s" }}>
            <Link href="/distribution/start" className="btn-primary pressable hover-lift">
              Start Distribution
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="#distribution-pricing" className="btn-outline pressable hover-lift">
              View Pricing
            </Link>
          </div>
        </div>

        <div
          className="relative overflow-hidden rounded-[1.75rem] border p-4 sm:p-5 lg:p-6 fade-up"
          style={{
            animationDelay: "0.22s",
            borderColor: "color-mix(in srgb, var(--glass-border) 88%, transparent)",
            background: "linear-gradient(165deg, color-mix(in srgb, var(--glass-bg-strong) 86%, transparent) 0%, color-mix(in srgb, var(--glass-bg) 78%, transparent) 100%)"
          }}
        >
          <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 8% 18%, color-mix(in srgb, var(--page-glow) 55%, transparent), transparent 45%)" }} />

          <div className="relative z-10">
            <div
              className="overflow-hidden rounded-2xl border"
              style={{
                borderColor: "color-mix(in srgb, var(--glass-border) 82%, transparent)",
                background: "color-mix(in srgb, var(--glass-bg) 76%, transparent)"
              }}
            >
              <div className="marquee-row items-center gap-7 px-5 py-4">
                {marqueeItems.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="inline-flex shrink-0 items-center justify-center">
                    <img src={item.src} alt={item.name} className={`distribution-store-logo ${item.className}`} loading="lazy" decoding="async" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// vercel trigger 3
