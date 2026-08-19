import { NextResponse } from "next/server";
import { createNotification } from "@/lib/db";
import { createReleaseAuditLog, listAllDetailedReleases, updateDetailedReleaseStatus } from "@/lib/distribution-db";
import { isDireNoteAccepted, releaseDateReached, statusWhenScheduledDateArrives } from "@/lib/release-status-engine";
import { logAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const now = new Date();
  const autoMarkLive = process.env.AUTO_MARK_LIVE_AFTER_RELEASE_DATE?.trim().toLowerCase() === "true";
  const releases = await listAllDetailedReleases();
  const due = releases.filter((release) => release.status === "scheduled" && isDireNoteAccepted(release) && releaseDateReached(release.releaseDate, now));
  const updated: Array<{ id: number; status: string }> = [];

  for (const release of due) {
    const status = statusWhenScheduledDateArrives(autoMarkLive);
    const note = autoMarkLive ? "Auto-marked live based on release date and DireNote acceptance." : "Release date reached; awaiting platform availability confirmation.";
    await updateDetailedReleaseStatus(release.id, status, note);
    await createReleaseAuditLog({ releaseId: release.id, action: "AUTOMATIC_RELEASE_STATUS_SYNC", details: { from: release.status, to: status, autoMarkLive, syncedAt: now.toISOString() } });
    await logAuditEvent({ actorType: "cron", entityType: "release", entityId: release.id, action: "release.status.auto_transition", oldValue: { status: release.status }, newValue: { status }, metadata: { autoMarkLive, syncedAt: now.toISOString() } });
    await createNotification({
      userId: release.userId,
      title: autoMarkLive ? `Release date reached: ${release.releaseTitle || release.trackName}` : `Release awaiting platform confirmation: ${release.releaseTitle || release.trackName}`,
      body: autoMarkLive ? "Your scheduled release date has arrived. HYMN has updated your release status based on the release date and distribution acceptance." : "Your release date has arrived. HYMN is waiting for platform availability confirmation.",
      type: "release",
      href: `/dashboard/releases?releaseId=${release.id}${autoMarkLive ? "" : "&tab=distribution"}`,
      actionLabel: "View release",
      eventKey: `release:${release.id}:status:${status}`,
      metadata: { releaseId: release.id, status, automatic: true }
    });
    updated.push({ id: release.id, status });
  }

  console.info("release-status-sync", { checked: releases.length, due: due.length, updated: updated.length, autoMarkLive, at: now.toISOString() });
  return NextResponse.json({ success: true, checked: releases.length, due: due.length, updated, autoMarkLive });
}
