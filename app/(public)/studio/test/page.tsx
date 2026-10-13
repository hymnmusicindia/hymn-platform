import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AudioLines, BriefcaseBusiness, Headphones, MessageCircle } from "lucide-react";

export const metadata: Metadata = { title: "Test HYMN Studio", description: "A guided test of HYMN's Mix & Master experience.", robots: { index: false, follow: false } };

const steps = [
  { icon: AudioLines, title: "Check your track", description: "Try the visual readiness check and get engineer suggestions for your genre, budget and timeline.", href: "/studio/readiness", action: "Start readiness check", note: "Free · no payment" },
  { icon: Headphones, title: "Explore engineers", description: "Open real profiles to hear samples and review credits, vouches and available listening calls.", href: "/studio#engineers", action: "Browse engineers", note: "Public profiles" },
  { icon: MessageCircle, title: "See your projects", description: "If you have a booking, try the conversation, file uploads, deliveries, revisions and completion approval.", href: "/dashboard/studio", action: "Open my projects", note: "Sign-in and a booking required" },
  { icon: BriefcaseBusiness, title: "Try the engineer side", description: "Apply as an engineer, then add your work, listening slots and public profile details.", href: "/studio/apply", action: "Become an engineer", note: "Sign-in required" },
];

export default function StudioTestPage() {
  return <main className="shell pb-20 pt-8 sm:pt-12">
    <section className="rounded-[2rem] border border-[var(--border)] bg-[radial-gradient(circle_at_80%_0%,rgba(91,140,255,.23),transparent_42%),radial-gradient(circle_at_5%_100%,rgba(67,211,186,.11),transparent_35%),var(--card)] px-6 py-10 sm:px-10 sm:py-14">
      <p className="hymn-kicker">HYMN Studio · Test drive</p><h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-[-.045em] sm:text-6xl">Take the Mix & Master flow for a spin.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-[var(--text-muted)]">Follow a track from the first readiness check to an engineer’s profile and a private project. Each step opens the working feature on HYMN.</p><div className="mt-7 flex flex-wrap gap-3"><Link href="/studio/readiness" className="btn-primary">Start with my track <ArrowRight className="ml-2 h-4 w-4"/></Link><Link href="/studio" className="btn-outline">See Studio</Link></div>
      <p className="mt-10 border-t border-[var(--border)] pt-5 text-sm text-[var(--text-muted)]">These are real Studio pages. This guide makes no test charges; booking a paid service uses the normal checkout.</p>
    </section>
    <section className="mt-12"><p className="hymn-kicker">Choose a path</p><h2 className="mt-2 mb-6 text-2xl font-semibold sm:text-3xl">Four steps, at your pace</h2><div className="grid gap-4 md:grid-cols-2">{steps.map((step, index) => <article key={step.title} className="flex min-h-64 flex-col rounded-[1.5rem] border border-[var(--border)] bg-[var(--card)] p-6 transition-colors hover:border-[var(--border-strong)]"><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[var(--bg-soft)] text-[var(--accent)]"><step.icon className="h-5 w-5"/></span><span className="text-sm font-semibold text-[var(--text-soft)]">0{index + 1} / 04</span></div><h3 className="mt-5 text-xl font-semibold">{step.title}</h3><p className="mt-2 flex-1 text-sm leading-6 text-[var(--text-muted)]">{step.description}</p><div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5"><Link href={step.href} className="inline-flex items-center gap-2 font-semibold text-[var(--accent)] hover:underline">{step.action}<ArrowRight className="h-4 w-4"/></Link><span className="text-xs text-[var(--text-soft)]">{step.note}</span></div></article>)}</div></section>
  </main>;
}
