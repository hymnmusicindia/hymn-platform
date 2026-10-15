import { getPublicAppUrl } from "./public-app-url";

/** Check against the configured public origin, not a reverse proxy's internal URL. */
export function isSameAppOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    return origin === getPublicAppUrl(request.url);
  } catch { return false; }
}
