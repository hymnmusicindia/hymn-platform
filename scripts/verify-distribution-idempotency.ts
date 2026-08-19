import assert from "node:assert/strict";
import { distributionPayloadIdentity } from "../lib/distribution-idempotency";

const first = distributionPayloadIdentity(7, { title: "Song", tracks: [{ title: "A", isrc: null }], artist: "Artist" });
const reordered = distributionPayloadIdentity(7, { artist: "Artist", tracks: [{ isrc: null, title: "A" }], title: "Song" });
assert.deepEqual(first, reordered);
assert.notEqual(first.idempotencyKey, distributionPayloadIdentity(8, { artist: "Artist", tracks: [{ isrc: null, title: "A" }], title: "Song" }).idempotencyKey);
assert.notEqual(first.payloadHash, distributionPayloadIdentity(7, { artist: "Artist", tracks: [{ isrc: null, title: "B" }], title: "Song" }).payloadHash);
console.log("DireNote payload idempotency verification passed.");
// vercel trigger 9
