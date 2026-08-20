import assert from "node:assert/strict";
import { contentIdRiskFlags } from "../lib/managed-services";
assert.deepEqual(contentIdRiskFlags({ exclusiveRights: true }), []);
assert.deepEqual(contentIdRiskFlags({ exclusiveRights: false, nonExclusiveBeat: true, enrolledElsewhere: true }), ["NON_EXCLUSIVE_RIGHTS", "NON_EXCLUSIVE_BEAT", "ALREADY_ENROLLED_ELSEWHERE"]);
assert.ok(contentIdRiskFlags({ exclusiveRights: true, coverRecording: true, coverRightsConfirmed: false }).includes("COVER_RIGHTS_UNCONFIRMED"));
console.log("Managed Content ID eligibility flag verification passed.");
// vercel trigger 9
