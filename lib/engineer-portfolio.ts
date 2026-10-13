import { ENGINEER_SPECIALTIES, type EngineerWork } from "@/lib/engineer-applications";

export function portfolioWorks(value: unknown): EngineerWork[] {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const raw = Array.isArray(value) ? value : Array.isArray(record.works) ? record.works : [];
  return raw.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const entry = item as Record<string, unknown>;
    const url = typeof entry.url === "string" ? entry.url : typeof entry.afterUrl === "string" ? entry.afterUrl : "";
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ title: typeof entry.title === "string" ? entry.title : "Featured work", url,
      role: ENGINEER_SPECIALTIES.includes(entry.role as typeof ENGINEER_SPECIALTIES[number]) ? entry.role as EngineerWork["role"] : "",
      artist: typeof entry.artist === "string" ? entry.artist : "", year: typeof entry.year === "string" ? entry.year : "", note: typeof entry.note === "string" ? entry.note : "" }];
  }).slice(0, 8);
}

export function workPlayer(value: string): { platform: string; embed?: string; audio?: string } {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return { platform: "Listen" };
    const host = url.hostname.replace(/^www\./, "");
    if (host === "open.spotify.com") {
      const match = url.pathname.match(/^\/(?:intl-[a-z]+\/)?(track|album|playlist|artist)\/([a-zA-Z0-9]+)\/?$/);
      return { platform: "Spotify", ...(match ? { embed: `https://open.spotify.com/embed/${match[1]}/${match[2]}?theme=0` } : {}) };
    }
    if (["youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? url.pathname.slice(1) : url.searchParams.get("v") || url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/)?.[1];
      return { platform: "YouTube", ...(id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? { embed: `https://www.youtube-nocookie.com/embed/${id}` } : {}) };
    }
    if (/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(url.pathname)) return { platform: "Audio sample", audio: url.href };
    return { platform: host === "soundcloud.com" ? "SoundCloud" : host === "music.apple.com" ? "Apple Music" : host };
  } catch { return { platform: "Listen" }; }
}
