import { prisma } from "@/lib/prisma";
import type { SpotifyAdminConnectionRecord, SpotifyAdminConnectionStatus } from "@/lib/types";

type GlobalState = typeof globalThis & { hymnSpotifyAdminConnection?: SpotifyAdminConnectionRecord | null };
const globalState = globalThis as GlobalState;
const usesPostgres = () => /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL?.trim() ?? "");

function mapRecord(row: { id: number; spotifyUserId: string; displayName: string; refreshToken: string; createdAt: Date; updatedAt: Date }): SpotifyAdminConnectionRecord {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function getSpotifyAdminConnection() {
  if (!usesPostgres()) return globalState.hymnSpotifyAdminConnection ?? null;
  const row = await prisma.spotifyAdminConnection.findUnique({ where: { id: 1 } });
  return row ? mapRecord(row) : null;
}

export async function getSpotifyAdminConnectionStatus(): Promise<SpotifyAdminConnectionStatus> {
  const record = await getSpotifyAdminConnection();
  return record
    ? { connected: true, spotifyUserId: record.spotifyUserId, displayName: record.displayName, connectedAt: record.createdAt }
    : { connected: false, spotifyUserId: null, displayName: null, connectedAt: null };
}

export async function saveSpotifyAdminConnection(input: { spotifyUserId: string; displayName: string; refreshToken: string }) {
  if (!usesPostgres()) {
    const now = new Date().toISOString();
    return (globalState.hymnSpotifyAdminConnection = { id: 1, ...input, createdAt: now, updatedAt: now });
  }
  return mapRecord(await prisma.spotifyAdminConnection.upsert({
    where: { id: 1 },
    create: { id: 1, ...input },
    update: input
  }));
}

export async function clearSpotifyAdminConnection() {
  if (!usesPostgres()) { globalState.hymnSpotifyAdminConnection = null; return; }
  await prisma.spotifyAdminConnection.deleteMany({ where: { id: 1 } });
}
// vercel trigger 9
