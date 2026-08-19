export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { clearSpotifyAdminTokenCache } from "@/lib/spotify";
import { clearSpotifyAdminConnection, getSpotifyAdminConnectionStatus } from "@/lib/spotify-auth-store";

export async function POST() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  await clearSpotifyAdminConnection();
  clearSpotifyAdminTokenCache();
  const status = await getSpotifyAdminConnectionStatus();
  return NextResponse.json({ status, message: "Spotify has been disconnected." });
}
