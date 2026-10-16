export function distributionSubmittedUrl(releaseId: number) {
  return `/distribution/start?resume=${releaseId}&stage=7&submitted=1`;
}
export function isCompletedDistributionSubmission(release: { status?: string | null; paymentStatus?: string | null } | null | undefined) {
  return Boolean(release && release.paymentStatus?.toLowerCase() === "paid" && release.status && !["draft", "awaiting_payment", "changes_requested", "rejected"].includes(release.status.toLowerCase()));
}
