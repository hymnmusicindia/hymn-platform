import Link from 'next/link';
import { BadgeCheck, Headphones, ArrowUpRight, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { listStudioEngineers } from '@/lib/studio-services';
import { ENGINEER_GENRES } from '@/lib/engineer-applications';
import { StudioBeatJourney } from '@/components/studio-beat-journey';
import s from './hymn-studio.module.css';

export type StudioQuery = { view?: string; genre?: string; maxPrice?: string; turnaround?: string; beatPurchaseId?: string; tab?: string; producerAccess?: string };
const money = (value: unknown) => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(Number(value));
export async function HymnStudioEngineers({ query }: { query: StudioQuery }) {
  let engineers: Awaited<ReturnType<typeof listStudioEngineers>> = [];
  let unavailable = false;
  try { engineers = await listStudioEngineers({ genre: query.genre, maxPrice: Number(query.maxPrice) || undefined, maxTurnaround: Number(query.turnaround) || undefined }); } catch { unavailable = true; }
  const purchaseParam = query.beatPurchaseId ? `&beatPurchaseId=${encodeURIComponent(query.beatPurchaseId)}` : '';
  return <div id="engineers">
    <header className={s.heading}><div><p className={s.eyebrow}>Finish your sound</p><h1>Find your sound partner.</h1><p>Professional mixing, clear delivery dates and a private project workspace.</p></div><Link prefetch={false} href="/studio/readiness" className={s.primary}><SlidersHorizontal size={15}/>Check mix-readiness</Link></header>
    {query.beatPurchaseId && <StudioBeatJourney purchaseId={Number(query.beatPurchaseId)}/>}
    <div className={s.notice}><ShieldCheck size={14} style={{display:'inline',marginRight:7}}/>Secure source files · Revisions included with your service · Track every delivery<Link prefetch={false} href="/studio/apply">Become an engineer ↗</Link></div>
    <form className={s.filters} action="/studio" aria-label="Studio engineer filters"><input type="hidden" name="view" value="engineers"/>{query.beatPurchaseId && <input type="hidden" name="beatPurchaseId" value={query.beatPurchaseId}/>}
      <label>Genre<select name="genre" defaultValue={query.genre || ''}><option value="">All genres</option>{ENGINEER_GENRES.map(genre => <option key={genre}>{genre}</option>)}</select></label>
      <label>Turnaround<select name="turnaround" defaultValue={query.turnaround || ''}><option value="">Any turnaround</option><option value="3">Up to 3 days</option><option value="5">Up to 5 days</option><option value="7">Up to 7 days</option></select></label>
      <label>Maximum price (₹)<input type="number" min="0" name="maxPrice" placeholder="Any budget" defaultValue={query.maxPrice}/></label><button type="submit" className={s.primary}>Apply filters</button>
    </form>
    <div className={s.genreLinks}>{ENGINEER_GENRES.map(genre => <Link prefetch={false} key={genre} href={`/studio?view=engineers&genre=${encodeURIComponent(genre)}${purchaseParam}`}>{genre}</Link>)}<Link prefetch={false} href={`/studio?view=engineers${purchaseParam}`}>Reset filters</Link></div>
    <div className={s.engineerGrid}>{engineers.flatMap(engineer => engineer.listings.slice(0,1).map(listing => {
      const photo = engineer.profilePhotoUrl ?? engineer.contributorParty.claimedBy?.avatar;
      return <article className={s.engineerCard} key={listing.id}><div className={s.engineerIdentity}>{photo ? <img src={photo} alt="" loading="lazy" referrerPolicy="no-referrer"/> : <span><Headphones size={23}/></span>}<div><h2>{engineer.professionalName}{engineer.verificationState === 'VERIFIED' && <BadgeCheck size={16} aria-label="Verified engineer"/>}</h2><p>Mixing & mastering</p></div></div><p>{listing.description}</p><div className={s.genreLinks}>{listing.acceptedGenres.slice(0,3).map(genre => <span className={s.badge} key={genre}>{genre}</span>)}</div><footer><div><strong>{money(listing.beatCustomerPrice ?? listing.standardPrice)}</strong><small>{listing.beatCustomerPrice ? 'Beat customer price' : 'Project price'}</small></div><div><small>{listing.turnaroundDays} day delivery</small><small>{listing.includedRevisions} revisions included</small></div></footer><Link prefetch={false} className={s.primary} href={`/studio/engineers/${engineer.slug}${query.beatPurchaseId ? `?beatPurchaseId=${encodeURIComponent(query.beatPurchaseId)}` : ''}`}>View profile <ArrowUpRight size={15}/></Link></article>;
    }))}</div>
    {!engineers.length && <section className={s.panel}><div className={s.empty}><strong>{unavailable ? 'Engineers are temporarily unavailable' : 'No engineers match these filters'}</strong>{unavailable ? 'Please retry shortly. Your existing projects are unaffected.' : 'Try another genre, budget or turnaround.'}<br/><Link prefetch={false} href={`/studio?view=engineers${purchaseParam}`}>{unavailable ? 'Retry' : 'Clear filters'} →</Link></div></section>}
  </div>;
}
