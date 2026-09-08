import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { redactDireNoteDiagnostic } from "../lib/direnote";

const releaseSources: Record<string, string> = {
  pin: "server environment", client_id: "server environment", albumname: "Release.title / metadata.releaseTitle",
  albumVersion: "Release.metadata.albumVersion", typeOfRelease: "Release.releaseType", albumGenre: "Release.genre",
  albumSubgenre: "Release.metadata.secondaryGenre", albumLanguage: "Release.metadata.language", albumMood: "Release.metadata.mood",
  contenttype: "Release.metadata.contentType", trackReleaseDate: "Release.releaseDate", originalReleaseDate: "Release.metadata.originalReleaseDate",
  presaveSpotify: "Release.metadata.presaveSpotify", presaveApple: "Release.metadata.presaveApple", exclusiveSpotify: "Release.metadata.exclusiveSpotify", exclusiveApple: "Release.metadata.exclusiveApple",
  labelName: "Release.metadata.labelName", cLine: "Release.metadata.copyrightOwner", pLine: "Release.metadata.publishingRights",
  upc: "Release.upc / transfer metadata", youtubeContentID: "Release.metadata.youtubeContentIdEnabled", releasePreviouslyReleased: "Release.metadata.releasePreviouslyReleased",
  addrequest: "Release.metadata.addrequest", owner_email: "User.email", cover_art_url: "Release.artworkUrl / StoredAsset",
  artists: "Release.artistName / ArtistCard", featuring_artists: "Track.metadata.featuredArtists / ArtistCard",
  suno_receipt_url: "Release.metadata.sunoReceiptUrl", sunoLink: "Release.metadata.sunoLink", license_receipt_url: "Release.metadata.licenseReceiptUrl"
};
const trackSources: Record<string, string> = {
  trackName: "Track.title", audio_url: "Track.audioUrl / StoredAsset", trackGenre: "Release.genre (inherited)",
  trackSubgenre: "Release.metadata.secondaryGenre (inherited)", trackLanguage: "Track.metadata.version + language -> readTrackLanguage",
  isrc: "Track.isrc", trackVersion: "Track.metadata.version", previewStart: "Track.metadata.previewStart", vocalist: "Track.metadata.vocalist",
  explicitLyrics: "Track.metadata.explicitContent", trackLyrics: "Track.metadata.lyrics", previouslyReleased: "Track.metadata.previouslyReleased",
  producers: "Track.metadata.producers", artists: "Track.primaryArtist / ArtistCard", featuring_artists: "Track.metadata.featuredArtists / ArtistCard",
  contributors: "Track.metadata.contributors", songwriters: "Track.metadata.songwriters + contributors", composers: "Track.metadata.composers + contributors"
};

export async function writeFieldConnectivityReport(cases: Array<{ name: string; expected: unknown; received: unknown }>) {
  const rows: Array<{ case: string; hymnDbField: string; mapper: string; providerField: string; received: unknown; result: string }> = [];
  for (const test of cases) {
    assert.deepEqual(test.received, JSON.parse(JSON.stringify(test.expected)), `${test.name}: full HTTP body mismatch`);
    const walk = (value: unknown, path: string) => {
      if (value && typeof value === "object" && Object.keys(value).length) {
        for (const [key, item] of Object.entries(value)) walk(item, path ? `${path}.${key}` : key);
        return;
      }
      const parts = path.split(".");
      const source = parts[0] === "tracks" ? trackSources[parts[2]] : releaseSources[parts[0]];
      assert(source, `Missing field inventory for ${path}`);
      rows.push({ case: test.name, hymnDbField: source, mapper: "buildDireNotePayload -> canonical DireNote client", providerField: path, received: value, result: "PASS" });
    };
    walk(redactDireNoteDiagnostic(test.received), "");
  }
  const fieldCount = new Set(rows.map(row => row.providerField.replace(/\.\d+(?=\.|$)/g, "[]"))).size;
  await mkdir(".cache", { recursive: true });
  await writeFile(".cache/direnote-http-field-connectivity.json", JSON.stringify({ fieldCount, assertions: rows.length, failed: 0, rows }, null, 2));
  console.log(`HTTP connectivity matrix: ${fieldCount} unique field paths, ${rows.length} value assertions, 0 failed.`);
}
