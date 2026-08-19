import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const unsafeMetadataKeys = new Set(["direnoteResponse", "direnoteValidationErrors", "reviewIssues", "reviewHistory", "analytics", "earnings", "audit"]);

function safeMetadata(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value ?? undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !unsafeMetadataKeys.has(key)));
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const source = await prisma.release.findFirst({ where: { id, userId: auth.user.id }, include: { tracks: true } });
  if (!source) return NextResponse.json({ error: "Release not found." }, { status: 404 });

  try {
    const duplicate = await prisma.$transaction(async (tx) => {
      const created = await tx.release.create({
        data: {
          userId: auth.user.id, title: `${source.title} - Copy`, artistName: source.artistName, genre: source.genre,
          collaborators: source.collaborators, producer: source.producer, bpm: source.bpm, explicit: source.explicit,
          releaseDate: source.releaseDate, status: "DRAFT", releaseType: source.releaseType, artworkUrl: source.artworkUrl,
          audioUrl: source.audioUrl, paymentStatus: "pending", metadata: safeMetadata(source.metadata) as any,
          draftCompletionPercent: source.draftCompletionPercent, lastEditedAt: new Date(), missingFields: source.missingFields ?? undefined
        }
      });
      if (source.tracks.length) {
        await tx.track.createMany({
          data: source.tracks.map((track) => ({
            releaseId: created.id, title: track.title, duration: track.duration, trackNumber: track.trackNumber,
            audioUrl: track.audioUrl, primaryArtist: track.primaryArtist, metadata: safeMetadata(track.metadata) as any
          }))
        });
      }
      return created;
    });
    return NextResponse.json({ releaseId: duplicate.id }, { status: 201 });
  } catch (error) {
    console.error("Release duplication failed", { releaseId: id, userId: auth.user.id, error });
    return NextResponse.json({ error: "Could not duplicate this release. Please try again." }, { status: 500 });
  }
}
