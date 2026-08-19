import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Building2,
  CalendarCheck2,
  Clapperboard,
  Disc3,
  DollarSign,
  FileAudio,
  Globe2,
  Headphones,
  LineChart,
  Megaphone,
  Music2,
  Play,
  Radio,
  ShieldCheck,
  Sparkles,
  Users2,
  Wand2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FloatingAssistant } from "@/components/floating-assistant";
import { beatStoreReviews, buildBeatStorefront } from "@/lib/beat-store";
import { sampleBeats } from "@/lib/site";

const { catalog } = buildBeatStorefront(sampleBeats);

const images = {
  hero: {
    src: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&q=82&w=3000",
    alt: "Artist performing in front of a massive concert crowd"
  },
  studio: {
    src: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&q=82&w=1800",
    alt: "Premium recording studio with mixing console"
  },
  stage: {
    src: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=82&w=1800",
    alt: "Live music performance with cinematic stage lights"
  },
  backstage: {
    src: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&q=82&w=1800",
    alt: "Artist singing into a microphone"
  },
  crowd: {
    src: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&q=82&w=2200",
    alt: "Festival audience facing a bright stage"
  }
};

const metrics = [
  ["2.4K+", "artists supported"],
  ["180M+", "catalog streams influenced"],
  ["60+", "countries reached"],
  ["24/7", "release visibility"]
];

const storeLogos = [
  { name: "Spotify", src: "/assets/store-logos/spotify.png", className: "h-8 w-auto sm:h-9" },
  { name: "Apple Music", src: "/assets/store-logos/apple-music.png", className: "h-6 w-auto sm:h-7" },
  { name: "YouTube Music", src: "/assets/store-logos/youtube-music.png", className: "h-7 w-auto sm:h-8" },
  { name: "Amazon Music", src: "/assets/store-logos/amazon-music.png", className: "h-7 w-auto sm:h-8" },
  { name: "Gaana", src: "/assets/store-logos/gaana.png", className: "h-6 w-auto sm:h-7" },
  { name: "TikTok", src: "/assets/store-logos/tiktok.png", className: "h-9 w-auto sm:h-10" },
  { name: "Instagram", src: "/assets/store-logos/instagram.png", className: "h-7 w-auto sm:h-8" },
  { name: "Facebook", src: "/assets/store-logos/facebook.png", className: "h-6 w-auto sm:h-7" }
] as const;

const storeLogoMarquee = [...storeLogos, ...storeLogos];

const services: Array<[string, string, LucideIcon]> = [
  ["Music Distribution", "Release singles, EPs, and albums through a guided workflow built for serious launches.", Disc3],
  ["Artist Management", "Shape positioning, timelines, rollout decisions, and audience development with clarity.", Users2],
  ["Label Services", "Access release infrastructure, catalog systems, creative operations, and campaign support.", Building2],
  ["Playlist Promotion", "Build discovery momentum with pitch-ready assets, timing, and platform strategy.", Radio],
  ["Music Marketing", "Turn releases into campaigns across social, short-form video, press, and fan channels.", Megaphone],
  ["Branding & Creative", "Develop art direction, narrative, visual identity, and cultural signals around the artist.", Wand2],
  ["YouTube Monetization", "Support content strategy, claim readiness, channel growth, and creator monetization.", Play],
  ["Release Strategy", "Plan the sequence before the upload: pre-save, assets, audience, and post-release growth.", CalendarCheck2],
  ["Rights Management", "Keep metadata, splits, royalties, and catalog ownership organized from the start.", ShieldCheck],
  ["Analytics & Insights", "Understand what is moving, where audiences form, and which moments deserve fuel.", BarChart3]
];

const artists = [
  {
    name: "Aarav Flamez",
    role: "Hindi hip-hop / drill",
    image: images.stage.src,
    stat: "18.6M streams",
    note: "Regional story, global release posture"
  },
  {
    name: "Mira Vale",
    role: "Alt pop / R&B",
    image: images.backstage.src,
    stat: "42 countries",
    note: "Identity-first campaign architecture"
  },
  {
    name: "Noor District",
    role: "Producer collective",
    image: images.studio.src,
    stat: "9 sync-ready releases",
    note: "Catalog systems for long-term value"
  }
];

const testimonials = [
  ["HYMN treated the release like a brand moment, not a file upload.", "Rhea K.", "Independent Artist", "3.1M launch streams"],
  ["The dashboard made our campaign feel controlled from announcement to payout.", "Dev House", "Producer Team", "12 releases managed"],
  ["They understood the music and the market. That combination is rare.", "Arjun N.", "Label Partner", "7 territories activated"]
];

const platformPanels: Array<[string, string, LucideIcon]> = [
  ["Release Workflow", "Metadata, artwork, files, review", FileAudio],
  ["Audience Analytics", "Cities, sources, platform lift", LineChart],
  ["Campaign Management", "Tasks, moments, creative assets", Clapperboard],
  ["Royalty Insights", "Credits, earnings, payout readiness", DollarSign]
];

const howItWorks: Array<[string, string, string, LucideIcon]> = [
  ["01", "Join The Platform", "Create your account, choose your path, and enter the release ecosystem.", BadgeCheck],
  ["02", "Release & Grow", "Launch music with distribution, campaign support, analytics, and monetization systems.", Globe2],
  ["03", "Build Your Brand", "Turn audience signals into visual identity, strategy, content, and long-term career value.", Sparkles]
];

export default function HomePage() {
  return (
    <main className="overflow-hidden bg-[#090b10] pb-20 text-[#f4f7fb]">
      <section className="relative -mt-[73px] min-h-[96vh] overflow-hidden pt-[73px]">
        <div className="absolute inset-0">
          <Image src={images.hero.src} alt={images.hero.alt} fill priority sizes="100vw" className="scale-105 object-cover object-center opacity-52" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_32%,rgba(255,255,255,0.16),transparent_26%),linear-gradient(90deg,rgba(9,11,16,0.96)_0%,rgba(9,11,16,0.76)_46%,rgba(9,11,16,0.5)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,16,0.22)_0%,rgba(9,11,16,0.18)_46%,#090b10_100%)]" />
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.25)_0_1px,transparent_1px),radial-gradient(circle_at_80%_45%,rgba(255,255,255,0.34)_0_1px,transparent_1px)] [background-size:90px_90px,140px_140px] motion-safe:animate-[hymn-grid-float_22s_linear_infinite]" />
        </div>

        <div className="shell relative grid min-h-[calc(96vh-73px)] items-center gap-12 py-14">
          <div className="max-w-4xl">
            <span className="inline-flex rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#ffffff] backdrop-blur-xl">
              Global Music Agency & Label
            </span>
            <h1 className="mt-7 text-5xl font-semibold leading-[0.96] tracking-[-0.03em] text-white sm:text-6xl lg:text-7xl xl:text-[5.8rem]">
              Where Artists Become Movements.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
              HYMN helps artists release music, build audiences, monetize creatively, grow brands, access label services, and scale into a global career ecosystem.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="premium-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f4f7fb] px-6 py-3 text-sm font-semibold text-[#071013] shadow-[0_0_42px_rgba(255,255,255,0.18)]">
                Join The Platform
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/services" className="premium-ghost inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white backdrop-blur-xl">
                Explore Services
              </Link>
            </div>
            <div className="mt-9 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
              {metrics.map(([value, label]) => (
                <div key={label} className="border-l border-white/10 pl-4">
                  <p className="text-2xl font-semibold text-white">{value}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.18em] text-white/44">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-10 sm:py-14">
        <div className="rounded-[2rem] border border-white/[0.06] bg-[#12151d]/72 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="max-w-lg text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
              Connected To The Global Music Ecosystem
            </h2>
            <p className="max-w-xl text-sm leading-7 text-white/52">
              Built for the channels where modern artists are discovered, streamed, shared, monetized, and remembered.
            </p>
          </div>
          <div className="mt-7 overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025]">
            <div className="marquee-row items-center gap-7 px-5 py-5">
              {storeLogoMarquee.map((item, index) => (
                <div key={`${item.name}-${index}`} className="inline-flex shrink-0 items-center justify-center">
                  <img src={item.src} alt={item.name} className={`distribution-store-logo ${item.className}`} loading="lazy" decoding="async" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="offerings" className="shell py-12 sm:py-16">
        <div className="mb-9 max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffffff]">Agency Infrastructure</p>
          <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Everything an artist needs after the song is finished.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {services.map(([title, body, Icon]) => (
            <article key={title} className="premium-card-hover group relative overflow-hidden rounded-[1.75rem] border border-white/[0.06] bg-[#171b24]/82 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.26)]">
              <div className="absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-[#f4f7fb] to-transparent transition duration-500 group-hover:scale-x-100" />
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-[#ffffff]">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/52">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="artist-spotlight" className="shell py-12 sm:py-16">
        <div className="grid gap-7 lg:grid-cols-[0.9fr,1.1fr] lg:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffffff]">Artist Spotlight</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">A roster presentation for artists building culture.</h2>
          </div>
          <p className="text-sm leading-7 text-white/54 lg:max-w-xl">
            HYMN combines release execution with creative direction, audience intelligence, and the confidence of a modern label room.
          </p>
        </div>
        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {artists.map((artist, index) => (
            <article key={artist.name} className={index === 1 ? "group relative overflow-hidden rounded-[2rem] border border-[#f4f7fb]/18 bg-[#171b24] shadow-[0_30px_100px_rgba(0,0,0,0.38)] lg:-mt-8" : "group relative overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#171b24] shadow-[0_24px_80px_rgba(0,0,0,0.3)]"}>
              <div className="relative h-[420px]">
                <Image src={artist.image} alt={`${artist.name} artist spotlight`} fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover opacity-78 transition duration-700 group-hover:scale-[1.04]" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#090b10] via-[#090b10]/24 to-transparent" />
              </div>
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="text-xs uppercase tracking-[0.24em] text-[#ffffff]">{artist.role}</p>
                <h3 className="mt-2 text-3xl font-semibold text-white">{artist.name}</h3>
                <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-white/[0.08] bg-black/28 p-4 backdrop-blur-xl">
                  <span className="text-sm text-white/56">{artist.note}</span>
                  <span className="shrink-0 text-sm font-semibold text-white">{artist.stat}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="label" className="relative py-16 sm:py-24">
        <div className="absolute inset-0">
          <Image src={images.crowd.src} alt={images.crowd.alt} fill sizes="100vw" className="object-cover opacity-24" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#090b10_0%,rgba(9,11,16,0.88)_48%,#090b10_100%)]" />
        </div>
        <div className="shell relative grid gap-10 lg:grid-cols-[1.05fr,0.95fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffffff]">Label Identity</p>
            <h2 className="mt-5 max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.04em] text-white sm:text-6xl">
              We do not just distribute music.
            </h2>
          </div>
          <div className="space-y-5 text-lg leading-8 text-white/64">
            <p>We help shape artists into global brands, combining creative culture with the infrastructure needed to release, measure, monetize, and grow.</p>
            <p>Strategy, systems, and taste work together so every campaign feels intentional before it reaches the world.</p>
          </div>
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr,1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffffff]">Platform Showcase</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Release workflow, analytics, earnings, and campaign control in one workspace.</h2>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/distribution" className="btn-primary">View Distribution</Link>
              <Link href="/dashboard" className="btn-outline">Open Dashboard</Link>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/[0.08] bg-[#12151d]/82 p-4 shadow-[0_34px_110px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {platformPanels.map(([title, body, Icon]) => (
                <div key={title} className="rounded-3xl border border-white/[0.06] bg-white/[0.035] p-5">
                  <Icon className="h-5 w-5 text-[#ffffff]" />
                  <h3 className="mt-5 text-lg font-semibold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-white/50">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="grid gap-4 lg:grid-cols-3">
          {howItWorks.map(([step, title, body, Icon]) => (
            <article key={title} className="rounded-[2rem] border border-white/[0.06] bg-[#171b24]/72 p-6 shadow-[0_20px_70px_rgba(0,0,0,0.26)]">
              <div className="flex items-center justify-between gap-4">
                <span className="text-5xl font-semibold tracking-[-0.04em] text-white/16">{step}</span>
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#f4f7fb]/12 text-[#ffffff]">
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <h3 className="mt-7 text-2xl font-semibold text-white">{title}</h3>
              <p className="mt-3 text-sm leading-7 text-white/52">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffffff]">Proof</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-white sm:text-5xl">Trusted by artists who move with intent.</h2>
          </div>
          <Link href="/beat-store" className="inline-flex items-center gap-2 text-sm font-semibold text-[#ffffff]">
            Explore creator tools <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-[2rem] border border-white/[0.06] bg-[#12151d]/72 p-4">
          <div className="marquee-row gap-4">
            {[...testimonials, ...beatStoreReviews.map((review) => [review.review, review.name, review.role, "Verified creator"]), ...testimonials].map(([quote, name, role, milestone], index) => (
              <article key={`${name}-${index}`} className="w-[320px] shrink-0 rounded-[1.5rem] border border-white/[0.07] bg-[#171b24] p-5 sm:w-[390px]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#f4f7fb] to-[#f5c16c] text-sm font-bold text-[#071013]">{String(name).slice(0, 1)}</span>
                    <div>
                      <p className="font-semibold text-white">{name}</p>
                      <p className="text-sm text-white/44">{role}</p>
                    </div>
                  </div>
                  <BadgeCheck className="h-5 w-5 text-[#ffffff]" />
                </div>
                <p className="mt-5 text-sm leading-7 text-white/62">&quot;{quote}&quot;</p>
                <p className="mt-5 rounded-full border border-white/[0.06] bg-white/[0.035] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/48">{milestone}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/[0.08] bg-[#12151d] p-6 shadow-[0_34px_130px_rgba(0,0,0,0.42)] sm:p-10 lg:p-14">
          <div className="absolute inset-0">
            <Image src={images.backstage.src} alt={images.backstage.alt} fill sizes="100vw" className="object-cover opacity-18" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(90deg,#12151d_0%,rgba(18,21,29,0.88)_52%,rgba(18,21,29,0.68)_100%)]" />
          </div>
          <div className="relative max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#ffffff]">Start The Journey</p>
            <h2 className="mt-5 text-4xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-6xl">
              Your Career Deserves More Than Uploading Music.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-8 text-white/62">
              Join a premium agency and label ecosystem built for artists who want releases, audiences, identity, monetization, and cultural impact to grow together.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/login" className="premium-cta inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#f4f7fb] px-6 py-3 text-sm font-semibold text-[#071013] shadow-[0_0_42px_rgba(255,255,255,0.18)]">
                Start Your Journey
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/contact" className="premium-ghost inline-flex min-h-12 items-center justify-center rounded-full border border-white/12 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white backdrop-blur-xl">
                Contact The Team
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-12">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {catalog.slice(0, 4).map((beat) => (
            <article key={beat.id} className="overflow-hidden rounded-[1.75rem] border border-white/[0.06] bg-[#171b24]/76 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
              <div className="relative overflow-hidden rounded-[1.35rem] border border-white/[0.06]">
                <Image src={beat.coverImage} alt={beat.title} width={900} height={900} className="aspect-square w-full object-cover transition duration-500 hover:scale-[1.03]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-transparent" />
                <button type="button" aria-label={`Preview ${beat.title}`} className="absolute left-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.15] bg-black/[0.35] text-white backdrop-blur-md">
                  <Headphones className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/42">{beat.genre} / {beat.bpm} BPM</p>
                <h3 className="mt-2 text-xl font-semibold text-white">{beat.title}</h3>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="font-semibold text-[#f5c16c]">Rs {beat.startingPrice}</span>
                  <Link href="/beat-store" className="premium-ghost rounded-full border border-white/[0.08] px-4 py-2 text-xs font-semibold text-white/72">Open store</Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <FloatingAssistant
        context="Home support"
        suggestions={[
          { label: "Join The Platform", description: "Start the release and artist growth journey." },
          { label: "Explore services", description: "See distribution, marketing, label services, and creative support." },
          { label: "Open dashboard", description: "Review queue status, analytics, earnings, and orders." }
        ]}
      />
    </main>
  );
}
