export const CLIENT_INTERESTS = {
  PROMOTION: "Music promotion & marketing", BEAT_SALES: "Selling beats", BEAT_PURCHASE: "Buying beats", DISTRIBUTION: "Music distribution",
  PLAYLIST_CURATION: "Playlist curation", MIX_MASTER: "Mixing & mastering", BECOME_ENGINEER: "Becoming a HYMN engineer",
} as const;
export type ClientInterest = keyof typeof CLIENT_INTERESTS;
