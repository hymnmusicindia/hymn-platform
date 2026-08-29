import { unstable_cache } from "next/cache";
import { listAllBeats, listProducerProfiles, listRecentGoogleAvatarUrls } from "@/lib/db";
import { prisma } from "@/lib/prisma";

const HOME_BEAT_LIMIT = 8;
const HOME_PRODUCER_LIMIT = 12;

export const getPublicHomePreview = unstable_cache(
  async () => {
    const [beats, producerProfiles, googleAvatarUrls, featuredReviews] = await Promise.all([
      listAllBeats(HOME_BEAT_LIMIT),
      listProducerProfiles(HOME_PRODUCER_LIMIT),
      listRecentGoogleAvatarUrls(4),
      prisma.purchaseReview.findMany({ where: { status: "approved", featured: true, body: { not: null } }, orderBy: [{ featuredOrder: "asc" }, { createdAt: "desc" }], take: 12, select: { id: true, rating: true, body: true, purchaseType: true, user: { select: { name: true, avatar: true } } } }).catch(() => [])
    ]);
    return { beats, producerProfiles, googleAvatarUrls, featuredReviews };
  },
  ["public-home-preview-v2"],
  { revalidate: 300, tags: ["public-home-preview"] }
);
