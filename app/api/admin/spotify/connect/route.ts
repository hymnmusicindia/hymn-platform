export const runtime = "nodejs";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminPermission } from "@/lib/access";
import { buildSpotifyAuthorizeUrl } from "@/lib/spotify";

const STATE_COOKIE = "hymn_spotify_admin_state";
const RETURN_TO_COOKIE = "hymn_spotify_admin_return_to";

function sanitizeReturnTo(value: string | null) {
  const fallback = "/admin?tab=timed-playlists";
  if (!value) return fallback;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  return trimmed;
}

export async function GET(request: NextRequest) {
  const result = await requireAdminPermission("system.manage");
  if ("error" in result) return result.error;

  try {
    const returnTo = sanitizeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    const state = randomUUID();
    const response = NextResponse.redirect(buildSpotifyAuthorizeUrl(state));
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 10
    };
    response.cookies.set(STATE_COOKIE, state, cookieOptions);
    response.cookies.set(RETURN_TO_COOKIE, returnTo, cookieOptions);
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the Spotify connection.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
// vercel trigger 9
