import { mapContributorRoleToDireNote, normalizeContributorRole } from "@/lib/contributor-roles";

export type ContributorProviderInput = {
  role?: unknown;
  creditedName?: unknown;
  name?: unknown;
  artistName?: unknown;
  legalName?: unknown;
  ipi?: unknown;
  iprsMember?: unknown;
  instagramUrl?: unknown;
  instagram_url?: unknown;
  xUrl?: unknown;
  x_url?: unknown;
};

/** Maps canonical/snapshotted HYMN credit data to the exact DireNote fields
 * supported by the current provider contract. Internal IDs and private contact
 * fields are deliberately excluded. */
export function mapContributorToDireNote(input: ContributorProviderInput) {
  const canonicalRole = normalizeContributorRole(input.role);
  if (!canonicalRole) return null;
  const role = mapContributorRoleToDireNote(canonicalRole);
  if (!role) return null;
  const name = String(input.creditedName ?? input.name ?? (role === "producer" ? input.artistName : input.legalName) ?? "").trim();
  if (!name) return null;
  return {
    role,
    contributor: {
      name,
      ipi: input.ipi ? String(input.ipi).trim() || undefined : undefined,
      iprs_member: input.iprsMember === true || input.iprsMember === "Yes" ? "Yes" as const : "No" as const,
      instagram_url: String(input.instagramUrl ?? input.instagram_url ?? "").trim() || undefined,
      x_url: String(input.xUrl ?? input.x_url ?? "").trim() || undefined
    }
  };
}
