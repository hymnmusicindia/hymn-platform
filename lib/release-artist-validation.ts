import { instagramProfilePattern } from "@/lib/validation";
import type { ArtistProfile } from "@/lib/types";

export const artistCreditNames = (value: string) => value.split(",").map(name => name.trim()).filter(Boolean);
export const restoreArtistProfileIds = (value: unknown) => Array.isArray(value) ? value.map(Number).filter(id => Number.isInteger(id) && id > 0) : [];
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export function hasArtistInstagram(profile: Pick<ArtistProfile, "instagramUrl">) { return instagramProfilePattern.test(profile.instagramUrl?.trim() || ""); }
export function artistSelectionIssue(names: string, ids: number[], profiles: ArtistProfile[], role: string, required = false): string | null {
  const selected = ids.map(id => profiles.find(profile => profile.id === id && !profile.archivedAt));
  if (selected.some(profile => !profile)) return `Select an available saved ${role} artist profile.`;
  if (required && !ids.length) return `Select at least one saved ${role} artist profile.`;
  for (const name of artistCreditNames(names)) if (!selected.some(profile => profile && sameName(profile.name, name))) return `Select or create a saved ${role} artist profile for ${name}, including their Instagram profile.`;
  const incomplete = selected.find(profile => profile && !hasArtistInstagram(profile));
  return incomplete ? `Add a valid Instagram profile to ${incomplete.name}'s saved artist profile before continuing.` : null;
}
// Keep unresolved legacy credits visible until the user links or removes them.
export function selectedArtistCreditNames(previousNames: string, previousProfiles: ArtistProfile[], selected: ArtistProfile[]) {
  const unresolved = artistCreditNames(previousNames).filter(name => ![...previousProfiles, ...selected].some(profile => sameName(profile.name, name)));
  return [...selected.map(profile => profile.name), ...unresolved].join(", ");
}
