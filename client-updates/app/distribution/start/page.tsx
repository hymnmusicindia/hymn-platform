import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getCurrentUserForPage } from "@/lib/access";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";
import { ReleaseForm } from "@/components/release-form";

function firstValue(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DistributionStartPage({ searchParams }: { searchParams?: Promise<{ edit?: string | string[]; resume?: string | string[]; manage?: string | string[] }> }) {
  const user = await getCurrentUserForPage();
  const params = (await searchParams) ?? {};
  const requestedId = Number(firstValue(params.edit) ?? firstValue(params.resume) ?? firstValue(params.manage) ?? "");
  const editingRelease = user && Number.isFinite(requestedId) && requestedId > 0 ? (await listDetailedReleasesByUser(user.id)).find((release) => release.id === requestedId) ?? null : null;
  const selectedPlan = editingRelease?.distributionPlan === "basic" || editingRelease?.distributionPlan === "pro" ? editingRelease.distributionPlan : "pay_per_release";
  const hasRequestedRelease = Boolean(firstValue(params.edit) || firstValue(params.resume) || firstValue(params.manage));
  const isEditing = Boolean(editingRelease);

  return (
    <main className="pb-20">
      <section className="shell py-8 sm:py-10 lg:py-12">
        <div className="mx-auto grid gap-6">
          <div className="surface-card p-6 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="eyebrow">Release portal</span>
                <h1 className="mt-4 text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>
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
          </div>

          {user ? (
            <div className="mx-auto w-full max-w-[1440px]">
              <ReleaseForm selectedPlan={selectedPlan} initialRelease={editingRelease} />
            </div>
          ) : (
            <div className="surface-card p-6 text-center sm:p-8">
              <span className="eyebrow">Login required</span>
              <h2 className="mt-4 text-2xl font-semibold sm:text-3xl" style={{ color: "var(--text)" }}>Sign in to continue into the release flow.</h2>
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
