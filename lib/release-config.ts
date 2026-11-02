import type { ContributorCredit } from "@/lib/types";

import type { DistributionChannel } from "@/lib/distribution-capabilities";

export type ContributorRole = ContributorCredit["role"];

export const versionOptions = ["Original", "Explicit", "Clean (Censored)", "Remix", "Acoustic", "Instrumental", "Live", "Other"] as const;

export const storePlatforms = [
  { name: "Spotify", icon: "SP" },
  { name: "Apple Music", icon: "AM" },
  { name: "YouTube Music", icon: "YT" },
  { name: "Amazon Music", icon: "AZ" },
  { name: "JioSaavn", icon: "JS" },
  { name: "Gaana", icon: "GA" },
  { name: "iTunes", icon: "IT" },
  { name: "Shazam", icon: "SH" },
  { name: "Deezer", icon: "DE" },
  { name: "Tidal", icon: "TI" },
  { name: "Pandora", icon: "PA" },
  { name: "SoundCloud", icon: "SC" },
  { name: "Audiomack", icon: "AU" },
  { name: "Anghami", icon: "AN" },
  { name: "Boomplay", icon: "BO" },
  { name: "Napster", icon: "NA" },
  { name: "iHeartRadio", icon: "IH" },
  { name: "Wynk Music", icon: "WY" },
  { name: "Hungama", icon: "HU" },
  { name: "Qobuz", icon: "QO" },
  { name: "Beatport", icon: "BE" },
  { name: "Traxsource", icon: "TR" },
  { name: "7digital", icon: "7D" },
  { name: "Tencent Music (QQ Music, Kugou, Kuwo)", icon: "TM" },
  { name: "NetEase Cloud Music", icon: "NE" },
  { name: "Yandex Music", icon: "YA" },
  { name: "VK Music", icon: "VK" },
  { name: "KKBOX", icon: "KK" },
  { name: "JOOX", icon: "JO" },
  { name: "LINE MUSIC", icon: "LI" },
  { name: "Melon", icon: "ME" },
  { name: "Genie Music", icon: "GE" },
  { name: "FLO", icon: "FL" },
  { name: "Bugs", icon: "BU" }
] as const;

export const socialPlatforms = [
  { name: "Instagram / Facebook", icon: "IG" },
  { name: "TikTok", icon: "TT" },
  { name: "Snapchat", icon: "SN" }
] as const;

const configuredChannels: ReadonlyArray<DistributionChannel> = [...storePlatforms.map(item => item.name), ...socialPlatforms.map(item => item.name)];
void configuredChannels;

export const contributorRoles: Array<{ key: ContributorRole; label: string }> = [
  { key: "songwriter", label: "Songwriters" },
  { key: "composer", label: "Composers" },
  { key: "producer", label: "Producers" }
];

export const countryOptions = [
  "India",
  "United States",
  "United Kingdom",
  "Canada",
  "Australia",
  "Germany",
  "France",
  "Netherlands",
  "Brazil",
  "Mexico",
  "Japan",
  "South Korea",
  "Singapore",
  "United Arab Emirates",
  "Saudi Arabia",
  "South Africa",
  "Nigeria",
  "Sri Lanka",
  "Pakistan",
  "Bangladesh"
] as const;

export const legalGroups = [
  {
    title: "Rights and ownership",
    items: [
      ["ownershipConfirmation", "I own or control the rights to this recording."],
      ["noInfringement", "No unauthorized samples, stems, or copyrighted material are used."],
      ["collaboratorsCredited", "All collaborators and splits are credited accurately."]
    ]
  },
  {
    title: "Policy and platform checks",
    items: [
      ["platformGuidelines", "This release follows store, social, and artwork guidelines."],
      ["hymnNotLiable", "HYMN is not liable for ownership disputes or false submissions."],
      ["termsAccepted", "I agree to HYMN's Terms of Service."],
      ["falseMetadataAcknowledged", "I understand false metadata may lead to rejection or takedown."],
      ["fraudWarningAccepted", "I understand that bots, fake playlists, and fraudulent promotion are prohibited."]
    ]
  }
] as const;

export const promotionCards = [
  {
    title: "Social Media Marketing",
    body: "Campaign rollout support while your release is still in review.",
    href: "/contact"
  },
  {
    title: "Playlisting",
    body: "Pitching support and curation prep for your release window.",
    href: "/contact"
  },
  {
    title: "Distribution Boost",
    body: "Priority ops support for stronger launch momentum.",
    href: "/contact"
  }
] as const;
