import { GrowthPlanner } from '@/components/growth-planner';
import { VisitorReleaseHero } from '@/components/visitor-release-hero';
import { PublicHomeInformation } from "@/components/public-home-information";
import { publicPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { getTrackPricingQuote } from '@/lib/distribution-pricing';
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
export const metadata = publicPageMetadata('Music Distribution, Beats & Artist Services', 'Get your music ready and release it worldwide with HYMN. Beats, mixing, mastering and distribution for independent artists.', '/');
export default async function HomePage() {
 const [session, { beats, producerProfiles, featuredReviews, featuredReleases }] = await Promise.all([getSession(), getPublicHomePreview()]);
 const { catalog } = buildBeatStorefront(beats, producerProfiles);
 const singleReleasePrice = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(getTrackPricingQuote(1).finalPrice);
 const banners = buildHomePathBanners({ featuredReleases, catalog, signedIn: Boolean(session) });
 if (session) return <main id="home" className="hymn-landing"><LandingWorkspace workspaceHref={destinationForRole(session.role)}><HomeGoalWorkspace userId={session.sub} name={session.name} banners={banners}/><HomeReviewsCarousel reviews={featuredReviews} signedIn/><PublicHomeInformation/></LandingWorkspace></main>;
 return <main id="home" className="hymn-landing landing-visitor"><LandingWorkspace workspaceHref="/login">
  <VisitorReleaseHero releases={featuredReleases}/>
  <section className="visitor-trust" aria-label="Our commitments"><div><ShieldCheck size={21}/><span><strong>Your music stays yours.</strong></span></div><div><span className="visitor-zero">0%</span><span><strong>Additional HYMN royalty commission.</strong><small>The distribution partner&apos;s share applies.</small></span></div></section>
  <section className="visitor-destinations" aria-label="Music distribution destinations"><p>Distribute to</p><div>{[
    {name:'Spotify',src:'/assets/store-logos/wordmark-spotify.png'},
    {name:'Apple Music',src:'/assets/store-logos/wordmark-apple.png'},
    {name:'YouTube Music',src:'/assets/store-logos/wordmark-youtube.png'},
    {name:'Amazon Music',src:'/assets/store-logos/wordmark-amazon.png'},
    {name:'JioSaavn',src:'/assets/store-logos/wordmark-jiosaavn.png'}
  ].map(store => <Image key={store.name} src={store.src} alt={store.name} width={132} height={40} loading="lazy"/>)}</div></section>
  <HomeReviewsCarousel reviews={featuredReviews} compact/>
  {banners.releases}
  <section className="landing-next-move" aria-labelledby="next-move-title"><div className="landing-section-heading"><div><p className="landing-eyebrow">A LITTLE HELP, AT THE RIGHT MOMENT</p><h2 id="next-move-title">What are you creating next?</h2></div><span>Every artist starts somewhere.</span></div><div className="visitor-services">{[
   {href:'/distribution',title:'Release your music',tag:'Distribution',icon:Radio,copy:'Submit your finished tracks to streaming platforms.'},
   {href:'/beat-store',title:'Find your sound',tag:'Beat Store',icon:Disc3,copy:'Listen to beats and choose a license for your track.'},
   {href:'/producer-onboarding',title:'Open your beat store',tag:'For producers',icon:Disc3,copy:'Create a storefront where artists can license your beats.'},
   {href:'/studio',title:'Finish your record',tag:'Mixing & mastering',icon:Headphones,copy:'Bring your recorded tracks to a mixing or mastering engineer.'}
  ].map(({icon:Icon,...item})=><Link key={item.href} href={item.href} className="visitor-service"><span className="visitor-service-icon"><Icon size={21}/></span><span><small>{item.tag}</small><strong>{item.title}</strong><span>{item.copy}</span></span><ArrowRight size={17}/></Link>)}</div></section>
  {banners.beats}{banners.studio}
  <details className="visitor-planner"><summary>Plan your releases<span>Explore your schedule and costs</span></summary><GrowthPlanner/></details>
  <section className="visitor-release-start" aria-labelledby="visitor-release-start-title">
    <div className="visitor-release-start-copy"><p className="landing-eyebrow">YOUR NEXT RELEASE STARTS HERE</p><h2 id="visitor-release-start-title">Ready for your<br/>next release?</h2><Link href="/distribution/start" className="visitor-primary">Prepare my release <ArrowUpRight size={18}/></Link></div>
    <div className="visitor-price-summary"><strong>{singleReleasePrice}<span> / track</span></strong><p>One-time distribution. Optional add-ons cost extra.</p><Link href="/pricing">Compare plans <ArrowRight size={15}/></Link></div>
  </section>
  <section className="landing-newsletter" aria-labelledby="visitor-newsletter-title"><div className="shell"><div className="visitor-newsletter-row"><div><p className="landing-eyebrow">The HYMN newsletter</p><h2 id="visitor-newsletter-title">Release tips and updates<br/>for independent artists.</h2></div><HomeNewsletter/></div><div className="visitor-socials"><span>Keep up with HYMN</span><a href="https://www.instagram.com/hymnmusic.in/" target="_blank" rel="noreferrer" aria-label="HYMN on Instagram"><Instagram size={18}/></a><a href="https://www.youtube.com/@hymnmusic_in/" target="_blank" rel="noreferrer" aria-label="HYMN on YouTube"><Youtube size={19}/></a></div></div></section>
 <PublicHomeInformation/>
 </LandingWorkspace></main>;
}
