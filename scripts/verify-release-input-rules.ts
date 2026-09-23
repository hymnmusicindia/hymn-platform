import assert from "node:assert/strict";
import { parseReleaseDate, validIsrc, validReleaseBarcode, normalizeReleaseText, safeReleaseText } from "../lib/release-input-rules";

for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-00-01", "2026-10-10T00:00:00Z", "", "not a date"]) assert.equal(parseReleaseDate(date), null);
assert.equal(parseReleaseDate("2028-02-29")?.toISOString(), "2028-02-29T00:00:00.000Z");
assert.equal(parseReleaseDate("2026-10-10")?.toISOString().slice(0, 10), "2026-10-10");
assert(validIsrc("INTST2600001"));
for (const id of ["INTST260001", "IN-TST-26-00001", "in tst2600001", "<script>", "123456789012"]) assert(!validIsrc(id));
assert(validReleaseBarcode("3473620313503"));
assert(!validReleaseBarcode("3473620313505"));
for (const title of ["हिन्दी गीत", "தமிழ் பாடல்", "Beyoncé", "L'été", "Dream ✨", "O'Connor", "SELECT * FROM songs"]) assert(safeReleaseText(title));
for (const title of ["Song\0", "Song\nTitle", "<script>alert(1)</script>", "Song\u202eTitle"]) assert(!safeReleaseText(title));
assert.equal(normalizeReleaseText("  Cafe\u0301   song  "), "Café song");
for (let n = 0; n < 2000; n++) {
  const value = String.fromCodePoint(n) + "Track";
  assert.equal(normalizeReleaseText(normalizeReleaseText(value)), normalizeReleaseText(value));
  assert.equal(typeof safeReleaseText(value), "boolean");
  assert.equal(validIsrc(value), false);
  assert.equal(validReleaseBarcode(value), false);
  assert.equal(parseReleaseDate(value), null);
}
console.log("Release input rules passed: calendar dates, check digits, ISRC, Unicode preservation and 2,000 generated inputs.");
