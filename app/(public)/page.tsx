import { GrowthPlanner } from '@/components/growth-planner';
import { HomeCreatorInvitation } from '@/components/home-creator-invitation';
import { ArtistFeatureShowcase } from '@/components/artist-feature-showcase';
import { VisitorReleaseHero } from '@/components/visitor-release-hero';
import { PublicHomeInformation } from "@/components/public-home-information";
import { publicPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { getTrackPricingQuote } from '@/lib/distribution-pricing';
import { ArrowRight, Instagram, Youtube } from 'lucide-react';
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
export const metadata = publicPageMetadata('Music Distribution, Beats & Artist Services', 'Get your music ready and release it worldwide with HYMN. Beats, mixing, mastering and distribution for independent artists.', '/');
export default async function HomePage() {
 const [session, { beats, producerProfiles, featuredReviews, featuredReleases }] = await Promise.all([getSession(), getPublicHomePreview()]);
 const { catalog } = buildBeatStorefront(beats, producerProfiles);
 const singleReleasePrice = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(getTrackPricingQuote(1).finalPrice);
 const banners = buildHomePathBanners({ featuredReleases, catalog, signedIn: Boolean(session) });
 if (session) return <main id="home" className="hymn-landing"><LandingWorkspace workspaceHref={destinationForRole(session.role)}><HomeGoalWorkspace userId={session.sub} name={session.name} banners={banners}/><HomeReviewsCarousel reviews={featuredReviews} signedIn/><PublicHomeInformation/></LandingWorkspace></main>;
 return <main id="home" className="hymn-landing landing-visitor"><LandingWorkspace workspaceHref="/login">
  <VisitorReleaseHero releases={featuredReleases.slice(0, 4)} beats={catalog.slice(0, 3).map(beat => ({ id: beat.id, title: beat.title, coverImage: beat.coverImage, producerName: beat.producer.name }))}/>
  <section className="visitor-trust" aria-label="Our commitments"><div><ShieldCheck size={21}/><span><strong>Your music stays yours.</strong></span></div></section>
  <section className="visitor-destinations" aria-label="Music distribution destinations"><p>Distribute to</p><div>{[
    {name:'Spotify',src:'/assets/store-logos/wordmark-spotify.png'},
    {name:'Apple Music',src:'/assets/store-logos/wordmark-apple.png'},
    {name:'YouTube Music',src:'/assets/store-logos/wordmark-youtube.png'},
    {name:'Amazon Music',src:'/assets/store-logos/wordmark-amazon.png'},
    {name:'JioSaavn',src:'/assets/store-logos/wordmark-jiosaavn.png'}
  ].map(store => <Image key={store.name} src={store.src} alt={store.name} width={132} height={40} loading="lazy"/>)}</div></section>
  <HomeReviewsCarousel reviews={featuredReviews} compact/>
  {banners.releases}
  <ArtistFeatureShowcase releases={featuredReleases.slice(0, 3)} beats={catalog.slice(0, 1).map(beat => ({ title: beat.title, coverImage: beat.coverImage, producerName: beat.producer.name }))}/>
  {banners.beats}{banners.studio}
  <HomeCreatorInvitation/>
  <details className="visitor-planner"><summary>Plan your releases<span>Explore your schedule and costs</span></summary><GrowthPlanner/></details>
  <section className="visitor-release-start" aria-labelledby="visitor-release-start-title">
    <div className="visitor-release-start-copy"><p className="landing-eyebrow">YOUR NEXT RELEASE STARTS HERE</p><h2 id="visitor-release-start-title">Ready for your<br/>next release?</h2><Link href="/distribution/start" className="visitor-primary">Prepare my release <ArrowUpRight size={18}/></Link></div>
    <div className="visitor-price-summary"><strong>{singleReleasePrice}<span> / track</span></strong><p>One-time distribution. Optional add-ons cost extra.</p><Link href="/pricing">Compare plans <ArrowRight size={15}/></Link></div>
  </section>
  <section className="landing-newsletter" aria-labelledby="visitor-newsletter-title"><div className="shell"><div className="visitor-newsletter-row"><div><p className="landing-eyebrow">The HYMN newsletter</p><h2 id="visitor-newsletter-title">Release tips and updates<br/>for independent artists.</h2></div><HomeNewsletter/></div><div className="visitor-socials"><span>Keep up with HYMN</span><a href="https://www.instagram.com/hymnmusic.in/" target="_blank" rel="noreferrer" aria-label="HYMN on Instagram"><Instagram size={18}/></a><a href="https://www.youtube.com/@hymnmusic_in/" target="_blank" rel="noreferrer" aria-label="HYMN on YouTube"><Youtube size={19}/></a></div></div></section>
 <PublicHomeInformation/>
 </LandingWorkspace></main>;
}
