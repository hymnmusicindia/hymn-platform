import { prisma } from "@/lib/prisma";
import { getSpotifyArtistById, parseSpotifyArtistId } from "@/lib/spotify";

export async function refreshSpotifyArtistPhoto(id: number, options: { onlyMissing?: boolean } = {}) {
  const card = await prisma.artistCard.findUnique({ where: { id }, select: { id: true, archivedAt: true, spotifyProfileUrl: true, spotifyArtistId: true, imageUrl: true } });
  if (!card || card.archivedAt || !card.spotifyProfileUrl) return { outcome: "skipped" as const };
  if (options.onlyMissing && card.imageUrl && !card.imageUrl.startsWith("data:")) return { outcome: "skipped" as const };
  const artistId = parseSpotifyArtistId(card.spotifyProfileUrl);
  if (card.spotifyArtistId && card.spotifyArtistId !== artistId) throw new Error("Spotify artist URL and stored identity do not match.");
  const artist = await getSpotifyArtistById(artistId, { forceRefresh: true });
  if (!artist || artist.id !== artistId || !artist.imageUrl) return { outcome: "no_image" as const };
  const image = new URL(artist.imageUrl);
  if (image.protocol !== "https:" || image.username || image.password) throw new Error("Spotify returned an invalid artist image URL.");
  // Never overwrite a profile changed or archived while Spotify was responding.
  const result = await prisma.artistCard.updateMany({ where: { id, archivedAt: null, spotifyProfileUrl: card.spotifyProfileUrl, spotifyArtistId: card.spotifyArtistId, imageUrl: card.imageUrl }, data: { imageUrl: artist.imageUrl, spotifyArtistId: artistId } });
  return { outcome: result.count ? "updated" as const : "superseded" as const, imageUrl: result.count ? artist.imageUrl : undefined };
}

export async function refreshMissingSpotifyArtistPhotos(userId: number) {
  const cards = await prisma.artistCard.findMany({ where: { userId, archivedAt: null, spotifyProfileUrl: { not: null }, OR: [{ imageUrl: null }, { imageUrl: "" }, { imageUrl: { startsWith: "data:" } }] }, select: { id: true } });
  for (const card of cards) {
    try { await refreshSpotifyArtistPhoto(card.id, { onlyMissing: true }); }
    catch (error) {
      console.warn("Spotify artist photo refresh deferred", { artistCardId: card.id, message: error instanceof Error ? error.message : "Lookup failed" });
      const failure = error as { status?: number; spotifyAuthenticationFailed?: boolean };
      if (failure.spotifyAuthenticationFailed || failure.status === 429 || failure.status === 401 || failure.status === 403) break;
    }
  }
}
