const LOCAL_HOSTNAMES = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"]);

function usableOrigin(value: string | null | undefined, production: boolean) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase();
    if (production && (LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith(".local"))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/** Returns the externally reachable application origin, never Hostinger's internal origin in production. */
export function getPublicAppUrl(requestUrl?: string | null) {
  const production = process.env.NODE_ENV === "production";
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    requestUrl,
  ];
  for (const candidate of candidates) {
    const origin = usableOrigin(candidate, production);
    if (origin) return origin;
  }
  return production ? "https://hymnmusic.fun" : "http://localhost:3000";
}
