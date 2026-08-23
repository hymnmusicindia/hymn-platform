import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getDetailedReleaseByUserId, updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { prisma } from "@/lib/prisma";

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
  const access = await prisma.release.findUnique({ where: { id: releaseId }, select: { releaseSource: true, customerEditable: true } });
  if (access?.releaseSource === "ADMIN_MANUAL" && !access.customerEditable) return NextResponse.json({ error: "This imported catalog release is view-only. Contact HYMN support to request a metadata change." }, { status: 403 });
  if (!["draft", "changes_requested", "rejected", "under_review"].includes(release.status)) return NextResponse.json({ error: "This release cannot be edited in its current status." }, { status: 409 });

  const updated = release.status === "rejected" ? await updateDetailedReleaseStatus(releaseId, "draft", "User reopened the rejected release for editing.") : release;
  return NextResponse.json({ release: updated });
}
// vercel trigger 9
