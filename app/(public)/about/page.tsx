import { publicPageMetadata } from '@/lib/seo';
import Link from 'next/link';
import { PublicEntryHero, PublicEntryProof } from '@/components/public-entry-experience';
export const metadata = publicPageMetadata('About', 'Meet HYMN Music, an India-based platform for independent artists: distribution, beats, studio services and release support.', '/about');
export default function AboutPage(){return <main className="shell py-12 sm:py-16">
<PublicEntryHero eyebrow="MEET HYMN MUSIC" title="Independent music. Shared ambition." description="A home for artists, producers and the people behind the music. Release your records, discover licensed beats and find the finishing touch for your sound in one connected workspace."/>
<PublicEntryProof/>
<section className="my-12 grid gap-6 sm:grid-cols-3">{[{title:'Release your music',body:'Prepare a release, manage credits and rights, and follow delivery updates.',href:'/music-distribution'},{title:'Find your next sound',body:'Explore beats from producers, compare licences and choose what fits your project.',href:'/beat-store'},{title:'Finish your record',body:'Explore mixing and mastering services and work towards a release-ready sound.',href:'/studio'}].map(item=><Link href={item.href} key={item.href} className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-7"><h2 className="text-xl font-semibold">{item.title} ?</h2><p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">{item.body}</p></Link>)}</section>
<p className="text-sm leading-7 text-[var(--text-muted)]">Meet the people and purpose behind HYMN. <Link href="/mission" className="underline underline-offset-4">Read our mission and founder?s message</Link>, or <Link href="/contact" className="underline underline-offset-4">talk to our team</Link>.</p>
</main>}
