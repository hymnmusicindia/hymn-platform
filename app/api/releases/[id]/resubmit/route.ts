import { NextResponse } from "next/server";
import { requireUser } from "@/lib/access";
import { getDetailedReleaseByUserId, updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { logAuditEvent } from "@/lib/audit-log";
import { createNotificationOnce } from "@/lib/notifications";
import { createAdminTaskOnce } from "@/lib/task-queue";
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(); if ("error" in user) return user.error;
  const id = Number((await params).id);
  const release = await getDetailedReleaseByUserId(user.session.sub, id);
  if (!release) return NextResponse.json({ error: "Release not found." }, { status: 404 });
  if (release.status !== "rejected" && release.status !== "changes_requested") return NextResponse.json({ error: "This release is not awaiting corrections." }, { status: 409 });
  const updated = await updateDetailedReleaseStatus(id, "resubmitted", "User corrected and resubmitted the release.");
  await Promise.all([
    logAuditEvent({ actorType: "user", actorId: user.session.sub, entityType: "release", entityId: id, action: "release.resubmitted", oldValue: { status: release.status }, newValue: { status: "resubmitted" } }),
    createNotificationOnce({ eventKey: `release:${id}:resubmitted:${updated?.createdAt ?? "current"}`, userId: user.session.sub, title: "Release resubmitted", body: "Your corrections were submitted to HYMN for review.", type: "release", href: `/dashboard/releases?releaseId=${id}`, actionLabel: "View release" }),
    createAdminTaskOnce({ eventKey: `release:${id}:resubmission`, type: "Needs Review", priority: "high", title: `Release #${id} resubmitted`, body: "The user completed corrections and returned the release to review.", href: `/admin?tab=releases&releaseId=${id}`, entityType: "release", entityId: id })
  ]);
  return NextResponse.json({ release: updated });
}
// vercel trigger 9
