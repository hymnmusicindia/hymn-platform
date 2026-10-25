import Link from 'next/link';
import { ArrowRight, AudioLines, FileCheck2, Globe2, Wallet } from 'lucide-react';
import { publicPageMetadata, jsonLd } from '@/lib/seo';
import { getPublicAppUrl } from '@/lib/public-app-url';
import { DISTRIBUTION_POLICY_SUMMARY } from '@/lib/policy-content';

export const metadata=publicPageMetadata('Music Distribution for Independent Artists','Distribute your music with HYMN Music. Prepare release metadata, manage rights evidence, track delivery and view reported royalties in one artist workspace.','/music-distribution');
export default function MusicDistributionPage(){
  const origin=getPublicAppUrl();
  const schema={'@context':'https://schema.org','@type':'Service',name:'HYMN Music Distribution',serviceType:'Digital music distribution',url:`${origin}/music-distribution`,provider:{'@id':`${origin}/#organization`},description:'Digital music distribution, release preparation, delivery tracking and royalty reporting for independent artists.'};
  return <main className="shell py-12 sm:py-16"><script type="application/ld+json" dangerouslySetInnerHTML={{__html:jsonLd(schema)}}/>
    <nav aria-label="Breadcrumb" className="mb-8 text-sm text-[var(--text-muted)]"><Link href="/">HYMN Music</Link><span aria-hidden="true"> / </span><span>Music distribution</span></nav>
    <header className="max-w-4xl"><p className="hymn-kicker">HYMN MUSIC DISTRIBUTION</p><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-6xl">Your next release.<br/>One clear workspace.</h1><p className="mt-6 max-w-2xl text-base leading-8 text-[var(--text-muted)]">Bring your music to digital stores with HYMN. Prepare your audio and artwork, confirm artist credits and rights, and follow your release from submission through delivery updates.</p><div className="mt-8 flex flex-wrap gap-3"><Link href="/distribution/start" className="btn-primary">Start a release <ArrowRight size={16}/></Link><Link href="/faq" className="btn-outline">Explore distribution FAQs</Link></div></header>
    <section aria-labelledby="distribution-workflow" className="my-14"><h2 id="distribution-workflow" className="text-2xl font-semibold">From finished track to release day</h2><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
      {Icon:AudioLines,title:'Prepare your release',body:'Upload your tracks and cover artwork. Add the title, artist names and recording credits.'},
      {Icon:FileCheck2,title:'Confirm your rights',body:'Provide accurate ownership and licence information. Respond to review requests in your workspace.'},
      {Icon:Globe2,title:'Follow delivery',body:'Track submission status and delivery updates. Store acceptance and timing depend on review and partner processing.'},
      {Icon:Wallet,title:'View reported royalties',body:'See royalty reports and manage eligible payouts after reports, adjustments and verification are complete.'}
    ].map(({Icon,title,body})=><article key={title} className="rounded-2xl border border-[var(--border)] p-6"><Icon size={26} className="text-[var(--text-muted)]" aria-hidden="true"/><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-3 text-sm leading-7 text-[var(--text-muted)]">{body}</p></article>)}</div></section>
    <section className="max-w-3xl"><h2 className="text-2xl font-semibold">Clear royalty terms</h2><p className="mt-4 text-sm leading-8 text-[var(--text-muted)]">{DISTRIBUTION_POLICY_SUMMARY}</p><Link href="/policies" className="mt-4 inline-flex items-center gap-2 text-sm underline underline-offset-4">Read distribution and payout policies <ArrowRight size={14}/></Link></section>
    <section className="mt-12 max-w-3xl"><h2 className="text-2xl font-semibold">Before you upload</h2><ul className="mt-4 list-disc space-y-3 pl-5 text-sm leading-7 text-[var(--text-muted)]"><li>Have your final audio and cover artwork ready.</li><li>Check artist names, track order, credits and release metadata.</li><li>Keep any sample, beat or third-party rights evidence available.</li><li>Review current plans and fees in the release workflow before payment.</li></ul><p className="mt-6 text-sm leading-7 text-[var(--text-muted)]">Still finishing your track? Explore <Link href="/beat-store" className="underline">licensed beats</Link> or choose a <Link href="/studio" className="underline">mixing and mastering engineer</Link>. For help with an existing release, <Link href="/contact" className="underline">contact HYMN</Link>.</p></section>
  </main>;
}
