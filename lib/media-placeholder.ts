export function missingImageResponseHeaders(cacheControl = "no-store") {
  return {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": cacheControl,
    "X-Content-Type-Options": "nosniff",
    "X-HYMN-Media-Fallback": "missing-source"
  };
}

export function missingImageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" role="img" aria-label="Image unavailable"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#242830"/><stop offset="1" stop-color="#101216"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="300" cy="265" r="86" fill="none" stroke="#707784" stroke-width="16"/><circle cx="300" cy="265" r="18" fill="#707784"/><path d="M164 440c48-64 224-64 272 0" fill="none" stroke="#707784" stroke-width="16" stroke-linecap="round"/><text x="300" y="520" fill="#a6abb4" font-family="system-ui,sans-serif" font-size="24" text-anchor="middle">Media unavailable</text></svg>`;
}
