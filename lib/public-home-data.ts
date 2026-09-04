import { unstable_cache } from "next/cache";
import { getSiteSettings, listAllBeats, listAllReleases, listProducerProfiles, listRecentGoogleAvatarUrls } from "@/lib/db";
import { prisma } from "@/lib/prisma";

const HOME_BEAT_LIMIT = 8;
const HOME_PRODUCER_LIMIT = 12;
const HOME_RELEASE_SHOWCASE_LIMIT = 9;

export const getPublicHomePreview = unstable_cache(
  async () => {
    const [beats, producerProfiles, googleAvatarUrls, featuredReviews, siteSettings, allReleases] = await Promise.all([
      listAllBeats(HOME_BEAT_LIMIT),
      listProducerProfiles(HOME_PRODUCER_LIMIT),
      listRecentGoogleAvatarUrls(4),
      prisma.purchaseReview.findMany({ where: { status: "approved", featured: true, body: { not: null } }, orderBy: [{ featuredOrder: "asc" }, { createdAt: "desc" }], take: 12, select: { id: true, rating: true, body: true, purchaseType: true, user: { select: { name: true, avatar: true } } } }).catch(() => []),
      getSiteSettings(),
      listAllReleases().catch(() => [])
    ]);
    const selectedIds = siteSettings.homeFeaturedReleaseIds ?? [];
    const selectedOrder = new Map(selectedIds.map((id, index) => [id, index]));
    const releaseSource = selectedIds.length
      ? allReleases.filter((release) => selectedOrder.has(release.id)).sort((a, b) => (selectedOrder.get(a.id) ?? 0) - (selectedOrder.get(b.id) ?? 0))
      : allReleases;
    const featuredReleases = releaseSource
      .filter((release) => Boolean(release.artworkUrl))
      .slice(0, HOME_RELEASE_SHOWCASE_LIMIT)
      .map((release) => ({
        id: release.id,
        title: release.releaseTitle || release.trackName,
        artistName: release.artistName,
        artworkUrl: release.artworkUrl,
        releaseType: release.releaseType,
        status: release.status
      }));
    return { beats, producerProfiles, googleAvatarUrls, featuredReviews, featuredReleases };
  },
  ["public-home-preview-v3"],
  { revalidate: 300, tags: ["public-home-preview"] }
);
