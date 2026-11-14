import assert from 'node:assert/strict';
import { resolveReleaseArtistIds, replaceReleaseArtists } from '../lib/release-artist-scope';
import { submitCorrectionPackage } from '../lib/client-correction-submit';
import { matchesReceivedCorrection } from '../lib/release-correction-workflow';
import { buildDireNotePayload } from '../lib/direnote';
import type { Release } from '../lib/types';

async function main() {
  const profiles = [{ id: 1, name: 'Main' }, { id: 2, name: 'Track collaborator' }, { id: 3, name: 'Guest' }];
  assert.deepEqual(resolveReleaseArtistIds('Main', profiles), [1]);
  assert.deepEqual(resolveReleaseArtistIds('Guest, Main', profiles), [3, 1]);
  assert.deepEqual(resolveReleaseArtistIds('Missing', profiles), []);
  assert.deepEqual(replaceReleaseArtists([1, 2], [1], [3]), [3, 2], 'Changing album identity preserves track-only collaborators');
  assert.deepEqual(replaceReleaseArtists([1, 2], [1, 2], [1]), [1]);
  const release = { artistName: 'Main', releaseType: 'album', releaseTitle: 'Album', tracks: [
    { trackTitle: 'First', primaryArtist: 'Main, Track collaborator', artistProfileIds: [1, 2], featuredArtists: 'Guest', featuredArtistProfileIds: [3] },
    { trackTitle: 'Second', primaryArtist: 'Main', artistProfileIds: [1] },
  ] } as unknown as Release;
  const payload = buildDireNotePayload(release);
  assert.deepEqual(payload.artists.map(a => a.name), ['Main']);
  assert.deepEqual(payload.tracks[0].artists.map(a => a.name), ['Main', 'Track collaborator']);
  assert.deepEqual(payload.tracks[1].artists.map(a => a.name), ['Main']);
  assert.deepEqual(payload.tracks[0].featuring_artists?.map(a => a.name), ['Guest']);
  assert.equal(payload.tracks[1].featuring_artists?.length ?? 0, 0);
  release.tracks!.reverse();
  assert.deepEqual(buildDireNotePayload(release).artists.map(a => a.name), ['Main'], 'Reordering cannot change album identity');
  const metadata = { editReleaseId: 193, artistName: 'Main' };
  let posts = 0;
  const receiptFetcher = (async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') { posts++; throw new TypeError('Lost response'); }
    const key = new URL(String(url), 'https://hymn.fixture').searchParams.get('correctionKey')!;
    assert.match(key, /^[a-f0-9]{64}$/);
    return Response.json({ correctionReceived: true, release: { id: 193 } });
  }) as typeof fetch;
  const recovered = await submitCorrectionPackage(metadata, new FormData(), receiptFetcher);
  assert.equal(recovered.recovered, true); assert.equal(posts, 1);
  const timedOut = (async (_url: string, init?: RequestInit) => {
    if (init?.method !== 'POST') return Response.json({ correctionReceived: false });
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Abort did not arrive')), 500);
      init.signal!.addEventListener('abort', () => { clearTimeout(timer); reject(init.signal!.reason); }, { once: true });
    });
  }) as typeof fetch;
  await assert.rejects(submitCorrectionPackage(metadata, new FormData(), timedOut, 10), /timed out.*before retrying/i);
  const key = 'a'.repeat(64);
  assert.equal(matchesReceivedCorrection({ status: 'under_review', metadata: { correctionSubmissionKey: key } }, key), true);
  assert.equal(matchesReceivedCorrection({ status: 'under_review', metadata: { correctionSubmissionKey: 'b'.repeat(64) } }, key), false);
  assert.equal(matchesReceivedCorrection({ status: 'changes_requested', metadata: { correctionSubmissionKey: key } }, key), false);
  console.log('PASS album/track isolation, reorder, delivery roles, lost-response recovery, bounded timeout, no duplicate POST, exact correction receipt.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
