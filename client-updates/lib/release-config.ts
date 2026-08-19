import type { ContributorCredit } from "@/lib/types";

export type ContributorRole = ContributorCredit["role"];

export const versionOptions = ["Original", "Explicit", "Clean (Censored)", "Remix", "Acoustic", "Instrumental", "Live", "Other"] as const;

export const storePlatforms = [
  { name: "Spotify", icon: "SP" },
  { name: "Apple Music", icon: "AM" },
  { name: "Amazon Music", icon: "AZ" },
  { name: "JioSaavn", icon: "JS" },
  { name: "Gaana", icon: "GA" },
  { name: "150+ More Stores", icon: "150+" }
] as const;

export const socialPlatforms = [
  { name: "Instagram / Facebook", icon: "IG" },
  { name: "TikTok", icon: "TT" },
  { name: "YouTube Music", icon: "YT" }
] as const;

export const contributorRoles: Array<{ key: ContributorRole; label: string }> = [
  { key: "songwriter", label: "Songwriters" },
  { key: "composer", label: "Composers" },
  { key: "producer", label: "Producers" }
];

export const countryOptions = [
  "Afghanistan",
  "Albania",
  "Algeria",
  "Argentina",
  "Armenia",
  "Austria",
  "Azerbaijan",
  "Bahrain",
  "Bangladesh",
  "Belgium",
  "Brazil",
  "Canada",
  "Chile",
  "China",
  "Colombia",
  "Denmark",
  "Egypt",
  "Finland",
  "France",
  "Germany",
  "India",
  "Indonesia",
  "Ireland",
  "Italy",
  "Japan",
  "Kenya",
  "Malaysia",
  "Mexico",
  "Netherlands",
  "New Zealand",
  "Nigeria",
  "Pakistan",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Russia",
  "Saudi Arabia",
  "Singapore",
  "South Africa",
  "South Korea",
  "Spain",
  "Sri Lanka",
  "Sweden",
  "Switzerland",
  "Thailand",
  "Turkey",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Vietnam"
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
