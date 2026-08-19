"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

type StoreLogo = {
  name: string;
  src: string;
  className: string;
};

const STORE_LOGOS: readonly StoreLogo[] = [
  { name: "Spotify", src: "/assets/store-logos/wordmark-spotify.png", className: "h-8 w-auto" },
  { name: "Apple Music", src: "/assets/store-logos/wordmark-apple.png", className: "h-7 w-auto" },
  { name: "YouTube Music", src: "/assets/store-logos/wordmark-youtube.png", className: "h-7 w-auto" },
  { name: "Amazon Music", src: "/assets/store-logos/wordmark-amazon.png", className: "h-8 w-auto" },
  { name: "Gaana", src: "/assets/store-logos/wordmark-gaana.png", className: "h-8 w-auto" },
  { name: "TikTok", src: "/assets/store-logos/wordmark-tiktok.png", className: "h-7 w-auto" },
  { name: "Instagram", src: "/assets/store-logos/instagram.png", className: "h-8 w-auto" },
  { name: "Facebook", src: "/assets/store-logos/wordmark-facebook.png", className: "h-7 w-auto" },
  { name: "Pandora", src: "/assets/store-logos/wordmark-pandora.png", className: "h-7 w-auto" },
  { name: "Deezer", src: "/assets/store-logos/wordmark-deezer.png", className: "h-8 w-auto" },
  { name: "TIDAL", src: "/assets/store-logos/wordmark-tidal.png", className: "h-7 w-auto" },
  { name: "SoundCloud", src: "/assets/store-logos/wordmark-soundcloud.png", className: "h-7 w-auto" },
  { name: "Boomplay", src: "/assets/store-logos/wordmark-boomplay.png", className: "h-12 w-auto scale-125" },
  { name: "Anghami", src: "/assets/store-logos/wordmark-anghami.png", className: "h-8 w-auto" },
  { name: "JioSaavn", src: "/assets/store-logos/wordmark-jiosaavn.png", className: "h-8 w-auto" }
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
                background: "rgba(255, 255, 255, 0.97)"
              }}
            >
              <div className="marquee-row music-store-marquee items-center gap-10 px-6 py-4">
                {marqueeItems.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="inline-flex h-12 w-32 shrink-0 items-center justify-center" title={item.name}>
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
