import { unstable_cache } from "next/cache";
import { getSiteSettings, listAllBeats, listAllReleases, listProducerProfiles, listRecentGoogleAvatarUrls } from "@/lib/db";
import { prisma } from "@/lib/prisma";
import { Prisma } from '@prisma/client';
import { canonicalReleaseArtworkUrl } from './release-media';

const HOME_BEAT_LIMIT = 8;
const HOME_PRODUCER_LIMIT = 12;
const HOME_RELEASE_SHOWCASE_LIMIT = 12;

export async function homeReleaseShowcase(selected: number[] = []) {
  const ids = [...new Set(selected.filter(id => Number.isSafeInteger(id) && id > 0))];
  if (/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL || '')) {
    // Public homepage cards never need full release metadata, tracks or audio.
    const rows = await prisma.$queryRaw<Array<{ id: number; title: string; artistName: string; artworkUrl: string; releaseType: string; releaseTitle: string | null }>>(Prisma.sql`
      SELECT id, title, artist_name AS "artistName", artwork_url AS "artworkUrl", release_type AS "releaseType", metadata->>'releaseTitle' AS "releaseTitle"
      FROM releases WHERE status = 'LIVE' AND archived_at IS NULL AND artwork_url IS NOT NULL AND artwork_url <> ''
      ${ids.length ? Prisma.sql`AND id IN (${Prisma.join(ids)})` : Prisma.empty}
      ORDER BY ${ids.length ? Prisma.sql`array_position(ARRAY[${Prisma.join(ids)}]::int[], id)` : Prisma.sql`updated_at DESC`}
      LIMIT ${HOME_RELEASE_SHOWCASE_LIMIT}`);
    return rows.map(row => ({ id: row.id, title: row.releaseTitle || row.title, artistName: row.artistName, artworkUrl: canonicalReleaseArtworkUrl(row.id, row.artworkUrl), releaseType: row.releaseType, status: 'live' }));
  }
  const order = new Map(ids.map((id, index) => [id, index]));
  const rows = (await listAllReleases()).filter(row => row.status === 'live' && row.artworkUrl && (!ids.length || order.has(row.id)));
  if (ids.length) rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
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
  ["public-home-preview-v11"],
  { revalidate: 300, tags: ["public-home-preview"] }
);
