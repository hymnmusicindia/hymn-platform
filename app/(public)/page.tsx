import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Clapperboard,
  DollarSign,
  FileAudio,
  Headphones,
  LineChart,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { FloatingAssistant } from "@/components/floating-assistant";
import { AnimatedHeroMetrics } from "@/components/animated-hero-metrics";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { beatStoreReviews, buildBeatStorefront } from "@/lib/beat-store";
import { getPublicHomePreview } from "@/lib/public-home-data";
import { getSession } from "@/lib/session";
import { destinationForRole } from "@/lib/routes";



const images = {
  hero: {
    src: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&q=75&w=1920",
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

const storeLogos = [
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

const storeLogoMarquee = [...storeLogos, ...storeLogos];

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

export default async function HomePage() {
  const [{ beats, producerProfiles, googleAvatarUrls, featuredReviews, featuredReleases }, session] = await Promise.all([getPublicHomePreview(), getSession()]);
  const { catalog } = buildBeatStorefront(beats, producerProfiles);
  const homepageShowcaseReleases = featuredReleases.length ? featuredReleases : catalog.slice(0, 9).map((beat) => ({
    id: beat.id,
    title: beat.title,
    artistName: beat.producerName,
    artworkUrl: beat.coverImage,
    releaseType: "single",
    status: "live"
  }));
  const showcaseLeftColumn = homepageShowcaseReleases.filter((_, index) => index % 2 === 0);
  const showcaseRightColumn = homepageShowcaseReleases.filter((_, index) => index % 2 === 1);
  const showcaseColumns = [
    { key: "left", items: showcaseLeftColumn.length ? showcaseLeftColumn : homepageShowcaseReleases, direction: "up" },
    { key: "right", items: showcaseRightColumn.length ? showcaseRightColumn : homepageShowcaseReleases, direction: "down" }
  ] as const;
  return (
    <main className="overflow-hidden bg-background pb-20 text-foreground">
      <section className="relative -mt-[73px] min-h-[96vh] overflow-hidden pt-[73px]">
        <div className="absolute inset-0">
          <Image src={images.hero.src} alt={images.hero.alt} fill priority fetchPriority="high" quality={75} sizes="100vw" className="scale-105 object-cover object-center opacity-52" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_32%,rgba(255,255,255,0.16),transparent_26%),linear-gradient(90deg,rgba(9,11,16,0.96)_0%,rgba(9,11,16,0.76)_46%,rgba(9,11,16,0.5)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,16,0.22)_0%,rgba(9,11,16,0.18)_46%,#090b10_100%)]" />
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.25)_0_1px,transparent_1px),radial-gradient(circle_at_80%_45%,rgba(255,255,255,0.34)_0_1px,transparent_1px)] [background-size:90px_90px,140px_140px] motion-safe:animate-[hymn-grid-float_22s_linear_infinite]" />
        </div>

        <div className={`shell relative grid min-h-[calc(96vh-73px)] min-w-0 grid-cols-[minmax(0,1fr)] items-center gap-10 py-12 sm:py-14 ${session ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(330px,410px)] lg:gap-12"}`}>
          <div className="min-w-0 max-w-4xl">
            <h1 className="text-4xl font-semibold leading-[1.02] tracking-[-0.035em] text-white sm:text-5xl sm:leading-[0.96] lg:text-7xl xl:text-[5.8rem]">
              Where Artists Become Movements.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white opacity-70 sm:mt-6 sm:text-base sm:leading-8 lg:text-lg">
              HYMN helps artists release music, build audiences, monetize creatively, grow brands, access label services, and scale into a global career ecosystem.
            </p>
            <AnimatedHeroMetrics />
            <div className="mt-7 h-px max-w-3xl bg-gradient-to-r from-white/20 via-white/10 to-transparent" aria-hidden="true" />
            <Link
                href={session ? "/distribution/start" : "/login?mode=signup"}
                className="group mt-5 inline-flex max-w-full items-center gap-4 text-left transition duration-300 hover:-translate-y-0.5"
              >
                {googleAvatarUrls.length ? (
                  <span className="flex shrink-0 -space-x-2.5" aria-hidden="true">
                    {googleAvatarUrls.map((src, index) => (
                      <span key={`${src}-${index}`} className="relative h-9 w-9 overflow-hidden rounded-full border-2 border-[#11141b] bg-[#1b1f28] sm:h-10 sm:w-10" style={{ zIndex: googleAvatarUrls.length - index }}>
                        <Image src={src} alt="" fill sizes="40px" className="object-cover" unoptimized />
                      </span>
                    ))}
                  </span>
                ) : null}
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold text-white">
                    {session ? "Ready to release? Start your release." : "Ready to release? Create your account."}
                    <ArrowRight className="hidden h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 sm:block" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/50">Join 2.4K+ artists supported by HYMN.</span>
                </span>
              </Link>
          </div>
          {!session ? (
            <aside className="force-dark relative mx-auto min-w-0 w-full max-w-[410px] overflow-hidden rounded-[1.65rem] border border-white/15 bg-black/[0.12] p-5 shadow-[0_28px_90px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-lg sm:p-6 lg:p-7">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(255,255,255,0.1),transparent_38%),linear-gradient(145deg,rgba(255,255,255,0.035),transparent_62%)]" />
              <div className="relative">
                <h2 className="max-w-sm text-[clamp(2.15rem,3.2vw,3.35rem)] font-bold leading-[0.94] tracking-[-0.05em] text-white">
                  <span className="block">Sign up.</span>
                  <span className="mt-1.5 block text-white/55">Your next move</span>
                  <span className="mt-1.5 block">starts here.</span>
                </h2>
                <div className="my-5 h-px bg-gradient-to-r from-white/20 via-white/8 to-transparent" />
                <GoogleAuthButton label="Continue with Google" expectedRole="customer" appearance="quiet" className="w-full" />
                <p className="mt-5 text-center text-[8px] leading-5 tracking-tight text-white/45 sm:whitespace-nowrap sm:text-[10px]">
                  By continuing, you agree to our{" "}
                  <Link href="/terms-of-service" className="text-white/75 underline decoration-white/25 underline-offset-4 transition hover:text-white">Terms of Service</Link>
                  {" "}and{" "}
                  <Link href="/privacy-policy" className="text-white/75 underline decoration-white/25 underline-offset-4 transition hover:text-white">Privacy Policy</Link>.
                </p>
              </div>
            </aside>
          ) : null}
        </div>
      </section>

      <section className="shell py-10 sm:py-14">
        <div className="rounded-[2rem] border border-border bg-surface/72 p-5 shadow-[0_24px_90px_rgba(0,0,0,0.3)] backdrop-blur-2xl sm:p-7">
          <div className="flex justify-center py-2 text-center sm:py-4">
            <h2 className="text-balance text-[clamp(1.05rem,3vw,2.25rem)] font-bold leading-tight tracking-[-0.04em] text-[var(--text)] sm:whitespace-nowrap sm:leading-none" style={{ fontFamily: '"Avenir Next", "Century Gothic", "Segoe UI Variable Display", "Segoe UI", sans-serif' }}>
              Connected To The Global Music Ecosystem
            </h2>
          </div>
          <div className="mt-7 overflow-hidden rounded-2xl border"
            style={{
              borderColor: "color-mix(in srgb, var(--glass-border) 82%, transparent)",
              background: "rgba(255, 255, 255, 0.96)"
            }}
          >          
            <div className="marquee-row music-store-marquee items-center gap-12 px-8 py-5 sm:gap-16">
              {storeLogoMarquee.map((item, index) => (
                <div key={`${item.name}-${index}`} className="inline-flex h-12 w-36 shrink-0 items-center justify-center" title={item.name}>
                  <Image src={item.src} alt={item.name} width={144} height={48} className={`distribution-store-logo ${item.className}`} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="label" className="relative py-16 sm:py-24">
        <div className="absolute inset-0">
          <Image src={images.crowd.src} alt={images.crowd.alt} fill sizes="100vw" className="object-cover opacity-24" unoptimized />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,#090b10_0%,rgba(9,11,16,0.88)_48%,#090b10_100%)]" />
        </div>
        <div className="shell relative grid gap-10 lg:grid-cols-[1.05fr,0.95fr] lg:items-center">
          <div>
            <h2 className="max-w-4xl text-5xl font-semibold leading-[0.96] tracking-[-0.04em] text-white sm:text-6xl">
              We do not just distribute music.
            </h2>
          </div>
          <div className="space-y-5 text-lg leading-8 text-white">
            <p>We help shape artists into global brands, combining creative culture with the infrastructure needed to release, measure, monetize, and grow.</p>
            <p>Strategy, systems, and taste work together so every campaign feels intentional before it reaches the world.</p>
          </div>
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="grid gap-8 lg:grid-cols-[0.9fr,1.1fr] lg:items-center">
          <div>
            <h2 className="text-4xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-5xl">Release workflow, analytics, earnings, and campaign control in one workspace.</h2>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/distribution" className="btn-primary">View Distribution</Link>
              <Link href="/dashboard" className="btn-outline">Open Dashboard</Link>
            </div>
          </div>
          <div className="home-workspace-shell rounded-[2rem] border border-border bg-surface/82 p-4 shadow-[0_34px_110px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:p-6">
            <div className="grid gap-4 md:grid-cols-2">
              {platformPanels.map(([title, body, Icon]) => (
                <div key={title} className="home-workspace-card rounded-3xl border border-border bg-card p-5">
                  <Icon className="h-5 w-5 text-foreground" />
                  <h3 className="mt-5 text-lg font-semibold text-[var(--text)]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-10 sm:py-16">
        <div className="relative overflow-hidden rounded-[2rem] border border-border bg-black px-5 py-10 shadow-[0_32px_120px_rgba(0,0,0,0.42)] sm:px-8 lg:min-h-[470px] lg:px-14 lg:py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_18%,rgba(255,255,255,0.1),transparent_25%),linear-gradient(90deg,rgba(0,0,0,1)_0%,rgba(0,0,0,0.92)_44%,rgba(0,0,0,0.54)_100%)]" />
          <div className="relative grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/50">#releasedonhymn</p>
              <h2 className="mt-6 text-4xl font-extrabold uppercase leading-[0.98] tracking-[-0.05em] text-white sm:text-5xl lg:text-6xl">
                Yes, this release moved through HYMN.
              </h2>
              <p className="mt-6 max-w-md text-sm font-medium leading-7 text-white/72 sm:text-base">
                Spotlight real releases from your HYMN database and turn the homepage into living proof of the platform.
              </p>
              <Link href={session ? "/distribution/start" : "/login?mode=signup"} className="mt-7 inline-flex items-center gap-3 rounded-xl border border-white/12 bg-white/[0.08] px-5 py-3 text-sm font-semibold text-white transition hover:border-white/28 hover:bg-white/[0.14]">
                Your next release is waiting
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="home-release-showcase-viewport relative grid max-h-[560px] grid-cols-2 gap-4 overflow-hidden pr-1 lg:-my-20 lg:max-h-[640px]">
              {showcaseColumns.map((column) => (
                <div key={column.key} className="home-release-showcase-column overflow-hidden">
                  <div className={`home-release-showcase-track ${column.direction === "up" ? "home-release-showcase-track-up" : "home-release-showcase-track-down"}`}>
                    {[...column.items, ...column.items].map((release, index) => (
                      <article key={`${column.key}-${release.id}-${index}`} className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.06] shadow-[0_18px_60px_rgba(0,0,0,0.32)]">
                        <div className="aspect-square overflow-hidden">
                          <img src={release.artworkUrl} alt={`${release.title} artwork`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(180deg,transparent_0%,rgba(0,0,0,0.58)_30%,rgba(0,0,0,0.94)_100%)] px-3 pb-3 pt-12 text-white">
                          <p className="line-clamp-1 text-xs font-extrabold uppercase tracking-[-0.02em] drop-shadow-[0_2px_10px_rgba(0,0,0,0.95)]">{release.title}</p>
                          <p className="line-clamp-1 text-[11px] font-semibold text-white/82 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">{release.artistName}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-12 sm:py-16">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-4xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-5xl">Trusted by artists who move with intent.</h2>
          </div>
          <Link href="/beat-store" className="inline-flex items-center gap-2 text-sm font-semibold text-foreground">
            Explore creator tools <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-[2rem] border border-border bg-surface/72 p-4">
          <div className="marquee-row gap-4">
            {[...testimonials, ...featuredReviews.map((review) => [review.body || "", review.user.name, review.purchaseType === "beat" ? "Beat Store customer" : "HYMN distribution customer", `${review.rating}/5 verified purchase`]), ...beatStoreReviews.map((review) => [review.review, review.name, review.role, "Verified creator"]), ...testimonials].map(([quote, name, role, milestone], index) => (
              <article key={`${name}-${index}`} className="w-[320px] shrink-0 rounded-[1.5rem] border border-white/[0.07] bg-card p-5 sm:w-[390px]">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#f4f7fb] to-[#f5c16c] text-sm font-bold text-[#071013]">{String(name).slice(0, 1)}</span>
                    <div>
                      <p className="font-semibold text-[var(--text)]">{name}</p>
                      <p className="text-sm text-[var(--text-soft)]">{role}</p>
                    </div>
                  </div>
                  <BadgeCheck className="h-5 w-5 text-foreground" />
                </div>
                <p className="mt-5 text-sm leading-7 text-[var(--text-soft)]">&quot;{quote}&quot;</p>
                <p className="mt-5 rounded-full border border-border bg-[var(--bg-soft)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">{milestone}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="shell py-10 sm:py-16">
        <div className="relative overflow-hidden rounded-[1.75rem] border border-border bg-surface p-6 shadow-[0_34px_130px_rgba(0,0,0,0.42)] sm:rounded-[2.5rem] sm:p-10 lg:p-14">
          <div className="absolute inset-0">
            <Image src={images.backstage.src} alt={images.backstage.alt} fill sizes="100vw" className="object-cover opacity-18" unoptimized />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(90deg,#12151d_0%,rgba(18,21,29,0.88)_52%,rgba(18,21,29,0.68)_100%)]" />
          </div>
          <div className="relative max-w-3xl">
            <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-white sm:text-4xl lg:text-6xl">
              Your Career Deserves More Than Uploading Music.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 sm:mt-5 sm:text-base sm:leading-8" style={{ color: "rgba(143, 151, 170, 0.72)" }}>
              Join a premium agency and label ecosystem built for artists who want releases, audiences, identity, monetization, and cultural impact to grow together.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:mt-8 sm:flex-row sm:flex-wrap">
              <Link href={session ? destinationForRole(session.role) : "/login"} className="premium-cta inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#f4f7fb] px-6 py-3 text-sm font-semibold text-[#071013] shadow-[0_0_42px_rgba(255,255,255,0.18)] sm:w-auto sm:min-h-12">
                {session ? "Go to Dashboard" : "Login"}
                <ArrowRight className="h-4 w-4" />
              </Link>
              {!session ? (
                <Link href="/login?mode=signup" className="premium-ghost inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/25 bg-white/[0.06] px-6 py-3 text-sm font-semibold text-white backdrop-blur-md transition-colors hover:border-white/45 hover:bg-white/[0.12] sm:w-auto sm:min-h-12">
                  Sign Up
                </Link>
              ) : null}
              <Link href="/contact" className="premium-ghost inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/12 bg-card px-6 py-3 text-sm font-semibold backdrop-blur-xl sm:w-auto sm:min-h-12" style={{ color: "var(--text)" }}>
                Contact The Team
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-10">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {catalog.slice(0, 4).map((beat) => (
            <article key={beat.id} className="overflow-hidden rounded-[1.35rem] border border-border bg-card/76 p-3 shadow-[0_16px_50px_rgba(0,0,0,0.22)]">
              <div className="relative overflow-hidden rounded-[1rem] border border-border">
                <Image src={beat.coverImage} alt={beat.title} width={900} height={900} className="aspect-square w-full object-cover transition duration-500 hover:scale-[1.03]" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-transparent to-transparent" />
                <button type="button" aria-label={`Preview ${beat.title}`} className="absolute left-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.15] bg-black/[0.35] text-white backdrop-blur-md">
                  <Headphones className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-3 px-0.5 pb-0.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/42">{beat.genre} / {beat.bpm} BPM</p>
                <h3 className="mt-1.5 text-lg font-semibold" style={{ color: "var(--text)" }}>{beat.title}</h3>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[#f5c16c]">Rs {beat.startingPrice}</span>
                  <Link href="/beat-store" className="premium-ghost rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-white/72">Open store</Link>
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

// vercel trigger 2

// vercel trigger

// vercel trigger 3
