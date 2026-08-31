export function canonicalReleaseArtworkUrl(releaseId: number, storedUrl: unknown) {
  return storedUrl && Number.isInteger(releaseId) && releaseId > 0 ? `/api/releases/${releaseId}/artwork` : "";
}

export function storedAssetIdFromUrl(value: unknown) {
  if (typeof value !== "string") return null;
  const match = value.match(/^\/api\/assets\/(\d+)\/download(?:\?|$)/);
  const id = Number(match?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
