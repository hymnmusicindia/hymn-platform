import { SpotifyArtistResult, SpotifyTrackSearchResult } from "@/lib/types";

import { getPublicAppUrl } from "@/lib/public-app-url";

type SpotifyTokenCache = {
  value: string;
  expiresAt: number;
  refreshToken?: string;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
};

type SpotifyUserProfileResponse = {
  id: string;
  display_name?: string | null;
};

const globalState = globalThis as typeof globalThis & {
  hymnSpotifyToken?: SpotifyTokenCache;
  hymnSpotifyAdminToken?: SpotifyTokenCache;
  hymnSpotifySearchCache?: Map<string, CacheEntry<SpotifyArtistResult[]>>;
  hymnSpotifyTrackSearchCache?: Map<string, CacheEntry<SpotifyTrackSearchResult[]>>;
  hymnSpotifyArtistCache?: Map<string, CacheEntry<SpotifyArtistResult | null>>;
};

const searchCache = globalState.hymnSpotifySearchCache ?? new Map<string, CacheEntry<SpotifyArtistResult[]>>();
const trackSearchCache = globalState.hymnSpotifyTrackSearchCache ?? new Map<string, CacheEntry<SpotifyTrackSearchResult[]>>();
const artistCache = globalState.hymnSpotifyArtistCache ?? new Map<string, CacheEntry<SpotifyArtistResult | null>>();
globalState.hymnSpotifySearchCache = searchCache;
globalState.hymnSpotifyTrackSearchCache = trackSearchCache;
globalState.hymnSpotifyArtistCache = artistCache;

function spotifyConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function getSpotifyClientId() {
  return process.env.SPOTIFY_CLIENT_ID?.trim() ?? "";
}

function getSpotifyClientSecret() {
  return process.env.SPOTIFY_CLIENT_SECRET?.trim() ?? "";
}

function getSpotifyBasicAuthHeader() {
  const credentials = Buffer.from(`${getSpotifyClientId()}:${getSpotifyClientSecret()}`).toString("base64");
  return `Basic ${credentials}`;
}

function getCached<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function setCached<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttlMs = 1000 * 60 * 5) {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function toSpotifyArtistResult(input: {
  id: string;
  name: string;
  images?: Array<{ url: string }>;
  followers?: { total?: number };
  external_urls?: { spotify?: string };
}): SpotifyArtistResult {
  return {
    id: input.id,
    name: input.name,
    imageUrl: input.images?.[0]?.url ?? null,
    followers: input.followers?.total ?? null,
    spotifyUrl: input.external_urls?.spotify ?? `https://open.spotify.com/artist/${input.id}`
  };
}

function toSpotifyTrackSearchResult(input: {
  id: string;
  name: string;
  artists?: Array<{ name?: string }>;
  album?: { name?: string; images?: Array<{ url: string }> };
  duration_ms?: number;
  external_urls?: { spotify?: string };
}): SpotifyTrackSearchResult {
  return {
    id: input.id,
    name: input.name,
    artistName: input.artists?.map((artist) => artist.name?.trim()).filter(Boolean).join(', ') || 'Unknown Artist',
    albumName: input.album?.name?.trim() ?? null,
    durationMs: input.duration_ms ?? null,
    imageUrl: input.album?.images?.[0]?.url ?? null,
    spotifyUrl: input.external_urls?.spotify ?? `https://open.spotify.com/track/${input.id}`
  };
}

function parseSpotifyTokenResponse(data: SpotifyTokenResponse) {
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    refreshToken: data.refresh_token ?? null
  };
}

function cacheSpotifyAdminToken(refreshToken: string, accessToken: string, expiresIn: number) {
  globalState.hymnSpotifyAdminToken = {
    value: accessToken,
    expiresAt: Date.now() + (expiresIn * 1000),
    refreshToken
  };
}

function getCachedSpotifyAdminToken(refreshToken: string) {
  const cached = globalState.hymnSpotifyAdminToken;
  if (!cached) return null;
  if (cached.refreshToken !== refreshToken) return null;
  if (cached.expiresAt <= Date.now() + 30_000) return null;
  return cached.value;
}

export function clearSpotifyAdminTokenCache() {
  globalState.hymnSpotifyAdminToken = undefined;
}

export function parseSpotifyArtistId(input: string) {
  const value = input.trim();
  const match = value.match(/spotify\.com\/artist\/([A-Za-z0-9]+)|spotify:artist:([A-Za-z0-9]+)/i);
  const extracted = match?.[1] ?? match?.[2] ?? null;
  if (!extracted) throw new Error("Enter a valid Spotify artist URL.");
  return extracted;
}

export function parseAppleArtistId(input: string) {
  const value = input.trim();
  const match = value.match(/\/artist\/[^/]+\/(\d+)/i);
  if (!match?.[1]) throw new Error("Enter a valid Apple Music artist URL.");
  return match[1];
}

export function parseSpotifyPlaylistId(input: string) {
  const value = input.trim();
  const match = value.match(/spotify\.com\/playlist\/([A-Za-z0-9]+)|spotify:playlist:([A-Za-z0-9]+)/i);
  const extracted = match?.[1] ?? match?.[2] ?? null;
  if (!extracted) throw new Error("Choose a valid Spotify playlist link.");
  return extracted;
}

export function parseSpotifyTrackId(input: string) {
  const value = input.trim();
  const match = value.match(/spotify\.com\/track\/([A-Za-z0-9]+)|spotify:track:([A-Za-z0-9]+)/i);
  const extracted = match?.[1] ?? match?.[2] ?? null;
  if (!extracted) throw new Error("Enter a valid Spotify track link or song name.");
  return extracted;
}

export function spotifyTrackUrl(trackId: string) {
  const normalized = trackId.trim();
  if (!normalized) {
    throw new Error("Enter a valid Spotify track link or song name.");
  }
  return `https://open.spotify.com/track/${normalized}`;
}

export function spotifyTrackUri(trackId: string) {
  const normalized = trackId.trim();
  if (!normalized) {
    throw new Error("Enter a valid Spotify track URL.");
  }
  return `spotify:track:${normalized}`;
}

function spotifyApiError(fallback: string) {
  return fallback;
}

async function requestSpotifyToken(body: URLSearchParams) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: getSpotifyBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString(),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(spotifyApiError("Could not authenticate with Spotify."));
  }

  return parseSpotifyTokenResponse(await response.json() as SpotifyTokenResponse);
}

export async function getSpotifyAccessToken() {
  if (!spotifyConfigured()) {
    throw new Error("Spotify credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
  }

  if (globalState.hymnSpotifyToken && globalState.hymnSpotifyToken.expiresAt > Date.now() + 30_000) {
    return globalState.hymnSpotifyToken.value;
  }

  const data = await requestSpotifyToken(new URLSearchParams({ grant_type: "client_credentials" }));
  globalState.hymnSpotifyToken = {
    value: data.accessToken,
    expiresAt: Date.now() + (data.expiresIn * 1000)
  };
  return data.accessToken;
}

export function buildSpotifyRedirectUri() {
  const configured = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (configured) return configured;

  const base = getPublicAppUrl();
  return new URL("/api/admin/spotify/callback", base).toString();
}

export function buildSpotifyAuthorizeUrl(state: string) {
  if (!spotifyConfigured()) {
    throw new Error("Spotify credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
  }

  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", getSpotifyClientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", buildSpotifyRedirectUri());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", [
    "playlist-modify-public",
    "playlist-modify-private",
    "user-read-email",
    "user-read-private"
  ].join(" "));
  url.searchParams.set("show_dialog", "true");
  return url.toString();
}

export async function exchangeSpotifyAuthorizationCode(code: string, redirectUri: string) {
  if (!spotifyConfigured()) {
    throw new Error("Spotify credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
  }

  const data = await requestSpotifyToken(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri
  }));

  if (data.refreshToken) {
    cacheSpotifyAdminToken(data.refreshToken, data.accessToken, data.expiresIn);
  }

  return data;
}

export async function refreshSpotifyAccessToken(refreshToken: string) {
  const cached = getCachedSpotifyAdminToken(refreshToken);
  if (cached) return cached;

  if (!spotifyConfigured()) {
    throw new Error("Spotify credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.");
  }

  const data = await requestSpotifyToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken
  }));

  const nextRefreshToken = data.refreshToken ?? refreshToken;
  cacheSpotifyAdminToken(nextRefreshToken, data.accessToken, data.expiresIn);
  return data.accessToken;
}

export async function getSpotifyUserProfile(accessToken: string) {
  const response = await fetch("https://api.spotify.com/v1/me", {
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Could not read the connected Spotify account.");
  }

  const data = await response.json() as SpotifyUserProfileResponse;
  return {
    id: data.id,
    displayName: data.display_name?.trim() || data.id || "Spotify user"
  };
}

async function spotifyPlaylistRequest(
  method: "POST" | "DELETE",
  accessToken: string,
  playlistId: string,
  trackUris: string[]
) {
  const response = await fetch(`https://api.spotify.com/v1/playlists/${encodeURIComponent(playlistId)}${method === "POST" ? "/items" : "/tracks"}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(
      method === "POST"
        ? { uris: trackUris }
        : { tracks: trackUris.map((uri) => ({ uri })) }
    ),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("Spotify playlist update failed. Please reconnect and try again.");
  }

  return response.json().catch(() => null);
}

export async function addTracksToSpotifyPlaylist(accessToken: string, playlistId: string, trackUris: string[]) {
  if (!trackUris.length) return null;
  return spotifyPlaylistRequest("POST", accessToken, playlistId, trackUris);
}

export async function removeTracksFromSpotifyPlaylist(accessToken: string, playlistId: string, trackUris: string[]) {
  if (!trackUris.length) return null;
  return spotifyPlaylistRequest("DELETE", accessToken, playlistId, trackUris);
}

export async function searchSpotifyArtists(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const cached = getCached(searchCache, normalized);
  if (cached) return cached;

  const token = await getSpotifyAccessToken();
  const response = await fetch(`https://api.spotify.com/v1/search?type=artist&limit=5&q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Spotify artist search failed.");
  const data = await response.json() as { artists?: { items?: Array<{ id: string; name: string; images?: Array<{ url: string }>; followers?: { total?: number }; external_urls?: { spotify?: string } }> } };
  const results = (data.artists?.items ?? []).map(toSpotifyArtistResult);
  setCached(searchCache, normalized, results);
  return results;
}

export async function searchSpotifyTracks(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const cached = getCached(trackSearchCache, normalized);
  if (cached) return cached;

  const token = await getSpotifyAccessToken();
  const response = await fetch(`https://api.spotify.com/v1/search?type=track&limit=5&q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!response.ok) throw new Error("Spotify track search failed.");
  const data = await response.json() as {
    tracks?: {
      items?: Array<{
        id: string;
        name: string;
        artists?: Array<{ name?: string }>;
        album?: { name?: string; images?: Array<{ url: string }> };
        duration_ms?: number;
        external_urls?: { spotify?: string };
      }>;
    };
  };
  const results = (data.tracks?.items ?? []).map(toSpotifyTrackSearchResult);
  setCached(trackSearchCache, normalized, results);
  return results;
}

export async function getSpotifyArtistById(artistId: string) {
  const normalized = artistId.trim();
  const cached = getCached(artistCache, normalized);
  if (cached) return cached;

  const token = await getSpotifyAccessToken();
  const response = await fetch(`https://api.spotify.com/v1/artists/${encodeURIComponent(normalized)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (response.status === 404) {
    setCached(artistCache, normalized, null);
    return null;
  }
  if (!response.ok) throw new Error("Spotify artist lookup failed.");
  const data = await response.json() as { id: string; name: string; images?: Array<{ url: string }>; followers?: { total?: number }; external_urls?: { spotify?: string } };
  const result = toSpotifyArtistResult(data);
  setCached(artistCache, normalized, result);
  return result;
}



