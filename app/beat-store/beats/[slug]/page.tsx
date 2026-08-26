import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Gauge, KeyRound, ShieldCheck } from "lucide-react";
import { BeatCard } from "@/components/beat-card";
import { BeatLicenseComparison } from "@/components/beat-license-comparison";
import { BeatLicenseChoices } from "@/components/beat-license-choices";
import { findBeatByStoreSlug } from "@/lib/beat-store";
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

  return <main className="shell py-10 sm:py-16">
    <Link href="/beat-store#beat-catalog" className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text-soft)] transition hover:text-[var(--text)]"><ArrowLeft className="h-4 w-4" /> Back to Beat Store</Link>
    <section className="mt-6 grid overflow-hidden rounded-[2rem] border border-[var(--border)] bg-[var(--card)] shadow-[0_28px_80px_rgba(0,0,0,.16)] lg:grid-cols-[minmax(320px,.8fr)_1.2fr]">
      <div className="relative aspect-square min-h-[320px] overflow-hidden"><Image src={beat.coverImage} alt={`${beat.title} cover artwork`} fill priority sizes="(max-width:1024px) 100vw, 42vw" className="object-cover" /></div>
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <Link href={`/beat-store/producers/${beat.producer.slug}`} className="text-xs font-semibold uppercase tracking-[.2em] text-[var(--accent)]">{beat.producer.name}</Link>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em] text-[var(--text)] sm:text-6xl">{beat.title}</h1>
        <p className="mt-4 max-w-xl leading-7 text-[var(--text-muted)]">{beat.shortHook}</p>
        <div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full border border-[var(--border)] px-3 py-2 text-sm"><Gauge className="mr-2 inline h-4 w-4" />{beat.bpm} BPM</span><span className="rounded-full border border-[var(--border)] px-3 py-2 text-sm"><KeyRound className="mr-2 inline h-4 w-4" />{beat.keySignature}</span><span className="rounded-full border border-[var(--border)] px-3 py-2 text-sm">{beat.genre}</span><span className="rounded-full border border-[var(--border)] px-3 py-2 text-sm">{beat.mood}</span></div>
        <audio controls preload="none" src={beat.fileUrl} className="mt-7 w-full" aria-label={`Preview ${beat.title}`} />
        <BeatLicenseChoices beat={beat} />
        <p className="mt-4 flex items-center gap-2 text-xs text-[var(--text-soft)]"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Secure Razorpay checkout. License access appears only when delivery is ready.</p>
      </div>
    </section>
    <div id="compare-licenses" className="mt-8 scroll-mt-24"><BeatLicenseComparison /></div>
    {similar.length ? <section className="mt-12"><h2 className="text-2xl font-semibold text-[var(--text)]">Similar beats</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{similar.map((item) => <BeatCard key={item.id} beat={item} />)}</div></section> : null}
    <div className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-3 rounded-xl border p-3 shadow-2xl md:hidden" style={{ borderColor: "var(--border-strong)", background: "var(--bg-elevated)" }}><div className="min-w-0"><p className="truncate text-sm font-semibold">{beat.title}</p><p className="text-xs" style={{ color: "var(--text-muted)" }}>From ₹{beat.startingPrice.toLocaleString("en-IN")}</p></div><Link href={`/beat-store?beat=${beat.id}#beat-catalog`} className="btn-primary pressable shrink-0">Choose licence</Link></div>
  </main>;
}

// vercel trigger 3

// vercel trigger 11
