export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import {
  addTracksToSpotifyPlaylist,
  parseSpotifyPlaylistId,
  refreshSpotifyAccessToken,
  removeTracksFromSpotifyPlaylist,
  spotifyTrackUri
} from "@/lib/spotify";
import {
  createTimedPlaylistTrack,
  extendTimedPlaylistTrack,
  getDueTimedPlaylistTracks,
  getTimedPlaylistDashboard,
  removeTimedPlaylistTrack,
  resolveSpotifyTrackMetadata
} from "@/lib/db";
import { getSpotifyAdminConnection, getSpotifyAdminConnectionStatus } from "@/lib/spotify-auth-store";
import { timedPlaylistCreateSchema, timedPlaylistMutationSchema } from "@/lib/validation";

async function syncExpiredTracks() {
  const connection = await getSpotifyAdminConnection();
  const dueTracks = await getDueTimedPlaylistTracks();
  const warnings: string[] = [];

  if (!dueTracks.length) {
    return { warnings };
  }

  if (!connection) {
    warnings.push("Connect Spotify to sync expired tracks.");
    return { warnings };
  }

  const accessToken = await refreshSpotifyAccessToken(connection.refreshToken);
  for (const track of dueTracks) {
    try {
      const playlistId = parseSpotifyPlaylistId(track.playlistUrl ?? "");
      await removeTracksFromSpotifyPlaylist(accessToken, playlistId, [spotifyTrackUri(track.spotifyTrackId)]);
      await removeTimedPlaylistTrack(track.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not remove ${track.trackName} from Spotify.`;
      warnings.push(message);
    }
  }

  return { warnings };
}

export async function GET() {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  let warning: string | null = null;
  try {
    const sweep = await syncExpiredTracks();
    warning = sweep.warnings[0] ?? null;
  } catch (error) {
    warning = error instanceof Error ? error.message : "Could not sync expired tracks.";
  }

  const [dashboard, spotifyConnection] = await Promise.all([
    getTimedPlaylistDashboard(),
    getSpotifyAdminConnectionStatus()
  ]);

  return NextResponse.json({
    dashboard,
    spotifyConnection,
    warning
  });
}

export async function POST(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const payload = timedPlaylistCreateSchema.parse(await request.json());
    const connection = await getSpotifyAdminConnection();
    if (!connection) {
      return NextResponse.json({ error: "Connect Spotify before adding tracks." }, { status: 403 });
    }

    const resolved = await resolveSpotifyTrackMetadata(payload.spotifyUrl);
    const accessToken = await refreshSpotifyAccessToken(connection.refreshToken);
    const playlistId = parseSpotifyPlaylistId(payload.playlistUrl);
    await addTracksToSpotifyPlaylist(accessToken, playlistId, [spotifyTrackUri(resolved.spotifyTrackId)]);

    const track = await createTimedPlaylistTrack({
      ...payload,
      spotifyUrl: resolved.spotifyUrl,
      playlistUrl: payload.playlistUrl,
      spotifyTrackId: resolved.spotifyTrackId,
      trackName: resolved.trackName,
      artistName: resolved.artistName
    });
    const [dashboard, spotifyConnection] = await Promise.all([
      getTimedPlaylistDashboard(),
      getSpotifyAdminConnectionStatus()
    ]);
    return NextResponse.json({ dashboard, spotifyConnection, track, message: `${track.trackName} was added to ${track.playlistName}.` }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add the track.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const payload = timedPlaylistMutationSchema.parse(await request.json());
    let track = null;

    if (payload.action === "extend") {
      if (!payload.endAt) {
        return NextResponse.json({ error: "Choose a new end time." }, { status: 400 });
      }
      track = await extendTimedPlaylistTrack(payload.id, payload.endAt);
    } else {
      const connection = await getSpotifyAdminConnection();
      if (!connection) {
        return NextResponse.json({ error: "Connect Spotify before removing tracks." }, { status: 403 });
      }

      const dashboard = await getTimedPlaylistDashboard();
      track = [...dashboard.activeTracks, ...dashboard.expiredTracks].find((item) => item.id === payload.id) ?? null;
      if (!track) {
        return NextResponse.json({ error: "Track not found." }, { status: 404 });
      }

      const playlistId = parseSpotifyPlaylistId(track.playlistUrl ?? "");
      const accessToken = await refreshSpotifyAccessToken(connection.refreshToken);
      await removeTracksFromSpotifyPlaylist(accessToken, playlistId, [spotifyTrackUri(track.spotifyTrackId)]);
      track = await removeTimedPlaylistTrack(payload.id);
    }

    if (!track) {
      return NextResponse.json({ error: "Track not found." }, { status: 404 });
    }

    const [dashboard, spotifyConnection] = await Promise.all([
      getTimedPlaylistDashboard(),
      getSpotifyAdminConnectionStatus()
    ]);
    return NextResponse.json({ dashboard, spotifyConnection, track, message: payload.action === "extend" ? `${track.trackName} has been extended.` : `${track.trackName} was removed.` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the track.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

