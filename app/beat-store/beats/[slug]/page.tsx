import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, KeyRound, ShieldCheck } from "lucide-react";
import { BeatLicenseComparison } from "@/components/beat-license-comparison";
import { BeatLicenseChoices } from "@/components/beat-license-choices";
import { beatStoreSlug, findBeatByStoreSlug } from "@/lib/beat-store";
import { listAllBeats, listProducerProfiles } from "@/lib/db";

type Props = { params: Promise<{ slug: string }> };

async function getBeat(slug: string) {
  const [beats, producers] = await Promise.all([listAllBeats(), listProducerProfiles()]);
  return { beat: findBeatByStoreSlug(beats, slug, producers), beats, producers };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { beat } = await getBeat(slug);
  if (!beat) return { title: "Beat not found | HYMN" };
  const path = `/beat-store/beats/${slug}`;
  return { title: `${beat.title} by ${beat.producer.name} | HYMN Beat Store`, description: `Preview and license ${beat.title}, a ${beat.genre} beat at ${beat.bpm} BPM in ${beat.keySignature}.`, alternates: { canonical: path }, openGraph: { title: `${beat.title} — ${beat.producer.name}`, description: beat.shortHook, images: [beat.coverImage], url: path } };
}

export default async function BeatDetailPage({ params }: Props) {
  const { slug } = await params;
  const { beat, beats, producers } = await getBeat(slug);
  if (!beat) notFound();
  const storefront = beats.length ? (await import("@/lib/beat-store")).buildBeatStorefront(beats, producers).catalog : [];
  const similar = storefront.filter((candidate) => candidate.id !== beat.id && (candidate.producer.slug === beat.producer.slug || candidate.genre === beat.genre || (candidate.mood === beat.mood && Math.abs(candidate.bpm - beat.bpm) <= 10))).slice(0, 4);

  return <main className="shell beat-detail-page py-8 sm:py-14">
    <Link href="/beat-store#beat-catalog" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-soft)] transition hover:text-[var(--text)]"><ArrowLeft className="h-4 w-4" /> Back to Beat Store</Link>
    <section className="beat-detail-hero mt-5 grid overflow-hidden lg:grid-cols-[minmax(300px,.78fr)_1.22fr]">
      <div className="relative aspect-square min-h-[300px] overflow-hidden rounded-[1.35rem]"><Image src={beat.coverImage} alt={`${beat.title} cover artwork`} fill priority sizes="(max-width:1024px) 100vw, 40vw" className="object-cover" /></div>
      <div className="flex flex-col justify-center px-1 py-7 sm:p-9 lg:py-4 lg:pr-4">
        <Link href={`/beat-store/producers/${beat.producer.slug}`} className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--accent)]">{beat.producer.name}</Link>
        <h1 className="mt-2 text-4xl font-semibold tracking-[-.045em] text-[var(--text)] sm:text-5xl">{beat.title}</h1>
        <p className="mt-4 max-w-xl leading-7 text-[var(--text-muted)]">{beat.shortHook}</p>
        <div className="beat-detail-meta mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-[var(--text-muted)]"><span><Gauge className="mr-1.5 inline h-4 w-4" />{beat.bpm} BPM</span><span><KeyRound className="mr-1.5 inline h-4 w-4" />{beat.keySignature}</span><span>{beat.genre}</span><span>{beat.mood}</span></div>
        {beat.previewUrl ? <audio controls preload="none" src={beat.previewUrl} className="beat-detail-audio mt-6 w-full" aria-label={`Preview ${beat.title}`} /> : <p className="mt-6 text-sm text-[var(--text-soft)]">Preview unavailable</p>}
        <BeatLicenseChoices beat={beat} />
        <p className="mt-4 flex items-center gap-2 text-xs text-[var(--text-soft)]"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Secure Razorpay checkout. License access appears only when delivery is ready.</p>
      </div>
    </section>
    <div id="compare-licenses" className="mt-12 scroll-mt-24"><BeatLicenseComparison /></div>
    {similar.length ? <section className="mt-14"><div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--text-soft)]">Keep exploring</p><h2 className="mt-1 text-2xl font-semibold text-[var(--text)]">Similar beats</h2></div><Link href="/beat-store#beat-catalog" className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]">View all</Link></div><div className="beat-related-grid mt-5 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-4">{similar.map((item) => <article key={item.id} className="min-w-0"><Link href={`/beat-store/beats/${beatStoreSlug(item)}`} className="group block"><div className="relative aspect-square overflow-hidden rounded-xl bg-[var(--bg-soft)]"><Image src={item.coverImage} alt="" fill sizes="(max-width:640px) 50vw, 22vw" className="object-cover transition duration-500 group-hover:scale-[1.025]" /></div><p className="mt-3 truncate font-semibold text-[var(--text)]">{item.title}</p><p className="mt-1 truncate text-xs text-[var(--text-soft)]">{item.producer.name} · {item.bpm} BPM</p><p className="mt-2 text-sm font-semibold">From ₹{item.startingPrice.toLocaleString("en-IN")}</p></Link></article>)}</div></section> : null}
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-xl border p-3 shadow-2xl md:hidden" style={{ borderColor: "var(--border-strong)", background: "var(--bg-elevated)" }}><div className="min-w-0"><p className="truncate text-sm font-semibold">{beat.title}</p><p className="text-xs" style={{ color: "var(--text-muted)" }}>From ₹{beat.startingPrice.toLocaleString("en-IN")}</p></div><Link href={`/beat-store?beat=${beat.id}#beat-catalog`} className="btn-primary pressable shrink-0">Choose licence</Link></div>
  </main>;
}

// vercel trigger 3

// vercel trigger 11
