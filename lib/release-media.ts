export function canonicalReleaseArtworkUrl(releaseId: number, storedUrl: unknown) {
  if (typeof storedUrl !== "string" || !storedUrl.trim()) return "";
  const value = storedUrl.trim();
  // The public release route hides the private StoredAsset URL. Keep a JPEG
  // delivery filename in the query so upstream distributors that validate the
  // URL name (as DireNote does) can identify the already-validated asset type.
  if (storedAssetIdFromUrl(value) && Number.isInteger(releaseId) && releaseId > 0) return `/api/releases/${releaseId}/artwork?filename=cover.jpg`;
  // Repair display URLs stored by older duplication code. The route ignores
  // this query parameter, while filename-based provider validation requires it.
  try {
    const url = new URL(value, "https://hymn.local");
    if (/^\/api\/releases\/\d+\/artwork$/.test(url.pathname)) {
      url.searchParams.set("filename", "cover.jpg");
      return /^https?:\/\//i.test(value) ? url.toString() : `${url.pathname}${url.search}`;
    }
  } catch { /* Preserve malformed legacy values for normal validation. */ }
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
