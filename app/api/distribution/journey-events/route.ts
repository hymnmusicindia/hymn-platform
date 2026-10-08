import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { prisma } from "@/lib/prisma";

const allowedEvents = new Set(["stage_reached", "audio_upload_failed", "audio_upload_resumed", "draft_conflict"]);
const allowedStages = new Set([0, 1, 2, 3, 4, 5, 7]);

export async function POST(request: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  const releaseId = Number(body.releaseId);
  const stage = Number(body.stage);
  if (!Number.isInteger(releaseId) || releaseId < 1 || !allowedEvents.has(body.event) || !allowedStages.has(stage)) {
    return NextResponse.json({ error: "Invalid journey event." }, { status: 400 });
  }
  const owned = await prisma.release.count({ where: { id: releaseId, userId: auth.user.id } });
  if (!owned) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  const recent = await prisma.acquisitionEvent.count({ where: { userId: auth.user.id, funnel: "release_journey", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= 120) return NextResponse.json({ error: "Journey event limit reached." }, { status: 429 });
  await prisma.acquisitionEvent.create({ data: { userId: auth.user.id, funnel: "release_journey", event: body.event, metadata: { releaseId, stage, format: ["single", "ep", "album"].includes(body.format) ? body.format : null, trackCount: Number.isInteger(body.trackCount) ? Math.max(0, Math.min(30, body.trackCount)) : null } } });
  return NextResponse.json({ recorded: true }, { status: 201 });
}
