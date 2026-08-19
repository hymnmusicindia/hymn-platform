import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { RoyaltyCalculator } from "@/components/royalty-calculator";

export default function RoyaltyPayoutsPage() {
  const sections = [
    ["Verified sales base", "Only paid orders count toward producer revenue and earnings metrics."],
    ["Beat ownership", "Each beat is linked to a producer account so sales can be attributed correctly."],
    ["Dashboard visibility", "Producers can review revenue, orders, and beat performance inside the producer dashboard."]
  ] as const;

  return (
    <main className="shell py-12 sm:py-16">
      <div className="max-w-4xl">
        <span className="eyebrow">Royalty Payouts</span>
        <h1 className="text-3xl font-semibold sm:text-4xl lg:text-5xl" style={{ color: "var(--text)" }}>Understand how HYMN tracks sales and future-ready payout visibility.</h1>
        <p className="mt-4 text-sm sm:text-base" style={{ color: "var(--text-muted)" }}>
          HYMN connects producer earnings to verified orders and beat ownership so payout-ready reporting can grow out of the same system that handles uploads, purchases, and analytics.
        </p>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
        {sections.map(([title, body]) => (
          <details key={`${title}-mobile`} className="ios-collapse rounded-[1.2rem] p-4 md:hidden">
            <summary className="flex list-none items-center justify-between gap-3 text-base font-semibold" style={{ color: "var(--text)" }}>
              {title}
              <ChevronDown className="ios-collapse-icon h-4 w-4 shrink-0" style={{ color: "var(--text-soft)" }} />
            </summary>
            <div className="ios-collapse-content">
              <div className="ios-collapse-inner">
                <p className="mt-3 text-sm" style={{ color: "var(--text-muted)" }}>{body}</p>
              </div>
            </div>
          </details>
        ))}
        {sections.map(([title, body]) => (
          <article key={`${title}-desktop`} className="hidden surface-card p-6 md:block">
            <h2 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
            <p className="mt-4" style={{ color: "var(--text-muted)" }}>{body}</p>
          </article>
        ))}
      </div>
      <div className="mt-8 sm:mt-10">
        <RoyaltyCalculator />
      </div>
      <div className="mt-8 flex flex-wrap gap-3 sm:mt-10 sm:gap-4">
        <Link href="/analytics" className="btn-primary">View Analytics</Link>
        <Link href="/producer-dashboard" className="btn-outline">Open Producer Dashboard</Link>
      </div>
    </main>
  );
}


