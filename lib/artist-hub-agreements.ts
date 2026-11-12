import 'server-only';
import { prisma } from './prisma';
import { ArtistHubError, hubNotice } from './artist-hub';
import { selectedReleaseArtistIds } from './release-artist-verification';
import { refreshSplit } from './splits';
import { attachedArtistProfileIds } from './artist-store-links';

export async function endorseHubArtist(userId: number, identityId: number, releaseId: number, active: boolean) {
  return prisma.$transaction(async tx => {
    const identity = await tx.artistHubIdentity.findUniqueOrThrow({ where: { id: identityId } });
    if (identity.ownerUserId === userId) throw new ArtistHubError('You cannot confirm your own artist identity.');
    const existing = await tx.artistHubEndorsement.findUnique({ where: { identityId_userId: { identityId, userId } } });
    if (!active && existing) return tx.artistHubEndorsement.update({ where: { id: existing.id }, data: { active: false } });
    const credential = await tx.payoutCredential.findUnique({ where: { userId } });
    if (credential?.status !== 'verified' || !await tx.user.count({ where: { id: userId, status: 'ACTIVE' } })) throw new ArtistHubError('Complete payout verification before confirming a collaborator.');
    const collaboration = await tx.artistHubParticipation.findFirst({ where: { releaseId, identityId, status: 'accepted', OR: [{ ownerUserId: userId }, { recipientUserId: userId }] } });
    const release = await tx.release.findFirst({ where: { id: releaseId, status: 'LIVE', archivedAt: null } });
    if (!collaboration || !release) throw new ArtistHubError('Confirm collaborators from an approved, live HYMN collaboration.');
    await tx.auditLog.create({ data: { actorId: userId, action: 'ARTIST_HUB_COMMUNITY_CONFIRMATION', entity: 'artist_hub', entityId: String(identityId), metadata: { releaseId, active } } });
    return tx.artistHubEndorsement.upsert({ where: { identityId_userId: { identityId, userId } }, create: { identityId, userId, releaseId }, update: { active: true, releaseId } });
  });
}

export async function resolveHubTransfer(userId: number, caseId: number, approve: boolean) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(81422100, 1)`;
    const claim = await tx.artistHubCase.findUniqueOrThrow({ where: { id: caseId } });
    const identity = await tx.artistHubIdentity.findUniqueOrThrow({ where: { id: claim.identityId } });
    if (claim.kind !== 'transfer' || identity.ownerUserId !== userId || !await tx.user.count({ where: { id: userId, status: 'ACTIVE' } })) throw new ArtistHubError('Only the current artist manager can decide this transfer.', 403);
    if (claim.status !== 'open') throw new ArtistHubError('This transfer has already been decided.');
    if (approve) {
      const credential = await tx.payoutCredential.findUnique({ where: { userId: claim.requesterUserId } });
      const target = await tx.artistCard.findFirst({ where: { userId: claim.requesterUserId, hubIdentityId: identity.id, archivedAt: null, user: { status: 'ACTIVE' } } });
      if (credential?.status !== 'verified' || !target) throw new ArtistHubError('The destination account must add this artist and complete payout verification first.');
      await tx.artistHubIdentity.update({ where: { id: identity.id }, data: { ownerUserId: claim.requesterUserId, sourceCardId: target.id, revision: { increment: 1 } } });
      await tx.artistHubParticipation.updateMany({ where: { identityId: identity.id, status: 'pending' }, data: { recipientUserId: claim.requesterUserId } });
      await tx.artistHubEndorsement.updateMany({ where: { identityId: identity.id }, data: { active: false } });
    }
    await tx.artistHubCase.update({ where: { id: caseId }, data: { status: approve ? 'transferred' : 'declined' } });
    await tx.auditLog.create({ data: { actorId: userId, action: 'ARTIST_HUB_TRANSFER_DECIDED', entity: 'artist_hub', entityId: String(identity.id), metadata: { caseId, approve, previousOwner: userId, destination: claim.requesterUserId, historicalRoyaltiesUnchanged: true } } });
    for (const recipient of [userId, claim.requesterUserId]) await hubNotice(tx, recipient, `artist-hub:transfer:${caseId}:${recipient}`, approve ? 'Artist profile transferred' : 'Artist transfer declined', `${identity.displayName}: the transfer was ${approve ? 'approved' : 'declined'}. Existing release approvals, royalty agreements and payments remain unchanged.`);
    await tx.adminTask.updateMany({ where: { eventKey: claim.eventKey }, data: { status: 'resolved', resolvedAt: new Date(), resolutionNote: approve ? 'Current manager approved verified destination.' : 'Current manager declined transfer.' } });
    return { status: approve ? 'transferred' : 'declined' };
  }, { timeout: 30000 });
}

/** Whole-release proposal through the existing split ledger; unanimous acceptance remains required. */
export async function proposeHubSplit(proposerId: number, input: { releaseId: number; period: string; shares: Array<{ userId: number; basisPoints: number }> }) {
  const [year, month] = input.period.split('-').map(Number), now = new Date();
  const current = now.getUTCFullYear() * 12 + now.getUTCMonth() + 1;
  if (month < 1 || month > 12 || year * 12 + month < current || year * 12 + month > current + 60) throw new ArtistHubError('Choose this month or a future statement month within five years.');
  if (new Set(input.shares.map(row => row.userId)).size !== input.shares.length || input.shares.some(row => !Number.isInteger(row.basisPoints) || row.basisPoints < 0 || row.basisPoints > 10000) || input.shares.reduce((sum, row) => sum + row.basisPoints, 0) !== 10000) throw new ArtistHubError('Each recipient needs one share, totalling exactly 100%.');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM releases WHERE id = ${input.releaseId} FOR UPDATE`;
    const release = await tx.release.findFirst({ where: { id: input.releaseId, status: 'LIVE', archivedAt: null }, include: { tracks: true } });
    if (!release) throw new ArtistHubError('Choose a fully live release.');
    const participants = await tx.artistHubParticipation.findMany({ where: { releaseId: release.id, status: 'accepted' } });
    const ids = selectedReleaseArtistIds(release.tracks, release.artistProfileId);
    const cards = await tx.artistCard.findMany({ where: { id: { in: ids }, userId: release.userId } });
    const primaryIds = new Set(release.tracks.flatMap(track => attachedArtistProfileIds(track.metadata, release.artistProfileId)));
    const primaryHubIds = new Set(cards.filter(card => primaryIds.has(card.id)).map(card => card.hubIdentityId));
    const candidates = new Set([release.userId, ...participants.filter(row => primaryHubIds.has(row.identityId)).map(row => row.recipientUserId)]);
    if (!candidates.has(proposerId)) throw new ArtistHubError('Only the release owner or an approved primary collaborator can propose shares.', 403);
    if (await tx.user.count({ where: { id: proposerId, status: 'ACTIVE' } }) !== 1) throw new ArtistHubError('An active account is required.', 403);
    if (input.shares.some(row => !candidates.has(row.userId)) || !input.shares.some(row => row.userId === release.userId)) throw new ArtistHubError('Include the release owner and select approved primary collaborators.');
    if (await tx.splitRecord.count({ where: { releaseId: release.id, trackId: null, status: { not: 'archived' } } })) throw new ArtistHubError('This release already has an agreement. Manage it in Royalty splits.');
    if (year * 12 + month === current && await tx.royaltyLineItem.count({ where: { releaseId: release.id } })) throw new ArtistHubError('Earnings already exist. Choose a future statement month so historical allocations stay unchanged.');
    const users = await tx.user.findMany({ where: { id: { in: input.shares.map(row => row.userId) }, status: 'ACTIVE' }, select: { id: true, name: true, email: true } });
    if (users.length !== input.shares.length) throw new ArtistHubError('Every recipient must have an active HYMN account.');
    const record = await tx.splitRecord.create({ data: { releaseId: release.id, ownerUserId: release.userId, effectiveFromMonth: month, effectiveFromYear: year } });
    for (const share of input.shares) {
      const user = users.find(row => row.id === share.userId)!;
      const recipient = await tx.splitRecipient.create({ data: { splitRecordId: record.id, releaseId: release.id, recipientUserId: user.id, recipientName: user.name, recipientEmail: user.email, role: user.id === release.userId ? 'Other' : 'Primary Artist', sharePercent: share.basisPoints / 100, payoutEligible: share.basisPoints > 0, inviteMethod: 'registered_email', inviteStatus: user.id === proposerId ? 'accepted' : 'pending', acceptedAt: user.id === proposerId ? new Date() : null } });
      if (user.id !== proposerId) await hubNotice(tx, user.id, `artist-hub:split:${recipient.id}`, 'Review your proposed royalty share', `A ${share.basisPoints / 100}% share was proposed for “${release.title}”, effective ${input.period}. Open Royalty splits to accept or decline. The agreement activates only when everyone accepts.`);
    }
    await refreshSplit(tx, record.id);
    await tx.auditLog.create({ data: { actorId: proposerId, action: 'ARTIST_HUB_SPLIT_PROPOSED', entity: 'split_record', entityId: String(record.id), metadata: { period: input.period, shares: input.shares } } });
    return { splitRecordId: record.id };
  }, { timeout: 30000 });
}
