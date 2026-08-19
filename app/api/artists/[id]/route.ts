import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { archiveArtistProfile, updateArtistProfile } from "@/lib/db";
import { parseAppleArtistId, parseSpotifyArtistId } from "@/lib/spotify";
import { artistProfileUpdateSchema, normalizeInstagramUrl } from "@/lib/validation";

function profileId(params: { id: string }) {
  const id = Number(params.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireUser();
  if ("error" in result) return result.error;
  const id = profileId(await params);
  if (!id) return NextResponse.json({ error: "Invalid artist profile." }, { status: 400 });
  try {
    const payload = artistProfileUpdateSchema.parse(await request.json());
    const patch = {
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.spotifyUrl !== undefined ? { spotifyUrl: payload.spotifyUrl.trim(), spotifyArtistId: payload.spotifyArtistId ?? parseSpotifyArtistId(payload.spotifyUrl) } : {}),
      ...(payload.appleUrl !== undefined ? { appleUrl: payload.appleUrl.trim() || null, appleArtistId: payload.appleUrl ? (payload.appleArtistId ?? parseAppleArtistId(payload.appleUrl)) : null } : {}),
      ...(payload.instagramUrl !== undefined ? { instagramUrl: normalizeInstagramUrl(payload.instagramUrl) } : {}),
      ...(payload.youtubeUrl !== undefined ? { youtubeUrl: payload.youtubeUrl.trim() || null } : {})
    };
    const profile = await updateArtistProfile(result.user.id, id, patch);
    if (!profile) return NextResponse.json({ error: "Artist profile not found." }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update artist profile." }, { status: 400 });
  }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = await requireUser();
  if ("error" in result) return result.error;
  const id = profileId(await params);
  if (!id) return NextResponse.json({ error: "Invalid artist profile." }, { status: 400 });
  const archived = await archiveArtistProfile(result.user.id, id);
  if (!archived) return NextResponse.json({ error: "Artist profile not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}

// vercel trigger
