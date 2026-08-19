export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { clearSpotifyAdminTokenCache } from "@/lib/spotify";
import { clearSpotifyAdminConnection, getSpotifyAdminConnectionStatus } from "@/lib/spotify-auth-store";

export async function POST() {
  const result = await requireAdminPermission("system.manage");
  if ("error" in result) return result.error;

  await clearSpotifyAdminConnection();
  clearSpotifyAdminTokenCache();
  const status = await getSpotifyAdminConnectionStatus();
  return NextResponse.json({ status, message: "Spotify has been disconnected." });
}
// vercel trigger 9
