export const platformRates = {
  Spotify: 0.2,
  "Apple Music": 0.5,
  "Amazon Music": 0.35,
  "YouTube Music": 0.12,
  JioSaavn: 0.18,
  Gaana: 0.16,
  Other: 0.18
} as const;

export type RoyaltyPlatform = keyof typeof platformRates;

export function estimateRoyalty(streams: number, platform: RoyaltyPlatform) {
  const safeStreams = Number.isFinite(streams) ? Math.max(0, streams) : 0;
  return Math.round(safeStreams * platformRates[platform]);
}
