import { Release, ReleaseStatus } from "@/lib/types";

export type ReleasePortalStage = "draft" | "review" | "changes_requested" | "scheduled" | "processing" | "partially_live" | "released" | "rejected";

export function getReleasePortalStage(release: Release): ReleasePortalStage {
  const s = release.status.toLowerCase();
  if (s === "draft") return "draft";
  if (s === "rejected") return "rejected";
  if (s === "changes_requested") return "changes_requested";
  if (s === "under_review" || s === "submitted" || s === "in_queue") return "review";
  if (s === "processing" || s === "awaiting_live_confirmation" || s === "sent_to_distributor") return "processing";
  if (s === "partially_live") return "partially_live";
  if (s === "scheduled") return "scheduled";
  if (s === "live" || s === "released") return "released";
  return "scheduled";
}

export function getReleasePortalStageLabel(stage: ReleasePortalStage) {
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
  const source = release.releaseDate || release.createdAt;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(source));
}

export function getReleasePortalTrackCount(release: Release) {
  return Math.max(release.tracks?.length ?? 0, 1);
}

export function getReleasePortalBadgeStyle(stage: ReleasePortalStage) {
  if (stage === "draft") {
    return {
      borderColor: "rgba(245, 158, 11, 0.45)",
      background: "rgba(245, 158, 11, 0.12)",
      color: "rgb(217, 119, 6)"
    } as const;
  }
  if (stage === "scheduled") {
    return {
      borderColor: "rgba(59, 130, 246, 0.4)",
      background: "rgba(59, 130, 246, 0.1)",
      color: "rgb(37, 99, 235)"
    } as const;
  }

  if (stage === "rejected") {
    return {
      borderColor: "rgba(239, 68, 68, 0.4)",
      background: "rgba(239, 68, 68, 0.1)",
      color: "rgb(220, 38, 38)"
    } as const;
  }

  if (stage === "changes_requested") {
    return {
      borderColor: "rgba(239, 68, 68, 0.48)",
      background: "rgba(239, 68, 68, 0.14)",
      color: "rgb(248, 113, 113)"
    } as const;
  }

  if (stage === "review") {
    return {
      borderColor: "rgba(234, 179, 8, 0.48)",
      background: "rgba(234, 179, 8, 0.14)",
      color: "rgb(202, 138, 4)"
    } as const;
  }

  if (stage === "partially_live") {
    return {
      borderColor: "rgba(59, 130, 246, 0.46)",
      background: "rgba(59, 130, 246, 0.13)",
      color: "rgb(37, 99, 235)"
    } as const;
  }

  if (stage === "released") {
    return {
      borderColor: "rgba(16, 185, 129, 0.4)",
      background: "rgba(16, 185, 129, 0.1)",
      color: "rgb(5, 150, 105)"
    } as const;
  }

  return {
    borderColor: "var(--border)",
    background: "var(--bg-soft)",
    color: "var(--text-soft)"
  } as const;
}

export function getReleasePortalFilterLabel(status: ReleaseStatus) {
  if (status === "live") return "Released";
  if (status === "approved" || status === "sent") return "Scheduled";
  return "Draft";
}




// vercel trigger
// vercel trigger 5

// vercel trigger 12
