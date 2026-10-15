const fs = require('node:fs');
const { parse } = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const config = parse(fs.readFileSync('.env.hostinger'));
const db = new PrismaClient({ datasourceUrl: config.DATABASE_URL, log: [] });
(async () => {
  const releases = await db.release.findMany({ where: { title: { contains: 'YAMUNAWOOD', mode: 'insensitive' } }, select: { id: true, title: true, artistName: true, status: true, tracks: { orderBy: { trackNumber: 'asc' }, select: { id: true, title: true, trackNumber: true, metadata: true } } } });
  for (const release of releases) {
    console.log(JSON.stringify({ cards: await db.artistCard.findMany({ where: { userId: 39 }, select: { id: true, artistName: true, direNoteArtistId: true } }), asset: await db.storedAsset.findUnique({ where: { id: 141 }, select: { originalFilename: true, uploadStatus: true, byteSize: true, mimeType: true } }), attempts: await db.distributionSubmissionAttempt.findMany({ where: { releaseId: 81 }, select: { id: true, state: true, isCurrent: true, upc: true } }) }, null, 2));
    console.log(JSON.stringify({ ...release, tracks: release.tracks.map(({ metadata, ...track }) => ({ ...track, explicitContent: metadata?.explicitContent, explicit: metadata?.explicit, explicitLyrics: metadata?.explicitLyrics })) }, null, 2));
    const log = await db.direNoteLog.findFirst({ where: { releaseId: release.id, action: { in: ['release_submission', 'retry_submission'] } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true, success: true, requestPayloadRedacted: true } });
    if (log) console.log(JSON.stringify({ submittedAt: log.createdAt, success: log.success, tracks: log.requestPayloadRedacted?.tracks?.map(t => ({ title: t.trackName, explicitLyrics: t.explicitLyrics })) }, null, 2));
  }
})().catch(() => { console.error('Read-only lookup failed; credentials omitted.'); process.exitCode = 1; }).finally(() => db.$disconnect());
