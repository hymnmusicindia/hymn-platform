import assert from "node:assert/strict";
import { contentIdLiveTrackCountsQuery, contentIdReviewReadiness } from "../lib/content-id-review-eligibility";

assert.deepEqual(contentIdReviewReadiness(0), { liveTrackCount: 0, requiredTrackCount: 5, ready: false });
assert.equal(contentIdReviewReadiness(4).ready, false, "Four live tracks do not start review.");
assert.equal(contentIdReviewReadiness(5).ready, true, "Exactly five live tracks start review.");
assert.equal(contentIdReviewReadiness(12).ready, true, "Tracks across releases accumulate toward eligibility.");
assert.equal(contentIdReviewReadiness(-3).liveTrackCount, 0, "Negative counts cannot satisfy review eligibility.");
assert.equal(contentIdReviewReadiness(Number.NaN).ready, false, "Invalid counts cannot satisfy review eligibility.");

const query = contentIdLiveTrackCountsQuery([12, 12, 0, -4, 19]);
assert.ok(query);
assert.match(query!.sql, /JOIN tracks t ON t\.release_id = r\.id/);
assert.match(query!.sql, /r\.status = 'LIVE'/);
assert.match(query!.sql, /r\.status = 'PARTIALLY_LIVE'/);
assert.match(query!.sql, /GROUP BY r\.user_id/);
assert.equal(contentIdLiveTrackCountsQuery([]), null);

console.log("Content ID review waits for five confirmed live tracks, accumulated across a user's releases.");
