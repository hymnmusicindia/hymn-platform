import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export type TeamAppRelease = { version: string; versionCode: number; file: string; size: number; sha256: string; publishedAt: string };
export const teamAppDirectory = path.join(process.cwd(), "public", "downloads", "hymn-team");

export async function getTeamAppRelease(): Promise<TeamAppRelease | null> {
  try {
    const release = JSON.parse(await readFile(path.join(teamAppDirectory, "release.json"), "utf8")) as TeamAppRelease;
    if (!/^\d+\.\d+\.\d+$/.test(release.version) || !Number.isSafeInteger(release.versionCode) || release.versionCode < 1 ||
      !/^[a-f0-9]{64}$/.test(release.sha256) || !/^hymn-team-\d+\.\d+\.\d+-[a-f0-9]{12}\.apk$/.test(release.file) ||
      !Number.isSafeInteger(release.size) || release.size < 1 || !Number.isFinite(Date.parse(release.publishedAt))) return null;
    const file = await stat(path.join(teamAppDirectory, release.file));
    return file.isFile() && file.size === release.size ? release : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}
