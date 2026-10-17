import assert from "node:assert/strict";
import { currentDireNoteTracks } from "../lib/direnote-track-revisions";
import { extractDireNoteCorrections } from "../lib/direnote-corrections";
const old = { isrc: "INDN22602938", track_name: "Song", status: "Rejected", remarks: "INCORRECT TRACK LANGUAGE", date: "2026-10-14 08:44:19" };
const approved = { ...old, status: "Approved", remarks: "", date: "2026-10-14 14:08:04" };
for (const rows of [[old, approved], [approved, old]]) {
  assert.deepEqual(currentDireNoteTracks(rows), [approved]);
  assert.equal(extractDireNoteCorrections({ tracks: currentDireNoteTracks(rows) }, [{ id: 1, title: "Song", isrc: old.isrc, trackNumber: 1 }], 1).length, 0);
}
assert.equal(currentDireNoteTracks([old, { ...approved, date: old.date }]).length, 2, "Ambiguous timestamps must retain correction evidence");
assert.equal(currentDireNoteTracks([old, { ...approved, date: "" }]).length, 2);
assert.equal(currentDireNoteTracks([old, { ...approved, isrc: "INDN22602939" }]).length, 2);
assert.equal(currentDireNoteTracks([{ ...old, isrc: "" }, { ...approved, isrc: "" }]).length, 2);
console.log("Track revision regressions passed: ordering, approval, distinct recordings, missing/tied dates and missing identity.");
