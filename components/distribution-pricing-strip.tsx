import Link from "next/link";
import { ArrowRight, BadgeCheck, Check, ChevronDown, Crown, RefreshCcw, Route, Zap } from "lucide-react";
import { distributionPlanCards } from "@/lib/distribution-plans";
import type { DistributionPlanOption } from "@/lib/distribution-plans";

// Show only subscription plans: half_yearly, yearly, yearly_plus
const subscriptionPlans = distributionPlanCards.filter((plan) => 
  ["half_yearly", "yearly", "yearly_plus"].includes(plan.key)
);

const planVisuals = {
  half_yearly: { icon: Route, eyebrow: "Flexible start" },
  yearly: { icon: Zap, eyebrow: "Most popular" },
  yearly_plus: { icon: Crown, eyebrow: "For professionals" }
} as const;

const planPerks = {
  one_time: [
    { label: "Single release submission", included: true },
    { label: "Metadata review", included: true },
    { label: "Artwork and audio QC", included: true },
    { label: "Distributor handoff", included: true },
    { label: "Release tracking dashboard", included: false },
    { label: "Multiple artist profiles", included: false },
    { label: "Priority support", included: false }
  ],
  half_yearly: [
    { label: "Unlimited releases", included: true },
    { label: "5 artist profiles", included: true },
    { label: "Metadata, artwork, and audio review", included: true },
    { label: "Release tracking dashboard", included: true },
    { label: "Distribution to 100+ stores", included: true },
    { label: "Faster support response", included: false },
    { label: "Custom label support", included: false }
  ],
  yearly: [
    { label: "Unlimited releases", included: true },
    { label: "7 artist profiles", included: true },
    { label: "Metadata, artwork, and audio review", included: true },
    { label: "Release tracking dashboard", included: true },
    { label: "Distribution to 100+ stores", included: true },
    { label: "Faster support response", included: true },
    { label: "Release planning guidance", included: true }
  ],
  yearly_plus: [
    { label: "Unlimited releases", included: true },
    { label: "15 artist profiles", included: true },
    { label: "Custom label/imprint name", included: true },
    { label: "Release tracking dashboard", included: true },
    { label: "Distribution to 100+ stores", included: true },
    { label: "24/7 priority support", included: true },
    { label: "Early access to new features", included: true }
  ]
} as const;

interface DistributionPricingStripProps {
  activePlan?: DistributionPlanOption | null;
}

export function DistributionPricingStrip({ activePlan }: DistributionPricingStripProps = {}) {
  const planDetails =
    activePlan && activePlan !== "one_time"
      ? distributionPlanCards.find((p) => p.key === activePlan)
      : null;

  // ── Active Plan View ─────────────────────────────────────────────────────────
  if (planDetails) {
    return (
      <section id="distribution-pricing" className="scroll-mt-24 py-6 sm:py-8">
        <div
          className="rounded-[1.9rem] border p-5 sm:p-6 lg:p-7"
          style={{
            borderColor: "var(--border)",
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--card) 96%, transparent) 0%, color-mix(in srgb, var(--bg-soft) 92%, transparent) 100%)"
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text)" }}>
                You are all set to release music.
              </h2>
            </div>
            <span
              className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"
              style={{ borderColor: "rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)", color: "#16a34a" }}
            >
              <BadgeCheck className="h-4 w-4" />
              Active
            </span>
          </div>

          <div
            className="mt-6 rounded-[1.55rem] border p-5 sm:p-6"
            style={{
              borderColor: "color-mix(in srgb, var(--accent) 22%, var(--border))",
              background:
                "linear-gradient(160deg, color-mix(in srgb, var(--accent-soft) 34%, var(--card)) 0%, color-mix(in srgb, var(--card) 94%, transparent) 100%)"
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--text-soft)" }}>
                  {planDetails.cadence} plan
                </p>
                <h3 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text)" }}>
                  {planDetails.title}
                </h3>
                <p className="mt-2 max-w-lg text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  {planDetails.description}
                </p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-semibold" style={{ color: "var(--text)" }}>
                  Rs {planDetails.price.toLocaleString("en-IN")}
                </p>
                <p className="mt-1 text-xs" style={{ color: "var(--text-soft)" }}>/ {planDetails.cadence}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {(planPerks[planDetails.key as "one_time" | "half_yearly" | "yearly" | "yearly_plus"] ?? [])
                .filter((f) => f.included)
                .map((feature) => (
                  <div key={feature.label} className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    <span
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
                      style={{ background: "rgba(34,197,94,0.12)", color: "#16a34a" }}
                    >
                      <Check className="h-3 w-3" />
                    </span>
                    {feature.label}
                  </div>
                ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/distribution/start" className="btn-primary pressable inline-flex">
                New Release
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/dashboard" className="btn-outline pressable inline-flex">
                <RefreshCcw className="h-4 w-4" />
                Manage Plan
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ── Default Plan Selection View ──────────────────────────────────────────────
  return (
    <section id="distribution-pricing" className="scroll-mt-24 py-8 sm:py-12">
      <div
        className="relative overflow-hidden rounded-[1.9rem] border p-5 sm:p-7 lg:p-10"
        style={{
          borderColor: "var(--border)",
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, transparent) 0%, color-mix(in srgb, var(--bg-soft) 94%, transparent) 100%)"
        }}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px" style={{ background: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--accent) 45%, transparent), transparent)" }} />
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.24em]" style={{ color: "var(--accent)" }}>Distribution plans</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl" style={{ color: "var(--text)" }}>
              Choose the lane that fits your release strategy.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: "var(--text-muted)" }}>
              From a focused release schedule to a professional label operation, choose the plan that matches how you work.
            </p>
          </div>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-1 lg:grid-cols-3 lg:items-stretch">
          {subscriptionPlans.map((plan, index) => {
            const visual = planVisuals[plan.key as keyof typeof planVisuals];
            const PlanIcon = visual.icon;
            const includedPerks = planPerks[plan.key as keyof typeof planPerks].filter((feature) => feature.included);

            return (
            <article
              key={plan.key}
              className="fade-up group relative flex overflow-hidden rounded-[1.5rem] border p-5 transition-[transform,border-color,box-shadow] duration-300 hover:-translate-y-1 sm:p-6"
              style={{
                animationDelay: `${0.08 * index}s`,
                borderColor: plan.featured ? "color-mix(in srgb, var(--accent) 52%, var(--border))" : "var(--border)",
                background: plan.featured
                  ? "linear-gradient(180deg, color-mix(in srgb, var(--accent-soft) 22%, var(--card)) 0%, var(--card) 38%)"
                  : "linear-gradient(180deg, color-mix(in srgb, var(--card) 98%, transparent) 0%, color-mix(in srgb, var(--bg-soft) 65%, var(--card)) 100%)",
                boxShadow: plan.featured
                  ? "0 18px 46px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.12)"
                  : "0 12px 34px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.08)"
              }}
            >
              {plan.featured ? (
                <div
                  className="absolute inset-x-6 top-0 h-px"
                  style={{ background: "linear-gradient(90deg, transparent, var(--accent), transparent)" }}
                />
              ) : null}

              <div className="relative z-10 flex w-full flex-col">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="inline-flex h-9 w-9 items-center justify-center rounded-xl border"
                    style={{
                      borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
                      color: "var(--accent)",
                      background: "color-mix(in srgb, var(--accent-soft) 28%, var(--card))"
                    }}
                  >
                    <PlanIcon className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="rounded-full border px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.17em]" style={{ color: plan.featured ? "var(--accent)" : "var(--text-soft)", borderColor: plan.featured ? "color-mix(in srgb, var(--accent) 28%, var(--border))" : "var(--border)", background: "color-mix(in srgb, var(--card) 84%, transparent)" }}>
                      {visual.eyebrow}
                    </span>
                  </div>
                </div>

                <h3 className="mt-6 text-2xl font-semibold tracking-[-0.03em] sm:text-[1.75rem]" style={{ color: "var(--text)" }}>
                  {plan.title}
                </h3>
                <p className="mt-2 min-h-[3rem] text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  {plan.description}
                </p>

                <div className="mt-6 border-b pb-6" style={{ borderColor: "var(--border)" }}>
                  <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-soft)" }}>Rs</span>
                  <span className="text-4xl font-semibold tracking-[-0.05em]" style={{ color: "var(--text)" }}>
                    {plan.price.toLocaleString("en-IN")}
                  </span>
                  </div>
                  <span className="mt-1 block text-xs" style={{ color: "var(--text-soft)" }}>per {plan.cadence}</span>
                </div>

                <div className="mt-5 space-y-3.5">
                  {includedPerks.slice(0, 3).map((feature) => (
                    <div key={feature.label} className="flex items-center gap-3 text-sm" style={{ color: "var(--text-muted)" }}>
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--accent-soft) 32%, var(--card))", color: "var(--accent)" }}>
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                      <span>{feature.label}</span>
                    </div>
                  ))}
                </div>

                <details className="group/details mt-5 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg text-xs font-semibold outline-none transition hover:opacity-75 focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-details-marker]:hidden" style={{ color: "var(--text-muted)" }}>
                    <span>See full plan details</span>
                    <ChevronDown className="h-3.5 w-3.5 transition group-open/details:rotate-180" />
                  </summary>
                  <div className="mt-4 space-y-2.5 border-l pl-3" style={{ borderColor: "color-mix(in srgb, var(--accent) 30%, var(--border))" }}>
                    {includedPerks.slice(3).map((feature) => (
                      <p key={feature.label} className="text-xs leading-5" style={{ color: "var(--text-muted)" }}>{feature.label}</p>
                    ))}
                  </div>
                </details>

                <div className="mt-auto pt-7">
                  <Link
                    href="/distribution/start"
                    className="pressable inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
                    style={{ borderColor: plan.featured ? "var(--accent)" : "var(--border)", background: plan.featured ? "var(--accent)" : "color-mix(in srgb, var(--card) 88%, var(--bg-soft))", color: plan.featured ? "var(--accent-foreground)" : "var(--text)" }}
                  >
                    Choose {plan.title}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </article>
            );
          })}
        </div>

        <div
          className="mt-8 overflow-hidden rounded-[1.5rem] border p-6 sm:p-8 lg:p-10"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 28%, var(--border))",
            background:
              "linear-gradient(140deg, color-mix(in srgb, var(--accent-soft) 42%, var(--card)) 0%, color-mix(in srgb, var(--accent-soft) 12%, var(--bg-soft)) 100%)"
          }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <Zap
                  className="h-5 w-5"
                  style={{ color: "var(--accent)" }}
                />
                <p className="text-sm font-semibold uppercase tracking-[0.22em]" style={{ color: "var(--accent)" }}>
                  Quick Option
                </p>
              </div>
              <h3 className="mt-4 text-2xl font-bold sm:text-3xl" style={{ color: "var(--text)" }}>
                Want to release a single track quickly?
              </h3>
              <p className="mt-3 max-w-xl text-base leading-7 sm:text-lg" style={{ color: "var(--text-muted)" }}>
                No subscription needed. Pay once, distribute everywhere. Perfect for testing the waters or releasing one-off singles.
              </p>
            </div>
            <Link 
              href="/distribution/start" 
              className="pressable inline-flex items-center gap-2 rounded-[1rem] border-2 px-6 py-3 font-semibold transition duration-200 hover:translate-y-[-2px] hover:shadow-lg w-fit"
              style={{
                borderColor: "var(--accent)",
                background: "var(--accent)",
                color: "var(--accent-foreground)",
                boxShadow: "0 18px 42px color-mix(in srgb, var(--accent) 18%, transparent), inset 0 1px 0 rgba(255,255,255,0.28)"
              }}
            >
              <Zap className="h-4 w-4" />
              Start Now
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// trigger vercel deploy

// vercel trigger

// vercel trigger 2

// vercel trigger

// vercel trigger 3
