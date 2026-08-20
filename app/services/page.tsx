import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BarChart3,
  FileAudio,
  Globe2,
  Megaphone,
  Music2,
  Radio,
  Send,
  Sparkles,
  UploadCloud
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ServiceShowcase = {
  title: string;
  body: string;
  Icon: LucideIcon;
  visual: "distribution" | "marketing" | "playlisting";
  fragments: string[];
  image: {
    src: string;
    alt: string;
  };
};

const images = {
  hero: {
    src: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=82&w=3000",
    alt: "Cinematic live music stage with dramatic light"
  },
  distribution: {
    src: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&q=82&w=1800",
    alt: "Premium recording studio console for release preparation"
  },
  marketing: {
    src: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=82&w=1800",
    alt: "Digital campaign analytics and social media strategy workspace"
  },
  playlisting: {
    src: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&q=82&w=1800",
    alt: "Festival audience discovering music from a large stage"
  },
  cta: {
    src: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&q=82&w=2600",
    alt: "Artist performing for a massive concert crowd"
  }
};

const serviceShowcases: ServiceShowcase[] = [
  {
    title: "Distribution",
    body: "Release music globally with streamlined metadata routing, approval tracking, and organized delivery infrastructure designed for independent artists and labels.",
    Icon: UploadCloud,
    visual: "distribution",
    fragments: [],
    image: images.distribution
  },
  {
    title: "Social Media Marketing",
    body: "Build attention before and after release through rollout planning, short-form content strategy, audience positioning, and sustained momentum campaigns.",
    Icon: Megaphone,
    visual: "marketing",
    fragments: [],
    image: images.marketing
  },
  {
    title: "Playlisting",
    body: "Strengthen platform discoverability through curated pitching strategy, release timing optimization, and playlist-focused campaign positioning.",
    Icon: Radio,
    visual: "playlisting",
    fragments: [],
    image: images.playlisting
  }
];

const flowStages = [
  ["Upload", "Files, artwork, credits", UploadCloud],
  ["Distribute", "Routing and approval", Send],
  ["Market", "Campaign momentum", Megaphone],
  ["Discover", "Playlist and audience lift", Sparkles]
] as const;

const stats = [
  ["Global", "Distribution", Globe2],
  ["360", "Campaign Support", BarChart3],
  ["Artist", "Growth Focused", Music2],
  ["Release", "Infrastructure", FileAudio]
] as const;

const playlistCovers = [
  {
    src: "/assets/playlist-images/1.png",
    alt: "Dusk Till Dawn playlist cover",
    href: "https://open.spotify.com/playlist/2soKoURWSXnWJ48ygivet8?si=3eef2edc478449fa"
  },
  {
    src: "/assets/playlist-images/2.png",
    alt: "Indie Hits playlist cover",
    href: "https://open.spotify.com/playlist/5XZL9kya8MYerEUJsvzyyR?si=64553c07d15b4fae"
  },
  {
    src: "/assets/playlist-images/3.png",
    alt: "Ungatekept Gems playlist cover",
    href: "https://open.spotify.com/playlist/6SMKwPUHU0T7HKiaz4Qcvv?si=0e508f10b50c4c28"
  },
  {
    src: "/assets/playlist-images/4.png",
    alt: "Fresh Releases playlist cover",
    href: "https://open.spotify.com/playlist/1Gx9l9GVerLbzL3Wc7HPBK?si=72fa22eeca034f96"
  }
] as const;

function MarketingVisual() {
  return (
    <div className="relative min-h-[290px] overflow-hidden rounded-[1.75rem] border border-border bg-background/72 p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]" />
      <div className="relative grid gap-4 sm:grid-cols-[0.82fr,1fr]">
        <div className="space-y-3">
          {["Teaser", "Hook", "Behind The Song"].map((item, index) => (
            <div key={item} className="rounded-[1.2rem] border border-border bg-card/78 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-500 group-hover/service:-translate-y-1" style={{ transitionDelay: `${index * 60}ms` }}>
              <div className="aspect-[4/3] rounded-2xl bg-[var(--bg-soft)]" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">{item}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-end rounded-[1.4rem] border border-border bg-card p-4 backdrop-blur-xl">
          <div className="mt-8 flex h-40 items-end gap-3">
            {[34, 48, 62, 78, 88].map((height, index) => (
              <div key={height} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-full bg-gradient-to-t from-white/16 to-[#f4f7fb] shadow-[0_0_22px_rgba(244,247,251,0.14)] transition-all duration-700 group-hover/service:opacity-100" style={{ height: `${height}%` }} />
                <span className="text-[10px] text-[var(--text-soft)]">W{index + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-full border border-border bg-surface/82 px-3 py-2 text-xs text-[var(--text-soft)]">
            <span>Engagement</span>
            <span className="font-semibold text-[var(--text)] transition duration-500 group-hover/service:text-[#f5c16c]">+42%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaylistVisual() {
  return (
    <div className="relative min-h-[380px] overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-background p-5 lg:h-full">
      <Image src={images.playlisting.src} alt={images.playlisting.alt} fill sizes="(max-width: 768px) 100vw, 800px" className="object-cover opacity-30 grayscale transition duration-700 group-hover/service:scale-[1.035] group-hover/service:opacity-40" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,#090b10_100%)]" />
      <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.22)_0_1px,transparent_1px),radial-gradient(circle_at_82%_62%,rgba(245,193,108,0.24)_0_1px,transparent_1px)] [background-size:72px_72px,108px_108px]" />
      <div className="group/playlist relative flex h-full flex-col justify-between gap-5">
        <div className="relative flex-1 w-full max-w-[28rem] mx-auto">
          {playlistCovers.map((cover, item) => (
            <a
              key={cover.src}
              href={cover.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${cover.alt.replace(" cover", "")} on Spotify`}
              className="playlist-cover-card absolute left-1/2 top-1/2 h-40 w-40 overflow-hidden rounded-[1.4rem] border border-border bg-card shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
              style={
                {
                  "--closed-r": `${item * 7 - 10}deg`,
                  "--closed-x": `${item * 9}px`,
                  "--closed-y": `${item * -7}px`,
                  "--open-x": `${(item - 1.5) * 96}px`,
                  zIndex: item + 1
                } as CSSProperties
              }
            >
              <Image src={cover.src} alt={cover.alt} fill sizes="192px" className="object-cover transition duration-700 group-hover/service:scale-[1.04]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(9,11,16,0.58)_100%)]" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function ServiceVisual({ visual }: { visual: ServiceShowcase["visual"] }) {
  if (visual === "distribution") return null;
  if (visual === "marketing") return null;
  return <PlaylistVisual />;
}

export default function ServicesPage() {
  return (
    <main className="overflow-hidden bg-background pb-16 text-foreground">
      <section className="relative -mt-[73px] min-h-[92vh] overflow-hidden pt-[73px]">
        <div className="absolute inset-0">
          <Image src={images.hero.src} alt={images.hero.alt} fill priority sizes="100vw" className="scale-[1.03] object-cover object-center" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,11,16,0.92)_0%,rgba(9,11,16,0.68)_52%,rgba(9,11,16,0.42)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,16,0.18)_0%,rgba(9,11,16,0.26)_55%,rgba(9,11,16,0.9)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_26%,rgba(255,255,255,0.12),transparent_30%)]" />
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_22%_24%,rgba(255,255,255,0.28)_0_1px,transparent_1px),radial-gradient(circle_at_82%_52%,rgba(255,255,255,0.22)_0_1px,transparent_1px)] [background-size:92px_92px,142px_142px] motion-safe:animate-[hymn-grid-float_24s_linear_infinite]" />
        </div>

        <div className="shell relative grid min-h-[calc(92vh-73px)] items-center py-14">
          <div className="max-w-5xl fade-up">
            <h1 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl xl:text-[5.6rem]">
              Services Built Around Artist Momentum.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 sm:text-lg" style={{ color: "rgba(255, 255, 255, 0.68)" }}>
              Distribution, growth systems, and release support designed for modern artists.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-[0_0_42px_rgba(255,255,255,0.18)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_45px_rgba(255,255,255,0.24)] focus:outline-none focus:ring-2 focus:ring-white/50" style={{ background: "#f4f7fb", color: "#071013" }}>
                 Login
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/contact" className="premium-ghost inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold backdrop-blur-xl sm:w-auto" style={{color: "var(--text)", background: "var(--glass-bg)", border: "1px solid var(--glass-border)"}}>
                Talk To HYMN
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="shell space-y-8 py-12 sm:py-16">
        {serviceShowcases.map((service, index) => (
          <article
            key={service.title}
            className="group/service relative grid gap-6 overflow-hidden rounded-[2.2rem] border p-4 shadow-[0_30px_110px_rgba(0,0,0,0.36)] backdrop-blur-2xl transition duration-700 sm:p-6 lg:grid-cols-[0.85fr,1.15fr] lg:gap-8 lg:p-8"
            style={{
              borderColor: "var(--glass-border)",
              background:
                "linear-gradient(165deg, color-mix(in srgb, var(--glass-bg-strong) 86%, transparent) 0%, color-mix(in srgb, var(--glass-bg) 78%, transparent) 100%)"
            }}
          >
            <Image src={service.image.src} alt={service.image.alt} fill sizes="100vw" className="object-cover opacity-[0.13] grayscale transition duration-700 group-hover/service:scale-[1.03] group-hover/service:opacity-[0.18]" />
            <div className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, color-mix(in srgb, var(--bg) 94%, transparent) 0%, color-mix(in srgb, var(--bg) 86%, transparent) 45%, color-mix(in srgb, var(--bg) 68%, transparent) 100%)"
              }} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.12),transparent_26%)]" />
            <div className="absolute inset-x-8 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-[#f4f7fb] to-transparent opacity-70 transition duration-700 group-hover/service:scale-x-100" />
            <div className={`relative ${index % 2 === 1 ? "lg:order-2" : ""}`}>
              {service.visual !== "playlisting" && (
                <div className="mb-6 overflow-hidden rounded-[1.6rem] border border-white/[0.07] bg-background/42 shadow-[0_22px_70px_rgba(0,0,0,0.28)] lg:hidden">
                  <Image src={service.image.src} alt={service.image.alt} width={1000} height={680} className="aspect-[16/10] w-full object-cover opacity-72 grayscale" />
                </div>
              )}
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card text-[var(--text)]">
                  <service.Icon className="h-5 w-5" />
                </span>
              </div>
              <h2 className="mt-7 text-4xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-5xl">{service.title}</h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--text-soft)] sm:text-base sm:leading-8">{service.body}</p>
              {service.fragments.length > 0 ? <div className="mt-8 flex flex-wrap gap-2">
                {service.fragments.map((fragment) => (
                  <span key={fragment} className="rounded-full border border-border bg-card px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text)] transition duration-500 hover:text-[var(--text)]">
                    {fragment}
                  </span>
                ))}
              </div> : null}
            </div>
            <div className="relative grid gap-4">
              {service.visual !== "playlisting" && (
                <div className="relative hidden h-full min-h-[340px] overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-background/54 shadow-[0_26px_90px_rgba(0,0,0,0.34)] lg:block">
                  <Image src={service.image.src} alt={service.image.alt} fill sizes="(min-width: 1024px) 55vw, 100vw" className="scale-[1.04] object-cover opacity-72 grayscale transition duration-700 group-hover/service:scale-[1.075] group-hover/service:opacity-86" />
                </div>
              )}
              <ServiceVisual visual={service.visual} />
            </div>
          </article>
        ))}
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="mb-9 max-w-3xl">
          <h2 className="max-w-4xl text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-4xl lg:text-5xl">One release path, built to keep momentum visible.</h2>
        </div>
        <div className="relative overflow-hidden rounded-[2.2rem] border border-white/[0.07] bg-surface/72 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)] sm:p-7">
          <Image src={images.distribution.src} alt={images.distribution.alt} fill sizes="100vw" className="object-cover opacity-[0.08] grayscale" />
          <div className="absolute inset-0 bg-surface/78" />
          <div className="absolute left-8 right-8 top-1/2 hidden h-px bg-gradient-to-r from-transparent via-white/28 to-transparent md:block" />
          <div className="relative grid gap-4 md:grid-cols-4">
            {flowStages.map(([title, body, Icon], index) => (
              <div key={title} className="relative rounded-[1.5rem] border border-border bg-card p-5 transition duration-500 hover:-translate-y-1 hover:border-white/16">
                <span className="absolute -right-3 top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-[#f4f7fb] shadow-[0_0_22px_rgba(244,247,251,0.5)] md:block" />
                <Icon className="h-5 w-5 text-[var(--text-soft)]" />
                <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--text-soft)] opacity-80">0{index + 1}</p>
                <h3 className="mt-2 text-2xl font-semibold uppercase tracking-[0.02em] text-[var(--text)]">{title}</h3>
                <p className="mt-2 text-sm text-[var(--text-soft)]">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map(([value, label, Icon], index) => (
            <div key={label} className="metric-card rounded-[1.75rem] border border-border bg-card/76 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
              <div className="flex items-center justify-between gap-4">
                <Icon className="h-5 w-5 text-[var(--text-soft)]" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-soft)] opacity-80">0{index + 1}</span>
              </div>
              <p className="mt-8 text-4xl font-semibold tracking-[-0.03em] text-[var(--text)] motion-safe:animate-[hymn-fade-up_0.7s_ease_both]" style={{ animationDelay: `${index * 120}ms` }}>
                {value}
              </p>
              <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-border bg-surface p-6 shadow-[0_34px_130px_rgba(0,0,0,0.42)] sm:p-10 lg:p-14">
          <Image src={images.cta.src} alt={images.cta.alt} fill sizes="100vw" className="object-cover object-center opacity-22 grayscale" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_24%,rgba(255,255,255,0.14),transparent_28%),radial-gradient(circle_at_18%_70%,rgba(245,193,108,0.08),transparent_26%),linear-gradient(90deg,#12151d_0%,rgba(18,21,29,0.9)_54%,rgba(18,21,29,0.72)_100%)]" />
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:54px_54px] motion-safe:animate-[hymn-grid-float_20s_linear_infinite]" />
          <div className="relative max-w-3xl">
            <h2 className="text-4xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-6xl">
              Built For Artists Ready To Scale.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8"
              style={{ color: "rgba(255, 255, 255, 0.62)" }}>
              HYMN combines infrastructure, strategy, and creative momentum into one ecosystem.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="premium-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f4f7fb] px-6 py-3 text-sm font-semibold text-[#071013] shadow-[0_0_42px_rgba(255,255,255,0.18)]">
                Build Your Momentum
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/contact" className="premium-ghost inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/12 bg-white/5 px-6 py-3 text-sm font-semibold text-white backdrop-blur-xl sm:w-auto sm:min-h-12">
                Contact The Team
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

// vercel trigger 2

// vercel trigger 3
