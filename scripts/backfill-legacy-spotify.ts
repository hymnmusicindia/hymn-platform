import mysql from "mysql2/promise";
import { prisma } from "../lib/prisma";

async function main() {
  const apply = process.argv.includes("--apply");
  const legacyUrl = process.env.LEGACY_MYSQL_DATABASE_URL?.trim();
  if (!legacyUrl) throw new Error("LEGACY_MYSQL_DATABASE_URL is required. The URL is never printed.");

  const pool = mysql.createPool({ uri: legacyUrl, connectionLimit: 1 });
  try {
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT id, spotify_user_id, display_name, refresh_token, created_at, updated_at FROM spotify_admin_connection WHERE id = 1 LIMIT 1"
    );
    const row = rows[0];
    if (!row) { console.log("No legacy Spotify admin connection found."); return; }
    console.log(`Found one legacy Spotify connection for provider user ${String(row.spotify_user_id)}. Mode: ${apply ? "apply" : "dry-run"}.`);
    if (!apply) return;
    await prisma.spotifyAdminConnection.upsert({
      where: { id: 1 },
      create: { id: 1, spotifyUserId: String(row.spotify_user_id), displayName: String(row.display_name), refreshToken: String(row.refresh_token), createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at) },
      update: { spotifyUserId: String(row.spotify_user_id), displayName: String(row.display_name), refreshToken: String(row.refresh_token) }
    });
    console.log("Legacy Spotify connection migrated. The source record was not deleted.");
  } finally {
    await pool.end();
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "Legacy backfill failed."); process.exitCode = 1; });
// vercel trigger 9
