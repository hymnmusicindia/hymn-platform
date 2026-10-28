import type { DireNotePayload } from "./direnote";

export type FeaturedArtistMatch = "known" | "profile-required";
const normalized = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** Search results are account-scoped. Never attach a HYMN card by name alone. */
export async function matchFeaturedArtistName(name: string, page: (page: number) => Promise<unknown>): Promise<FeaturedArtistMatch> {
  const matches = new Set<number>();
  for (let index = 1; index <= 3; index++) {
    const result = await page(index) as { success?: boolean; artists?: Array<{ artist_id?: number; name?: string }>; pagination?: { has_more?: boolean } };
    if (result?.success !== true || !Array.isArray(result.artists) || typeof result.pagination?.has_more !== "boolean") throw Error("Artist lookup was not confirmed.");
    for (const artist of result.artists) {
      if (typeof artist?.name !== "string" || normalized(artist.name) !== normalized(name)) continue;
      if (!Number.isInteger(artist.artist_id) || Number(artist.artist_id) <= 0) throw Error("Artist lookup returned an invalid identity.");
      matches.add(Number(artist.artist_id));
    }
    if (matches.size > 1) return "profile-required";
    if (!result.pagination.has_more) return matches.size === 1 ? "known" : "profile-required";
  }
  return "profile-required";
}

export async function featuredArtistProvisionIssues(payload: Pick<DireNotePayload,"tracks" | "featuring_artists">, lookup: (name: string) => Promise<FeaturedArtistMatch>) {
  const candidates = new Map<string,{name:string;field:string}>();
  for (const [trackIndex,track] of payload.tracks.entries()) for (const [index,artist] of (track.featuring_artists ?? []).entries()) {
    if (!artist.instagram_url?.trim() && artist.name?.trim()) candidates.set(normalized(artist.name),{name:artist.name,field:`tracks.${trackIndex}.featuring_artists.${index}.instagram_url`});
  }
  for (const [index,artist] of (payload.featuring_artists ?? []).entries()) {
    if (!artist.instagram_url?.trim() && artist.name?.trim() && !candidates.has(normalized(artist.name))) candidates.set(normalized(artist.name),{name:artist.name,field:`featuring_artists.${index}.instagram_url`});
  }
  const issues: Array<{field:string;message:string}> = [];
  for (const {name,field} of candidates.values()) {
    try {
      if (await lookup(name) === "profile-required") issues.push({field,message:`Add an artist profile with Instagram for ${name}. HYMN could not identify a unique existing featured artist by name.`});
    } catch {
      issues.push({field,message:`HYMN could not verify the featured artist ${name}. Try again, or add their artist profile with Instagram.`});
    }
  }
  return issues;
}
