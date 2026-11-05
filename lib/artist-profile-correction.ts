export type ArtistInstagramCorrection = {
  artistName: string;
  reason: string;
  problem: string;
  action: string;
  field: string;
  label: string;
};

export function normalizeArtistCardName(value: string) {
  return value.normalize("NFC").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

export function artistInstagramCorrection(message: string, releaseTitle: string): ArtistInstagramCorrection | null {
  const match = message.match(/artist\s+["']([^"']{1,150})["']\s+was not found in the database[\s\S]*?instagram_url\s+is required to create a new artist profile/i);
  if (!match) return null;
  const artistName = match[1].trim();
  return {
    artistName,
    reason: `HYMN could not match the credited artist "${artistName}" to an existing artist profile. Add this artist's Instagram profile link or @handle to their saved artist profile, keep the credited name unchanged, and resubmit "${releaseTitle}" to HYMN for review.`,
    problem: `HYMN could not match "${artistName}" to an artist profile because the profile is missing a required Instagram link.`,
    action: `Add the Instagram profile link or @handle for "${artistName}" to that artist's saved profile. Keep the credited name unchanged. Save the profile, then resubmit "${releaseTitle}" to HYMN for review.`,
    field: "artistProfile.instagram_url",
    label: `Instagram profile for ${artistName}`
  };
}

export function artistInstagramCorrectionCopy(issue: { field: string; label: string; note?: string | null }, releaseReason: string | null | undefined, releaseTitle: string) {
  if (issue.field !== "artistProfile.instagram_url") return null;
  const match = issue.label.match(/^Instagram profile for (.+)$/i);
  const artistName = match?.[1] || "the credited artist";
  const correction = artistInstagramCorrection(
    `Artist "${artistName}" was not found in the database. instagram_url is required to create a new artist profile.`,
    releaseTitle
  );
  if (correction) return correction;
  const name = `"${artistName}"`;
  return {
    artistName,
    reason: releaseReason || `An Instagram profile is required to match ${name} for distribution.`,
    problem: issue.note || `HYMN could not match ${name} to an artist profile.`,
    action: `Add the Instagram profile link or @handle for ${name} to that artist's saved profile. Keep the credited name unchanged, then save and resubmit "${releaseTitle}" to HYMN for review.`,
    field: issue.field,
    label: issue.label
  };
}
