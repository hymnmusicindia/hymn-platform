import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Headphones,
  Instagram,
  Youtube,
} from "lucide-react";
import { buildHomePathBanners } from "@/components/home-path-banners";
import { HomeGoalWorkspace } from "@/components/home-goal-workspace";
import { LandingWorkspace } from "@/components/landing-workspace";
import { AnimatedHeroMetrics } from "@/components/animated-hero-metrics";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { HomeNewsletter } from "@/components/home-newsletter";
import { beatStoreReviews, buildBeatStorefront } from "@/lib/beat-store";
import { getPublicHomePreview } from "@/lib/public-home-data";
import { getSession } from "@/lib/session";
import { destinationForRole } from "@/lib/routes";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Music Distribution, Beats & Artist Services",
  description: "Build your next release with HYMN Music: license beats, book mixing and mastering, distribute worldwide, track royalties, and grow your independent music career.",
  alternates: { canonical: "/" }
};



const images = {
  hero: {
    src: "/home-hero-crowd.jpg",
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

const testimonials = [
  ["HYMN treated the release like a brand moment, not a file upload.", "Rhea K.", "Independent Artist", "3.1M launch streams"],
  ["The dashboard made our campaign feel controlled from announcement to payout.", "Dev House", "Producer Team", "12 releases managed"],
  ["They understood the music and the market. That combination is rare.", "Arjun N.", "Label Partner", "7 territories activated"]
];


export default async function HomePage() {
  const session = await getSession();
  const { beats, producerProfiles, googleAvatarUrls, featuredReviews, featuredReleases } = await getPublicHomePreview();
  const { catalog } = buildBeatStorefront(beats, producerProfiles);
  const banners = buildHomePathBanners({featuredReleases,catalog,signedIn:Boolean(session)});
  if (session) return <main id="home" className="hymn-landing"><LandingWorkspace workspaceHref={destinationForRole(session.role)}><HomeGoalWorkspace userId={session.sub} name={session.name} banners={banners} /></LandingWorkspace></main>;
  return (
    <main id="home" className="hymn-landing">
      <LandingWorkspace workspaceHref="/login">
      <section className="landing-hero">
        <div className="absolute inset-0">
          <Image src={images.hero.src} alt={images.hero.alt} fill priority fetchPriority="high" quality={75} sizes="100vw" className="scale-105 object-cover object-center opacity-52" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_32%,rgba(255,255,255,0.16),transparent_26%),linear-gradient(90deg,rgba(9,11,16,0.96)_0%,rgba(9,11,16,0.76)_46%,rgba(9,11,16,0.5)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,11,16,0.22)_0%,rgba(9,11,16,0.18)_46%,#090b10_100%)]" />
          <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.25)_0_1px,transparent_1px),radial-gradient(circle_at_80%_45%,rgba(255,255,255,0.34)_0_1px,transparent_1px)] [background-size:90px_90px,140px_140px] motion-safe:animate-[hymn-grid-float_22s_linear_infinite]" />
        </div>

        <div className="landing-hero-content">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Independent artists. Unlimited possibilities.</p>
            <h1>
              Where Artists Become Movements.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white opacity-70 sm:mt-6 sm:text-base sm:leading-8 lg:text-lg">
              HYMN helps artists release music, build audiences, monetize creatively, grow brands, access label services, and scale into a global career ecosystem.
            </p>
            <AnimatedHeroMetrics />
            <div className="mt-7 h-px max-w-3xl bg-gradient-to-r from-white/20 via-white/10 to-transparent" aria-hidden="true" />
            <Link
                href="/first-release"
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
                    Release your first track free
                    <ArrowRight className="hidden h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 sm:block" />
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-white/50">Music distribution for independent artists.</span>
                </span>
              </Link>
          </div>
        </div>
      </section>

      <section className="landing-next-move" aria-labelledby="next-move-title">
        <div className="landing-section-heading"><div><p className="landing-eyebrow">One home for your music</p><h2 id="next-move-title">What are you creating next?</h2></div><span>Start anywhere. Keep moving.</span></div>
        <div className="landing-services">{[
          {href:"/distribution",number:"01",title:"Release your music",copy:"Take your next release to the world's music platforms.",icon:ArrowRight,tag:"Distribution"},
          {href:"/beat-store",number:"02",title:"Find your next sound",copy:"Discover beats and license the one that feels like you.",icon:Headphones,tag:"Beatstore"},
          {href:"/studio",number:"03",title:"Finish your record",copy:"Connect with engineers for mixing and mastering.",icon:Headphones,tag:"Mixing / Mastering"}
        ].map(service=><Link key={service.number} href={service.href} className="landing-service"><div><span>{service.tag}</span><small>{service.number}</small></div><service.icon size={25}/><h3>{service.title}</h3><p>{service.copy}</p><span className="landing-service-cta">Explore <ArrowRight size={16}/></span></Link>)}</div>
      </section>

      {!session ? (
            <section className="landing-signup">
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
            </section>
          ) : null}

      {banners.platforms}

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

      {banners.journey}
      {banners.producers}

      {banners.releases}

      <section id="artists" className="landing-artists shell py-12 sm:py-16">
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

      <section className="landing-career shell py-10 sm:py-16">
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
              <Link href="/login" className="premium-cta inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#f4f7fb] px-6 py-3 text-sm font-semibold text-[#071013] shadow-[0_0_42px_rgba(255,255,255,0.18)] sm:w-auto sm:min-h-12">
                Login
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

      {banners.beats}

      <section id="newsletter" className="landing-newsletter border-y border-white/[0.06] bg-[#090a0c]">
        <div className="shell py-10 sm:py-14 lg:py-16">
          <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between lg:gap-12">
            <h2 className="max-w-sm text-2xl font-medium leading-tight tracking-[-0.03em] text-white sm:text-3xl">
              Subscribe to our newsletter<br className="hidden sm:block" /> for updates
            </h2>
            <HomeNewsletter />
          </div>

          <div className="my-9 h-px bg-white/[0.055] sm:my-11" />

          <div className="flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
            <Image src="/assets/hymnlogowhite.png" alt="HYMN Music" width={164} height={56} className="h-10 w-auto object-contain" />
            <div className="flex items-center gap-6 text-white sm:gap-7" aria-label="HYMN social channels">
              {[
                ["Instagram", "https://www.instagram.com/hymnmusic.in/", Instagram],
                ["YouTube", "https://www.youtube.com/@hymnmusic_in/", Youtube]
              ].map(([label, href, Icon]) => { const SocialIcon = Icon as typeof Instagram; return <a key={label as string} href={href as string} target="_blank" rel="noreferrer" aria-label={label as string} className="grid h-8 w-8 place-items-center transition-opacity hover:opacity-70"><SocialIcon className="h-5 w-5" strokeWidth={2.2} /></a>; })}
            </div>
          </div>
        </div>
      </section>
      </LandingWorkspace>
    </main>
  );
}

// vercel trigger 2

// vercel trigger

// vercel trigger 3
