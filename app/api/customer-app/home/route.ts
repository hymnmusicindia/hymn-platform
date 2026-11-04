import { NextResponse } from 'next/server';
import { getPublicHomePreview } from '@/lib/public-home-data';
import { artworkPreviewUrl } from '@/lib/artwork-preview';
export const dynamic = 'force-dynamic';
export async function GET() {
  const home = await getPublicHomePreview();
  return NextResponse.json({
    releases: home.featuredReleases.map(r => ({ id: r.id, title: r.title, artistName: r.artistName, artworkUrl: artworkPreviewUrl(r.artworkUrl, 320) })),
    beats: home.beats.slice(0, 4).map(b => ({ id: b.id, title: b.title, producerName: b.producerName, genre: b.genre, bpm: b.bpm, price: b.generalPrice ?? b.price, artworkUrl: artworkPreviewUrl(b.artworkUrl || '', 320) }))
  }, { headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' } });
}
