import { getMusicAppRelease } from '@/lib/music-app-release';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const release = await getMusicAppRelease();
  const headers = { 'Cache-Control': 'no-store' };
  if (!release) return Response.json({ error: 'The app update is being prepared.' }, { status: 503, headers });
  return Response.json({ version: release.version, versionCode: release.versionCode, downloadUrl: '/music/app/download' }, { headers });
}
