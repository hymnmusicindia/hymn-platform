import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
Object.assign(process.env, parse(readFileSync('.env.hostinger')));
async function main() {
  const { prisma } = await import('../lib/prisma');
  const { getDireNoteReleaseInformation } = await import('../lib/direnote/direnote-client');
  const { redactDireNoteDiagnostic } = await import('../lib/direnote');
  try {
    const release = await prisma.release.findUniqueOrThrow({ where: { id: 81 }, include: { tracks: { orderBy: { trackNumber: 'asc' }, include: { contributions: { include: { party: true } } } }, distributionSubmissions: true, user: { select: { id: true, email: true } } } });
    console.log(JSON.stringify({ id: release.id, title: release.title, user: release.user, upc: release.upc, artworkUrl: release.artworkUrl?.split('?')[0], tracks: release.tracks.map(t => ({ id: t.id, title: t.title, isrc: t.isrc, credits: t.contributions.map(c => ({ name: c.creditedName, role: c.role, partyId: c.partyId, legalName: c.party.legalName, songwriterId: c.party.direNoteSongwriterId })) })), attempts: release.distributionSubmissions.map(a => ({ id: a.id, state: a.state, isCurrent: a.isCurrent })) }, null, 2));
    const response = await getDireNoteReleaseInformation('3473620319017');
    console.log(JSON.stringify({ provider: redactDireNoteDiagnostic(response.data ?? response.error), success: response.success }, null, 2));
    const cards = await prisma.artistCard.findMany({ where: { userId: release.userId }, select: { id: true, artistName: true, direNoteArtistId: true } });
    console.log(JSON.stringify({ cards, trackMetadata: release.tracks.map(t => ({ title: t.title, artistProfileIds: (t.metadata as any)?.artistProfileIds, nestedIds: (t.metadata as any)?.metadata?.artistProfileIds })) }, null, 2));
    const { getDireNoteArtistInformation, getDireNoteSongwriterInformation } = await import('../lib/direnote/direnote-client');
    for (const id of ['2238', '3647', '3653', '3651', '3652']) {
      const result = await getDireNoteArtistInformation(id);
      console.log(JSON.stringify({ artistId: id, data: redactDireNoteDiagnostic(result.data ?? result.error) }));
    }
    for (const id of [2185, 2188, 2189, 2190, 2191, 2192]) {
      const result = await getDireNoteSongwriterInformation(id);
      console.log(JSON.stringify({ songwriterId: id, data: redactDireNoteDiagnostic(result.data ?? result.error) }));
    }
    if (!process.argv.includes('--apply')) return;
    const upc = '3473620319017';
    const key = `direnote:dashboard:81:${upc}`;
    const normalize = (s: string) => s.replace(/\s/g, '').toUpperCase();
    const data = response.data;
    const { validIsrc, validReleaseBarcode } = await import('../lib/release-input-rules');
    if (release.title !== 'YAMUNAWOOD' || release.user.email !== 'deepitkamboj09@gmail.com' || !response.success || data.release?.upc_code !== upc || data.release?.album_name !== release.title || data.tracks?.length !== 5 || !validReleaseBarcode(upc)) throw Error('Scope/provider mismatch');
    const mapped = release.tracks.map(t => {
      const remote = data.tracks.filter((r: any) => normalize(r.track_name) === normalize(t.title));
      if (remote.length !== 1 || !validIsrc(remote[0].isrc) || (t.isrc && t.isrc !== remote[0].isrc)) throw Error('Track identity conflict');
      return { id: t.id, title: t.title, trackNumber: t.trackNumber, isrc: remote[0].isrc };
    });
    if (new Set(mapped.map(t => t.isrc)).size !== 5) throw Error('ISRC uniqueness conflict');
    const artistMap: Record<string, string> = { JUDGE: '2238', HRK: '3647', ATH9RV: '3653', SAMBHAV: '3651', 'KARAN SKY': '3652' };
    const writerMap: Record<string, string> = { RITIKSAINI: '2188', ATHARVGUPTA: '2189', SAMBHAVBHUDIRAJA: '2191', KARANVERMA: '2192' };
    const evidence = 'Owner confirmed successful DireNote dashboard submission after API file-size failure; verified by UPC lookup and all five recording identities.';
    const safe = redactDireNoteDiagnostic(data) as any;
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422028, ${81}::integer)`;
      const current = await tx.release.findUniqueOrThrow({ where: { id: 81 } });
      if (current.upc && current.upc !== upc || await tx.release.count({ where: { id: { not: 81 }, upc } })) throw Error('UPC conflict');
      for (const t of mapped) if (await tx.track.count({ where: { id: { not: t.id }, isrc: t.isrc } })) throw Error('ISRC conflict');
      const attempt = await tx.distributionSubmissionAttempt.upsert({ where: { idempotencyKey: key }, create: { releaseId: 81, idempotencyKey: key, payloadHash: (await import('node:crypto')).createHash('sha256').update(key).digest('hex'), state: 'submitted', isCurrent: true, upc, providerReference: upc, providerStatus: 'processing', trackIdentifiers: mapped, rawStatusPayload: safe, responseRedacted: { source: 'dashboard_reconciliation', evidence, upc }, completedAt: new Date() }, update: { state: 'submitted', isCurrent: true, upc, providerStatus: 'processing', trackIdentifiers: mapped, rawStatusPayload: safe } });
      await tx.distributionSubmissionAttempt.updateMany({ where: { releaseId: 81, id: { not: attempt.id } }, data: { isCurrent: false, state: 'failed', providerStatus: 'superseded', safeError: 'API file-size failure superseded by verified dashboard delivery.', completedAt: new Date() } });
      if (current.upc !== upc) await tx.externalIdentifierHistory.create({ data: { releaseId: 81, provider: 'direnote', identifierType: 'upc', previousValue: current.upc, canonicalValue: upc, source: 'dashboard_reconciliation' } });
      const meta = (current.metadata ?? {}) as any;
      await tx.release.update({ where: { id: 81 }, data: { upc, status: 'DISTRIBUTOR_PROCESSING', direNoteStatus: 'processing', direNoteSyncError: null, rejectionReason: null, correctionReason: null, metadata: { ...meta, direnoteValidationErrors: [], direNote: { ...meta.direNote, currentAttemptId: attempt.id, status: 'processing', deliverySource: 'dashboard', deliveryEvidence: evidence, release: safe.release } } } });
      for (const t of mapped) {
        const prior = release.tracks.find(r => r.id === t.id)!;
        if (!prior.isrc) await tx.externalIdentifierHistory.create({ data: { releaseId: 81, trackId: t.id, provider: 'direnote', identifierType: 'isrc', previousValue: null, canonicalValue: t.isrc, source: 'dashboard_reconciliation' } });
        await tx.track.update({ where: { id: t.id }, data: { isrc: t.isrc, distributorStatus: 'processing' } });
      }
      for (const card of cards) {
        const id = artistMap[card.artistName.trim().toUpperCase()];
        if (!id) continue;
        if (card.direNoteArtistId && card.direNoteArtistId !== id) {
          await tx.auditLog.create({ data: { actorType: 'system', action: 'DIRENOTE_DASHBOARD_ARTIST_ID_CONFLICT', entity: 'release', entityId: '81', metadata: { artistCardId: card.id, name: card.artistName, existingId: card.direNoteArtistId, dashboardId: id, resolution: 'Preserved existing global artist identity; dashboard identity retained in provider response.' } } });
          continue;
        }
        await tx.artistCard.update({ where: { id: card.id }, data: { direNoteArtistId: id } });
      }
      for (const track of release.tracks) for (const c of track.contributions) {
        if (!['SONGWRITER', 'COMPOSER', 'LYRICIST'].includes(c.role)) continue;
        const name = normalize(c.party.legalName ?? c.creditedName);
        const id = name === 'DEEPITKAMBOJ' ? (c.role === 'COMPOSER' ? '2190' : '2185') : writerMap[name];
        if (!id) continue;
        if (c.party.direNoteSongwriterId && c.party.direNoteSongwriterId !== id) throw Error('Writer identity conflict');
        await tx.contributorParty.update({ where: { id: c.partyId }, data: { direNoteSongwriterId: id } });
      }
      await tx.distributionQueueEntry.updateMany({ where: { releaseId: 81 }, data: { currentStage: 'processing', apiErrorMessage: null, direnoteRequestId: upc, direnoteResponse: { source: 'dashboard', upc, status: 'Pending' } } });
      await tx.adminTask.updateMany({ where: { entityType: 'release', entityId: '81', status: { not: 'resolved' }, type: 'DireNote Failed' }, data: { status: 'resolved', resolvedAt: new Date(), resolutionNote: evidence } });
      await tx.notification.upsert({ where: { eventKey: key + ':under-review' }, create: { eventKey: key + ':under-review', userId: release.userId, title: 'YAMUNAWOOD is under review', body: 'Your release has been successfully delivered to DireNote and is under review.', type: 'release', href: '/dashboard/releases/81' }, update: {} });
      if (current.status !== 'DISTRIBUTOR_PROCESSING') await tx.releaseStatusTransition.create({ data: { releaseId: 81, previousStatus: current.status, newStatus: 'DISTRIBUTOR_PROCESSING', actorType: 'system', reason: evidence } });
      await tx.auditLog.create({ data: { actorType: 'system', action: 'DIRENOTE_DASHBOARD_DELIVERY_RECONCILED', entity: 'release', entityId: '81', metadata: { upc, attemptId: attempt.id, tracks: mapped, evidence } } });
    }, { timeout: 30000 });
    const { syncDireNoteRelease } = await import('../lib/direnote-service');
    console.log(JSON.stringify({ sync: await syncDireNoteRelease(81) }));
    const { sendTransactionalEmail } = await import('../lib/email/send-transactional-email');
    const message = 'Hi Deepit,\n\nYAMUNAWOOD has been successfully delivered to DireNote and is now under review. HYMN has been updated, and future status updates will be synchronized from DireNote.\n\nAlbum UPC: 3473620319017\n\nWe will notify you when the review status changes.\n\nHYMN Music';
    console.log(JSON.stringify({ email: await sendTransactionalEmail({ to: release.user.email, userId: release.userId, subject: 'YAMUNAWOOD has been delivered and is under review', template: 'release_dashboard_under_review', text: message, html: `<div style="font-family:Arial,sans-serif;white-space:pre-line">${message}</div>`, eventKey: key + ':under-review-email', entityType: 'release', entityId: 81 }) }));
    console.log(JSON.stringify({ verified: await prisma.release.findUnique({ where: { id: 81 }, select: { status: true, upc: true, direNoteStatus: true, direNoteLastSyncedAt: true, tracks: { select: { title: true, isrc: true } }, distributionSubmissions: { where: { isCurrent: true }, select: { id: true, state: true, upc: true, providerStatus: true } } } }) }));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error('Reconciliation failed:', error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/\S+/g, '[REDACTED]') : 'Unknown error'); process.exitCode = 1; });
