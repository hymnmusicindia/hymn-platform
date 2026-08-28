import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, HeartHandshake, Quote, Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Our Mission & Founder | HYMN Music",
  description: "Learn about HYMN Music's artist-first mission and read a message from founder Aditya Ujjain."
};

export default function MissionPage() {
  return (
    <main className="overflow-hidden">
      <section className="relative border-b py-16 sm:py-24" style={{ borderColor: "var(--border)" }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_20%,color-mix(in_srgb,var(--accent)_15%,transparent),transparent_30%)]" />
        <div className="shell relative">
          <div className="max-w-4xl">
            <div className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.2em]" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--accent)" }}>
              <Sparkles className="h-4 w-4" /> Why HYMN exists
            </div>
            <h1 className="mt-7 text-5xl font-semibold tracking-[-0.045em] sm:text-6xl lg:text-7xl" style={{ color: "var(--text)" }}>Building an artist-first music ecosystem.</h1>
            <p className="mt-6 max-w-3xl text-base leading-8 sm:text-lg" style={{ color: "var(--text-muted)" }}>HYMN Music is building the infrastructure, knowledge, and support independent creators need to turn talent into sustainable careers.</p>
          </div>
        </div>
      </section>

      <section className="shell py-14 sm:py-20">
        <div className="grid gap-8 lg:grid-cols-[0.72fr,1.28fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <div className="relative overflow-hidden rounded-[2rem] border p-6" style={{ borderColor: "var(--border)", background: "linear-gradient(145deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), var(--surface))" }}>
              <span className="grid h-14 w-14 place-items-center rounded-2xl border" style={{ borderColor: "var(--border)", color: "var(--accent)", background: "var(--bg-soft)" }}><HeartHandshake className="h-6 w-6" /></span>
              <p className="mt-8 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: "var(--accent)" }}>Our Mission</p>
              <p className="mt-4 text-2xl font-semibold leading-snug" style={{ color: "var(--text)" }}>Stronger artists. Transparent systems. Sustainable careers.</p>
            </div>
          </div>

          <article className="space-y-6 text-[15px] leading-8 sm:text-base" style={{ color: "var(--text-muted)" }}>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--text)" }}>Our Mission</h2>
            <p>HYMN Music exists to build a stronger, more transparent, and artist-first music ecosystem.</p>
            <p>Our mission is to help independent artists, producers, and creators access the tools, infrastructure, and professional support they need to grow their careers. From music distribution and release management to marketing, artist development, beat licensing, and digital strategy, we aim to simplify the business side of music so creators can focus on their art.</p>
            <p>We believe talent should not be limited by a lack of connections, industry knowledge, or financial resources. HYMN Music is committed to providing accessible, reliable, and technology-driven services that give emerging artists greater control over their music, rights, revenue, and long-term careers.</p>
            <p className="rounded-2xl border p-5 text-lg font-semibold leading-8" style={{ borderColor: "var(--border)", background: "var(--bg-soft)", color: "var(--text)" }}>Our goal is not simply to release music. It is to help build sustainable artists, stronger communities, and a more organised independent music industry.</p>
          </article>
        </div>
      </section>

      <section className="border-y py-14 sm:py-20" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-[0.82fr,1.18fr] lg:gap-14">
            <div>
              <div className="relative aspect-[4/5] max-w-lg overflow-hidden rounded-[2rem] border shadow-2xl" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
                <Image src="/assets/aditya-ujjain-founder.jpeg" alt="Aditya Ujjain, founder of HYMN Music" fill priority sizes="(min-width: 1024px) 38vw, 100vw" className="object-cover object-top" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-6 pt-24 text-white">
                  <p className="text-2xl font-semibold">Aditya Ujjain</p>
                  <p className="mt-1 text-sm text-white/70">Founder, HYMN Music</p>
                </div>
              </div>
            </div>

            <article className="relative">
              <Quote className="h-12 w-12" style={{ color: "var(--accent)" }} />
              <h2 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl" style={{ color: "var(--text)" }}>Message from the Founder</h2>
              <div className="mt-7 space-y-5 text-[15px] leading-8 sm:text-base" style={{ color: "var(--text-muted)" }}>
                <p>When I started HYMN Music, I saw a clear problem: India has no shortage of talented artists, but many creators lack access to proper guidance, professional infrastructure, transparent distribution, and genuine career support.</p>
                <p>Too often, independent artists are expected to navigate contracts, royalties, marketing, distribution, and release strategies alone. Many talented creators either remain undiscovered or make decisions that damage their long-term careers simply because they were never given the right information or opportunities.</p>
                <p className="text-xl font-semibold" style={{ color: "var(--text)" }}>HYMN Music was created to change that.</p>
                <p>We are building a platform where artists and producers can release music professionally, understand the business behind their work, protect their rights, and access services that were once available only through major labels or established industry networks.</p>
                <p>My vision for HYMN Music is to create an institution that artists can trust—one that respects creativity, encourages independence, and combines technology with genuine human support.</p>
                <p>We are still building, learning, and improving. But our purpose remains clear: to give independent creators the infrastructure, knowledge, and opportunities they need to turn their talent into a sustainable career.</p>
              </div>
              <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--border)" }}><p className="text-lg font-semibold" style={{ color: "var(--text)" }}>Aditya Ujjain</p><p className="text-sm" style={{ color: "var(--text-muted)" }}>Founder, HYMN Music</p></div>
            </article>
          </div>
        </div>
      </section>

      <section className="shell py-14 sm:py-20">
        <div className="flex flex-col gap-6 rounded-[2rem] border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-9" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
          <div><h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Build your next chapter with HYMN.</h2><p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Explore the services and infrastructure designed for independent creators.</p></div>
          <Link href="/services" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold" style={{ background: "var(--accent)", color: "var(--bg)" }}>Explore HYMN <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>
    </main>
  );
}
