import { publicPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import Image from 'next/image';
import { AnimatedHeroMetrics } from '@/components/animated-hero-metrics';
import { ArrowRight, Disc3, Headphones, Radio, Instagram, Youtube } from 'lucide-react';
import { buildHomePathBanners } from '@/components/home-path-banners';
import { HomeGoalWorkspace } from '@/components/home-goal-workspace';
import { LandingWorkspace } from '@/components/landing-workspace';
import { HomeNewsletter } from '@/components/home-newsletter';
import { buildBeatStorefront } from '@/lib/beat-store';
import { HomeReviewsCarousel } from '@/components/home-reviews-carousel';
import { getPublicHomePreview } from '@/lib/public-home-data';
import { getSession } from '@/lib/session';
import { destinationForRole } from '@/lib/routes';
import './homepage.css';
export const metadata = publicPageMetadata('Music Distribution, Beats & Artist Services', 'Release music worldwide, discover beats and work with mixing and mastering engineers. Your next chapter starts with HYMN.', '/');
const images = {hero:{alt:'Artist performing in front of a massive concert crowd'}};
export default async function HomePage() {
 const [session, { beats, producerProfiles, googleAvatarUrls, featuredReviews, featuredReleases }] = await Promise.all([getSession(), getPublicHomePreview()]);
 const { catalog } = buildBeatStorefront(beats, producerProfiles);
 const banners = buildHomePathBanners({ featuredReleases, catalog, signedIn: Boolean(session) });
 if (session) return <main id="home" className="hymn-landing"><LandingWorkspace workspaceHref={destinationForRole(session.role)}><HomeGoalWorkspace userId={session.sub} name={session.name} banners={banners}/><HomeReviewsCarousel reviews={featuredReviews}/></LandingWorkspace></main>;
 return <main id="home" className="hymn-landing landing-visitor"><LandingWorkspace workspaceHref="/login">
  <section className="landing-hero force-dark">
        <div className="absolute inset-0">
          <picture><source media="(max-width: 640px)" srcSet="/images/home-hero-640.webp"/><img src="/images/home-hero-1280.webp" alt={images.hero.alt} fetchPriority="high" loading="eager" decoding="async" className="absolute inset-0 h-full w-full scale-105 object-cover object-center opacity-52"/></picture>
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
            <Link prefetch={false}
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
  {banners.releases}
  <section className="landing-next-move" aria-labelledby="next-move-title"><div className="landing-section-heading"><h2 id="next-move-title">What are you creating next?</h2><span>Pick your starting point.</span></div><div className="visitor-services">{[
   {href:'/distribution',title:'Release your music',tag:'Distribution',icon:Radio,copy:'Take your next release worldwide.'},
   {href:'/beat-store',title:'Find your sound',tag:'Beat Store',icon:Disc3,copy:'Discover and license your next beat.'},
   {href:'/studio',title:'Finish your record',tag:'Mixing & mastering',icon:Headphones,copy:'Work with an engineer on your sound.'}
  ].map(({icon:Icon,...item})=><Link key={item.href} href={item.href} className="visitor-service"><span className="visitor-service-icon"><Icon size={21}/></span><span><small>{item.tag}</small><strong>{item.title}</strong><span>{item.copy}</span></span><ArrowRight size={17}/></Link>)}</div></section>
  {banners.journey}{banners.beats}{banners.platforms}
  <HomeReviewsCarousel reviews={featuredReviews} compact/>
  <section className="landing-newsletter" aria-labelledby="visitor-newsletter-title"><div className="shell"><div className="visitor-newsletter-row"><div><p className="landing-eyebrow">Stay in the loop</p><h2 id="visitor-newsletter-title">A little inspiration. <br/>Your next beginning.</h2></div><HomeNewsletter/></div><div className="visitor-socials"><span>Follow the music</span><a href="https://www.instagram.com/hymnmusic.in/" target="_blank" rel="noreferrer" aria-label="HYMN on Instagram"><Instagram size={18}/></a><a href="https://www.youtube.com/@hymnmusic_in/" target="_blank" rel="noreferrer" aria-label="HYMN on YouTube"><Youtube size={19}/></a></div></div></section>
 </LandingWorkspace></main>;
}
