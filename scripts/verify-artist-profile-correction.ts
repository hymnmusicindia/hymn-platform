import assert from "node:assert/strict";
import { artistInstagramCorrection, artistInstagramCorrectionCopy, normalizeArtistCardName } from "../lib/artist-profile-correction";
import { artistProfileUpdateSchema } from "../lib/validation";

const providerMessage = 'Artist "krsna clint" was not found in the database. Instagram_url is required to create a new artist profile.';
const correction = artistInstagramCorrection(providerMessage, "NOCTURNAL");
assert.ok(correction);
assert.equal(correction.artistName, "krsna clint");
assert.equal(correction.field, "artistProfile.instagram_url");
assert.match(correction.reason, /Instagram profile link or @handle/);
assert.match(correction.reason, /credited name unchanged/);
assert.doesNotMatch(correction.reason, /database|instagram_url|DireNote/i);

const copy = artistInstagramCorrectionCopy({ field: correction.field, label: correction.label, note: providerMessage }, correction.reason, "NOCTURNAL");
assert.ok(copy);
assert.match(copy.problem, /could not match "krsna clint"/);
assert.match(copy.reason, /existing artist profile/);
assert.match(copy.action, /saved profile/);
assert.match(copy.action, /resubmit "NOCTURNAL" to HYMN/);
assert.notEqual(copy.problem, copy.reason);
assert.notEqual(copy.problem, copy.action);
assert.equal(artistInstagramCorrection("A generic provider error.", "NOCTURNAL"), null);
assert.equal(normalizeArtistCardName(" KRSNA—CLINT "), normalizeArtistCardName("krsna clint"), "Case and punctuation differences match a saved artist card.");
assert.notEqual(normalizeArtistCardName("Krsna Clint"), normalizeArtistCardName("Krsna"), "Artist-card matching must not use loose partial-name matches.");
assert.ok(normalizeArtistCardName("Крсна कलाकार").length > 0, "Unicode artist names remain searchable.");
assert.equal(artistProfileUpdateSchema.safeParse({ instagramUrl: "@krsnaclint" }).success, true, "A valid Instagram handle can be added without changing the artist name.");
assert.equal(artistProfileUpdateSchema.safeParse({ instagramUrl: "https://instagram.com/" }).success, false, "A bare Instagram home page cannot satisfy artist identity requirements.");
assert.equal(artistProfileUpdateSchema.safeParse({ instagramUrl: "https://instagram.com.evil.test/krsna" }).success, false, "Lookalike domains are rejected.");

console.log("Artist profile correction and card matching checks passed.");
