/** HYMN marketplace policy: third-party/non-exclusive source material cannot be sold exclusively. */
export function exclusiveBeatEligible(beat: {sampleDeclaration?: string | null; sampleDisclosure?: string | null}) {
  return beat.sampleDeclaration === 'NO_UNCONTROLLED_SAMPLES' && !sampleSourceConflict(beat.sampleDisclosure);
}
export function sampleSourceConflict(disclosure?: string | null) {
  return /\b(splice|loopcloud|tracklib|sample\s*pack|non[ -]?exclusive|royalty[ -]?free\s+(?:sample|loop))\b/i.test(disclosure || '');
}
export const exclusiveBeatRestriction = 'Exclusive licensing is available only for fully original beats without third-party samples or non-exclusive loops.';
