export const DISTRIBUTION_CHANNELS = {
  "Spotify": { kind: "store", contentId: false }, "Apple Music": { kind: "store", contentId: false },
  "Amazon Music": { kind: "store", contentId: false }, "JioSaavn": { kind: "store", contentId: false },
  "Gaana": { kind: "store", contentId: false }, "150+ More Stores": { kind: "store", contentId: false },
  "Instagram / Facebook": { kind: "ugc", contentId: false }, "TikTok": { kind: "ugc", contentId: false },
  "YouTube Music": { kind: "store", contentId: true }
} as const;
export type DistributionChannel = keyof typeof DISTRIBUTION_CHANNELS;
export function isDistributionChannel(value: string): value is DistributionChannel { return value in DISTRIBUTION_CHANNELS; }
