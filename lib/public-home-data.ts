import { unstable_cache } from "next/cache";
import { getSiteSettings, listAllBeats, listAllReleases, listProducerProfiles, listRecentGoogleAvatarUrls } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { Prisma } from '@prisma/client';
import { diverseHomeReleases } from './home-release-variety';
import { canonicalReleaseArtworkUrl } from './release-media';

const HOME_BEAT_LIMIT = 8;
const HOME_PRODUCER_LIMIT = 12;
const HOME_RELEASE_SHOWCASE_LIMIT = 48;

export async function homeReleaseShowcase(selected: number[] = []) {
  const ids = [...new Set(selected.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || '')) {
    // Public homepage cards never need full release metadata, tracks or audio.
    const rows = await prisma.$queryRaw<Array<{ id: number; title: string; artistName: string; artworkUrl: string; releaseType: string; releaseTitle: string | null }>>(Prisma.sql`
      SELECT id, title, "artistName", "artworkUrl", "releaseType", "releaseTitle"
      FROM (
        SELECT id, title, artist_name AS "artistName", artwork_url AS "artworkUrl", release_type AS "releaseType", metadata->>'releaseTitle' AS "releaseTitle", updated_at,
          ROW_NUMBER() OVER (PARTITION BY lower(trim(artist_name)) ORDER BY updated_at DESC, id DESC) AS artist_rank
        FROM releases WHERE status = 'LIVE' AND archived_at IS NULL AND artwork_url IS NOT NULL AND artwork_url <> ''
      ) live_releases
      ORDER BY ${ids.length ? Prisma.sql`array_position(ARRAY[${Prisma.join(ids)}]::int[], id) ASC NULLS LAST,` : Prisma.empty}
        artist_rank ASC, updated_at DESC, id DESC
      LIMIT ${HOME_RELEASE_SHOWCASE_LIMIT}`);
    return rows.map(row => ({ id: row.id, title: row.releaseTitle || row.title, artistName: row.artistName, artworkUrl: canonicalReleaseArtworkUrl(row.id, row.artworkUrl), releaseType: row.releaseType, status: 'live' }));
  }
  const order = new Map(ids.map((id, index) => [id, index]));
  const live = (await listAllReleases()).filter(row => row.status === 'live' && !row.archivedAt && row.artworkUrl);
  const rows = diverseHomeReleases(live.map(row => ({ ...row, title: row.releaseTitle || row.trackName })));
  if (ids.length) rows.sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
  return rows.slice(0, HOME_RELEASE_SHOWCASE_LIMIT).map(row => ({ id: row.id, title: row.releaseTitle || row.trackName, artistName: row.artistName, artworkUrl: row.artworkUrl, releaseType: row.releaseType, status: row.status }));
}

export const getPublicHomePreview = unstable_cache(
  async () => {
    const [beats, producerProfiles, googleAvatarUrls, featuredReviews, featuredReleases] = await Promise.all([
      listAllBeats(HOME_BEAT_LIMIT),
      listProducerProfiles(HOME_PRODUCER_LIMIT),
      listRecentGoogleAvatarUrls(4),
      prisma.purchaseReview.findMany({ where: { status: "approved", rating: { gte: 4 } }, orderBy: [{ featured: 'desc' }, { featuredOrder: 'asc' }, { moderatedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: 12, select: { id: true, rating: true, body: true, featured: true, featuredOrder: true, purchaseType: true, user: { select: { id: true, name: true, avatar: true } } } }).catch(() => []),
      getSiteSettings().then(settings => homeReleaseShowcase(settings.homeFeaturedReleaseIds)).catch(() => [])
    ]);
    featuredReviews.sort((a, b) => Number(b.featured) - Number(a.featured) || a.featuredOrder - b.featuredOrder);
    return { beats, producerProfiles, googleAvatarUrls, featuredReviews, featuredReleases };
  },
  ["public-home-preview-v12"],
  { revalidate: 300, tags: ["public-home-preview"] }
);
