import { validWaveform, type WaveformData } from "./waveform-data";

const maximumEntries = 24;
const lifetime = 5 * 60_000;
const storageKey = "hymn:selected-waveforms:v1";
const cache = new Map<string, { savedAt: number; data: WaveformData }>();
let restored = false;

export function cachedPlaybackWaveform(url: string): WaveformData | null {
  if (!restored && typeof window !== "undefined") {
    restored = true;
    try {
      const raw = window.localStorage.getItem(storageKey);
      const entries: unknown = raw && raw.length < 100_000 ? JSON.parse(raw) : [];
      if (Array.isArray(entries)) for (const entry of entries.slice(-maximumEntries)) {
        if (Array.isArray(entry) && typeof entry[0] === "string" && entry[0].length < 2048 && entry[1]
          && typeof entry[1].savedAt === "number" && Date.now() - entry[1].savedAt < lifetime && validWaveform(entry[1].data)) cache.set(entry[0], entry[1]);
      }
    } catch { /* Private browsing and storage limits do not affect playback. */ }
  }
  const entry = cache.get(url);
  if (!entry || Date.now() - entry.savedAt >= lifetime) { cache.delete(url); return null; }
  return entry.data;
}

export function savePlaybackWaveform(url: string, data: WaveformData) {
  cache.delete(url);
  cache.set(url, { savedAt: Date.now(), data });
  while (cache.size > maximumEntries) cache.delete(cache.keys().next().value!);
  try { window.localStorage.setItem(storageKey, JSON.stringify([...cache])); } catch { /* Cache is optional. */ }
}
