import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { syncDireNoteArtistInformation, syncDireNoteRelease } from "../lib/direnote-service";
import { GET as cron } from "../app/api/cron/direnote-release-sync/route";

// This integration fixture must never run against a deployed database.
assert.match(process.env.DATABASE_URL ?? "", /^postgresql:\/\/fixture:fixture@127\.0\.0\.1:55439\/direnote_virtual(?:\?|$)/);
const runId = randomUUID();
const spotify = "https://open.spotify.com/artist/66x9igCk2Vdjrhm1ULpe6r";
const apple = "https://music.apple.com/us/artist/test/1800353038";
const originalFetch = globalThis.fetch;
async function main() {
  const user = await prisma.user.create({ data: { googleId: runId, name: "Artist sync fixture", email: `${runId}@example.test`, role: "CUSTOMER", status: "ACTIVE" } });
  const cards = await Promise.all([1, 2].map(n => prisma.artistCard.create({ data: { userId: user.id, artistName: `Debut ${n} ${runId}`, instagramUrl: "https://www.instagram.com/debut" } })));
  const release = await prisma.release.create({ data: { userId: user.id, artistProfileId: cards[0].id, title: "Artist enrichment fixture", artistName: cards[0].artistName, genre: "Pop", releaseDate: new Date("2099-01-01"), releaseType: "ep", status: "DISTRIBUTOR_PROCESSING", upc: "3473620313503", tracks: { create: cards.map((card, index) => ({ title: `Track ${index + 1}`, trackNumber: index + 1, isrc: `INDN2260244${index + 2}`, metadata: { artistProfileIds: [card.id] } })) } }, include: { tracks: true } });
  await prisma.distributionSubmissionAttempt.create({ data: { releaseId: release.id, state: "submitted", isCurrent: true, idempotencyKey: runId, payloadHash: runId, upc: release.upc } });
  let complete = false;
  let conflictingIdentity = false;
  let wrongName = false;
  let editDuringFetch = false;
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body || "{}"));
    assert.equal(body.pin, "fixture-pin");
    assert.equal(body.client_id, "fixture-client");
    if (url.endsWith("/check_artist")) {
      const card = cards.find((_, i) => String(body.artist_id) === String(80001 + i));
      if (!card) return Response.json({ success: false, error: "Unknown fixture artist" });
      calls.push(String(body.artist_id));
      if (editDuringFetch) { editDuringFetch = false; await prisma.artistCard.update({ where: { id: card.id }, data: { spotifyProfileUrl: "https://open.spotify.com/artist/0123456789012345678901" } }); }
      return Response.json({ success: true, artist: { artist_id: body.artist_id, name: wrongName ? "Unrelated artist" : card.artistName, links: { spotify, ...(complete ? { apple, youtube: "https://www.youtube.com/@debut" } : {}) } } });
    }
    if (url.endsWith("/check_release_status") && body.upc === release.upc) return Response.json({ success: true, release: { upc_code: release.upc, album_name: release.title, status: "Pending" }, tracks: release.tracks.map((track, i) => ({ track_number: i + 1, track_name: track.title, isrc: track.isrc, status: "Pending", artist: { artist_id: 80001 + i + (conflictingIdentity && i === 1 ? 1000 : 0), name: cards[i].artistName, links: conflictingIdentity && i === 1 ? { apple } : {} } })) });
    // Reject unmatched fixture calls locally; never contact DireNote.
    return Response.json({ success: false, error: "Unmatched fixture request" });
  };
  await syncDireNoteRelease(release.id);
  for (const [i, card] of cards.entries()) assert.equal((await prisma.artistCard.findUniqueOrThrow({ where: { id: card.id } })).direNoteArtistId, String(80001 + i), "All tracks must persist their artist identity, even after the first changes.");
  await prisma.release.update({ where: { id: release.id }, data: { archivedAt: new Date() } });
  const poll = () => cron(new Request("http://localhost/api/cron/direnote-release-sync", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } }));
  assert.equal((await poll()).status, 200);
  for (const card of cards) { const saved = await prisma.artistCard.findUniqueOrThrow({ where: { id: card.id } }); assert.equal(saved.spotifyProfileUrl, spotify); assert.equal(saved.spotifyArtistId, "66x9igCk2Vdjrhm1ULpe6r"); assert.equal(saved.appleMusicProfileUrl, null); }
  const count = calls.length;
  await poll(); assert.equal(calls.length, count, "Do not poll a fresh incomplete identity repeatedly within an hour.");
  complete = true;
  await prisma.artistCard.updateMany({ where: { id: { in: cards.map(c => c.id) } }, data: { direNoteLastSyncedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
  await poll();
  for (const card of cards) { const saved = await prisma.artistCard.findUniqueOrThrow({ where: { id: card.id } }); assert.equal(saved.appleMusicProfileUrl, apple); assert.equal(saved.appleArtistId, "1800353038"); assert.equal(saved.youtubeUrl, "https://www.youtube.com/@debut"); }
  wrongName = true; await assert.rejects(syncDireNoteArtistInformation(cards[0].id), /does not match/); wrongName = false;
  await prisma.artistCard.update({ where: { id: cards[0].id }, data: { spotifyProfileUrl: null, spotifyArtistId: null } }); editDuringFetch = true;
  await syncDireNoteArtistInformation(cards[0].id);
  assert.equal((await prisma.artistCard.findUniqueOrThrow({ where: { id: cards[0].id } })).spotifyProfileUrl, "https://open.spotify.com/artist/0123456789012345678901", "A user edit during the provider request must survive.");
  conflictingIdentity = true;
  await prisma.artistCard.update({ where: { id: cards[1].id }, data: { appleMusicProfileUrl: null, appleArtistId: null } });
  await syncDireNoteRelease(release.id);
  assert.equal((await prisma.artistCard.findUniqueOrThrow({ where: { id: cards[1].id } })).appleMusicProfileUrl, null, "A conflicting provider identity must not populate missing links.");
  assert.equal(await prisma.artistCard.count({ where: { userId: user.id } }), 2);
  console.log("PASS: multi-track identity association, hourly artist endpoint enrichment, delayed Apple/YouTube links, no duplicate cards, identity verification, concurrent edit protection.");
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { globalThis.fetch = originalFetch; await prisma.$disconnect(); });
