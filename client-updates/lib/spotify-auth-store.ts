import mysql from "mysql2/promise";
import type { SpotifyAdminConnectionRecord, SpotifyAdminConnectionStatus } from "@/lib/types";

type GlobalState = typeof globalThis & {
  hymnSpotifyAdminConnection?: SpotifyAdminConnectionRecord | null;
  hymnSpotifyAuthPool?: mysql.Pool;
};

const globalState = globalThis as GlobalState;

function getPool() {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const looksLikeExample = !databaseUrl || databaseUrl === "mysql://user:password@localhost:3306/hymn";
  if (looksLikeExample) return null;
  if (!globalState.hymnSpotifyAuthPool) {
    globalState.hymnSpotifyAuthPool = mysql.createPool({ uri: databaseUrl, connectionLimit: 10 });
  }
  return globalState.hymnSpotifyAuthPool;
}

async function ensureSpotifyAuthTable(pool: mysql.Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spotify_admin_connection (
      id INT PRIMARY KEY,
      spotify_user_id VARCHAR(191) NOT NULL,
      display_name VARCHAR(255) NOT NULL,
      refresh_token TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

function normalizeRow(row: Record<string, any>): SpotifyAdminConnectionRecord {
  return {
    id: Number(row.id),
    spotifyUserId: String(row.spotifyUserId ?? row.spotify_user_id ?? ""),
    displayName: String(row.displayName ?? row.display_name ?? ""),
    refreshToken: String(row.refreshToken ?? row.refresh_token ?? ""),
    createdAt: String(row.createdAt ?? row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updatedAt ?? row.updated_at ?? new Date().toISOString())
  };
}

function toStatus(record: SpotifyAdminConnectionRecord | null): SpotifyAdminConnectionStatus {
  if (!record) {
    return { connected: false, spotifyUserId: null, displayName: null, connectedAt: null };
  }
  return {
    connected: true,
    spotifyUserId: record.spotifyUserId,
    displayName: record.displayName,
    connectedAt: record.createdAt
  };
}

export async function getSpotifyAdminConnection() {
  const pool = getPool();
  if (!pool) return globalState.hymnSpotifyAdminConnection ?? null;

  await ensureSpotifyAuthTable(pool);
  const [rows] = await pool.query(
    `SELECT id, spotify_user_id AS spotifyUserId, display_name AS displayName, refresh_token AS refreshToken, created_at AS createdAt, updated_at AS updatedAt
     FROM spotify_admin_connection
     WHERE id = 1
     LIMIT 1`
  );
  return ((rows as Array<Record<string, any>>)[0] ? normalizeRow((rows as Array<Record<string, any>>)[0]) : null);
}

export async function getSpotifyAdminConnectionStatus() {
  return toStatus(await getSpotifyAdminConnection());
}

export async function saveSpotifyAdminConnection(input: { spotifyUserId: string; displayName: string; refreshToken: string }) {
  const pool = getPool();
  const now = new Date().toISOString();
  const record: SpotifyAdminConnectionRecord = {
    id: 1,
    spotifyUserId: input.spotifyUserId,
    displayName: input.displayName,
    refreshToken: input.refreshToken,
    createdAt: now,
    updatedAt: now
  };

  if (!pool) {
    globalState.hymnSpotifyAdminConnection = record;
    return record;
  }

  await ensureSpotifyAuthTable(pool);
  await pool.query(
    `INSERT INTO spotify_admin_connection (id, spotify_user_id, display_name, refresh_token, created_at, updated_at)
     VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON DUPLICATE KEY UPDATE spotify_user_id = VALUES(spotify_user_id), display_name = VALUES(display_name), refresh_token = VALUES(refresh_token), updated_at = CURRENT_TIMESTAMP`,
    [input.spotifyUserId, input.displayName, input.refreshToken]
  );
  const existing = await getSpotifyAdminConnection();
  return existing ?? record;
}

export async function clearSpotifyAdminConnection() {
  const pool = getPool();
  if (!pool) {
    globalState.hymnSpotifyAdminConnection = null;
    return;
  }
  await ensureSpotifyAuthTable(pool);
  await pool.query("DELETE FROM spotify_admin_connection WHERE id = 1");
}
