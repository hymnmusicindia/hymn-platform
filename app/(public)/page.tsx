import { publicPageMetadata } from '@/lib/seo';
import Link from 'next/link';
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
export default async function HomePage() {
 const [session, { beats, producerProfiles, featuredReviews, featuredReleases }] = await Promise.all([getSession(), getPublicHomePreview()]);
 const { catalog } = buildBeatStorefront(beats, producerProfiles);
 const banners = buildHomePathBanners({ featuredReleases, catalog, signedIn: Boolean(session) });
 if (session) return <main id="home" className="hymn-landing"><LandingWorkspace workspaceHref={destinationForRole(session.role)}><HomeGoalWorkspace userId={session.sub} name={session.name} banners={banners}/><HomeReviewsCarousel reviews={featuredReviews}/></LandingWorkspace></main>;
 return <main id="home" className="hymn-landing landing-visitor"><LandingWorkspace workspaceHref="/login">
  <section className="landing-hero force-dark" aria-labelledby="visitor-hero-title">
   <picture className="visitor-hero-image"><source media="(max-width:640px)" srcSet="/images/home-hero-640.webp"/><img src="/images/home-hero-1280.webp" alt="A live music crowd" fetchPriority="high" loading="eager" decoding="async"/></picture><div className="visitor-hero-shade"/>
   <div className="landing-hero-content"><div className="landing-hero-copy"><p className="landing-eyebrow">Independent music. Shared ambition.</p><h1 id="visitor-hero-title">Where artists<br/>become movements.</h1><p>Release worldwide. Find your sound. Make your next record with HYMN.</p><div className="visitor-hero-actions"><Link href="/distribution" className="visitor-primary">Release your music <ArrowRight size={16}/></Link><Link href="/beat-store">Explore beats <ArrowRight size={15}/></Link></div><Link href="/first-release" className="visitor-first-release">Your first track, on us <ArrowRight size={13}/></Link></div></div>
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
