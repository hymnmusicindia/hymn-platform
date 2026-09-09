import assert from "node:assert/strict";
import { artistProfileCreateSchema, artistProfileUpdateSchema } from "../lib/validation";

const artist = { name: "New Artist Test", instagramUrl: "@newartisttest" };
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
