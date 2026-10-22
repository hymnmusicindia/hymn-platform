import assert from 'node:assert/strict';
import { assertAmendmentIdentifiers } from '../lib/release-amendment-identifiers';
import type { Release } from '../lib/types';

const original = { upcCode: '3473620314135', tracks: [{ id: 400, trackNumber: 1, isrc: 'INDN22602494' }, { id: 401, trackNumber: 2, isrc: 'INDN22602495' }] } as Release;
const metadata = { upcCode: original.upcCode!, tracks: original.tracks!.map(track => ({ trackNumber: track.trackNumber!, isrc: track.isrc! })) };
assert.doesNotThrow(() => assertAmendmentIdentifiers(original, metadata));
assert.throws(() => assertAmendmentIdentifiers(original, { ...metadata, upcCode: '3473620319079' }), /UPC is locked/);
assert.throws(() => assertAmendmentIdentifiers(original, { ...metadata, tracks: [{ ...metadata.tracks[0], isrc: 'INDN22609999' }, metadata.tracks[1]] }), /ISRCs are locked/);
assert.throws(() => assertAmendmentIdentifiers(original, { ...metadata, tracks: [metadata.tracks[0]] }), /added or removed/);
assert.throws(() => assertAmendmentIdentifiers(original, { ...metadata, tracks: [metadata.tracks[0], metadata.tracks[0]] }), /ISRCs are locked/);
assert.throws(() => assertAmendmentIdentifiers(original, { ...metadata, tracks: metadata.tracks.map((track, index) => ({ ...track, trackNumber: 2 - index })) }), /ISRCs are locked/);
assert.throws(() => assertAmendmentIdentifiers({ ...original, tracks: [{ ...original.tracks![0], isrc: undefined }] }, metadata), /must be available/);
console.log('PASS amendment wizard: original identities accepted; tampered UPC/ISRC, missing codes, removed, duplicated and reordered tracks rejected.');
