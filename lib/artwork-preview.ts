/** UI-only derivatives. Never use these URLs for delivery or original downloads. */
export const artworkWidths = [96, 192, 320, 640, 960] as const;

export function artworkPreviewUrl(src: string, width: number) {
  const size = artworkWidths.find(size => size >= width) ?? 960;
  // Apple's artwork CDN supports native size variants; no proxy or extra hop.
  if (/^https:\/\/is\d+-ssl\.mzstatic\.com\/image\/thumb\//.test(src)) {
    return src.replace(/\/\d+x\d+bb\.(jpg|png)(\?.*)?$/, `/${size}x${size}bb.$1$2`);
  }
  // Only endpoints that already enforce their own public/private access policy.
  const localPath = src.replace(/^https:\/\/(?:www\.)?hymnmusic\.fun(?=\/)/, "");
  if (!/^\/api\/(?:releases\/\d+\/artwork|assets\/\d+\/download|public-uploads\/[^?]+)(?:\?|$)/.test(localPath)) return src;
  const url = new URL(src, "https://hymn.local");
  if (url.searchParams.get("download") === "1") return src;
  url.searchParams.set("w", String(size));
  return src.startsWith("https://") ? url.toString() : `${url.pathname}${url.search}`;
}

export function requestedArtworkWidth(request: Request) {
  const width = Number(new URL(request.url).searchParams.get("w"));
  return artworkWidths.includes(width as typeof artworkWidths[number]) ? width : null;
}
