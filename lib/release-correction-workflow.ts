export function releaseAlreadyInReview(status?: string | null) {
  return ["under_review", "resubmitted"].includes(String(status ?? "").trim().toLowerCase());
}

export function matchesReceivedCorrection(release: { status?: string; metadata?: unknown } | null, submissionKey: string) {
  if (!release || !submissionKey || !releaseAlreadyInReview(release.status)) return false;
  const metadata = release.metadata && typeof release.metadata === "object" ? release.metadata as Record<string, unknown> : {};
  return metadata.correctionSubmissionKey === submissionKey;
}
