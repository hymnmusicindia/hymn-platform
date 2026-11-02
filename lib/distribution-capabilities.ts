export const DISTRIBUTION_CHANNELS = {
  "Spotify": { kind: "store", contentId: false }, "Apple Music": { kind: "store", contentId: false },
  "Amazon Music": { kind: "store", contentId: false }, "JioSaavn": { kind: "store", contentId: false },
  "Gaana": { kind: "store", contentId: false }, "150+ More Stores": { kind: "store", contentId: false },
  "Instagram / Facebook": { kind: "ugc", contentId: false }, "TikTok": { kind: "ugc", contentId: false },
  "YouTube Music": { kind: "store", contentId: false },
  "iTunes": { kind: "store", contentId: false }, "Shazam": { kind: "store", contentId: false },
  "Deezer": { kind: "store", contentId: false }, "Tidal": { kind: "store", contentId: false },
  "Pandora": { kind: "store", contentId: false }, "SoundCloud": { kind: "store", contentId: false },
  "Audiomack": { kind: "store", contentId: false }, "Anghami": { kind: "store", contentId: false },
  "Boomplay": { kind: "store", contentId: false }, "Napster": { kind: "store", contentId: false },
  "iHeartRadio": { kind: "store", contentId: false }, "Wynk Music": { kind: "store", contentId: false },
  "Hungama": { kind: "store", contentId: false }, "Qobuz": { kind: "store", contentId: false },
  "Beatport": { kind: "store", contentId: false }, "Traxsource": { kind: "store", contentId: false },
  "7digital": { kind: "store", contentId: false }, "Tencent Music (QQ Music, Kugou, Kuwo)": { kind: "store", contentId: false },
  "NetEase Cloud Music": { kind: "store", contentId: false }, "Yandex Music": { kind: "store", contentId: false },
  "VK Music": { kind: "store", contentId: false }, "KKBOX": { kind: "store", contentId: false },
  "JOOX": { kind: "store", contentId: false }, "LINE MUSIC": { kind: "store", contentId: false },
  "Melon": { kind: "store", contentId: false }, "Genie Music": { kind: "store", contentId: false },
  "FLO": { kind: "store", contentId: false }, "Bugs": { kind: "store", contentId: false },
  "Snapchat": { kind: "ugc", contentId: false }
} as const;
export type DistributionChannel = keyof typeof DISTRIBUTION_CHANNELS;
export function isDistributionChannel(value: string): value is DistributionChannel { return value in DISTRIBUTION_CHANNELS; }
