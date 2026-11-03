import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
export const musicAppDirectory = path.join(process.cwd(), 'public/downloads/hymn-music');
export type MusicAppRelease = { version: string; versionCode: number; packageName: string; file: string; size: number; sha256: string; publishedAt: string };
export async function getMusicAppRelease(): Promise<MusicAppRelease | null> {
  try {
    const r = JSON.parse(await readFile(path.join(musicAppDirectory, 'release.json'), 'utf8')) as MusicAppRelease;
    if (r.packageName !== 'fun.hymnmusic.app' || !/^\d+\.\d+\.\d+$/.test(r.version) || !Number.isSafeInteger(r.versionCode) || r.versionCode < 1 || !/^hymn-music-\d+\.\d+\.\d+-[a-f0-9]{12}\.apk$/.test(r.file) || !/^[a-f0-9]{64}$/.test(r.sha256) || !Number.isSafeInteger(r.size) || r.size < 100000) return null;
    const file = await stat(path.join(musicAppDirectory, r.file)); return file.isFile() && file.size === r.size ? r : null;
  } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return null; throw e; }
}
