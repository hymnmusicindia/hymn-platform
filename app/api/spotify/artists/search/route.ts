import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { searchSpotifyArtists } from "@/lib/spotify";
import { spotifySearchSchema } from "@/lib/validation";

export async function GET(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const { searchParams } = new URL(request.url);
    const parsed = spotifySearchSchema.parse({ q: searchParams.get("q") ?? "" });
    const artists = await searchSpotifyArtists(parsed.q);
    return NextResponse.json({ artists });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify search failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

