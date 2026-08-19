import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { createArtistProfile } from "@/lib/db";
import { parseAppleArtistId } from "@/lib/spotify";
import { artistProfileCreateSchema } from "@/lib/validation";

function avatarDataUrl(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "A";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="100%" height="100%" fill="#18212f" rx="32"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="48" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export async function POST(request: Request) {
  const result = await requireUser();
  if ("error" in result) return result.error;

  try {
    const payload = artistProfileCreateSchema.parse(await request.json());
    const name = payload.name.trim();
    const isLinked = payload.hasLiveMusic;
    const spotifyUrl = payload.spotifyUrl?.trim() || "";
    const appleUrl = payload.appleUrl?.trim() || "";

    if (isLinked && !spotifyUrl && !appleUrl) {
      return NextResponse.json({ error: "Add at least one store link for an artist that already has music live in stores." }, { status: 400 });
    }

    if (spotifyUrl && !payload.spotifyArtistId) {
      return NextResponse.json({ error: "Spotify artist verification is required when a Spotify URL is provided." }, { status: 400 });
    }

    if (spotifyUrl && payload.confirmedSpotifyName && payload.confirmedSpotifyName !== name) {
      return NextResponse.json({ error: "Artist name must match the verified Spotify artist." }, { status: 400 });
    }

    const profile = await createArtistProfile({
      userId: result.user.id,
      name,
      spotifyArtistId: spotifyUrl ? payload.spotifyArtistId ?? null : null,
      spotifyUrl: spotifyUrl || null,
      appleArtistId: appleUrl ? payload.appleArtistId ?? parseAppleArtistId(appleUrl) : null,
      appleUrl: appleUrl || null,
      imageUrl: payload.imageUrl?.trim() || avatarDataUrl(name),
      followers: spotifyUrl ? payload.followers ?? null : null,
      isLinked
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create artist profile.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}


