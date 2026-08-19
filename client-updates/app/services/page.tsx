import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileAudio,
  Globe2,
  Megaphone,
  Music2,
  Radio,
  Send,
  Sparkles,
  UploadCloud,
  Waves
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type ServiceShowcase = {
  eyebrow: string;
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
    src: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&q=82&w=1800",
    alt: "Artist performing into a microphone during a campaign shoot"
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
    eyebrow: "Service 01",
    title: "Distribution",
    body: "Release music globally with streamlined metadata routing, approval tracking, and organized delivery infrastructure designed for independent artists and labels.",
    Icon: UploadCloud,
    visual: "distribution",
    fragments: ["Metadata locked", "DSP queue", "Approval live"],
    image: images.distribution
  },
  {
    eyebrow: "Service 02",
    title: "Social Media Marketing",
    body: "Build attention before and after release through rollout planning, short-form content strategy, audience positioning, and sustained momentum campaigns.",
    Icon: Megaphone,
    visual: "marketing",
    fragments: ["Rollout map", "Audience lift", "Content pulse"],
    image: images.marketing
  },
  {
    eyebrow: "Service 03",
    title: "Playlisting",
    body: "Strengthen platform discoverability through curated pitching strategy, release timing optimization, and playlist-focused campaign positioning.",
    Icon: Radio,
    visual: "playlisting",
    fragments: ["Pitch window", "Discovery net", "Editorial fit"],
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

const heroImagePanels = [images.distribution, images.marketing, images.playlisting] as const;

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

function DistributionVisual() {
  return (
    <div className="relative min-h-[290px] overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#090b10]/72 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:44px_44px] motion-safe:animate-[hymn-grid-float_18s_linear_infinite]" />
      <div className="relative flex h-full flex-col justify-between gap-5">
        <div className="grid grid-cols-[1fr,auto,1fr,auto,1fr] items-center gap-2">
          {["Upload", "Review", "DSP"].map((label, index) => (
            <div key={label} className="rounded-2xl border border-white/[0.08] bg-white/[0.045] p-3 backdrop-blur-xl transition duration-500 group-hover/service:-translate-y-1 group-hover/service:border-white/20">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">0{index + 1}</p>
              <p className="mt-2 text-sm font-semibold text-white">{label}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div className="h-full rounded-full bg-[#f4f7fb] motion-safe:animate-[hymn-shimmer_1.8s_linear_infinite]" style={{ width: `${54 + index * 18}%` }} />
              </div>
            </div>
          ))}
          {[0, 1].map((item) => (
            <div key={item} className="h-px bg-gradient-to-r from-transparent via-white/40 to-transparent">
              <div className="h-px w-7 bg-[#f4f7fb] shadow-[0_0_18px_rgba(244,247,251,0.45)] motion-safe:animate-[hymn-streak_3.8s_linear_infinite]" />
            </div>
          ))}
        </div>
        <div className="rounded-[1.4rem] border border-white/[0.08] bg-[#12151d]/82 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-white/42">Release Panel</p>
              <p className="mt-2 text-lg font-semibold text-white">Midnight Single</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#f5c16c]/22 bg-[#f5c16c]/10 px-3 py-1.5 text-xs font-semibold text-[#f5c16c]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approved
            </span>
          </div>
          <div className="mt-4 grid gap-2">
            {["Spotify", "Apple Music", "YouTube Music"].map((platform) => (
              <div key={platform} className="flex items-center justify-between rounded-full border border-white/[0.05] bg-white/[0.03] px-3 py-2 text-xs text-white/58 transition duration-500 group-hover/service:translate-x-1">
                <span>{platform}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-[#f4f7fb] shadow-[0_0_16px_rgba(244,247,251,0.48)]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketingVisual() {
  return (
    <div className="relative min-h-[290px] overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#090b10]/72 p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_18%,rgba(255,255,255,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.045),transparent)]" />
      <div className="relative grid gap-4 sm:grid-cols-[0.82fr,1fr]">
        <div className="space-y-3">
          {["Teaser", "Hook", "Behind The Song"].map((item, index) => (
            <div key={item} className="rounded-[1.2rem] border border-white/[0.08] bg-[#171b24]/78 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.22)] transition duration-500 group-hover/service:-translate-y-1" style={{ transitionDelay: `${index * 60}ms` }}>
              <div className="aspect-[4/3] rounded-2xl bg-[linear-gradient(135deg,rgba(244,247,251,0.14),rgba(255,255,255,0.03))]" />
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.18em] text-white/46">{item}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-end rounded-[1.4rem] border border-white/[0.08] bg-white/[0.035] p-4 backdrop-blur-xl">
          <p className="text-xs uppercase tracking-[0.24em] text-white/42">Campaign Lift</p>
          <div className="mt-8 flex h-40 items-end gap-3">
            {[34, 48, 62, 78, 88].map((height, index) => (
              <div key={height} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-full bg-gradient-to-t from-white/16 to-[#f4f7fb] shadow-[0_0_22px_rgba(244,247,251,0.14)] transition-all duration-700 group-hover/service:opacity-100" style={{ height: `${height}%` }} />
                <span className="text-[10px] text-white/34">W{index + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-full border border-white/[0.07] bg-[#12151d]/82 px-3 py-2 text-xs text-white/58">
            <span>Engagement</span>
            <span className="font-semibold text-white transition duration-500 group-hover/service:text-[#f5c16c]">+42%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaylistVisual() {
  return (
    <div className="relative min-h-[290px] overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#090b10]/72 p-5">
      <div className="absolute inset-0 opacity-50 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.22)_0_1px,transparent_1px),radial-gradient(circle_at_82%_62%,rgba(245,193,108,0.24)_0_1px,transparent_1px)] [background-size:72px_72px,108px_108px]" />
      <div className="group/playlist relative grid min-h-[250px] place-items-center">
        <div className="relative h-52 w-full max-w-[28rem]">
          {playlistCovers.map((cover, item) => (
            <a
              key={cover.src}
              href={cover.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${cover.alt.replace(" cover", "")} on Spotify`}
              className="playlist-cover-card absolute left-1/2 top-1/2 h-40 w-40 overflow-hidden rounded-[1.4rem] border border-white/[0.08] bg-[#171b24] shadow-[0_24px_80px_rgba(0,0,0,0.28)]"
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
        <div className="absolute inset-x-3 bottom-0 rounded-full border border-white/[0.08] bg-[#12151d]/88 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-white/72" />
            <div className="waveform h-7 flex-1">
              {Array.from({ length: 18 }).map((_, index) => (
                <span key={index} className="wave-bar bg-[#f4f7fb]/72" style={{ animationDelay: `${index * 70}ms` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ServiceVisual({ visual }: { visual: ServiceShowcase["visual"] }) {
  if (visual === "distribution") return <DistributionVisual />;
  if (visual === "marketing") return <MarketingVisual />;
  return <PlaylistVisual />;
}

export default function ServicesPage() {
  return (
    <main className="overflow-hidden bg-[#090b10] pb-16 text-[#f4f7fb]">
      <section className="relative -mt-[73px] min-h-[92vh] overflow-hidden pt-[73px]">
        <div className="absolute inset-0">
          <Image src={images.hero.src} alt={images.hero.alt} fill priority sizes="100vw" className="scale-105 object-cover object-center opacity-34" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,11,16,0.96)_0%,rgba(9,11,16,0.78)_48%,rgba(9,11,16,0.58)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_24%,rgba(255,255,255,0.13),transparent_28%),radial-gradient(circle_at_16%_18%,rgba(245,193,108,0.08),transparent_24%),linear-gradient(180deg,#090b10_0%,#12151d_54%,#090b10_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,16,0.18)_0%,rgba(9,11,16,0.28)_42%,#090b10_100%)]" />
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_22%_24%,rgba(255,255,255,0.28)_0_1px,transparent_1px),radial-gradient(circle_at_82%_52%,rgba(255,255,255,0.22)_0_1px,transparent_1px)] [background-size:92px_92px,142px_142px] motion-safe:animate-[hymn-grid-float_24s_linear_infinite]" />
          <div className="absolute right-[5%] top-[20%] hidden w-[38rem] grid-cols-3 gap-4 opacity-55 lg:grid">
            {heroImagePanels.map((panel, index) => (
              <div
                key={panel.src}
                className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.08] bg-[#12151d]/58 shadow-[0_28px_90px_rgba(0,0,0,0.34)] motion-safe:animate-[hymn-float_8s_ease-in-out_infinite]"
                style={{
                  height: `${15 + index * 2}rem`,
                  marginTop: `${index % 2 === 0 ? 2.5 : 0}rem`,
                  animationDelay: `${index * 420}ms`
                }}
              >
                <Image src={panel.src} alt={panel.alt} fill sizes="220px" className="object-cover opacity-70 grayscale" />
                <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,16,0.08)_0%,rgba(9,11,16,0.62)_100%)]" />
              </div>
            ))}
          </div>
          <div className="absolute bottom-16 right-8 hidden h-28 w-72 overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-[#12151d]/58 opacity-50 shadow-[0_24px_80px_rgba(0,0,0,0.28)] md:block">
            <Image src={images.playlisting.src} alt={images.playlisting.alt} fill sizes="288px" className="object-cover opacity-72 grayscale" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,11,16,0.72),rgba(9,11,16,0.2))]" />
          </div>
        </div>

        <div className="shell relative grid min-h-[calc(92vh-73px)] items-center py-14">
          <div className="max-w-5xl fade-up">
            <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-white backdrop-blur-xl">
              HYMN Services
            </span>
            <h1 className="mt-7 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl xl:text-[5.6rem]">
              Services Built Around Artist Momentum.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
              Distribution, growth systems, and release support designed for modern artists.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="premium-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f4f7fb] px-6 py-3 text-sm font-semibold text-[#071013] shadow-[0_0_42px_rgba(255,255,255,0.18)]">
                Start Your Release
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/contact" className="premium-ghost inline-flex min-h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white backdrop-blur-xl">
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
            className="group/service relative grid gap-6 overflow-hidden rounded-[2.2rem] border border-white/[0.07] bg-[#12151d]/72 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.36)] backdrop-blur-2xl transition duration-700 hover:border-white/16 sm:p-6 lg:grid-cols-[0.85fr,1.15fr] lg:gap-8 lg:p-8"
          >
            <Image src={service.image.src} alt={service.image.alt} fill sizes="100vw" className="object-cover opacity-[0.13] grayscale transition duration-700 group-hover/service:scale-[1.03] group-hover/service:opacity-[0.18]" />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,#12151d_0%,rgba(18,21,29,0.92)_45%,rgba(18,21,29,0.72)_100%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_18%,rgba(255,255,255,0.12),transparent_26%)]" />
            <div className="absolute inset-x-8 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-[#f4f7fb] to-transparent opacity-70 transition duration-700 group-hover/service:scale-x-100" />
            <div className={`relative ${index % 2 === 1 ? "lg:order-2" : ""}`}>
              <div className="mb-6 overflow-hidden rounded-[1.6rem] border border-white/[0.07] bg-[#090b10]/42 shadow-[0_22px_70px_rgba(0,0,0,0.28)] lg:hidden">
                <Image src={service.image.src} alt={service.image.alt} width={1000} height={680} className="aspect-[16/10] w-full object-cover opacity-72 grayscale" />
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.045] text-white">
                  <service.Icon className="h-5 w-5" />
                </span>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/46">{service.eyebrow}</p>
              </div>
              <h2 className="mt-7 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">{service.title}</h2>
              <p className="mt-5 max-w-xl text-sm leading-7 text-white/62 sm:text-base sm:leading-8">{service.body}</p>
              <div className="mt-8 flex flex-wrap gap-2">
                {service.fragments.map((fragment) => (
                  <span key={fragment} className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/46 transition duration-500 group-hover/service:border-white/16 group-hover/service:text-white/72">
                    {fragment}
                  </span>
                ))}
              </div>
            </div>
            <div className="relative grid gap-4">
              <div className="hidden overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-[#090b10]/54 shadow-[0_26px_90px_rgba(0,0,0,0.34)] lg:block">
                <Image src={service.image.src} alt={service.image.alt} width={1400} height={820} className="aspect-[16/7] w-full object-cover opacity-72 grayscale transition duration-700 group-hover/service:scale-[1.035] group-hover/service:opacity-86" />
              </div>
              <ServiceVisual visual={service.visual} />
            </div>
          </article>
        ))}
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="mb-9 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white">Experience Flow</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">One release path, built to keep momentum visible.</h2>
        </div>
        <div className="relative overflow-hidden rounded-[2.2rem] border border-white/[0.07] bg-[#12151d]/72 p-5 shadow-[0_28px_100px_rgba(0,0,0,0.34)] sm:p-7">
          <Image src={images.distribution.src} alt={images.distribution.alt} fill sizes="100vw" className="object-cover opacity-[0.08] grayscale" />
          <div className="absolute inset-0 bg-[#12151d]/78" />
          <div className="absolute left-8 right-8 top-1/2 hidden h-px bg-gradient-to-r from-transparent via-white/28 to-transparent md:block" />
          <div className="relative grid gap-4 md:grid-cols-4">
            {flowStages.map(([title, body, Icon], index) => (
              <div key={title} className="relative rounded-[1.5rem] border border-white/[0.06] bg-[#171b24]/72 p-5 transition duration-500 hover:-translate-y-1 hover:border-white/16">
                <span className="absolute -right-3 top-1/2 hidden h-2 w-2 -translate-y-1/2 rounded-full bg-[#f4f7fb] shadow-[0_0_22px_rgba(244,247,251,0.5)] md:block" />
                <Icon className="h-5 w-5 text-white/72" />
                <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/34">0{index + 1}</p>
                <h3 className="mt-2 text-2xl font-semibold uppercase tracking-[0.02em] text-white">{title}</h3>
                <p className="mt-2 text-sm text-white/50">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {stats.map(([value, label, Icon], index) => (
            <div key={label} className="metric-card rounded-[1.75rem] border border-white/[0.06] bg-[#171b24]/76 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
              <div className="flex items-center justify-between gap-4">
                <Icon className="h-5 w-5 text-white/68" />
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-white/34">0{index + 1}</span>
              </div>
              <p className="mt-8 text-4xl font-semibold tracking-[-0.03em] text-white motion-safe:animate-[hymn-fade-up_0.7s_ease_both]" style={{ animationDelay: `${index * 120}ms` }}>
                {value}
              </p>
              <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/46">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/[0.08] bg-[#12151d] p-6 shadow-[0_34px_130px_rgba(0,0,0,0.42)] sm:p-10 lg:p-14">
          <Image src={images.cta.src} alt={images.cta.alt} fill sizes="100vw" className="object-cover object-center opacity-22 grayscale" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_76%_24%,rgba(255,255,255,0.14),transparent_28%),radial-gradient(circle_at_18%_70%,rgba(245,193,108,0.08),transparent_26%),linear-gradient(90deg,#12151d_0%,rgba(18,21,29,0.9)_54%,rgba(18,21,29,0.72)_100%)]" />
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:54px_54px] motion-safe:animate-[hymn-grid-float_20s_linear_infinite]" />
          <div className="relative max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white">Scale With HYMN</p>
            <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-6xl">
              Built For Artists Ready To Scale.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/62">
              HYMN combines infrastructure, strategy, and creative momentum into one ecosystem.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="premium-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f4f7fb] px-6 py-3 text-sm font-semibold text-[#071013] shadow-[0_0_42px_rgba(255,255,255,0.18)]">
                Build Your Momentum
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/contact" className="premium-ghost inline-flex min-h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white backdrop-blur-xl">
                Contact The Team
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
