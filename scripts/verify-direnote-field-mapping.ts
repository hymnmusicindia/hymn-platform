import assert from "node:assert/strict";
import { createServer } from "node:http";
import { buildDireNotePayload, validateDireNotePayload, redactDireNotePayload, redactDireNoteDiagnostic } from "../lib/direnote";
import { submitToDireNote } from "../lib/direnote/direnote-client";
import { DIRENOTE_GENRE_CATALOG, DIRENOTE_LANGUAGES } from "../lib/direnote-config";
import { readTrackLanguage } from "../lib/track-language";
import { diffDireNotePayload } from "../lib/direnote-payload-diff";
import { distributionTrackSchema } from "../lib/validation";
import type { Release } from "../lib/types";

process.env.DIRENOTE_API_PIN = "mapping-fixture-pin";
process.env.DIRENOTE_CLIENT_ID = "mapping-fixture-client";
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const release = {
  id: 1, userId: 1, releaseTitle: "Magenta", artistName: "Fixture Artist", releaseType: "album", releaseDate: "2099-01-10",
  language: "Hindi", primaryGenre: "Pop", secondaryGenre: "Indie Pop", mood: "Happy", labelName: "Fixture Records",
  copyrightOwner: "2026 Composition Owner", publishingRights: "2026 Master Owner", contentType: "original", youtubeContentIdEnabled: false,
  artworkUrl: "https://cdn.example.test/cover.jpg", metadata: { albumVersion: "Deluxe", artistLinks: { "Fixture Artist": { instagram_url: "https://instagram.com/fixture" } } },
  tracks: ["Hindi", "Instrumental", "English"].map((language, index) => ({
    id: index + 1, releaseId: 1, trackTitle: ["purple", "pink", "blue"][index], trackNumber: index + 1, language,
    version: index === 1 ? "Instrumental" : "Original", primaryArtist: "Fixture Artist", audioUrl: `https://cdn.example.test/${index}.wav`,
    explicitContent: index === 2, lyrics: index === 2 ? "Fixture lyrics" : undefined, producers: "Fixture Producer", songwriters: "Fixture Writer", composers: "Fixture Composer",
    previewStart: 0, previouslyReleased: false
  }))
} as unknown as Release;
const payload = buildDireNotePayload(release);
assert(!JSON.stringify(redactDireNoteDiagnostic({ audio_url: "https://example.test/api/distribution-assets/1/private-token/audio.wav?signature=secret-value" })).match(/private-token|secret-value/));
assert.equal(validateDireNotePayload(payload).ok, true, JSON.stringify(validateDireNotePayload(payload)));
assert.deepEqual(payload.tracks.map(track => track.trackLanguage), ["Hindi", "Instrumental", "English"]);
assert.equal(payload.tracks[0].previewStart, "0");
assert.deepEqual(json(payload.tracks[1]), {
  trackName: "pink", audio_url: "https://cdn.example.test/1.wav", trackGenre: "Pop", trackSubgenre: "Indie Pop", trackLanguage: "Instrumental",
  trackVersion: "Instrumental", previewStart: "0", explicitLyrics: "No", previouslyReleased: "No", producers: ["Fixture Producer"],
  artists: [{ name: "Fixture Artist", instagram_url: "https://instagram.com/fixture" }], featuring_artists: [],
  songwriters: [{ name: "Fixture Writer", iprs_member: "No" }], composers: [{ name: "Fixture Composer", iprs_member: "No" }]
});
assert.equal(payload.albumVersion, "Deluxe");
assert.equal(payload.youtubeContentID, "No");
assert.equal(payload.cLine, "2026 Composition Owner");
assert.equal(payload.pLine, "2026 Master Owner");
assert.deepEqual(json({ ...payload, tracks: undefined, pin: undefined, client_id: undefined }), {
  albumname: "Magenta", albumVersion: "Deluxe", typeOfRelease: "Album", albumGenre: "Pop", albumSubgenre: "Indie Pop", albumLanguage: "Hindi", albumMood: "Happy",
  contenttype: "Original/Exclusive Licensed", trackReleaseDate: "2099-01-10", labelName: "Fixture Records", cLine: "2026 Composition Owner", pLine: "2026 Master Owner",
  youtubeContentID: "No", releasePreviouslyReleased: "No", cover_art_url: "https://cdn.example.test/cover.jpg",
  artists: [{ name: "Fixture Artist", instagram_url: "https://instagram.com/fixture" }], featuring_artists: []
});
for (const field of ["albumname", "typeOfRelease", "albumGenre", "albumSubgenre", "albumLanguage", "albumMood", "contenttype", "trackReleaseDate", "labelName", "cLine", "pLine", "cover_art_url", "artists", "tracks"]) {
  for (const value of [undefined, null, "", "   "]) {
    assert.equal(validateDireNotePayload({ ...payload, [field]: value } as any).ok, false, `${field}: ${JSON.stringify(value)}`);
  }
}
for (const field of ["trackName", "audio_url", "trackLanguage", "artists", "songwriters", "composers", "explicitLyrics", "previouslyReleased"]) {
  for (const value of [undefined, null, "", "   "]) {
    const invalid = { ...payload, tracks: [{ ...payload.tracks[0], [field]: value }, ...payload.tracks.slice(1)] };
    assert.equal(validateDireNotePayload(invalid as any).ok, false, `${field}: ${JSON.stringify(value)}`);
  }
}
assert.equal(buildDireNotePayload({ ...release, contentType: "Original/Exclusive Licensed" as any }).contenttype, "Original/Exclusive Licensed");
assert.equal(validateDireNotePayload(buildDireNotePayload({ ...release, contentType: "unknown-rights" as any })).ok, false);
assert.equal(buildDireNotePayload({ ...release, contentType: "original_exclusive_licensed" }).contenttype, "Original/Exclusive Licensed");
const proofRelease = { ...release, contentType: "ai_generated", sunoReceiptUrl: "https://cdn.example.test/current.pdf", sunoLink: "https://suno.com/song/fixture", metadata: { ...release.metadata, contenttype: "Non-Exclusive Licensed", sunoReceiptUrl: "https://cdn.example.test/stale.pdf" } };
assert.equal(buildDireNotePayload(proofRelease).contenttype, "AI Generated");
assert.equal(buildDireNotePayload(proofRelease).suno_receipt_url, "https://cdn.example.test/current.pdf");
assert.equal(buildDireNotePayload({ ...proofRelease, sunoReceiptUrl: "", suno_receipt_url: "https://cdn.example.test/stale.pdf" }).suno_receipt_url, undefined);
assert.equal(buildDireNotePayload({ ...release, contentType: "non_exclusive_licensed", licenseReceiptUrl: "https://cdn.example.test/license.pdf" }).license_receipt_url, "https://cdn.example.test/license.pdf");
const credited = buildDireNotePayload({ ...release, tracks: [{ ...release.tracks![0], featuredArtists: "Guest Artist", contributors: [
  { role: "songwriter", legalName: "Legal Writer", ipi: "123456789", iprsMember: true, instagramUrl: "https://instagram.com/writer", xUrl: "https://x.com/writer" },
  { role: "composer", legalName: "Legal Composer", iprsMember: false }
] }] });
assert.deepEqual(credited.tracks[0].songwriters, [{ name: "Legal Writer", ipi: "123456789", iprs_member: "Yes", instagram_url: "https://instagram.com/writer", x_url: "https://x.com/writer" }]);
assert.equal(credited.tracks[0].composers[0].name, "Legal Composer");
assert.equal(credited.featuring_artists?.[0].name, "Guest Artist");
assert.equal(credited.tracks[0].featuring_artists?.[0].name, "Guest Artist");
for (const [genre, subgenres] of Object.entries(DIRENOTE_GENRE_CATALOG)) for (const subgenre of subgenres) {
  const mapped = buildDireNotePayload({ ...release, primaryGenre: genre, secondaryGenre: subgenre });
  assert.equal(mapped.albumGenre, genre);
  assert.equal(mapped.albumSubgenre, subgenre);
  assert.equal(validateDireNotePayload(mapped).issues.some(issue => /genre/i.test(issue.field)), false);
}
for (const language of DIRENOTE_LANGUAGES) {
  const mapped = buildDireNotePayload({ ...release, tracks: [{ ...release.tracks![0], language }] });
  assert.equal(mapped.tracks[0].trackLanguage, language);
  assert.equal(validateDireNotePayload(mapped).issues.some(issue => issue.field === "tracks.0.trackLanguage"), false);
}
for (const invalid of [undefined, null, "", "   ", "not-a-language"]) {
  const mapped = buildDireNotePayload({ ...release, tracks: [{ ...release.tracks![0], language: invalid as any }] });
  assert.equal(validateDireNotePayload(mapped).issues.some(issue => issue.field === "tracks.0.trackLanguage"), true);
}
assert.equal(readTrackLanguage({ metadata: { titleLanguage: "Tamil" } }), "Tamil");
assert.equal(readTrackLanguage({ metadata: { metadata: { titleLanguage: "Telugu" } } }), "Telugu");
assert.equal(readTrackLanguage({ language: "", metadata: { titleLanguage: "Hindi" } }), "");
assert.equal(readTrackLanguage({ language: "English", metadata: { language: "Hindi" } }), "English");
const apiTrack = distributionTrackSchema.parse({ ...release.tracks![1], duration: "180", isCover: false, coverLicenseConfirmed: false, dolbyAtmos: false, audioFileKey: "audio-1", artistProfileIds: [1] });
assert.equal(apiTrack.language, "Instrumental");
const bad = json(payload);
bad.tracks[1].trackLanguage = "Hindi";
assert.equal(validateDireNotePayload(bad).issues.some(issue => issue.field === "tracks.1.trackLanguage"), true);
assert.deepEqual(diffDireNotePayload(bad, payload), [{ field: "tracks.1.trackLanguage", before: "Hindi", after: "Instrumental" }]);

async function main() {
  const captured: unknown[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    captured.push(JSON.parse(body));
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ success: true }));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert(address && typeof address !== "string");
    process.env.DIRENOTE_INGEST_ENDPOINT = `http://127.0.0.1:${address.port}/ingest_content`;
    assert.equal((await submitToDireNote(payload)).success, true);
    assert.deepEqual(captured[0], json(payload));
    assert(!JSON.stringify(redactDireNotePayload(payload)).includes("mapping-fixture-pin"));
    console.log("Field mapping passed: three independent track languages, track golden payload, every configured genre/subgenre and language, missing/invalid values, legacy reads, API schema, payload diff, and exact HTTP body. Provider enum certification remains separate.");
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
