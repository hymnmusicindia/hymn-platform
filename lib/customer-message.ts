// Presentation only: keep API errors, stored review notes and field identifiers intact.
const labels: Record<string, string> = {
  instagram_url: "Instagram profile", instagramUrl: "Instagram profile", "Instagram URL": "Instagram profile",
  spotify_url: "Spotify artist profile", spotifyUrl: "Spotify artist profile",
  apple_url: "Apple Music artist profile", appleUrl: "Apple Music artist profile",
  youtube_url: "YouTube channel", youtubeUrl: "YouTube channel",
  cover_art_url: "cover artwork", artworkUrl: "cover artwork", uploadedArtworkUrl: "cover artwork",
  audio_url: "audio file", audioUrl: "audio file", uploadedAudioUrl: "audio file",
  trackLanguage: "track language", albumLanguage: "release language",
  trackName: "track title", trackTitle: "track title", albumName: "release title", releaseTitle: "release title",
  trackGenre: "track genre", albumGenre: "release genre", primaryGenre: "main genre",
  trackSubgenre: "track subgenre", albumSubgenre: "release subgenre", secondaryGenre: "subgenre",
  albumMood: "mood", contenttype: "music ownership", contentType: "music ownership",
  trackReleaseDate: "release date", releaseDate: "release date", originalReleaseDate: "original release date",
  cLine: "songwriting copyright", pLine: "recording copyright", copyrightOwner: "copyright owner",
  publishingRights: "recording rights", license_receipt_url: "licence receipt", suno_receipt_url: "Suno receipt",
  sunoLink: "Suno song link", previewStart: "preview start time", explicitLyrics: "explicit content setting",
  explicitContent: "explicit content setting", trackLyrics: "lyrics", artistProfileIds: "saved artist profiles",
  primaryArtist: "primary artist", featuring_artists: "featured artists", featuredArtists: "featured artists",
  recordLabelName: "record label", labelName: "record label", paymentModel: "payment option",
  producerLegalName: "producer’s legal name", legalName: "legal name", isrc: "ISRC", upc: "UPC"
};

export function customerFieldLabel(path: string): string {
  const parts = path.replace(/\\_/g, "_").replace(/\[(\d+)\]/g, ".$1").split(".");
  const context: string[] = [];
  const groups: Record<string, string> = { tracks: "Track", artists: "Artist", featuring_artists: "Featured artist", contributors: "Contributor", songwriters: "Songwriter", composers: "Composer", producers: "Producer" };
  for (let index = 0; index < parts.length - 1; index++) {
    if (groups[parts[index]] && /^\d+$/.test(parts[index + 1])) context.push(`${groups[parts[index]]} ${Number(parts[++index]) + 1}`);
  }
  const leaf = parts.at(-1) || "release details";
  const label = /^\d+$/.test(leaf) ? "details" : labels[leaf] || leaf.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
  return [...context, label].join(" — ");
}

export function customerMessage(value: string | null | undefined): string {
  if (!value) return "";
  let text = value.replace(/\\_/g, "_");
  // Zod errors sometimes arrive as JSON text. Show the fields to correct, not schema internals.
  if (/^\s*[\[{]/.test(text)) {
    try {
      const parsed = JSON.parse(text);
      const issues = Array.isArray(parsed) ? parsed : parsed.issues;
      if (Array.isArray(issues) && issues.length && issues.every(issue => Array.isArray(issue.path))) {
        return [...new Set(issues.map(issue => `Please check ${customerFieldLabel(issue.path.join(".")) || "your details"} and enter a valid value.`))].join(" ");
      }
    } catch { /* Ordinary text continues through the display formatter. */ }
  }
  if (/PrismaClient|prisma\.[\w.]+\(|SQLSTATE|unique constraint failed|transaction failed due to|ECONNREFUSED|ENOTFOUND/i.test(text)) return "We couldn’t complete this request. Please try again. If the problem continues, contact HYMN support.";
  const links: string[] = [];
  text = text.replace(/https?:\/\/[^\s]+/g, link => { links.push(link); return `CUSTOMERLINK${links.length - 1}PLACEHOLDER`; });
  text = text.replace(/The submitted plan does not match the persisted order\.?/gi, "The selected plan doesn’t match this checkout. Refresh the page to load your saved payment details, then try again.");
  const path = "(?:[A-Za-z_][A-Za-z0-9_]*)(?:(?:\\.\\w+)|(?:\\[\\d+\\]))*";
  text = text.replace(new RegExp(`Review (${path}) for this release and validate again\\.`, "g"), (_, field: string) => {
    const label = customerFieldLabel(field);
    const track = field.match(/tracks\.(\d+)/);
    const artist = field.match(/artists\.(\d+)/);
    return /instagram/i.test(field)
      ? `Add an Instagram handle or profile link for ${artist ? `Artist ${Number(artist[1]) + 1}` : "the artist"}${track ? ` on Track ${Number(track[1]) + 1}` : " on this release"}. Save the artist profile, then check the release again.`
      : `Check ${label}, save your changes, then check the release again.`;
  });
  // Match schema paths only, so public links, filenames and ordinary sentences remain readable.
  text = text.replace(/\b(?:tracks|artists|featuring_artists|metadata|contributors|legal)(?:\.\w+|\[\d+\])+/g, field => customerFieldLabel(field));
  text = text.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, word => labels[word] || word);
  return text.replace(/Instagram URL/g, "Instagram profile").replace(/artist provisioning/gi, "artist profile creation").replace(/persisted order/gi, "saved checkout").replace(/CUSTOMERLINK(\d+)PLACEHOLDER/g, (_, index: string) => links[Number(index)]);
}
