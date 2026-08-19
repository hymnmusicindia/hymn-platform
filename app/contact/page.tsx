import { ContactForm } from "@/components/contact-form";
import Link from "next/link";
import { ArrowRight, LockKeyhole, MessageCircle, Send } from "lucide-react";
import { getSession } from "@/lib/session";

export default async function ContactPage() {
  const session = await getSession();
  return (
    <main className="relative overflow-hidden py-12 sm:py-16 lg:py-20">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_5%,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_28%),radial-gradient(circle_at_88%_18%,color-mix(in_srgb,var(--money)_10%,transparent),transparent_24%)]" />
      <div className="shell relative">
        <div className="grid gap-8 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-12">
          <section className="lg:sticky lg:top-28">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text-soft)]"><Send className="h-3.5 w-3.5" /> Contact HYMN</span>
            <h1 className="mt-5 max-w-xl text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-[var(--text)] sm:text-5xl lg:text-6xl">Let&apos;s move your music forward.</h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-[var(--text-muted)] sm:text-base">Reach the HYMN team for distribution, services, release support, and partnership conversations.</p>

            <a href="https://wa.me/918793643228" target="_blank" rel="noreferrer" className="group mt-8 flex max-w-lg items-center gap-4 rounded-2xl border p-4 transition duration-300 hover:-translate-y-1" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 78%, transparent)", boxShadow: "var(--shadow-soft)" }}>
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--text)", color: "var(--bg)" }}><MessageCircle className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1"><strong className="block text-sm text-[var(--text)]">Chat on WhatsApp</strong><span className="mt-1 block text-xs leading-5 text-[var(--text-soft)]">Quick support and partnership conversations.</span></span>
              <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform group-hover:translate-x-1" />
            </a>
          </section>

          <section className="overflow-hidden rounded-[2rem] border p-5 shadow-[var(--shadow-strong)] backdrop-blur-xl sm:p-8" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--card) 86%, transparent)" }}>
            <div className="mb-7 border-b pb-6" style={{ borderColor: "var(--border)" }}>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--text-soft)]">Inquiry desk</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-3xl">Tell us what you&apos;re building.</h2>
            </div>
            {session ? (
              <ContactForm initialName={session.name} initialEmail={session.email} />
            ) : (
              <div className="flex min-h-[24rem] flex-col items-center justify-center rounded-2xl border px-5 py-12 text-center" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border" style={{ borderColor: "var(--border)", background: "var(--card)", color: "var(--text)" }}><LockKeyhole className="h-6 w-6" /></span>
                <h3 className="mt-6 text-2xl font-semibold tracking-[-0.025em] text-[var(--text)]">Log in to send an inquiry</h3>
                <p className="mt-3 max-w-sm text-sm leading-6 text-[var(--text-muted)]">Signing in keeps your conversation connected to your account and makes follow-up easier.</p>
                <Link href="/login" className="group mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-semibold transition hover:-translate-y-0.5" style={{ background: "var(--text)", color: "var(--bg)" }}>Log in to continue <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}


// vercel trigger 2
