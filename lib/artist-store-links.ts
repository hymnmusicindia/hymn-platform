type StoreLink = { url: string; id?: string };
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** Only canonical associations qualify; never discover a saved card by a global name search. */
export function attachedArtistProfileIds(metadata: unknown, releaseArtistProfileId: number | null) {
  const root = record(metadata);
  const nested = record(root.metadata);
  const values = Array.isArray(nested.artistProfileIds) ? nested.artistProfileIds : root.artistProfileIds;
  const ids = Array.isArray(values) ? values.filter((id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0) : [];
  return [...new Set(ids.length ? ids : releaseArtistProfileId ? [releaseArtistProfileId] : [])];
}

/** The documented tracks[].artist.links keys. Reject track/album links and unrelated hosts. */
export function verifiedArtistStoreLinks(value: unknown): Partial<Record<"spotify" | "apple" | "youtube", StoreLink>> {
  const input = record(value);
  const output: Partial<Record<"spotify" | "apple" | "youtube", StoreLink>> = {};
  for (const provider of ["spotify", "apple", "youtube"] as const) {
    if (typeof input[provider] !== "string") continue;
    try {
      const url = new URL(input[provider]);
      if (url.protocol !== "https:" || url.username || url.password || url.port) continue;
      if (provider === "spotify" && url.hostname === "open.spotify.com") {
        const match = url.pathname.match(/^\/artist\/([A-Za-z0-9]{22})\/?$/);
        if (match) output.spotify = { url: `https://open.spotify.com/artist/${match[1]}`, id: match[1] };
      }
      if (provider === "apple" && url.hostname === "music.apple.com") {
        const match = url.pathname.match(/^\/(?:[a-z]{2}\/)?artist\/(?:[^/]+\/)?(\d+)\/?$/i);
        if (match) output.apple = { url: `https://music.apple.com${url.pathname}`, id: match[1] };
      }
      if (provider === "youtube" && ["youtube.com", "www.youtube.com"].includes(url.hostname) && /^\/(?:@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)\/?$/.test(url.pathname)) output.youtube = { url: `https://www.youtube.com${url.pathname}` };
    } catch { /* Missing or malformed provider links leave the saved profile untouched. */ }
  }
  return output;
}
