import { createReadStream } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getMusicAppRelease, musicAppDirectory } from '@/lib/music-app-release';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function download(head: boolean) {
  const r = await getMusicAppRelease();
  if (!r) return Response.json({ error: 'The Android app is being prepared. Please try again shortly.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return new Response(head ? null : Readable.toWeb(createReadStream(path.join(musicAppDirectory, r.file))) as ReadableStream<Uint8Array>, { headers: { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': `attachment; filename="HYMN-Music-${r.version}.apk"`, 'Content-Length': String(r.size), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-HYMN-App-Version': r.version, ETag: `"${r.sha256}"` } });
}
export async function GET() { return download(false); }
export async function HEAD() { return download(true); }
