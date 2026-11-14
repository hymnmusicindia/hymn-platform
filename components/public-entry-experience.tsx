import Link from 'next/link';
import { ArrowRight, FileCheck2, Headphones, Radio, ShieldCheck } from 'lucide-react';
import { getPublicHomePreview } from '@/lib/public-home-data';
import { buildHomePathBanners } from '@/components/home-path-banners';
import { HomeReviewsCarousel } from '@/components/home-reviews-carousel';
import styles from './public-entry-experience.module.css';

export function PublicEntryHero({eyebrow,title,description,partnership=false}:{eyebrow:string;title:string;description:string;partnership?:boolean}){
 return <header className={styles.hero}>
  <div className={styles.heroImage}><picture><source media="(max-width:640px)" srcSet="/images/home-hero-640.webp"/><img src="/images/home-hero-1280.webp" alt="An artist performing for a live music audience" fetchPriority="high"/></picture></div>
  <div className={styles.copy}><p className={styles.eyebrow}>{eyebrow}</p><h1>{title}</h1><p className={styles.description}>{description}</p><div className={styles.actions}><Link href={partnership?'#partnership-enquiry':'/first-release'} className={styles.primary}>{partnership?'Let’s build together':'Start my first release'}<ArrowRight size={18}/></Link><Link href={partnership?'/services':'#released'} className={styles.secondary}>{partnership?'Explore HYMN services':'Meet the music'}<ArrowRight size={16}/></Link></div><div className={styles.promise}><ShieldCheck size={17}/><span>{partnership?'For labels, collectives, managers and creators.':'First single’s base distribution fee: FREE. Eligibility applies; optional extras cost separately.'}</span></div></div>
 </header>;
}

export async function PublicEntryProof({offer=true}:{offer?:boolean}){
 const {featuredReleases,featuredReviews}=await getPublicHomePreview();
 const banners=buildHomePathBanners({featuredReleases,catalog:[]});
 return <div className={`hymn-landing ${styles.proof}`}>
  {featuredReleases.length>0?banners.releases:null}
  {banners.platforms}
  <section className={styles.assurance} aria-label="A clearer release experience">{[
   {Icon:FileCheck2,title:'Your release, kept in view',body:'Prepare your audio, artwork and credits, respond to review requests and follow delivery updates in your workspace.'},
   {Icon:ShieldCheck,title:'Clear terms before you commit',body:'Review fees, rights and royalty terms before submitting. HYMN charges zero additional royalty commission; the distribution partner’s share applies.'},
   {Icon:Headphones,title:'People to help you move forward',body:'Find release guidance, answers and a way to contact HYMN when you need support.'}
  ].map(({Icon,title,body})=><article key={title}><Icon size={24}/><h3>{title}</h3><p>{body}</p></article>)}</section>
  <HomeReviewsCarousel reviews={featuredReviews} compact/>
  {offer?<section className={styles.offer}><div><p className={styles.eyebrow}><Radio size={15}/> YOUR FIRST CHAPTER</p><h2>Your first release.<br/>Base fee? <span>FREE.</span></h2><p>Your first single’s base distribution fee is on us for eligible artists. Optional services and extras are priced separately. Check eligibility and current terms before claiming.</p></div><Link href="/first-release" className={styles.primary}>Check my free release <ArrowRight size={18}/></Link></section>:null}
 </div>;
}
