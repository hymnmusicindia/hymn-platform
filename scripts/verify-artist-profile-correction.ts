import assert from "node:assert/strict";
import { artistInstagramCorrection, artistInstagramCorrectionCopy } from "../lib/artist-profile-correction";

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

console.log("Artist profile correction copy checks passed.");
