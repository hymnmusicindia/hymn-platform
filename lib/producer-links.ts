import type { ProducerProfile } from "@/lib/types";
import type { StorefrontBeat } from "@/lib/beat-store";

export function producerSocialLinks(profile: ProducerProfile) {
  return ([
    ["instagram", "Instagram", profile.instagramUrl],
    ["youtube", "YouTube", profile.youtubeUrl],
    ["spotify", "Spotify", profile.spotifyUrl],
    ["website", "Website", profile.websiteUrl]
  ] as const).flatMap(([id, label, value]) => {
    if (!value) return [];
    try {
      const url = new URL(value);
      return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password
        ? [{ id, label, url: url.href }] : [];
    } catch { return []; }
  });
}

/** Verified paid licence sales first; recent releases break ties. No invented play counts. */
export function featuredProducerBeats(beats: StorefrontBeat[], sales: Map<number, number>, limit = 6) {
  return [...beats].sort((a, b) => (sales.get(b.id) || 0) - (sales.get(a.id) || 0)
    || (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0) || b.id - a.id).slice(0, limit);
}

export type BioBeat = { id: number; title: string; bpm: number; genre: string; artwork: string; audio: string; mood?: string; keySignature?: string; price: number; generalPrice?: number; stemPrice?: number; exclusivePrice?: number };
export type BioViewer = { name: string; email: string; avatarUrl?: string | null };
