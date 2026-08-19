import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getSpotifyArtistById, parseAppleArtistId, parseSpotifyArtistId } from "@/lib/spotify";
import { z } from "zod";

const resolveSchema = z.object({
  spotifyUrl: z.string().min(1),
  appleUrl: z.string().min(1).optional()
});

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const payload = resolveSchema.parse(await request.json());
    const spotifyArtistId = parseSpotifyArtistId(payload.spotifyUrl);
    const artist = await getSpotifyArtistById(spotifyArtistId);
    if (!artist) {
      return NextResponse.json({ error: "Spotify artist not found." }, { status: 404 });
    }
    return NextResponse.json({
      artist,
      spotifyArtistId,
      appleArtistId: payload.appleUrl ? parseAppleArtistId(payload.appleUrl) : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify resolve failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

