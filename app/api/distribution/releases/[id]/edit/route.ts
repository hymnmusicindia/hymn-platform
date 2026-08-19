import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getDetailedReleaseByUserId, updateDetailedReleaseStatus } from "@/lib/distribution-db";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  if ("error" in session) return session.error;

  const { id } = await params;
  const releaseId = Number(id);
  if (!Number.isInteger(releaseId) || releaseId <= 0) {
    return NextResponse.json({ error: "Valid release id is required." }, { status: 400 });
  }

  const release = await getDetailedReleaseByUserId(session.session.sub, releaseId);
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });

  const updated = await updateDetailedReleaseStatus(releaseId, "draft", "User returned release to draft for editing.");
  return NextResponse.json({ release: updated });
}
