import { NextResponse } from 'next/server';
import { DIRENOTE_GENRE_CATALOG, DIRENOTE_LANGUAGES, DIRENOTE_CONTENT_TYPES } from '@/lib/direnote-config';
import { DISTRIBUTION_CHANNELS } from '@/lib/distribution-capabilities';
export async function GET() {
  return NextResponse.json({ genres: DIRENOTE_GENRE_CATALOG, languages: DIRENOTE_LANGUAGES, contentTypes: DIRENOTE_CONTENT_TYPES, channels: DISTRIBUTION_CHANNELS }, { headers: { 'Cache-Control': 'public, max-age=3600' } });
}
