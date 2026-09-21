export const CONTRIBUTOR_ROLES = [
  "PRODUCER",
  "CO_PRODUCER",
  "ADDITIONAL_PRODUCER",
  "EXECUTIVE_PRODUCER",
  "VOCAL_PRODUCER",
  "REMIXER",
  "COMPOSER",
  "LYRICIST",
  "SONGWRITER",
  "MIX_ENGINEER",
  "MASTERING_ENGINEER",
  "RECORDING_ENGINEER",
  "PERFORMER",
  "ARRANGER"
] as const;

export type ContributorRole = typeof CONTRIBUTOR_ROLES[number];

const legacyRoles: Record<string, ContributorRole> = {
  producer: "PRODUCER",
  songwriter: "SONGWRITER",
  composer: "COMPOSER",
  lyricist: "LYRICIST",
  remixer: "REMIXER"
};

export function normalizeContributorRole(value: unknown): ContributorRole | null {
  const key = String(value ?? "").trim();
  if (!key) return null;
  const canonical = key.toUpperCase().replace(/[\s-]+/g, "_") as ContributorRole;
  if (CONTRIBUTOR_ROLES.includes(canonical)) return canonical;
  return legacyRoles[key.toLowerCase()] ?? null;
}

// DireNote's current HYMN contract accepts these three exact role values.
// Richer HYMN roles remain internal until the provider contract adds them.
export function mapContributorRoleToDireNote(role: ContributorRole) {
  if (["PRODUCER", "CO_PRODUCER", "ADDITIONAL_PRODUCER", "EXECUTIVE_PRODUCER", "VOCAL_PRODUCER"].includes(role)) return "producer" as const;
  if (role === "COMPOSER") return "composer" as const;
  if (role === "SONGWRITER" || role === "LYRICIST") return "songwriter" as const;
  return null;
}

export function contributorRoleLabel(role: ContributorRole) {
  return role.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}
