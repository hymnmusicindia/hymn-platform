export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { buildSpotifyRedirectUri, clearSpotifyAdminTokenCache, exchangeSpotifyAuthorizationCode, getSpotifyUserProfile } from "@/lib/spotify";
import { getAdminSession } from "@/lib/session";
import { getSpotifyAdminConnection, saveSpotifyAdminConnection } from "@/lib/spotify-auth-store";

const STATE_COOKIE = "hymn_spotify_admin_state";
const RETURN_TO_COOKIE = "hymn_spotify_admin_return_to";

function buildRedirectTarget(request: NextRequest, value: string | null, fallback = "/admin?tab=timed-playlists") {
  const base = value?.trim();
  if (!base || !base.startsWith("/") || base.startsWith("//")) {
    return new URL(fallback, request.url);
  }
  return new URL(base, request.url);
}

function finishRedirect(request: NextRequest, returnTo: string | null, spotifyStatus: string) {
  const url = buildRedirectTarget(request, returnTo);
  url.searchParams.set("spotify", spotifyStatus);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get(STATE_COOKIE)?.value ?? null;
  const returnTo = request.cookies.get(RETURN_TO_COOKIE)?.value ?? null;

  if (!code || !state || !storedState || state !== storedState) {
    return finishRedirect(request, returnTo, "error");
  }

  try {
    const existingConnection = await getSpotifyAdminConnection();
    const token = await exchangeSpotifyAuthorizationCode(code, buildSpotifyRedirectUri());
    const accessToken = token.accessToken;
    const profile = await getSpotifyUserProfile(accessToken);
    const refreshToken = token.refreshToken ?? existingConnection?.refreshToken ?? null;

    if (!refreshToken) {
      return finishRedirect(request, returnTo, "error");
    }

    await saveSpotifyAdminConnection({
      spotifyUserId: profile.id,
      displayName: profile.displayName,
      refreshToken
    });
    clearSpotifyAdminTokenCache();

    const response = finishRedirect(request, returnTo, "connected");
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(RETURN_TO_COOKIE);
    return response;
  } catch {
    const response = finishRedirect(request, returnTo, "error");
    response.cookies.delete(STATE_COOKIE);
    response.cookies.delete(RETURN_TO_COOKIE);
    return response;
  }
}
