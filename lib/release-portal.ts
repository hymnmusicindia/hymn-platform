import { Release, ReleaseStatus } from "@/lib/types";
import { CUSTOMER_REVIEW_STATUSES, effectiveReleaseStatus } from "@/lib/release-status-presentation";

export type ReleasePortalStage = "draft" | "review" | "reconciling" | "changes_requested" | "scheduled" | "processing" | "partially_live" | "released" | "rejected" | "queued" | "sending" | "partner_received" | "payment_required" | "delivery_issue" | "takedown_pending" | "taken_down" | "archived" | "unknown";

export function getReleasePortalStage(release: Release): ReleasePortalStage {
  const s = effectiveReleaseStatus(release.status, release.direNoteStatus);
  const metadata = release.metadata && typeof release.metadata === "object" ? release.metadata as Record<string, unknown> : {};
  const direNote = metadata.direNote && typeof metadata.direNote === "object" ? metadata.direNote as Record<string, unknown> : {};
  if (direNote.reconciliationInProgress === true) return "reconciling";
  if (s === "draft") return "draft";
  if (s === "rejected") return "rejected";
  if (s === "changes_requested" || s === "distributor_changes_required") return "changes_requested";
  if (s === "awaiting_payment") return "payment_required";
  if (s === "approved" || s === "queued_for_distribution") return "queued";
  if (s === "submitting_to_distributor") return "sending";
  if (s === "sent" || s === "sent_to_distributor") return "partner_received";
  if (s === "distributor_processing" || s === "processing") return "processing";
  if (s === "failed" || s === "delivery_failed") return "delivery_issue";
  if (s === "takedown_requested" || s === "takedown_processing") return "takedown_pending";
  if (s === "taken_down") return "taken_down";
  if (s === "archived") return "archived";
  if (s === "awaiting_live_confirmation" || s === "delivered") return "processing";
  if (s === "partially_live") return "partially_live";
  if (s === "scheduled") return "scheduled";
  if (s === "live" || s === "released" || s === "distributed") return "released";
  if (CUSTOMER_REVIEW_STATUSES.has(s)) return "review";
  return "unknown";
}

export function getReleasePortalStageLabel(stage: ReleasePortalStage) {
  if (stage === "reconciling") return "Reconciling";
  const operational: Partial<Record<ReleasePortalStage, string>> = { queued: "Queued for Distribution", sending: "Sending to Partner", partner_received: "Received by Partner", payment_required: "Payment Required", delivery_issue: "Delivery Needs Attention", takedown_pending: "Takedown Pending", taken_down: "Taken Down", archived: "Archived", unknown: "Status Pending" };
  if (operational[stage]) return operational[stage]!;
  if (stage === "scheduled") return "Scheduled";
  if (stage === "released") return "Released";
  if (stage === "rejected") return "Rejected";
  if (stage === "changes_requested") return "Changes Requested";
  if (stage === "review") return "Under Review";
  if (stage === "processing") return "Processing";
  if (stage === "partially_live") return "Partially Released";
  return "Draft";
}

export function getReleasePortalAction(release: Release) {
  return {
    label: "Manage",
    href: `/dashboard/releases/${release.id}`
  };
}

export function getReleasePortalSortKey(release: Release) {
  const stage = getReleasePortalStage(release);
  const rank = stage === "released" ? 2 : stage === "scheduled" ? 1 : 0;
  return { rank, timestamp: new Date(release.createdAt).getTime() };
}

export function isReleaseUnfinished(release: Release) {
  return getReleasePortalStage(release) === "draft";
}

export function getReleasePortalDateLabel(release: Release) {
  if (release.releaseTiming === "quick_release") {
    const stage = getReleasePortalStage(release);
    if (stage === "released") return "Available now";
    if (stage === "partially_live") return "Available on some stores";
    if (stage === "taken_down") return "Removed from stores";
    if (stage === "scheduled") return "HYMN approved; store release is pending";
    if (["partner_received", "processing"].includes(stage)) return "Usually 2–7 days after HYMN approval";
    return "As soon as possible after approval";
  }
  const source = release.releaseDate || release.createdAt;
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return "Date pending";
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(parsed);
  return date;
}

export function isTentativeQuickRelease(release: Release) {
  if (release.releaseTiming !== "quick_release") return false;
  return !["live", "released"].includes(release.status.toLowerCase());
}

export function getReleasePortalDateTitle(release: Release) {
  return release.releaseTiming === "quick_release" ? "Release timing" : "Release date";
}

export function getReleasePortalTrackCount(release: Release) {
  return Math.max(release.tracks?.length ?? 0, 1);
}

export function getReleasePortalBadgeStyle(stage: ReleasePortalStage) {
  if (stage === "draft") {
    return {
      borderColor: "var(--warning)",
      background: "var(--warning-soft)",
      color: "var(--warning)"
    } as const;
  }
  if (stage === "scheduled") {
    return {
      borderColor: "var(--info)",
      background: "var(--info-soft)",
      color: "var(--info)"
    } as const;
  }

  if (stage === "rejected") {
    return {
      borderColor: "var(--danger)",
      background: "var(--danger-soft)",
      color: "var(--danger)"
    } as const;
  }

  if (stage === "changes_requested") {
    return {
      borderColor: "var(--danger)",
      background: "var(--danger-soft)",
      color: "var(--danger)"
    } as const;
  }

  if (stage === "review") {
    return {
      borderColor: "var(--warning)",
      background: "var(--warning-soft)",
      color: "var(--warning)"
    } as const;
  }

  if (stage === "partially_live") {
    return {
      borderColor: "var(--info)",
      background: "var(--info-soft)",
      color: "var(--info)"
    } as const;
  }

  if (stage === "released") {
    return {
      borderColor: "var(--success)",
      background: "var(--success-soft)",
      color: "var(--success)"
    } as const;
  }

  return {
    borderColor: "var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text-soft)"
  } as const;
}

export function getReleasePortalFilterLabel(status: ReleaseStatus) {
  return getReleasePortalStageLabel(getReleasePortalStage({ status } as Release));
}




// vercel trigger
// vercel trigger 5

// vercel trigger 12
