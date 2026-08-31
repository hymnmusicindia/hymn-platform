export function canonicalReleaseArtworkUrl(releaseId: number, storedUrl: unknown) {
  if (typeof storedUrl !== "string" || !storedUrl.trim()) return "";
  const value = storedUrl.trim();
  if (/^\/api\/assets\/\d+\/download(?:\?|$)/.test(value) && Number.isInteger(releaseId) && releaseId > 0) return `/api/releases/${releaseId}/artwork`;
  return value;
}

export function storedAssetIdFromUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/api\/assets\/(\d+)\/download(?:\?|$)/);
  const id = Number(match?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
