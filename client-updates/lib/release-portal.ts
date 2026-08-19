import { Release, ReleaseStatus } from "@/lib/types";

export type ReleasePortalStage = "draft" | "scheduled" | "released";

export function getReleasePortalStage(release: Release): ReleasePortalStage {
  if (release.status === "draft") return "draft";
  if (release.status === "live" || release.status === "delivered") return "released";
  if (["approved", "sent", "queued_for_distribution", "sent_to_distributor", "processing"].includes(release.status)) return "scheduled";
  return "draft";
}

export function getReleasePortalStageLabel(stage: ReleasePortalStage) {
  if (stage === "scheduled") return "Scheduled";
  if (stage === "released") return "Released";
  return "Draft";
}

export function getReleasePortalAction(release: Release) {
  const stage = getReleasePortalStage(release);
  if (stage === "draft") {
    return {
      label: "Finish your release",
      href: `/distribution/start?resume=${release.id}`
    };
  }

  return {
    label: "Manage",
    href: `/distribution/start?manage=${release.id}`
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
  if (status === "live" || status === "delivered") return "Released";
  if (["approved", "sent", "queued_for_distribution", "sent_to_distributor", "processing"].includes(status)) return "Scheduled";
  if (status === "failed" || status === "rejected" || status === "changes_requested") return "Needs Attention";
  return "Draft";
}



