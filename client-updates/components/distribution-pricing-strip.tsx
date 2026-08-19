import Link from "next/link";
import { ArrowRight, Check, ChevronDown, X } from "lucide-react";
import { distributionPlanCards } from "@/lib/distribution-plans";

const subscriptionPlans = distributionPlanCards.filter((plan) => plan.key !== "pay_per_release");

const planPerks = {
  basic: [
    { label: "Unlimited artist additions", included: true },
    { label: "Metadata, artwork, and audio review", included: true },
    { label: "Release tracking dashboard", included: true },
    { label: "Standard support turnaround", included: true },
    { label: "Faster support response", included: false },
    { label: "Release planning guidance", included: false },
    { label: "Best value for frequent releases", included: false }
  ],
  pro: [
    { label: "Unlimited artist additions", included: true },
    { label: "Metadata, artwork, and audio review", included: true },
    { label: "Release tracking dashboard", included: true },
    { label: "Standard support turnaround", included: true },
    { label: "Faster support response", included: true },
    { label: "Release planning guidance", included: true },
    { label: "Best value for frequent releases", included: true }
  ]
} as const;

export function DistributionPricingStrip() {
  return (
    <section id="distribution-pricing" className="scroll-mt-24 py-6 sm:py-8">
      <div className="rounded-[1.9rem] border p-5 sm:p-6 lg:p-7" style={{ borderColor: "var(--border)", background: "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent) 0%, color-mix(in srgb, var(--bg-soft) 92%, transparent) 100%)" }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="eyebrow">Subscription plans</p>
            <h2 className="mt-4 text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text)" }}>
              Pick the subscription that keeps your releases moving.
            </h2>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {subscriptionPlans.map((plan, index) => (
            <article
              key={plan.key}
              className="fade-up group relative overflow-hidden rounded-[1.55rem] border p-5 transition duration-300 hover:-translate-y-1.5 hover:shadow-[0_26px_70px_rgba(16,24,40,0.16)] sm:p-6"
              style={{
                animationDelay: `${0.08 * index}s`,
                borderColor: plan.featured ? "color-mix(in srgb, var(--accent) 22%, var(--border))" : "var(--border)",
                background: plan.featured
                  ? "linear-gradient(160deg, color-mix(in srgb, var(--accent-soft) 34%, var(--card)) 0%, color-mix(in srgb, var(--card) 94%, transparent) 100%)"
                  : "linear-gradient(160deg, color-mix(in srgb, var(--card) 96%, transparent) 0%, color-mix(in srgb, var(--bg-soft) 86%, transparent) 100%)"
              }}
            >
              <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100" style={{ background: "radial-gradient(circle at top right, color-mix(in srgb, var(--page-glow) 60%, transparent), transparent 48%)" }} />

              <div className="relative z-10">
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em]" style={{ borderColor: plan.featured ? "color-mix(in srgb, var(--accent) 26%, transparent)" : "var(--border)", color: plan.featured ? "var(--text)" : "var(--text-soft)", background: plan.featured ? "color-mix(in srgb, var(--accent-soft) 44%, transparent)" : "color-mix(in srgb, var(--card) 82%, transparent)" }}>
                    {plan.tag}
                  </div>
                  <span className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>{plan.cadence}</span>
                </div>

                <h3 className="mt-5 text-2xl font-semibold sm:text-[1.9rem]" style={{ color: "var(--text)" }}>{plan.title}</h3>
                <p className="mt-3 max-w-[34rem] text-sm leading-6 sm:text-base" style={{ color: "var(--text-muted)" }}>{plan.description}</p>

                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-semibold sm:text-5xl" style={{ color: "var(--text)" }}>Rs {plan.price.toLocaleString("en-IN")}</span>
                  <span className="pb-1 text-sm" style={{ color: "var(--text-soft)" }}>/ {plan.cadence}</span>
                </div>

                <div className="mt-3 rounded-[0.95rem] border" style={{ borderColor: "color-mix(in srgb, var(--border) 92%, transparent)", background: "color-mix(in srgb, var(--card) 88%, transparent)" }}>
                  <div className="flex items-center justify-between gap-2 px-2.5 py-2 text-[11px] font-semibold" style={{ color: "var(--text)" }}>
                    <span>View plan perks</span>
                    <ChevronDown className="h-3 w-3 transition duration-300 group-hover:rotate-180 group-focus-within:rotate-180" style={{ color: "var(--text-soft)" }} />
                  </div>
                  <div className="grid max-h-0 gap-1.5 overflow-hidden px-2.5 opacity-0 transition-all duration-300 ease-out group-hover:max-h-[24rem] group-hover:pb-2.5 group-hover:opacity-100 group-focus-within:max-h-[24rem] group-focus-within:pb-2.5 group-focus-within:opacity-100">
                    {planPerks[plan.key].map((feature) => (
                      <div
                        key={`${plan.key}-${feature.label}`}
                        className={`group/perk flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] leading-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-sm ${
                          feature.included
                            ? "bg-[color-mix(in_srgb,var(--card)_82%,transparent)] hover:bg-[rgba(34,197,94,0.08)]"
                            : "bg-[color-mix(in_srgb,var(--bg-soft)_84%,transparent)] hover:bg-[rgba(239,68,68,0.08)]"
                        }`}
                        style={{
                          borderColor: "color-mix(in srgb, var(--border) 92%, transparent)",
                          color: feature.included ? "var(--text-muted)" : "var(--text-soft)"
                        }}
                      >
                        <span
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition duration-200 group-hover/perk:scale-110"
                          style={{
                            background: feature.included ? "rgba(34, 197, 94, 0.12)" : "rgba(239, 68, 68, 0.12)",
                            color: feature.included ? "#16a34a" : "#ef4444"
                          }}
                        >
                          {feature.included ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        </span>
                        <span>{feature.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Link href="/distribution/start" className="btn-primary pressable mt-6 inline-flex">
                  {plan.cta}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 rounded-[1.5rem] border p-5 sm:p-6" style={{ borderColor: "color-mix(in srgb, var(--border) 90%, transparent)", background: "linear-gradient(140deg, color-mix(in srgb, var(--bg-soft) 88%, transparent) 0%, color-mix(in srgb, var(--card) 96%, transparent) 100%)" }}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>One-time option</p>
              <h3 className="mt-3 text-xl font-semibold sm:text-2xl" style={{ color: "var(--text)" }}>
                Not interested in Subscription? Don&apos;t worry, opt for our one time release.
              </h3>
              <p className="mt-2 text-sm leading-6 sm:text-base" style={{ color: "var(--text-muted)" }}>
                Open the metadata filling portal directly and continue with a one-time distribution submission.
              </p>
            </div>
            <Link href="/distribution/start" className="btn-outline pressable w-fit">
              Open Metadata Portal
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
