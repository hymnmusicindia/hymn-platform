/** Client-safe presentation and campaign URL rules. Eligibility stays server-side. */
export const FIRST_RELEASE_CODE = "FIRST_RELEASE_FREE";
const attributionKeys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export function firstReleaseAttribution(query: Record<string, unknown>) {
  return Object.fromEntries(attributionKeys.flatMap(key => typeof query[key] === "string" && query[key] ? [[key, query[key].slice(0, 300)]] : []));
}
export function firstReleaseStartHref(query: Record<string, unknown>, draftId?: number) {
  const params = new URLSearchParams({ ...firstReleaseAttribution(query), campaign: "first-release" });
  if (draftId && Number.isInteger(draftId) && draftId > 0) params.set("edit", String(draftId));
  return `/distribution/start?${params}`;
}
export function showFirstReleaseBadge(status: string, metadata: unknown) {
  const code = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).promotionCode : null;
  return code === FIRST_RELEASE_CODE && !["live", "released", "distributed", "partially_live", "taken_down", "archived"].includes(status.toLowerCase());
}
