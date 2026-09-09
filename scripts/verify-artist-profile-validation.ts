import assert from "node:assert/strict";
import { artistProfileCreateSchema, artistProfileUpdateSchema } from "../lib/validation";
import { attachedArtistProfileIds, verifiedArtistStoreLinks } from "../lib/artist-store-links";

const artist = { name: "New Artist Test", instagramUrl: "@newartisttest" };
assert.equal(artistProfileCreateSchema.safeParse({ name: "Debut Artist", hasLiveMusic: false }).success, false);
assert.equal(artistProfileCreateSchema.safeParse({ name: "   ", hasLiveMusic: false }).success, false);
assert.equal(artistProfileCreateSchema.safeParse({ ...artist, hasLiveMusic: false }).success, true);
assert.equal(artistProfileCreateSchema.safeParse({ ...artist, hasLiveMusic: true }).success, false);
assert.equal(artistProfileCreateSchema.safeParse(artist).success, false);
assert.equal(artistProfileCreateSchema.safeParse({ ...artist, spotifyUrl: "https://open.spotify.com/artist/123abc" }).success, true);
assert.equal(artistProfileCreateSchema.safeParse({ ...artist, appleUrl: "https://music.apple.com/us/artist/test/123456" }).success, true);
assert.equal(artistProfileCreateSchema.safeParse({ ...artist, hasLiveMusic: false, spotifyUrl: "invalid" }).success, false);
assert.equal(artistProfileCreateSchema.safeParse({ ...artist, hasLiveMusic: false, isProducer: true }).success, false);
assert.deepEqual(artistProfileUpdateSchema.parse({ name: "Updated Artist" }), { name: "Updated Artist" });
assert.equal(artistProfileUpdateSchema.safeParse({ isProducer: true }).success, false);
assert.equal(artistProfileUpdateSchema.safeParse({ isProducer: true, producerLegalName: "Test Producer" }).success, true);
console.log("Artist validation passed: first release, existing store links, producer requirements, and partial updates.");
assert.deepEqual(attachedArtistProfileIds({ metadata: { artistProfileIds: [12, 12, "13", -1] } }, 99), [12]);
assert.deepEqual(attachedArtistProfileIds({}, null), []);
assert.deepEqual(attachedArtistProfileIds({}, 99), [99]);
assert.deepEqual(verifiedArtistStoreLinks({ spotify: "https://open.spotify.com/track/66x9igCk2Vdjrhm1ULpe6r", apple: "javascript:alert(1)", youtube: "https://evil.test/@artist" }), {});
assert.equal(verifiedArtistStoreLinks({ spotify: "https://open.spotify.com/artist/66x9igCk2Vdjrhm1ULpe6r?si=test" }).spotify?.id, "66x9igCk2Vdjrhm1ULpe6r");
assert.equal(verifiedArtistStoreLinks({ apple: "https://music.apple.com/us/artist/test/1800353038" }).apple?.id, "1800353038");
console.log("Artist link validation and canonical relationship guards passed.");

assert.equal(artistProfileCreateSchema.safeParse({ ...artist, hasLiveMusic: false, instagramUrl: " " }).success, false);
assert.equal(artistProfileCreateSchema.safeParse({ ...artist, hasLiveMusic: false, instagramUrl: "invalid" }).success, false);
assert.equal(artistProfileUpdateSchema.safeParse({ instagramUrl: "@debut_artist" }).success, true);
