export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/access";
import { searchSpotifyTracks } from "@/lib/spotify";
import { spotifySearchSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const result = await requireAdmin();
  if ("error" in result) return result.error;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = spotifySearchSchema.parse({ q: searchParams.get("q") ?? "" });
    const tracks = await searchSpotifyTracks(parsed.q);
    return NextResponse.json({ tracks });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify search failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
