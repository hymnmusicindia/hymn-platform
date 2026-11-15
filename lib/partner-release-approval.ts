type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
const status = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase().replaceAll("_", " ") : "";
const approved = (value: unknown) => /^(approved|scheduled|ready for distribution|approved for distribution|release date approved)$/.test(status(value));

/** Receipt/processing alone is not an approval, nor is one approved track in an album. */
export function hasPartnerReleaseApproval(release: unknown, tracks: unknown[], payload: unknown = {}) {
  const source = record(release), root = record(payload);
  const statuses = [source.status, source.release_status, source.delivery_status, root.status, root.release_status, ...tracks.map(track => record(track).status)];
  if (statuses.some(value => /reject|declin|fail|correction|changes? required|changes? requested/.test(status(value)))) return false;
  return [source.status, source.release_status, source.delivery_status, root.status, root.release_status].some(approved)
    || (tracks.length > 0 && tracks.every(track => status(record(track).status) === "approved"));
}

export function partnerEstimatedDate(release: unknown, payload: unknown = {}): string | null {
  const keys = ["estimated_release_date", "estimated_live_date", "estimated_delivery_date", "expected_release_date", "track_release_date"];
  const sources = [record(release), record(payload)];
  for (const key of keys) for (const source of sources) {
    const value = source[key];
    if (typeof value !== "string" || !/^20\d{2}-\d{2}-\d{2}(?:$|T| )/.test(value.trim())) continue;
    const day = value.trim().slice(0, 10), parsed = new Date(`${day}T00:00:00Z`);
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day) return day;
  }
  return null;
}

export function approvalEstimateText(day: string | null) {
  return day
    ? `Estimated availability: ${new Intl.DateTimeFormat("en-IN", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`))}. This is an estimate, not a guaranteed release date. Availability may vary by store and territory.`
    : "An estimated availability date has not been provided yet. Approval does not mean the release is already live; store availability will be confirmed separately.";
}

export const PARTNER_APPROVAL_FORWARD_STATES = ["APPROVED", "QUEUED_FOR_DISTRIBUTION", "SUBMITTING_TO_DISTRIBUTOR", "SENT_TO_DISTRIBUTOR", "DISTRIBUTOR_PROCESSING", "SCHEDULED", "AWAITING_LIVE_CONFIRMATION", "PARTIALLY_LIVE", "LIVE"];
