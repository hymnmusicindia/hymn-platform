import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentUserForPage } from "@/lib/access";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";
import { listOrdersByUser, getSubscriptionByUserId } from "@/lib/db";
import { DistributionHero } from "@/components/distribution-hero";
import { DistributionPricingStrip } from "@/components/distribution-pricing-strip";
import { ReleaseSummaryCard } from "@/components/release-summary-card";
import type { DistributionPlanOption } from "@/lib/distribution-plans";

/** Determine if a user has a paid subscription plan by inspecting their orders. */
function detectActivePlan(orders: Awaited<ReturnType<typeof listOrdersByUser>>): DistributionPlanOption | null {
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  if (paid.some((o) => o.productId === "yearly_plus")) return "yearly_plus";
  if (paid.some((o) => o.productId === "yearly" || o.productId === "pro")) return "yearly";
  if (paid.some((o) => o.productId === "half_yearly" || o.productId === "basic")) return "half_yearly";
  if (paid.some((o) => o.productId === "one_time" || o.productId === "pay_per_release")) return "one_time";
  return null;
}

export default async function DistributionPage({ searchParams }: { searchParams?: Promise<{ recommended?: string; manage?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const requestedPlan = resolvedSearchParams?.recommended;
  const showPlanManagement = resolvedSearchParams?.manage === "plans";
  const normalizedRecommendation = requestedPlan === "half-yearly" ? "half_yearly" : requestedPlan;
  const recommendedPlan = ["half_yearly", "yearly", "yearly_plus"].includes(normalizedRecommendation || "") ? normalizedRecommendation as DistributionPlanOption : null;
  const user = await getCurrentUserForPage();
  const [releases, orders, subscription] = user
    ? await Promise.all([listDetailedReleasesByUser(user.id), listOrdersByUser(user.id), getSubscriptionByUserId(user.id)])
    : [[], [], null];

  const activePlan = subscription ? (subscription.plan as DistributionPlanOption) : (user ? detectActivePlan(orders) : null);

  return (
    <main className="distribution-page pb-20">
      <section className="shell py-8 sm:py-10 lg:py-12">
        <DistributionHero />
      </section>

      <section className="shell">
        <DistributionPricingStrip activePlan={activePlan} recommendedPlan={recommendedPlan} showPlanManagement={showPlanManagement} />
      </section>

      {user ? (
        <section className="shell py-8 sm:py-10 lg:py-12">
          <div className="surface-card p-4 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>
                  Releases linked to your account.
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base sm:leading-7" style={{ color: "var(--text-muted)" }}>
                  Open any release to edit metadata, artwork, or audio, then send it back to review.
                </p>
              </div>
              <Link href="/dashboard/releases" className="btn-outline pressable">
                Open release portal
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {releases.length > 0 ? (
              <div className="mt-6 grid grid-cols-1 justify-items-center gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {releases.map((release) => {
                  return (
                    <ReleaseSummaryCard key={release.id} release={release} href={`/dashboard/releases/${release.id}`} />
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 rounded-[1.6rem] border p-6" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <h3 className="text-2xl font-semibold" style={{ color: "var(--text)" }}>Start your first release to see it here.</h3>
                <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: "var(--text-muted)" }}>
                  Once you submit a release, this section becomes your quick edit lane for metadata changes and review resubmissions.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {!user ? (
        <section className="shell py-8 sm:py-10">
          <div className="mx-auto max-w-[900px] rounded-[2rem] border p-8 text-center md:p-10" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h2 className="text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>Log in before starting your release.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base" style={{ color: "var(--text-muted)" }}>
              Your metadata, upload progress, and queue status stay attached to your HYMN account once you enter the portal.
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}

// vercel trigger 2
// vercel trigger 4
// vercel trigger 5

// vercel trigger 12
