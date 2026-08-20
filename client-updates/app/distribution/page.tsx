import Link from "next/link";
import { ArrowRight, FileMusic } from "lucide-react";
import { getCurrentUserForPage } from "@/lib/access";
import { listDetailedReleasesByUser } from "@/lib/distribution-db";
import { DistributionHero } from "@/components/distribution-hero";
import { DistributionPricingStrip } from "@/components/distribution-pricing-strip";
import { getReleasePortalBadgeStyle, getReleasePortalStage, getReleasePortalStageLabel } from "@/lib/release-portal";

export default async function DistributionPage() {
  const user = await getCurrentUserForPage();
  const releases = user ? await listDetailedReleasesByUser(user.id) : [];

  return (
    <main className="pb-20">
      <section className="shell py-8 sm:py-10 lg:py-12">
        <DistributionHero />
      </section>

      <section className="shell">
        <DistributionPricingStrip />
      </section>

      {user ? (
        <section className="shell py-8 sm:py-10 lg:py-12">
          <div className="surface-card p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="eyebrow">Your catalogue</span>
                <h2 className="mt-4 text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>
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
              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {releases.map((release) => {
                  const title = release.releaseTitle?.trim() || release.trackName;
                  const stage = getReleasePortalStage(release);
                  const badgeStyle = getReleasePortalBadgeStyle(stage);

                  return (
                    <article key={release.id} className="group overflow-hidden rounded-[1.2rem] border transition duration-200 hover:-translate-y-1 hover:shadow-xl sm:rounded-[1.7rem]" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                      <div className="relative aspect-square overflow-hidden">
                        {release.artworkUrl ? (
                          <img src={release.artworkUrl} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[color-mix(in_srgb,var(--bg-soft)_84%,transparent)]" style={{ color: "var(--text-soft)" }}>
                            <FileMusic className="h-10 w-10" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute left-3 top-3 inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] backdrop-blur-md sm:left-4 sm:top-4 sm:px-3 sm:text-[11px]" style={badgeStyle}>
                          {getReleasePortalStageLabel(stage)}
                        </div>
                        <div className="absolute bottom-4 left-4 right-4">
                          <h3 className="text-base font-semibold leading-tight text-white sm:text-xl">{title}</h3>
                          <p className="mt-1 text-xs text-white/75 sm:mt-2 sm:text-sm">{release.artistName}</p>
                        </div>
                      </div>

                      <div className="p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.16em] sm:gap-3 sm:text-xs sm:tracking-[0.18em]" style={{ color: "var(--text-soft)" }}>
                          <span>{release.releaseType}</span>
                          <span>{release.status.replace(/_/g, " ")}</span>
                        </div>
                        <Link href={`/distribution/start?edit=${release.id}`} className="btn-primary pressable mt-4 inline-flex w-full justify-center">
                          Edit Release
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="mt-8 rounded-[1.6rem] border p-6" style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}>
                <p className="text-sm uppercase tracking-[0.22em]" style={{ color: "var(--text-soft)" }}>No catalogue yet</p>
                <h3 className="mt-3 text-2xl font-semibold" style={{ color: "var(--text)" }}>Start your first release to see it here.</h3>
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
            <span className="eyebrow">Distribution access</span>
            <h2 className="mt-4 text-3xl font-semibold sm:text-4xl" style={{ color: "var(--text)" }}>Log in before starting your release.</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm sm:text-base" style={{ color: "var(--text-muted)" }}>
              Your metadata, upload progress, and queue status stay attached to your HYMN account once you enter the portal.
            </p>
          </div>
        </section>
      ) : null}
    </main>
  );
}
