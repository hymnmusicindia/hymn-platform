import Link from "next/link";
import { notFound } from "next/navigation";
import { findProducerBySlug } from "@/lib/beat-store";
import { listAllBeats, listProducerProfiles } from "@/lib/db";

function formatCurrency(amount: number) {
  return `\u20B9${amount.toLocaleString("en-IN")}`;
}

export default async function ProducerProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const beats = await listAllBeats();
  const producerProfiles = await listProducerProfiles();
  const result = findProducerBySlug(beats, slug, producerProfiles);

  if (!result) notFound();

  const { producer, beats: producerBeats } = result;

  return (
    <main className="pb-20">
      <section className="relative overflow-hidden border-b" style={{ borderColor: "var(--border)" }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `linear-gradient(180deg, rgba(0, 0, 0, 0.48), rgba(0, 0, 0, 0.84)), url("${producer.imageUrl}")` }}
        />
        <div className="shell relative z-10 py-16 text-white sm:py-20">
          <Link href="/beat-store" className="inline-flex items-center rounded-full border border-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-white/70 hover:bg-white/10">
            Back to beatstore
          </Link>
          <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.7fr)] lg:items-end">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">{producer.name}</h1>
              <p className="mt-4 text-sm font-semibold uppercase tracking-[0.24em] text-white/68">{producer.genreIdentity}</p>
              <p className="mt-6 max-w-3xl text-base leading-8 text-white/76 sm:text-lg">{producer.story}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/beat-store" className="btn-money pressable">
                  Explore all curated beats
                </Link>
                <Link href={`/beat-store#beat-${producerBeats[0]?.id ?? ""}`} className="btn-outline border-white/15 bg-white/10 text-white hover:bg-white/15">
                  Jump to first beat
                </Link>
              </div>
            </div>
            <div className="rounded-[2rem] border border-white/15 bg-white/10 p-6 backdrop-blur-xl">
              <div className="grid gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-white/60">Beats live</p>
                  <p className="mt-2 text-3xl font-semibold">{producerBeats.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="shell py-16">
        <div className="mb-8 max-w-3xl">
          <h2 className="text-3xl font-semibold sm:text-4xl">Every beat from {producer.name}</h2>
          <p className="mt-3 text-soft">Each available beat keeps its genre, mood, tempo, key and current licensing path visible.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {producerBeats.map((beat) => (
            <article key={beat.id} className="surface-card overflow-hidden p-4 sm:p-5">
              <div className="aspect-square rounded-[1.5rem] bg-cover bg-center" style={{ backgroundImage: `url("${beat.coverImage}")` }} />
              <div className="mt-5 space-y-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-soft">
                  <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)" }}>{beat.genre}</span>
                  <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)" }}>{beat.bpm} BPM</span>
                  <span className="rounded-full border px-2.5 py-1" style={{ borderColor: "var(--border)" }}>{beat.keySignature}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--money)" }}>{beat.vibeTag}</p>
                  <h3 className="mt-2 text-2xl font-semibold">{beat.title}</h3>
                  <p className="mt-2 text-sm text-soft">{beat.typeBeat}</p>
                </div>
                <p className="text-sm leading-7 text-soft">{beat.shortHook}</p>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-soft">Starting from</p>
                    <p className="mt-1 text-xl font-semibold">{formatCurrency(beat.startingPrice)}</p>
                  </div>
                  <Link href={`/beat-store#beat-${beat.id}`} className="btn-money pressable">
                    Listen and license
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}


// vercel trigger 2

// vercel trigger 11
