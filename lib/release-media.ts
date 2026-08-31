export function canonicalReleaseArtworkUrl(releaseId: number, storedUrl: unknown) {
  if (typeof storedUrl !== "string" || !storedUrl.trim()) return "";
  const value = storedUrl.trim();
  if (storedAssetIdFromUrl(value) && Number.isInteger(releaseId) && releaseId > 0) return `/api/releases/${releaseId}/artwork`;
  return value;
}

export function storedAssetIdFromUrl(value: unknown) {
  if (typeof value !== "string") return null;
  let pathname = value.trim();
  try {
    pathname = new URL(value, "https://hymn.local").pathname;
  } catch {
    pathname = value.trim();
  }
  const id = Number(pathname.match(/^\/api\/assets\/(\d+)\/download$/)?.[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}
