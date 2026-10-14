import 'server-only';
import { prisma } from './prisma';
import { recommendPlaylists } from './playlist-recommendations';
export async function releasePlaylistRecommendations(userId: number, releaseId: number) {
  const release = await prisma.release.findFirst({ where: { id: releaseId, userId }, select: { genre: true, releaseType: true, metadata: true } });
  if (!release) throw Error('Release not found.');
  const metadata = release.metadata as Record<string, unknown> | null;
  const formData = metadata?.formData && typeof metadata.formData === 'object' ? metadata.formData as Record<string, unknown> : {};
  const mood = typeof metadata?.mood === 'string' && metadata.mood.trim() ? metadata.mood : typeof formData.mood === 'string' ? formData.mood : '';
  const listings = await prisma.playlistReviewListing.findMany({ where: { status: 'APPROVED', isHymn: true }, select: { id: true, name: true, slug: true, genres: true, isHymn: true, feeMinor: true } });
  return { recommendations: recommendPlaylists(listings, { genre: release.genre, mood, releaseType: release.releaseType }) };
}
