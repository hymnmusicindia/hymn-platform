import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DIRENOTE_GENRES, DIRENOTE_LANGUAGES, DIRENOTE_SUBGENRES_BY_GENRE } from "@/lib/direnote-config";
import { getReleasePrefill, type ReleasePreferences } from "@/lib/release-prefill";

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function optionalText(value: unknown, limit = 180) { return typeof value === "string" ? value.trim().slice(0, limit) || undefined : undefined; }

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  return NextResponse.json(await getReleasePrefill(session.sub));
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const body = record(await request.json().catch(() => ({})));
  const current = await prisma.user.findUnique({ where: { id: session.sub }, select: { onboardingPreferences: true } });
  if (!current) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const root = record(current.onboardingPreferences);
  if (body.clear === true) {
    delete root.distributionPreferences;
  } else {
    const rightsInput = record(body.rightsDefaults);
    const preferredTitleLanguage = optionalText(body.preferredTitleLanguage, 80);
    const preferredGenre = optionalText(body.preferredGenre, 80);
    const preferredSubgenre = optionalText(body.preferredSubgenre, 100);
    if (preferredTitleLanguage && !(DIRENOTE_LANGUAGES as readonly string[]).includes(preferredTitleLanguage)) return NextResponse.json({ error: "Choose a supported title language." }, { status: 400 });
    if (preferredGenre && !(DIRENOTE_GENRES as readonly string[]).includes(preferredGenre)) return NextResponse.json({ error: "Choose a supported genre." }, { status: 400 });
    if (preferredSubgenre && (!preferredGenre || !(DIRENOTE_SUBGENRES_BY_GENRE[preferredGenre] ?? []).includes(preferredSubgenre))) return NextResponse.json({ error: "Choose a subgenre that belongs to the selected genre." }, { status: 400 });
    const preferences: ReleasePreferences = {
      defaultArtistProfileId: Number.isInteger(body.defaultArtistProfileId) && Number(body.defaultArtistProfileId) > 0 ? Number(body.defaultArtistProfileId) : undefined,
      preferredTitleLanguage,
      preferredGenre,
      preferredSubgenre,
      rightsDefaults: {
        compositionOwner: optionalText(rightsInput.compositionOwner), masterRecordingOwner: optionalText(rightsInput.masterRecordingOwner), defaultLabelName: optionalText(rightsInput.defaultLabelName), defaultCLineName: optionalText(rightsInput.defaultCLineName), defaultPLineName: optionalText(rightsInput.defaultPLineName)
      }
    };
    root.distributionPreferences = JSON.parse(JSON.stringify(preferences));
  }
  await prisma.user.update({ where: { id: session.sub }, data: { onboardingPreferences: root as Prisma.InputJsonValue } });
  return NextResponse.json({ success: true, ...(await getReleasePrefill(session.sub)) });
}
