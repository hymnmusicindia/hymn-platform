import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminPermission } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { syncDireNoteArtistInformation, syncDireNoteSongwriterInformation } from "@/lib/direnote-service";

const schema = z.discriminatedUnion("type", [z.object({ type: z.literal("artist"), id: z.number().int().positive() }), z.object({ type: z.literal("songwriter"), id: z.number().int().positive() })]);

export async function GET() {
  const admin = await requireAdminPermission("releases.read"); if ("error" in admin) return admin.error;
  const [artists, songwriters] = await Promise.all([
    prisma.artistCard.findMany({ where: { direNoteArtistId: { not: null }, archivedAt: null }, select: { id: true, artistName: true, direNoteArtistId: true, direNoteLastSyncedAt: true }, orderBy: { direNoteLastSyncedAt: { sort: "asc", nulls: "first" } }, take: 100 }),
    prisma.contributorParty.findMany({ where: { direNoteSongwriterId: { not: null }, mergedIntoId: null }, select: { id: true, professionalName: true, direNoteSongwriterId: true, direNoteLastSyncedAt: true }, orderBy: { direNoteLastSyncedAt: { sort: "asc", nulls: "first" } }, take: 100 })
  ]);
  return NextResponse.json({ artists, songwriters });
}

export async function POST(request: Request) {
  const admin = await requireAdminPermission("system.manage"); if ("error" in admin) return admin.error;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid DireNote identity." }, { status: 400 });
  const actorId = "sub" in admin ? Number(admin.sub) || null : null;
  try {
    const identity = parsed.data.type === "artist" ? await syncDireNoteArtistInformation(parsed.data.id, actorId) : await syncDireNoteSongwriterInformation(parsed.data.id, actorId);
    return NextResponse.json({ success: true, identity });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "DireNote identity refresh failed." }, { status: 502 }); }
}
