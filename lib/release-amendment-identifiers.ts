import type { Release } from './types';

/** Amendments keep the original recording identities; enforce independently of UI. */
export function assertAmendmentIdentifiers(release: Release, metadata: { upcCode?: string | null; tracks: Array<{ trackNumber: number; isrc?: string | null }> }) {
  if (!release.upcCode || !release.tracks?.length || release.tracks.some(track => !track.isrc)) throw Error('The original UPC and every track ISRC must be available before amending.');
  if (metadata.upcCode !== release.upcCode) throw Error('The original UPC is locked. Reload the amendment.');
  if (metadata.tracks.length !== release.tracks.length) throw Error('Existing tracks cannot be added or removed in this amendment.');
  const numbers = new Set<number>();
  for (const track of metadata.tracks) {
    const original = release.tracks.find(item => item.trackNumber === track.trackNumber);
    if (!original || numbers.has(track.trackNumber) || original.isrc !== track.isrc) throw Error('Track order and original ISRCs are locked. Reload the amendment.');
    numbers.add(track.trackNumber);
  }
}
