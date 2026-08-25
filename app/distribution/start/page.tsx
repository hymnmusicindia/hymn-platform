import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getCurrentUserForPage } from "@/lib/access";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";
import { ReleaseForm } from "@/components/release-form";
import { ReleaseOnboardingGate } from "@/components/release-onboarding-gate";
import { getFirstReleaseEligibility } from "@/lib/first-release-promotion";
import { getReleasePrefill } from "@/lib/release-prefill";
import { getSubscriptionByUserId } from "@/lib/db";

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DistributionStartPage({ searchParams }: { searchParams?: Promise<{ edit?: string | string[]; resume?: string | string[]; manage?: string | string[]; onboarding?: string | string[]; campaign?: string | string[]; utm_source?: string | string[]; utm_medium?: string | string[]; utm_campaign?: string | string[]; utm_content?: string | string[]; utm_term?: string | string[] }> }) {
  const user = await getCurrentUserForPage();
  const params = (await searchParams) ?? {};
  const requestedId = Number(firstValue(params.edit) ?? firstValue(params.resume) ?? firstValue(params.manage) ?? "");
  const editingRelease = user && Number.isFinite(requestedId) && requestedId > 0 ? (await listDetailedReleasesByUser(user.id)).find((release) => release.id === requestedId) ?? null : null;
  const subscription = user ? await getSubscriptionByUserId(user.id) : null;
  const hasActiveSubscription = Boolean(subscription && subscription.plan !== "one_time" && subscription.status === "active" && subscription.daysRemaining > 0);
  let selectedPlan: any = hasActiveSubscription ? subscription?.plan : "one_time";
  if (!hasActiveSubscription && editingRelease?.distributionPlan) {
    if (editingRelease.distributionPlan === "yearly_plus") selectedPlan = "yearly_plus";
    else if (editingRelease.distributionPlan === "yearly" || editingRelease.distributionPlan === "pro") selectedPlan = "yearly";
    else if (editingRelease.distributionPlan === "half_yearly" || editingRelease.distributionPlan === "basic") selectedPlan = "half_yearly";
  }
  const hasRequestedRelease = Boolean(firstValue(params.edit) || firstValue(params.resume) || firstValue(params.manage));
  const isEditing = Boolean(editingRelease);
  const editingMetadata = editingRelease?.metadata && typeof editingRelease.metadata === "object" ? editingRelease.metadata as Record<string, unknown> : {};
  const campaignDraftEligible = !editingRelease || (
    ["draft", "awaiting_payment"].includes(editingRelease.status) &&
    editingRelease.releaseType === "single" &&
    (editingRelease.tracks?.length ?? 1) === 1
  );
  const campaignRequested = firstValue(params.campaign) === "first-release" || editingMetadata.promotionCode === "FIRST_RELEASE_FREE" || (selectedPlan === "one_time" && campaignDraftEligible);
  const campaignEligibility = user && campaignRequested ? await getFirstReleaseEligibility(user.id) : null;
  const attribution = Object.fromEntries(["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"].map((key) => [key, firstValue(params[key as keyof typeof params])]).filter(([, value]) => Boolean(value))) as Record<string, string>;
  const releasePrefill = user && !editingRelease ? await getReleasePrefill(user.id) : { suggestions: [], preferences: {} };

  return (
    <main className="distribution-start-page pb-20">
      <section className="shell py-8 sm:py-10 lg:py-12">
        <div className="mx-auto grid gap-6">
          {!user ? <div className="distribution-start-header surface-card p-4 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>
                  {isEditing ? "Edit your release." : "Start your distribution submission."}
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 sm:text-base sm:leading-7" style={{ color: "var(--text-muted)" }}>
                  {isEditing
                    ? "Update the metadata, artwork, or audio for this release and send it back into review."
                    : "Fill in metadata, upload artwork and audio, then review your package before submission."}
                </p>
                {isEditing && editingRelease ? (
                  <p className="mt-3 text-sm" style={{ color: "var(--text-soft)" }}>
                    Editing <strong style={{ color: "var(--text)" }}>{editingRelease.releaseTitle || editingRelease.trackName}</strong>
                  </p>
                ) : hasRequestedRelease && !editingRelease ? (
                  <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
                    We could not find that release in your catalogue.
                  </p>
                ) : null}
              </div>
              <Link href="/distribution" className="btn-outline pressable">
                <ArrowLeft className="h-4 w-4" />
                Back to portal
              </Link>
            </div>
          </div> : null}

          {user ? (
            <div className="mx-auto w-full max-w-[1440px]">
              <ReleaseForm selectedPlan={selectedPlan} hasActiveSubscription={hasActiveSubscription} initialRelease={editingRelease} firstReleaseOffer={Boolean(campaignEligibility?.eligible && campaignDraftEligible)} campaignAttribution={attribution} prefillSuggestions={releasePrefill.suggestions} />
            </div>
          ) : firstValue(params.onboarding) === "release" ? <ReleaseOnboardingGate /> : (
            <div className="surface-card p-6 text-center sm:p-8">
              <h2 className="text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text)" }}>Sign in to continue into the release flow.</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base" style={{ color: "var(--text-muted)" }}>
                The portal keeps your release, queue, and payment data connected to your account.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Link href="/login" className="btn-primary pressable">
                  Go to login
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/distribution" className="btn-outline pressable">
                  View portal
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// vercel trigger 2

// vercel trigger 12
